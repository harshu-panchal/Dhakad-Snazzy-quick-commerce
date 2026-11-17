import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../../../models/Customer";
import Product from "../../../models/Product";
import ProductExplorationEvent, { ProductExplorationSource } from "../../../models/ProductExplorationEvent";
import ProductInterest from "../../../models/ProductInterest";
import ProductReminderCampaign from "../../../models/ProductReminderCampaign";
import ProductReminderRecipient from "../../../models/ProductReminderRecipient";
import { asyncHandler } from "../../../utils/asyncHandler";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SOURCES = new Set<ProductExplorationSource>([
  "direct", "home", "search", "category", "store", "reel", "wishlist", "order-again", "similar-product", "promotion",
]);

export const recordProductView = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?.userId;
  const { eventId, productId, campaignId } = req.body;
  const source = SOURCES.has(req.body.source) ? req.body.source as ProductExplorationSource : "direct";

  if (!customerId || !eventId || typeof eventId !== "string" || eventId.length > 100 || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ success: false, message: "Valid eventId and productId are required" });
  }

  const customer = await Customer.findById(customerId).select("status privacyPreferences").lean();
  if (!customer || customer.status !== "Active") {
    return res.status(403).json({ success: false, message: "Customer is not eligible for product exploration tracking" });
  }
  if (customer.privacyPreferences?.shareProductExplorationWithSellers === false) {
    return res.status(202).json({ success: true, tracked: false, reason: "preference_disabled" });
  }

  const product = await Product.findOne({ _id: productId, status: "Active", publish: true })
    .select("seller productName mainImage price discPrice")
    .lean();
  if (!product) return res.status(404).json({ success: false, message: "Product not found or unavailable" });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS);
  const nextReminderAt = new Date(now.getTime() + SIX_HOURS_MS);
  const snapshot = {
    name: product.productName,
    ...(product.mainImage ? { image: product.mainImage } : {}),
    price: product.discPrice ?? product.price,
  };

  try {
    await ProductExplorationEvent.create({
      eventId,
      customer: customerId,
      seller: product.seller,
      product: product._id,
      source,
      ...(campaignId && mongoose.Types.ObjectId.isValid(campaignId) ? { campaign: campaignId } : {}),
      occurredAt: now,
      receivedAt: now,
      productSnapshot: snapshot,
      expiresAt,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(200).json({ success: true, tracked: true, duplicate: true });
    }
    throw error;
  }

  await ProductInterest.findOneAndUpdate(
    { seller: product.seller, customer: customerId, product: product._id },
    {
      $setOnInsert: { firstViewedAt: now },
      $set: {
        lastViewedAt: now,
        lastSource: source,
        productSnapshot: snapshot,
        nextReminderAt,
        automationStatus: "Pending",
        expiresAt,
      },
      $inc: { viewCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
    const opened = await ProductReminderRecipient.findOneAndUpdate(
      { campaign: campaignId, customer: customerId, product: product._id, openedAt: { $exists: false } },
      { openedAt: now },
      { new: true },
    );
    if (opened) await ProductReminderCampaign.updateOne({ _id: campaignId }, { $inc: { openedCount: 1 } });
  }

  return res.status(202).json({ success: true, tracked: true });
});

export const clearProductActivity = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?.userId;
  await Promise.all([
    ProductExplorationEvent.deleteMany({ customer: customerId }),
    ProductInterest.deleteMany({ customer: customerId }),
    ProductReminderRecipient.updateMany(
      { customer: customerId, status: "Pending" },
      { status: "SkippedOptOut", processedAt: new Date(), failureReason: "Customer cleared product activity" },
    ),
  ]);
  return res.json({ success: true, message: "Recent product activity cleared" });
});
