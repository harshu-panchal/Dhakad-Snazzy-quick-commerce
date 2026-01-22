import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Commission from "../../../models/Commission";
import WalletTransaction from "../../../models/WalletTransaction";
import WithdrawRequest from "../../../models/WithdrawRequest";
import Seller from "../../../models/Seller";
import Delivery from "../../../models/Delivery";
import { creditWallet } from "../../../services/walletManagementService";
import mongoose from "mongoose";
// @ts-ignore
import Order from "../../../models/Order";

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get Financial Dashboard Stats
 * Returns aggregated metrics for the wallet dashboard.
 */
export const getFinancialDashboard = asyncHandler(
  async (_req: Request, res: Response) => {
    // 1. Total Earnings (Sum of all PAID commissions)
    // Note: Commission records represent the Platform Fee (Admin Earning)
    const totalEarningsResult = await Commission.aggregate([
      { $match: { status: "Paid" } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);
    const totalEarnings = totalEarningsResult[0]?.total || 0;

    // 2. Pending Earnings (Sum of PENDING commissions)
    const pendingEarningsResult = await Commission.aggregate([
      { $match: { status: "Pending" } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);
    const pendingEarnings = pendingEarningsResult[0]?.total || 0;

    // 3. This Month Earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthEarningsResult = await Commission.aggregate([
      {
        $match: {
          status: "Paid",
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);
    const thisMonthEarnings = monthEarningsResult[0]?.total || 0;

    const stats = {
      totalEarnings,
      paidEarnings: totalEarnings, // "Paid Earnings" is effectively Total Resolved Earnings in this context
      pendingEarnings,
      thisMonthEarnings,
    };

    return res.status(200).json({
      success: true,
      message: "Financial dashboard stats fetched",
      data: stats,
    });
  },
);

// ============================================================================
// ADMIN EARNINGS (COMMISSIONS)
// ============================================================================

/**
 * Get Admin Earnings (Commissions List)
 * Supports pagination, search, and date filters.
 */
export const getAdminEarnings = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const query: any = {};
    if (status && status !== "All") query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [commissions, total] = await Promise.all([
      Commission.find(query)
        .populate("order", "orderNumber")
        .populate("seller", "storeName")
        .populate("deliveryBoy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Commission.countDocuments(query),
    ]);

    const formattedEarnings = commissions.map((c) => {
      let source = "System";
      if (c.type === "SELLER")
        source = (c.seller as any)?.storeName || "Unknown Seller";
      else if (c.type === "DELIVERY_BOY")
        source = (c.deliveryBoy as any)?.name || "Unknown Delivery Boy";

      return {
        id: c._id,
        source,
        amount: c.commissionAmount,
        date: new Date(c.createdAt).toLocaleDateString("en-IN"),
        status: c.status,
        description: `Commission from Order #${(c.order as any)?.orderNumber || "N/A"}`,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedEarnings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  },
);

// ============================================================================
// WALLET TRANSACTIONS
// ============================================================================

/**
 * Get Wallet Transactions
 * Fetches transactions across the platform (Credits/Debits).
 */
export const getWalletTransactions = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, type, status } = req.query;

    const query: any = {};
    if (type) query.type = type; // Credit or Debit
    if (status && status !== "All") query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .populate("relatedOrder", "orderNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WalletTransaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  },
);

// ============================================================================
// WITHDRAWAL REQUESTS
// ============================================================================

/**
 * Get Withdrawal Requests
 * Fetches seller/delivery boy withdrawal requests.
 */
export const getWithdrawalRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, status } = req.query; // status: Pending, Approved, Rejected

    const query: any = {};
    if (status && status !== "All") query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      WithdrawRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      WithdrawRequest.countDocuments(query),
    ]);

    // Enrich with user details (Manual populate because userId is generic string)
    const enrichedRequests = await Promise.all(
      requests.map(async (req) => {
        let userName = "Unknown";
        let userIdDisplay = req.userId;

        if (req.userType === "SELLER") {
          const seller = await Seller.findById(req.userId).select(
            "storeName email",
          );
          if (seller) {
            userName = seller.storeName;
          }
        } else if (req.userType === "DELIVERY_BOY") {
          const db = await Delivery.findById(req.userId).select("name email");
          if (db) {
            userName = db.name;
          }
        }

        // Return flattened structure expected by frontend usually
        return {
          id: req._id,
          userId: userIdDisplay,
          userName,
          amount: req.amount,
          requestDate: new Date(req.createdAt).toLocaleDateString("en-IN"),
          status: req.status,
          paymentMethod: req.paymentMethod || "Bank Transfer",
          accountDetails: "View Details", // Simplification
          remark: req.remarks,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      data: enrichedRequests,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  },
);

/**
 * Process Withdrawal (Approve/Reject)
 */
export const processWithdrawal = asyncHandler(
  async (req: Request, res: Response) => {
    const { action, remark, requestId } = req.body;

    // Support ID from params if we switch to clean REST later, but stick to body for now
    const idToProcess = requestId || req.body.id;

    if (!idToProcess || !action) {
      return res.status(400).json({
        success: false,
        message: "Request ID and Action are required",
      });
    }

    const request = await WithdrawRequest.findById(idToProcess);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    if (request.status !== "Pending") {
      return res
        .status(400)
        .json({ success: false, message: "Request is already processed" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (action === "Approve") {
        // Amount already deducted at request time. Just update status.
        request.status = "Approved";
        request.processedAt = new Date();
        // request.processedBy = req.user.id; // If auth user available
      } else if (action === "Reject") {
        // Refund the amount
        await creditWallet(
          request.userId.toString(),
          request.userType as any,
          request.amount,
          `Withdrawal Rejected: ${idToProcess}`,
          undefined,
          undefined,
          session,
        );

        request.status = "Rejected";
        request.remarks = remark;
        request.processedAt = new Date();
      }

      await request.save({ session });
      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        message: `Withdrawal ${action}ed successfully`,
      });
    } catch (error: any) {
      await session.abortTransaction();
      console.error("Error processing withdrawal:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Processing failed",
      });
    } finally {
      session.endSession();
    }
  },
);

// Fallback for previous route compatibility if needed
export const getSellerTransactions = asyncHandler(
  async (_req: Request, res: Response) => {
    return res.status(200).json({ success: true, data: [] });
  },
);

export const processFundTransfer = asyncHandler(
  async (_req: Request, res: Response) => {
    return res
      .status(200)
      .json({ success: true, message: "Not implemented in rewrite" });
  },
);

export const getAllOrderTransactions = asyncHandler(
  async (req: Request, res: Response, next: any) => {
    return getWalletTransactions(req, res, next);
  },
);

export const getDeliveryChargesReport = asyncHandler(
  async (_req: Request, res: Response) => {
    return res.status(200).json({ success: true, data: [] });
  },
);
