import Commission from '../models/Commission';
import Order from '../models/Order';
import OrderItem from '../models/OrderItem';
import Seller from '../models/Seller';
import Delivery from '../models/Delivery';
import AppSettings from '../models/AppSettings';
import { creditWallet } from './walletManagementService';
import mongoose from 'mongoose';

/**
 * Get commission rate for a seller
 */
/**
 * Get commission rate for a seller
 */
export const getSellerCommissionRate = async (
    sellerId: string
): Promise<number> => {
    try {
        const seller = await Seller.findById(sellerId);
        if (!seller) {
            throw new Error('Seller not found');
        }

        // Use individual rate if set, otherwise use global default
        if (seller.commissionRate !== undefined && seller.commissionRate !== null) {
            return seller.commissionRate;
        }

        return 10; // Default 10%
    } catch (error) {
        console.error('Error getting seller commission rate:', error);
        return 10; // Default fallback
    }
};

/**
 * Get commission rate for a delivery boy
 */
export const getDeliveryBoyCommissionRate = async (
    deliveryBoyId: string
): Promise<number> => {
    try {
        const deliveryBoy = await Delivery.findById(deliveryBoyId);
        if (!deliveryBoy) {
            throw new Error('Delivery boy not found');
        }

        // Use individual rate if set, otherwise use global default
        if (deliveryBoy.commissionRate !== undefined && deliveryBoy.commissionRate !== null) {
            return deliveryBoy.commissionRate;
        }

        return 5; // Default 5%
    } catch (error) {
        console.error('Error getting delivery boy commission rate:', error);
        return 5; // Default fallback
    }
};

/**
 * Calculate commissions for an order
 */
export const calculateOrderCommissions = async (orderId: string) => {
    try {
        const order = await Order.findById(orderId).populate('items');
        if (!order) {
            throw new Error('Order not found');
        }

        const commissions: {
            seller?: {
                sellerId: string;
                amount: number;
                rate: number;
                orderAmount: number;
            }[];
            deliveryBoy?: {
                deliveryBoyId: string;
                amount: number;
                rate: number;
                orderAmount: number;
            };
        } = {};

        // Calculate seller commissions (per item/seller)
        const sellerCommissions = new Map<string, { amount: number; rate: number; orderAmount: number }>();

        for (const itemId of order.items) {
            const orderItem = await OrderItem.findById(itemId);
            if (!orderItem) continue;

            const sellerId = orderItem.seller.toString();
            const itemTotal = orderItem.total;

            // Get commission rate for this seller
            const commissionRate = await getSellerCommissionRate(sellerId);
            const commissionAmount = (itemTotal * commissionRate) / 100;

            if (sellerCommissions.has(sellerId)) {
                const existing = sellerCommissions.get(sellerId)!;
                existing.amount += commissionAmount;
                existing.orderAmount += itemTotal;
            } else {
                sellerCommissions.set(sellerId, {
                    amount: commissionAmount,
                    rate: commissionRate,
                    orderAmount: itemTotal,
                });
            }
        }

        // Convert to array
        commissions.seller = Array.from(sellerCommissions.entries()).map(
            ([sellerId, data]) => ({
                sellerId,
                ...data,
            })
        );

        // Calculate delivery boy commission (on order subtotal OR distance based)
        if (order.deliveryBoy) {
            const deliveryBoyId = order.deliveryBoy.toString();

            // Check for distance based commission
            let commissionAmount = 0;
            let commissionRate = 0;
            let usedDistanceBased = false;

            try {
                const settings = await AppSettings.getSettings();
                if (settings &&
                    settings.deliveryConfig?.isDistanceBased === true &&
                    settings.deliveryConfig?.deliveryBoyKmRate &&
                    order.deliveryDistanceKm &&
                    order.deliveryDistanceKm > 0
                ) {
                    commissionRate = settings.deliveryConfig.deliveryBoyKmRate;
                    commissionAmount = order.deliveryDistanceKm * commissionRate;
                    usedDistanceBased = true;
                    console.log(`DEBUG: Distance Commission: Dist=${order.deliveryDistanceKm}km, Rate=${commissionRate}/km, Amt=${commissionAmount}`);
                }
            } catch (err) {
                console.error("Error checking settings for commission:", err);
            }

            if (!usedDistanceBased) {
                // Fallback to percentage based logic
                commissionRate = await getDeliveryBoyCommissionRate(deliveryBoyId);
                commissionAmount = (order.subtotal * commissionRate) / 100;
            }

            commissions.deliveryBoy = {
                deliveryBoyId,
                amount: Math.round(commissionAmount * 100) / 100, // Round to 2 decimals
                rate: commissionRate,
                orderAmount: usedDistanceBased ? (order.deliveryDistanceKm || 0) : order.subtotal,
            };
        }

        return {
            success: true,
            data: commissions,
        };
    } catch (error: any) {
        console.error('Error calculating order commissions:', error);
        return {
            success: false,
            message: error.message || 'Failed to calculate commissions',
        };
    }
};

/**
 * Distribute commissions for an order
 */
