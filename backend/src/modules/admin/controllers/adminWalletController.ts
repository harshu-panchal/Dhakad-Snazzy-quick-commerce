import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Commission from '../../../models/Commission';
import WalletTransaction from '../../../models/WalletTransaction';
import WithdrawRequest from '../../../models/WithdrawRequest';
import { asyncHandler } from '../../../utils/asyncHandler';
import { approveWithdrawal, rejectWithdrawal, completeWithdrawal } from './adminWithdrawalController';

/**
 * Get Financial Dashboard Stats
 */
/**
 * Get Financial Dashboard Stats
 */
export const getFinancialDashboard = asyncHandler(async (_req: Request, res: Response) => {
    // 1. Total Platform Earnings (GMV - Gross Merchandise Value)
    // Sum of 'total' from Order collection (Successful orders only ideally, but 'Received'/'Pending' etc also count as revenue booked)
    // Excluding Cancelled/Rejected/Returned for net GMV? User didn't specify, but usually GMV excludes cancelled.
    // User said "add 100rs... to total plateform earning" for a new order. So implies all new orders count.
    const totalGMVResult = await mongoose.model('Order').aggregate([
        { $match: { status: { $ne: 'Cancelled' }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalGMV = totalGMVResult.length > 0 ? totalGMVResult[0].total : 0;

    // 2. Total Admin Earnings
    // Formula: SellerCommissions + OrderFees (Platform+Shipping) - DeliveryCommissions

    // A. Seller Commissions (The 10% part)
    const sellerCommResult = await Commission.aggregate([
        { $match: { type: 'SELLER', status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const sellerCommissions = sellerCommResult.length > 0 ? sellerCommResult[0].total : 0;

    // B. Delivery Commissions (The part paid to delivery boy)
    const deliveryCommResult = await Commission.aggregate([
        { $match: { type: 'DELIVERY_BOY', status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const deliveryCommissions = deliveryCommResult.length > 0 ? deliveryCommResult[0].total : 0;

    // C. Order Fees (Platform Fee + Shipping Charge)
    const orderFeesResult = await mongoose.model('Order').aggregate([
        { $match: { status: { $ne: 'Cancelled' }, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: { $add: ['$platformFee', '$shipping'] } } } }
    ]);
    const orderFees = orderFeesResult.length > 0 ? orderFeesResult[0].total : 0;

    // Calculation: (SellerComm + PlatformFee + Shipping) - DeliveryComm
    // This effectively gives: SellerComm + PlatformFee + (Shipping - DeliveryComm) -> where (Shipping-DeliveryComm) is Base Charge
    const totalAdminEarnings = sellerCommissions + orderFees - deliveryCommissions;

    // Calculate Total Completed Withdrawals (Outflow)
    const withdrawalResult = await WithdrawRequest.aggregate([
        { $match: { status: 'Completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWithdrawals = withdrawalResult.length > 0 ? withdrawalResult[0].total : 0;

    // Current Platform Balance = Total Inflow (GMV) - Total Outflow (Withdrawals)
    const currentAccountBalance = totalGMV - totalWithdrawals;

    // 3. Total Seller Wallet Pending Payouts -> Sum of Seller Balances
    const sellerBalanceResult = await mongoose.model('Seller').aggregate([
        { $match: {} }, // All sellers
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const sellerPendingPayouts = sellerBalanceResult.length > 0 ? sellerBalanceResult[0].total : 0;

    // 4. Total Delivery Boy Wallet Pending Payouts -> Sum of Delivery Balances
    const deliveryBalanceResult = await mongoose.model('Delivery').aggregate([
        { $match: {} }, // All delivery boys
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const deliveryPendingPayouts = deliveryBalanceResult.length > 0 ? deliveryBalanceResult[0].total : 0;

    return res.status(200).json({
        success: true,
        data: {
            totalGMV,
            currentAccountBalance,
            totalAdminEarnings,
            sellerPendingPayouts,
            deliveryPendingPayouts,
            // Legacy field just in case
            pendingWithdrawalsCount: await WithdrawRequest.countDocuments({ status: 'Pending' })
        }
    });
});

/**
 * Get Admin Earnings (Commissions List)
 */
export const getAdminEarnings = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
        if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const earnings = await Commission.find(query)
        .populate('order', 'orderNumber')
        .populate('seller', 'storeName sellerName')
        .populate('deliveryBoy', 'name mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

    const total = await Commission.countDocuments(query);

    // Format data for frontend
    const formattedEarnings = earnings.map(e => {
        let sourceName = 'Unknown';
        if (e.type === 'SELLER' && e.seller) {
            sourceName = (e.seller as any).storeName || (e.seller as any).sellerName;
        } else if (e.type === 'DELIVERY_BOY' && e.deliveryBoy) {
            sourceName = (e.deliveryBoy as any).name;
        }

        return {
            id: e._id,
            source: sourceName,
            sourceType: e.type,
            amount: e.commissionAmount,
            date: e.createdAt,
            status: e.status,
            description: `Order #${(e.order as any)?.orderNumber || 'Unknown'}`,
            orderId: (e.order as any)?._id
        };
    });

    return res.status(200).json({
        success: true,
        data: formattedEarnings,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
        }
    });
});

/**
 * Get All Wallet Transactions (Sellers & Delivery Boys)
 */
export const getWalletTransactions = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, type, userType, search: _search } = req.query;

    const query: any = {};
    if (type) query.type = type;
    if (userType) query.userType = userType;

    // Search handling not fully implemented for cross-collection ref

    const skip = (Number(page) - 1) * Number(limit);

    const transactions = await WalletTransaction.find(query)
        .populate({
            path: 'userId', // This will populate based on refPath 'userType'
            select: 'name firstName lastName storeName sellerName mobile email'
        })
        .populate('relatedOrder', 'orderNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

    const total = await WalletTransaction.countDocuments(query);

    // Format transactions to ensure user name is accessible
    const formattedTransactions = transactions.map((t: any) => {
        let userName = 'Unknown';
        if (t.userId) {
            if (t.userType === 'SELLER') {
                userName = t.userId.storeName || t.userId.sellerName;
            } else {
                userName = t.userId.name || t.userId.firstName + ' ' + t.userId.lastName;
            }
        }

        return {
            _id: t._id,
            type: t.type,
            userType: t.userType,
            userName: userName,
            userId: t.userId?._id,
            amount: t.amount,
            description: t.description,
            status: t.status,
            createdAt: t.createdAt,
            reference: t.reference,
            relatedOrder: t.relatedOrder ? { orderNumber: t.relatedOrder.orderNumber } : undefined
        };
    });

    return res.status(200).json({
        success: true,
        data: formattedTransactions,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
        }
    });
});

/**
 * Process Withdrawal Wrapper (to match frontend service expectation)
 */
export const processWithdrawalWrapper = asyncHandler(async (req: Request, res: Response) => {
    const { requestId, action, remark, transactionReference } = req.body;

    if (!requestId || !action) {
        return res.status(400).json({
            success: false,
            message: 'Request ID and action are required'
        });
    }

    // Mock the params for the existing controllers
    req.params.id = requestId;

    if (action === 'Approve') {
        return approveWithdrawal(req, res);
    } else if (action === 'Reject') {
        req.body.remarks = remark; // Map 'remark' to 'remarks'
        return rejectWithdrawal(req, res);
    } else if (action === 'Complete') {
        if (!transactionReference) {
            return res.status(400).json({
                success: false,
                message: 'Transaction reference is required for completion'
            });
        }
        req.body.transactionReference = transactionReference;
        return completeWithdrawal(req, res);
    } else {
        return res.status(400).json({
            success: false,
            message: 'Invalid action. Must be "Approve", "Reject", or "Complete"'
        });
    }
});
