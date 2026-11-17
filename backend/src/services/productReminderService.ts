import crypto from "crypto";
import mongoose from "mongoose";
import Customer from "../models/Customer";
import CustomerPromotionDailyQuota from "../models/CustomerPromotionDailyQuota";
import Notification from "../models/Notification";
import NotificationTemplate from "../models/NotificationTemplate";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import ProductInterest from "../models/ProductInterest";
import ProductReminderCampaign from "../models/ProductReminderCampaign";
import ProductReminderRecipient, { ReminderRecipientStatus } from "../models/ProductReminderRecipient";
import Seller from "../models/Seller";
import { sendNotificationToUser } from "./firebaseAdmin";

const COOLDOWN_MS = 72 * 60 * 60 * 1000;
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

function indiaLocalDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Calcutta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function renderTemplate(value: string, values: Record<string, string>): string {
  return value.replace(PLACEHOLDER_PATTERN, (_match, key: string) => values[key] ?? "");
}

export function validateTemplatePlaceholders(title: string, body: string, allowed: string[]): string[] {
  const invalid = new Set<string>();
  for (const text of [title, body]) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) if (!allowed.includes(match[1])) invalid.add(match[1]);
  }
  return [...invalid];
}

async function hasPurchased(customerId: mongoose.Types.ObjectId, sellerId: mongoose.Types.ObjectId, productId: mongoose.Types.ObjectId) {
  const result = await OrderItem.aggregate([
    { $match: { seller: sellerId, product: productId, status: { $nin: ["Cancelled", "Returned"] }, sellerStatus: { $ne: "Rejected" } } },
    { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "orderDoc" } },
    { $unwind: "$orderDoc" },
    { $match: { "orderDoc.customer": customerId, "orderDoc.status": { $nin: ["Cancelled", "Rejected", "Returned"] } } },
    { $limit: 1 },
    { $project: { _id: 1 } },
  ]);
  return result.length > 0;
}

