import { Request, Response } from "express";
import mongoose from "mongoose";
import NotificationTemplate from "../../../models/NotificationTemplate";
import Product from "../../../models/Product";
import ProductExplorationEvent from "../../../models/ProductExplorationEvent";
import ProductInterest from "../../../models/ProductInterest";
import ProductReminderCampaign from "../../../models/ProductReminderCampaign";
import { createCampaign } from "../../../services/productReminderService";
import { asyncHandler } from "../../../utils/asyncHandler";

const maskCustomerId = (id: unknown) => `CUST-****${String(id).slice(-2).toUpperCase()}`;

export const getInsightSummary = asyncHandler(async (req: Request, res: Response) => {
  const seller = new mongoose.Types.ObjectId(req.user!.userId);
  const now = new Date();
  const [totalViews, uniqueCustomers, viewedProducts, repeatExplorers, eligibleRecipients, campaigns] = await Promise.all([
    ProductExplorationEvent.countDocuments({ seller, expiresAt: { $gt: now } }),
    ProductInterest.distinct("customer", { seller, expiresAt: { $gt: now } }).then((v) => v.length),
    ProductInterest.distinct("product", { seller, expiresAt: { $gt: now } }).then((v) => v.length),
    ProductInterest.countDocuments({ seller, expiresAt: { $gt: now }, viewCount: { $gt: 1 } }),
    ProductInterest.countDocuments({ seller, expiresAt: { $gt: now } }),
    ProductReminderCampaign.aggregate([
      { $match: { seller } },
      { $group: { _id: null, accepted: { $sum: "$acceptedCount" }, inAppOnly: { $sum: "$inAppOnlyCount" }, opened: { $sum: "$openedCount" } } },
    ]),
  ]);
  return res.json({ success: true, data: {
    totalViews, uniqueCustomers, viewedProducts, repeatExplorers, eligibleRecipients,
    notificationsAccepted: campaigns[0]?.accepted || 0,
    inAppOnly: campaigns[0]?.inAppOnly || 0,
    notificationOpens: campaigns[0]?.opened || 0,
  } });
});

export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  const seller = req.user!.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const query: any = { seller, expiresAt: { $gt: new Date() } };
  if (req.query.productId && mongoose.Types.ObjectId.isValid(String(req.query.productId))) query.product = req.query.productId;
  if (req.query.minViews) query.viewCount = { $gte: Math.max(1, Number(req.query.minViews)) };
  const [rows, total] = await Promise.all([
    ProductInterest.find(query)
      .populate("product", "productName mainImage price discPrice compareAtPrice discount stock variations status publish")
      .populate("customer", "name status notificationPreferences privacyPreferences")
      .sort({ lastViewedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProductInterest.countDocuments(query),
  ]);
  const data = rows.filter((row: any) => row.customer?.privacyPreferences?.shareProductExplorationWithSellers !== false).map((row: any) => ({
    _id: row._id,
    product: row.product,
    customer: row.customer ? { name: row.customer.name, maskedId: maskCustomerId(row.customer._id) } : null,
    firstViewedAt: row.firstViewedAt,
    lastViewedAt: row.lastViewedAt,
    viewCount: row.viewCount,
    lastSource: row.lastSource,
    lastNotificationAt: row.lastNotificationAt,
    notificationCount: row.notificationCount,
    nextReminderAt: row.nextReminderAt,
    expiresAt: row.expiresAt,
    marketingEnabled: row.customer?.notificationPreferences?.productMarketingPush !== false,
  }));
  return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const getSellerInsightProducts = asyncHandler(async (req: Request, res: Response) => {
  const productIds = await ProductInterest.distinct("product", { seller: req.user!.userId, expiresAt: { $gt: new Date() } });
  const products = await Product.find({ _id: { $in: productIds }, seller: req.user!.userId }).select("productName mainImage").sort({ productName: 1 }).lean();
  return res.json({ success: true, data: products });
});

export const getActiveTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const templates = await NotificationTemplate.find({ status: "Active" }).select("name category titleTemplate bodyTemplate version").sort({ category: 1, name: 1 }).lean();
  return res.json({ success: true, data: templates });
});

export const createSellerCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { productId, templateId, idempotencyKey, interestId, campaignType = interestId ? "ManualSingle" : "ManualBulk" } = req.body;
  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(templateId) || !idempotencyKey) {
    return res.status(400).json({ success: false, message: "productId, templateId and idempotencyKey are required" });
  }
  if (!['ManualSingle', 'ManualBulk'].includes(campaignType)) return res.status(400).json({ success: false, message: "Invalid campaign type" });
  if (interestId) {
    const owned = await ProductInterest.exists({ _id: interestId, seller: req.user!.userId, product: productId, expiresAt: { $gt: new Date() } });
    if (!owned) return res.status(404).json({ success: false, message: "Customer interest not found" });
  }
  try {
    const campaign = await createCampaign({
      sellerId: req.user!.userId, productId, templateId, campaignType,
      idempotencyKey, createdByType: "Seller", createdBy: req.user!.userId, interestId,
    });
    return res.status(202).json({ success: true, message: "Reminder campaign queued", data: campaign });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export const getCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const campaigns = await ProductReminderCampaign.find({ seller: req.user!.userId })
    .populate("product", "productName mainImage").populate("template", "name category")
    .sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, data: campaigns });
});

export const cancelCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await ProductReminderCampaign.findOneAndUpdate(
    { _id: req.params.id, seller: req.user!.userId, status: { $in: ["Queued", "Processing"] } },
    { status: "Cancelled", completedAt: new Date() }, { new: true },
  );
  if (!campaign) return res.status(404).json({ success: false, message: "Cancellable campaign not found" });
  return res.json({ success: true, data: campaign });
});