export const distributeCommissions = async (orderId: string) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new Error('Order not found');
        }

        // Check if order is delivered
        if (order.status !== 'Delivered') {
            throw new Error('Commissions can only be distributed for delivered orders');
        }

        // Check if commissions already distributed
        const existingCommissions = await Commission.find({ order: orderId }).session(session);
        if (existingCommissions.length > 0) {
            throw new Error('Commissions already distributed for this order');
        }

        // Calculate commissions
        const result = await calculateOrderCommissions(orderId);
        if (!result.success || !result.data) {
            throw new Error('Failed to calculate commissions');
        }

        const { seller: sellerCommissions, deliveryBoy: deliveryBoyCommission } = result.data;

        const createdCommissions: any[] = [];

        // Create and credit seller commissions
        if (sellerCommissions && sellerCommissions.length > 0) {
            for (const sellerComm of sellerCommissions) {
                // Create commission record
                const commission = new Commission({
                    order: orderId,
                    seller: sellerComm.sellerId,
                    type: 'SELLER',
                    orderAmount: sellerComm.orderAmount,
                    commissionRate: sellerComm.rate,
                    commissionAmount: sellerComm.amount,
                    status: 'Paid',
                    paidAt: new Date(),
                });

                await commission.save({ session });
                createdCommissions.push(commission);

                // Credit seller wallet
                const netAmount = sellerComm.orderAmount - sellerComm.amount;
                await creditWallet(
                    sellerComm.sellerId,
                    'SELLER',
                    netAmount,
                    `Sale proceeds for order ${order.orderNumber} (Commission: ₹${sellerComm.amount})`,
                    orderId,
                    commission._id.toString(),
                    session
                );
            }
        }

        // Create and credit delivery boy commission
        if (deliveryBoyCommission) {
            const commission = new Commission({
                order: orderId,
                deliveryBoy: deliveryBoyCommission.deliveryBoyId,
                type: 'DELIVERY_BOY',
                orderAmount: deliveryBoyCommission.orderAmount,
                commissionRate: deliveryBoyCommission.rate,
                commissionAmount: deliveryBoyCommission.amount,
                status: 'Paid',
                paidAt: new Date(),
            });

            await commission.save({ session });
            createdCommissions.push(commission);

            // Credit delivery boy wallet
            await creditWallet(
                deliveryBoyCommission.deliveryBoyId,
                'DELIVERY_BOY',
                deliveryBoyCommission.amount,
                `Commission for order ${order.orderNumber}`,
                orderId,
                commission._id.toString(),
                session
            );
        }

        await session.commitTransaction();

        return {
            success: true,
            message: 'Commissions distributed successfully',
            data: {
                commissions: createdCommissions,
            },
        };
    } catch (error: any) {
        await session.abortTransaction();
        console.error('Error distributing commissions:', error);
        return {
            success: false,
            message: error.message || 'Failed to distribute commissions',
        };
    } finally {
        session.endSession();
    }
};

/**
 * Get commission summary for a user
 */
export const getCommissionSummary = async (
    userId: string,
    userType: 'SELLER' | 'DELIVERY_BOY'
) => {
    try {
        const query = userType === 'SELLER' ? { seller: userId } : { deliveryBoy: userId };

        const commissions = await Commission.find(query).sort({ createdAt: -1 });

        const summary = {
            total: 0,
            paid: 0,
            pending: 0,
            count: commissions.length,
            commissions: commissions.map((c) => ({
                id: c._id,
                orderId: c.order,
                amount: c.commissionAmount,
                rate: c.commissionRate,
                orderAmount: c.orderAmount,
                status: c.status,
                paidAt: c.paidAt,
                createdAt: c.createdAt,
            })),
        };

        commissions.forEach((c) => {
            summary.total += c.commissionAmount;
            if (c.status === 'Paid') {
                summary.paid += c.commissionAmount;
            } else if (c.status === 'Pending') {
                summary.pending += c.commissionAmount;
            }
        });

        return {
            success: true,
            data: summary,
        };
    } catch (error: any) {
        console.error('Error getting commission summary:', error);
        return {
            success: false,
            message: error.message || 'Failed to get commission summary',
        };
    }
};

/**
 * Reverse commissions for a cancelled/returned order
 */
export const reverseCommissions = async (orderId: string) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const commissions = await Commission.find({ order: orderId }).session(session);

        if (commissions.length === 0) {
            // No commissions to reverse
            return {
                success: true,
                message: 'No commissions to reverse',
            };
        }

        for (const commission of commissions) {
            // Only reverse if status is Paid
            if (commission.status === 'Paid') {
                commission.status = 'Cancelled';
                await commission.save({ session });

                // Debit from wallet
                const userId = commission.type === 'SELLER' ? commission.seller : commission.deliveryBoy;
                const userType = commission.type;

                if (userId) {
                    const { debitWallet } = await import('./walletManagementService');
                    await debitWallet(
                        userId.toString(),
                        userType,
                        commission.commissionAmount,
                        `Commission reversal for cancelled order`,
                        orderId,
                        session
                    );
                }
            }
        }

        await session.commitTransaction();

        return {
            success: true,
            message: 'Commissions reversed successfully',
        };
    } catch (error: any) {
        await session.abortTransaction();
        console.error('Error reversing commissions:', error);
        return {
            success: false,
            message: error.message || 'Failed to reverse commissions',
        };
    } finally {
        session.endSession();
    }
};