async function reserveDailyQuota(customerId: mongoose.Types.ObjectId): Promise<boolean> {
  const localDate = indiaLocalDate();
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  try {
    const quota = await CustomerPromotionDailyQuota.findOneAndUpdate(
      { customer: customerId, localDate, reservedCount: { $lt: 3 } },
      { $inc: { reservedCount: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return Boolean(quota && quota.reservedCount <= 3);
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function releaseDailyQuota(customerId: mongoose.Types.ObjectId) {
  await CustomerPromotionDailyQuota.updateOne(
    { customer: customerId, localDate: indiaLocalDate(), reservedCount: { $gt: 0 } },
    { $inc: { reservedCount: -1 } },
  );
}

export async function createCampaign(args: {
  sellerId: string;
  productId: string;
  templateId: string;
  campaignType: "ManualBulk" | "ManualSingle" | "AutomatedInterest" | "BackInStock";
  idempotencyKey: string;
  createdByType: "Seller" | "System";
  createdBy?: string;
  interestId?: string;
  interestIds?: string[];
}) {
  const [product, template] = await Promise.all([
    Product.findOne({ _id: args.productId, seller: args.sellerId }).select("_id seller").lean(),
    NotificationTemplate.findOne({ _id: args.templateId, status: "Active" }).lean(),
  ]);
  if (!product) throw new Error("Product not found or not owned by this seller");
  if (!template) throw new Error("Active notification template not found");
  if (args.campaignType === "BackInStock" && template.category !== "BackInStock") throw new Error("Back-in-stock template required");
  if (args.campaignType !== "BackInStock" && template.category !== "RecentProductInterest") throw new Error("Recent-interest template required");

  const now = new Date();
  const interestQuery: any = {
    seller: args.sellerId,
    product: args.productId,
    expiresAt: { $gt: now },
  };
  if (args.interestId) interestQuery._id = args.interestId;
  if (args.interestIds?.length) interestQuery._id = { $in: args.interestIds };
  const interests = await ProductInterest.find(interestQuery).select("_id seller customer product").lean();

  let campaign;
  try {
    campaign = await ProductReminderCampaign.create({
      seller: args.sellerId,
      product: args.productId,
      template: template._id,
      templateVersion: template.version,
      campaignType: args.campaignType,
      idempotencyKey: args.idempotencyKey,
      titleSnapshot: template.titleTemplate,
      bodySnapshot: template.bodyTemplate,
      totalCandidates: interests.length,
      createdByType: args.createdByType,
      ...(args.createdBy ? { createdBy: args.createdBy } : {}),
      expiresAt: new Date(Date.now() + AUDIT_RETENTION_MS),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return ProductReminderCampaign.findOne({ seller: args.sellerId, idempotencyKey: args.idempotencyKey });
    }
    throw error;
  }

  if (interests.length) {
    await ProductReminderRecipient.insertMany(interests.map((interest) => ({
      campaign: campaign._id,
      seller: interest.seller,
      customer: interest.customer,
      product: interest.product,
      interest: interest._id,
      status: "Pending",
      expiresAt: new Date(Date.now() + AUDIT_RETENTION_MS),
    })), { ordered: false });
  } else {
    campaign.status = "Completed";
    campaign.completedAt = new Date();
    await campaign.save();
  }
  return campaign;
}

async function finalizeRecipient(recipientId: mongoose.Types.ObjectId, status: ReminderRecipientStatus, extra: Record<string, any> = {}) {
  await ProductReminderRecipient.updateOne({ _id: recipientId }, { status, processedAt: new Date(), ...extra });
}

async function processRecipient(recipientId: mongoose.Types.ObjectId, campaign: any, product: any, seller: any) {
  const recipient = await ProductReminderRecipient.findOneAndUpdate(
    { _id: recipientId, status: "Pending" }, { status: "Processing", processingStartedAt: new Date() }, { new: true },
  );
  if (!recipient) return;

  const [interest, customer] = await Promise.all([
    ProductInterest.findById(recipient.interest).lean(),
    Customer.findById(recipient.customer).lean(),
  ]);
  if (!campaign || campaign.status === "Cancelled" || !product || !seller) return finalizeRecipient(recipient._id, "SkippedInvalidProduct");
  if (!interest || interest.expiresAt <= new Date()) return finalizeRecipient(recipient._id, "SkippedExpiredInterest");
  if (campaign.campaignType === "AutomatedInterest" && interest.nextReminderAt > new Date()) {
    return finalizeRecipient(recipient._id, "SkippedExpiredInterest", { failureReason: "A newer product view reset the six-hour reminder delay" });
  }
  if (!customer || customer.status !== "Active") return finalizeRecipient(recipient._id, "SkippedInactiveCustomer");
  if (customer.privacyPreferences?.shareProductExplorationWithSellers === false || customer.notificationPreferences?.productMarketingPush === false) {
    return finalizeRecipient(recipient._id, "SkippedOptOut");
  }
  if (await hasPurchased(customer._id, recipient.seller, recipient.product)) return finalizeRecipient(recipient._id, "SkippedPurchased");

  const cooldownStart = new Date(Date.now() - COOLDOWN_MS);
  const recent = await ProductReminderRecipient.exists({
    _id: { $ne: recipient._id }, seller: recipient.seller, customer: recipient.customer, product: recipient.product,
    status: { $in: ["AcceptedByFcm", "InAppOnly"] }, processedAt: { $gte: cooldownStart },
  });
  if (recent) return finalizeRecipient(recipient._id, "SkippedCooldown");
  if (!(await reserveDailyQuota(customer._id))) return finalizeRecipient(recipient._id, "SkippedDailyCap");
  let releaseQuotaOnError = true;

  try {
    const price = product.discPrice ?? product.price;
    const mrp = product.compareAtPrice ?? product.price;
    const values = {
    customerName: customer.name,
    productName: product.productName,
    storeName: seller.storeName,
    price: `₹${price}`,
    mrp: `₹${mrp}`,
    discount: `${product.discount || 0}%`,
    };
    const renderedTitle = renderTemplate(campaign.titleSnapshot, values);
    const renderedBody = renderTemplate(campaign.bodySnapshot, values);
    const link = `/product/${product._id}?campaign=${campaign._id}`;
    const notification = await Notification.create({
    recipientType: "Customer", recipientId: customer._id, title: renderedTitle, message: renderedBody,
    type: "Promotion", link, actionLabel: "View product", priority: "Medium", isRead: false,
    });

    const push = await sendNotificationToUser(customer._id.toString(), "Customer", {
      title: renderedTitle,
      body: renderedBody,
      data: { type: "PRODUCT_REMINDER", link, productId: product._id.toString(), campaignId: campaign._id.toString() },
      icon: product.mainImage,
    });
    if (push?.successCount > 0) {
      notification.sentAt = new Date();
      await notification.save();
      await finalizeRecipient(recipient._id, "AcceptedByFcm", {
        notification: notification._id, renderedTitle, renderedBody,
        fcmSuccessCount: push.successCount, fcmFailureCount: push.failureCount || 0,
      });
      releaseQuotaOnError = false;
    } else {
      releaseQuotaOnError = false;
      await finalizeRecipient(recipient._id, "InAppOnly", {
        notification: notification._id, renderedTitle, renderedBody,
        fcmFailureCount: push?.failureCount || 0,
        failureReason: push ? "Firebase did not accept the notification" : "No registered push device",
      });
    }

    await ProductInterest.updateOne({ _id: interest._id }, {
      lastNotificationAt: new Date(), $inc: { notificationCount: 1 }, automationStatus: "Sent",
    });
  } catch (error) {
    if (releaseQuotaOnError) await releaseDailyQuota(customer._id);
    throw error;
  }
}

async function refreshCampaign(campaignId: mongoose.Types.ObjectId) {
  const grouped = await ProductReminderRecipient.aggregate([
    { $match: { campaign: campaignId } }, { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(grouped.map((row) => [row._id, row.count])) as Record<string, number>;
  const pending = (counts.Pending || 0) + (counts.Processing || 0);
  const acceptedCount = counts.AcceptedByFcm || 0;
  const inAppOnlyCount = counts.InAppOnly || 0;
  const failedCount = counts.Failed || 0;
  const processedCount = grouped.reduce((sum, row) => sum + row.count, 0) - pending;
  const skippedCount = processedCount - acceptedCount - inAppOnlyCount - failedCount;
  const update: any = { processedCount, acceptedCount, inAppOnlyCount, failedCount, skippedCount };
  if (!pending) {
    update.status = failedCount && !acceptedCount && !inAppOnlyCount ? "Failed" : failedCount ? "PartiallyCompleted" : "Completed";
    update.completedAt = new Date();
  }
  await ProductReminderCampaign.updateOne({ _id: campaignId }, update);
}

export async function processQueuedReminderCampaigns(batchSize = 50) {
  await ProductReminderRecipient.updateMany(
    { status: "Processing", processingStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
    { status: "Pending", $unset: { processingStartedAt: 1 } },
  );
  const campaigns = await ProductReminderCampaign.find({ status: { $in: ["Queued", "Processing"] } }).sort({ createdAt: 1 }).limit(10);
  let remaining = batchSize;
  for (const campaign of campaigns) {
    if (remaining <= 0) break;
    if (campaign.status === "Queued") await ProductReminderCampaign.updateOne({ _id: campaign._id }, { status: "Processing", startedAt: new Date() });
    const [product, seller] = await Promise.all([
      Product.findOne({ _id: campaign.product, seller: campaign.seller, status: "Active", publish: true }).lean(),
      Seller.findById(campaign.seller).select("storeName").lean(),
    ]);
    const recipients = await ProductReminderRecipient.find({ campaign: campaign._id, status: "Pending" }).select("_id").limit(remaining).lean();
    for (const recipient of recipients) {
      try {
        await processRecipient(recipient._id, campaign.toObject(), product, seller);
      } catch (error: any) {
        await finalizeRecipient(recipient._id, "Failed", { failureReason: error?.message || "Unexpected reminder processing failure" });
      }
    }
    remaining -= recipients.length;
    await refreshCampaign(campaign._id);
  }
}

export async function scheduleDueInterestReminders(limit = 50) {
  const template = await NotificationTemplate.findOne({ category: "RecentProductInterest", status: "Active" }).sort({ version: -1 }).lean();
  if (!template) return;
  const now = new Date();
  const interests = await ProductInterest.find({ automationStatus: "Pending", nextReminderAt: { $lte: now }, expiresAt: { $gt: now } }).limit(limit).lean();
  const grouped = new Map<string, typeof interests>();
  for (const interest of interests) {
    const key = `${interest.seller}:${interest.product}`;
    const group = grouped.get(key) || [];
    group.push(interest);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    const first = group[0];
    const signature = crypto.createHash("sha1").update(
      group.map((interest) => `${interest._id}:${interest.lastViewedAt.getTime()}`).sort().join("|"),
    ).digest("hex").slice(0, 20);
    await createCampaign({
      sellerId: first.seller.toString(), productId: first.product.toString(), templateId: template._id.toString(),
      campaignType: "AutomatedInterest", idempotencyKey: `auto:${first.product}:${signature}`,
      createdByType: "System", interestIds: group.map((interest) => interest._id.toString()),
    });
    await ProductInterest.updateMany(
      { _id: { $in: group.map((interest) => interest._id) }, automationStatus: "Pending", nextReminderAt: { $lte: now } },
      { automationStatus: "Sent" },
    );
  }
}

let reminderWorkerRunning = false;
export async function runProductReminderWorker() {
  if (reminderWorkerRunning) return;
  reminderWorkerRunning = true;
  try {
    await scheduleDueInterestReminders(Number(process.env.REMINDER_SCHEDULE_BATCH_SIZE) || 50);
    await processQueuedReminderCampaigns(Number(process.env.REMINDER_SEND_BATCH_SIZE) || 50);
  } finally {
    reminderWorkerRunning = false;
  }
}

export function isProductAvailable(product: any): boolean {
  if (Array.isArray(product?.variations) && product.variations.length > 0) {
    return product.variations.some((variation: any) => Number(variation.stock || 0) > 0 && variation.status !== "Sold out");
  }
  return Number(product?.stock || 0) > 0;
}

export async function scheduleBackInStockCampaign(productId: string, transitionKey: string) {
  const [product, template] = await Promise.all([
    Product.findById(productId).select("_id seller status publish stock variations").lean(),
    NotificationTemplate.findOne({ category: "BackInStock", status: "Active" }).sort({ version: -1 }).lean(),
  ]);
  if (!product || !template || product.status !== "Active" || !product.publish || !isProductAvailable(product)) return;
  await createCampaign({
    sellerId: product.seller.toString(), productId: product._id.toString(), templateId: template._id.toString(),
    campaignType: "BackInStock", idempotencyKey: `stock:${product._id}:${transitionKey}`, createdByType: "System",
  });
}

export function newIdempotencyKey() { return crypto.randomUUID(); }
