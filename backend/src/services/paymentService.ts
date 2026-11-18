import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Payment from "../models/Payment";
import Order from "../models/Order";
import Delivery from "../models/Delivery";
import PlatformWallet from "../models/PlatformWallet";
import WalletTransaction from "../models/WalletTransaction";
import RazorpayPaymentAttempt, {
  IRazorpayPaymentAttempt,
  RazorpayPaymentPurpose,
} from "../models/RazorpayPaymentAttempt";
import RazorpayWebhookEvent from "../models/RazorpayWebhookEvent";
import PaymentOutboxEvent from "../models/PaymentOutboxEvent";
import { createPendingCommissions, processPendingCODPayouts } from "./commissionService";

type CreateRazorpayOrderArgs = {
  purpose: RazorpayPaymentPurpose;
  ownerId: string;
  localEntityId: string;
  amount: number;
  currency?: string;
  receipt: string;
};

type ExpectedAttempt = {
  purpose: RazorpayPaymentPurpose;
  ownerId: string;
  localEntityId: string;
};

const TERMINAL_ATTEMPT_STATUSES = ["Settled", "Refunded"];
const NON_REGRESSIBLE_ATTEMPT_STATUSES = [
  "Captured",
  "Settled",
  "Expired",
  "RefundRequired",
  "RefundPending",
  "Refunded",
];
let razorpayClientOverride: any;

// Narrow test seam for deterministic gateway integration tests. Production
// never sets this and always constructs the official Razorpay SDK client.
export const setRazorpayClientForTests = (client?: any) => {
  razorpayClientOverride = client;
};

const getRazorpayInstance = () => {
  if (razorpayClientOverride) return razorpayClientOverride;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials not configured");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const secureHexEqual = (left: string, right: string): boolean => {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const verifyPaymentSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): boolean => {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return secureHexEqual(expected, razorpaySignature);
};

export const verifyWebhookSignature = (rawBody: Buffer, signature: string): boolean => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("Razorpay webhook secret not configured");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return secureHexEqual(expected, signature);
};

export const createRazorpayOrder = async (args: CreateRazorpayOrderArgs) => {
  try {
    if (!mongoose.isValidObjectId(args.ownerId) || !mongoose.isValidObjectId(args.localEntityId)) {
      throw new Error("Invalid Razorpay payment owner or local entity");
    }
    const amountPaise = Math.round(Number(args.amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new Error("Invalid Razorpay payment amount");
    }
    const currency = (args.currency || "INR").toUpperCase();
    const gatewayOrder: any = await getRazorpayInstance().orders.create({
      amount: amountPaise,
      currency,
      receipt: args.receipt,
      notes: {
        purpose: args.purpose,
        ownerId: args.ownerId,
        localEntityId: args.localEntityId,
      },
    });
    const attempt = await RazorpayPaymentAttempt.create({
      purpose: args.purpose,
      ownerType: args.purpose === "CUSTOMER_ORDER" ? "Customer" : "Delivery",
      owner: args.ownerId,
      localEntity: args.localEntityId,
      receipt: args.receipt,
      amountPaise,
      currency,
      razorpayOrderId: gatewayOrder.id,
      status: "Created",
      gatewayStatus: gatewayOrder.status,
      nextReconcileAt: new Date(Date.now() + 60_000),
    });
    return {
      success: true,
      data: {
        attemptId: attempt._id,
        razorpayOrderId: gatewayOrder.id,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        amount: Number(gatewayOrder.amount),
        currency: gatewayOrder.currency,
        receipt: gatewayOrder.receipt,
      },
    };
  } catch (error: any) {
    console.error("Error creating Razorpay order:", error);
    return { success: false, message: error.message || "Failed to create Razorpay order" };
  }
};

const assertGatewayPaymentMatchesAttempt = (attempt: IRazorpayPaymentAttempt, payment: any) => {
  if (!payment || payment.id !== attempt.razorpayPaymentId) {
    throw new Error("Razorpay payment identity mismatch");
  }
  if (payment.order_id !== attempt.razorpayOrderId) {
    throw new Error("Razorpay payment does not belong to the expected Razorpay order");
  }
  if (Number(payment.amount) !== attempt.amountPaise) {
    throw new Error("Razorpay payment amount mismatch");
  }
  if (String(payment.currency || "").toUpperCase() !== attempt.currency) {
    throw new Error("Razorpay payment currency mismatch");
  }
  if (payment.status !== "captured" || payment.captured !== true) {
    throw new Error(`Razorpay payment is not captured (status: ${payment.status || "unknown"})`);
  }
};

const markAttemptForRefund = async (
  attempt: IRazorpayPaymentAttempt,
  paymentId: string,
  session: mongoose.ClientSession,
) => {
  attempt.razorpayPaymentId = paymentId;
  attempt.gatewayStatus = "captured";
  attempt.status = "RefundRequired";
  attempt.nextReconcileAt = new Date();
  await attempt.save({ session });
};

const settleCustomerOrder = async (
  attempt: IRazorpayPaymentAttempt,
  payment: any,
  session: mongoose.ClientSession,
) => {
  const order = await Order.findById(attempt.localEntity).session(session);
  if (!order || order.customer.toString() !== attempt.owner.toString()) {
    throw new Error("Customer order for Razorpay attempt was not found");
  }
  if (order.paymentStatus === "Paid") {
    if (order.paymentId === payment.id) {
      attempt.status = "Settled";
      attempt.settledAt = attempt.settledAt || new Date();
      await attempt.save({ session });
      return;
    }
    await markAttemptForRefund(attempt, payment.id, session);
    return;
  }
  if (order.status === "Cancelled" || order.paymentStatus === "Refunded") {
    await markAttemptForRefund(attempt, payment.id, session);
    return;
  }

  await Payment.findOneAndUpdate(
    { paymentAttempt: attempt._id },
    {
      $setOnInsert: {
        paymentAttempt: attempt._id,
        order: order._id,
        customer: order.customer,
        paymentMethod: "Online",
        paymentGateway: "Razorpay",
        razorpayOrderId: attempt.razorpayOrderId,
        razorpayPaymentId: payment.id,
        amount: attempt.amountPaise / 100,
        currency: attempt.currency,
        status: "Completed",
        paidAt: new Date(),
        gatewayResponse: { success: true, message: "Verified with Razorpay API" },
      },
    },
    { upsert: true, new: true, session, setDefaultsOnInsert: true },
  );
  order.paymentStatus = "Paid";
  order.paymentId = payment.id;
  if (order.status === "Pending") order.status = "Received";
  await order.save({ session });
  await createPendingCommissions(order._id.toString(), session);
  await PaymentOutboxEvent.updateOne(
    { deduplicationKey: `razorpay:customer-order:${order._id}:settled` },
    {
      $setOnInsert: {
        deduplicationKey: `razorpay:customer-order:${order._id}:settled`,
        type: "SELLER_NEW_ORDER",
        aggregateId: order._id,
        status: "Pending",
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true, session },
  );
  attempt.status = "Settled";
  attempt.settledAt = new Date();
  await attempt.save({ session });
};

const settleDeliveryAdminPayout = async (
  attempt: IRazorpayPaymentAttempt,
  payment: any,
  session: mongoose.ClientSession,
) => {
  const delivery = await Delivery.findById(attempt.owner).session(session);
  if (!delivery || attempt.localEntity.toString() !== delivery._id.toString()) {
    throw new Error("Delivery partner for Razorpay attempt was not found");
  }
  const amount = attempt.amountPaise / 100;
  const currentPending = Math.round((delivery.pendingAdminPayout || 0) * 100) / 100;
  if (amount > currentPending + 0.001) {
    await markAttemptForRefund(attempt, payment.id, session);
    return;
  }
  const reference = `RZP-PAYOUT-${payment.id}`;
  const existing = await WalletTransaction.findOne({ reference }).session(session);
  if (existing) {
    attempt.status = "Settled";
    attempt.settledAt = attempt.settledAt || new Date();
    await attempt.save({ session });
    return;
  }
  await WalletTransaction.create(
    [{
      userId: delivery._id,
      userType: "DELIVERY_BOY",
      amount,
      type: "Debit",
      description: "Payout to Admin via Razorpay",
      status: "Completed",
      reference,
    }],
    { session },
  );
  let platformWallet = await PlatformWallet.findOne().session(session);
  if (!platformWallet) [platformWallet] = await PlatformWallet.create([{}], { session });
  platformWallet.totalPlatformEarning += amount;
  platformWallet.currentPlatformBalance += amount;
  platformWallet.pendingFromDeliveryBoy = Math.max(0, platformWallet.pendingFromDeliveryBoy - amount);
  await platformWallet.save({ session });
  const payoutResult = await processPendingCODPayouts(delivery._id.toString(), amount, session);
  if (!payoutResult.success) throw new Error("Failed to distribute delivery COD payout");
  delivery.pendingAdminPayout = Math.max(0, currentPending - amount);
  await delivery.save({ session });
  attempt.status = "Settled";
  attempt.settledAt = new Date();
  await attempt.save({ session });
};

export const settleRazorpayPayment = async (
  attemptId: string,
  razorpayPaymentId: string,
  io?: any,
) => {
  const attempt = await RazorpayPaymentAttempt.findById(attemptId);
  if (!attempt) throw new Error("Razorpay payment attempt not found");
  if (attempt.status === "Refunded") return { success: true, status: attempt.status };
  attempt.razorpayPaymentId = razorpayPaymentId;
  const gatewayPayment: any = await getRazorpayInstance().payments.fetch(razorpayPaymentId);
  assertGatewayPaymentMatchesAttempt(attempt, gatewayPayment);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await RazorpayPaymentAttempt.findById(attempt._id).session(session);
      if (!current) throw new Error("Razorpay payment attempt disappeared");
      if (TERMINAL_ATTEMPT_STATUSES.includes(current.status)) return;
      current.razorpayPaymentId = gatewayPayment.id;
      current.gatewayStatus = gatewayPayment.status;
      current.status = "Captured";
      current.lastReconciledAt = new Date();
      assertGatewayPaymentMatchesAttempt(current, gatewayPayment);
      if (current.purpose === "CUSTOMER_ORDER") {
        await settleCustomerOrder(current, gatewayPayment, session);
      } else {
        await settleDeliveryAdminPayout(current, gatewayPayment, session);
      }
    });
  } finally {
    await session.endSession();
  }
  if (io) void processPaymentOutbox(io).catch((error) => console.error("Payment outbox failed:", error));
  const updated = await RazorpayPaymentAttempt.findById(attempt._id).lean();
  return { success: true, status: updated?.status || "Captured" };
};

export const verifyAndSettleRazorpayCallback = async (args: {
  expected: ExpectedAttempt;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  io?: any;
}) => {
  if (!verifyPaymentSignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)) {
    throw new Error("Invalid Razorpay payment signature");
  }
  const attempt = await RazorpayPaymentAttempt.findOne({
    razorpayOrderId: args.razorpayOrderId,
    purpose: args.expected.purpose,
    owner: args.expected.ownerId,
    localEntity: args.expected.localEntityId,
  });
  if (!attempt) throw new Error("Razorpay payment attempt does not match this payment operation");
  return settleRazorpayPayment(attempt._id.toString(), args.razorpayPaymentId, args.io);
};

export const acceptRazorpayWebhook = async (args: {
  rawBody: Buffer;
  signature: string;
  eventId: string;
}) => {
  if (!args.eventId) throw new Error("Missing x-razorpay-event-id header");
  if (!verifyWebhookSignature(args.rawBody, args.signature)) {
    throw new Error("Invalid Razorpay webhook signature");
  }
  let payload: any;
  try {
    payload = JSON.parse(args.rawBody.toString("utf8"));
  } catch {
    throw new Error("Invalid Razorpay webhook JSON");
  }
  if (!payload?.event) throw new Error("Razorpay webhook event type is missing");
  try {
    await RazorpayWebhookEvent.create({
      eventId: args.eventId,
      eventType: payload.event,
      payloadHash: crypto.createHash("sha256").update(args.rawBody).digest("hex"),
      payload,
      status: "Pending",
      nextAttemptAt: new Date(),
    });
    return { accepted: true, duplicate: false };
  } catch (error: any) {
    if (error?.code === 11000) return { accepted: true, duplicate: true };
    throw error;
  }
};

const updateRefundStateFromPayment = async (attempt: IRazorpayPaymentAttempt, payment: any) => {
  const refundedPaise = Number(payment.amount_refunded || 0);
  const fullyRefunded = refundedPaise >= attempt.amountPaise;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await RazorpayPaymentAttempt.findById(attempt._id).session(session);
      if (!current) return;
      current.refundAmountPaise = Math.max(current.refundAmountPaise || 0, refundedPaise);
      if (fullyRefunded) current.status = "Refunded";
      await current.save({ session });
      if (fullyRefunded && current.purpose === "CUSTOMER_ORDER") {
        const linkedPayment = await Payment.findOneAndUpdate(
          { paymentAttempt: current._id },
          { status: "Refunded", refundAmount: refundedPaise / 100, refundedAt: new Date() },
          { session, new: true },
        );
        // A duplicate/cancelled capture has no local Payment record. Refunding it
        // must not mark an independently paid order as refunded.
        if (linkedPayment) {
          await Order.findByIdAndUpdate(
            current.localEntity,
            { paymentStatus: "Refunded" },
            { session },
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }
};

const processWebhookPayload = async (event: any, io?: any) => {
  const payload: any = event.payload;
  const eventType = event.eventType;
  const payment = payload?.payload?.payment?.entity;
  const refund = payload?.payload?.refund?.entity;
  if (["payment.captured", "payment.authorized", "order.paid"].includes(eventType)) {
    if (!payment?.order_id || !payment?.id) throw new Error("Webhook payment payload is missing");
    const attempt = await RazorpayPaymentAttempt.findOne({ razorpayOrderId: payment.order_id });
    if (!attempt) return "Ignored";
    if (payment.status === "captured" || payment.captured === true || eventType !== "payment.authorized") {
      await settleRazorpayPayment(attempt._id.toString(), payment.id, io);
    } else if (!NON_REGRESSIBLE_ATTEMPT_STATUSES.includes(attempt.status)) {
      attempt.razorpayPaymentId = payment.id;
      attempt.gatewayStatus = payment.status;
      attempt.status = "Authorized";
      attempt.nextReconcileAt = new Date(Date.now() + 60_000);
      await attempt.save();
    }
    return "Processed";
  }
  if (eventType === "payment.failed") {
    if (!payment?.order_id || !payment?.id) throw new Error("Failed payment webhook payload is missing");
    const attempt = await RazorpayPaymentAttempt.findOne({ razorpayOrderId: payment.order_id });
    if (!attempt || NON_REGRESSIBLE_ATTEMPT_STATUSES.includes(attempt.status)) return "Ignored";
    const gatewayPayment: any = await getRazorpayInstance().payments.fetch(payment.id);
    if (gatewayPayment.status === "captured" && gatewayPayment.captured === true) {
      await settleRazorpayPayment(attempt._id.toString(), gatewayPayment.id, io);
    } else {
      attempt.gatewayStatus = gatewayPayment.status;
      attempt.failureCode = gatewayPayment.error_code || payment.error_code;
      attempt.failureDescription = gatewayPayment.error_description || payment.error_description;
      attempt.status = "Failed";
      attempt.lastReconciledAt = new Date();
      await attempt.save();
    }
    return "Processed";
  }
  if (["refund.created", "refund.processed", "refund.failed"].includes(eventType)) {
    if (!refund?.payment_id) throw new Error("Webhook refund payload is missing");
    const attempt = await RazorpayPaymentAttempt.findOne({ razorpayPaymentId: refund.payment_id });
    if (!attempt) return "Ignored";
    const gatewayPayment: any = await getRazorpayInstance().payments.fetch(refund.payment_id);
    await updateRefundStateFromPayment(attempt, gatewayPayment);
    return "Processed";
  }
  return "Ignored";
};

let webhookWorkerRunning = false;
export const processRazorpayWebhookInbox = async (io?: any, limit = 20) => {
  if (webhookWorkerRunning) return;
  webhookWorkerRunning = true;
  try {
    await RazorpayWebhookEvent.updateMany(
      { status: "Processing", updatedAt: { $lt: new Date(Date.now() - 5 * 60_000) } },
      { status: "Failed", nextAttemptAt: new Date() },
    );
    for (let index = 0; index < limit; index += 1) {
      const event = await RazorpayWebhookEvent.findOneAndUpdate(
        { status: { $in: ["Pending", "Failed"] }, nextAttemptAt: { $lte: new Date() } },
        { $set: { status: "Processing" }, $inc: { processingAttempts: 1 } },
        { new: true, sort: { createdAt: 1 } },
      );
      if (!event) break;
      try {
        const status = await processWebhookPayload(event, io);
        event.status = status as "Processed" | "Ignored";
        event.processedAt = new Date();
        event.lastError = undefined;
      } catch (error: any) {
        event.status = "Failed";
        event.lastError = String(error?.message || error).slice(0, 1000);
        event.nextAttemptAt = new Date(Date.now() + Math.min(30 * 60_000, 30_000 * event.processingAttempts));
      }
      await event.save();
    }
  } finally {
    webhookWorkerRunning = false;
  }
};

let outboxWorkerRunning = false;
export const processPaymentOutbox = async (io: any, limit = 20) => {
  if (outboxWorkerRunning || !io) return;
  outboxWorkerRunning = true;
  try {
    await PaymentOutboxEvent.updateMany(
      { status: "Processing", updatedAt: { $lt: new Date(Date.now() - 5 * 60_000) } },
      { status: "Failed", nextAttemptAt: new Date() },
    );
    for (let index = 0; index < limit; index += 1) {
      const event = await PaymentOutboxEvent.findOneAndUpdate(
        { status: { $in: ["Pending", "Failed"] }, nextAttemptAt: { $lte: new Date() } },
        { $set: { status: "Processing" }, $inc: { attempts: 1 } },
        { new: true, sort: { createdAt: 1 } },
      );
      if (!event) break;
      try {
        if (event.type === "SELLER_NEW_ORDER") {
          const order = await Order.findById(event.aggregateId);
          if (!order) throw new Error("Outbox order not found");
          const { notifySellersOfOrderUpdate } = await import("./sellerNotificationService");
          await notifySellersOfOrderUpdate(io, order, "NEW_ORDER");
        }
        event.status = "Processed";
        event.processedAt = new Date();
        event.lastError = undefined;
      } catch (error: any) {
        event.status = "Failed";
        event.lastError = String(error?.message || error).slice(0, 1000);
        event.nextAttemptAt = new Date(Date.now() + Math.min(30 * 60_000, 30_000 * event.attempts));
      }
      await event.save();
    }
  } finally {
    outboxWorkerRunning = false;
  }
};

const requestRequiredRefund = async (attempt: IRazorpayPaymentAttempt) => {
  if (!attempt.razorpayPaymentId) return;
  const razorpay = getRazorpayInstance();
  const payment: any = await razorpay.payments.fetch(attempt.razorpayPaymentId);
  if (Number(payment.amount_refunded || 0) >= attempt.amountPaise) {
    await updateRefundStateFromPayment(attempt, payment);
    return;
  }
  const claimed = await RazorpayPaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, status: "RefundRequired" },
    { status: "RefundPending", nextReconcileAt: new Date(Date.now() + 60_000) },
    { new: true },
  );
  if (!claimed) return;
  try {
    const refund: any = await razorpay.payments.refund(attempt.razorpayPaymentId, {
      amount: attempt.amountPaise - Number(payment.amount_refunded || 0),
      notes: { reason: "Payment could not be safely applied to local operation" },
    });
    claimed.refundId = refund.id;
    claimed.nextReconcileAt = new Date(Date.now() + 60_000);
    await claimed.save();
  } catch (error) {
    claimed.status = "RefundRequired";
    claimed.nextReconcileAt = new Date(Date.now() + 5 * 60_000);
    await claimed.save();
    throw error;
  }
};

const expireAbandonedCustomerAttempt = async (attemptId: string) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const attempt = await RazorpayPaymentAttempt.findById(attemptId).session(session);
      if (!attempt || attempt.purpose !== "CUSTOMER_ORDER") return;
      if (NON_REGRESSIBLE_ATTEMPT_STATUSES.includes(attempt.status)) return;
      const order = await Order.findById(attempt.localEntity).session(session);
      if (!order || order.status !== "Pending" || order.paymentStatus !== "Pending") {
        attempt.status = "Expired";
        await attempt.save({ session });
        return;
      }
      const { restoreOrderInventoryAndCoupon } = await import(
        "../modules/customer/controllers/customerOrderController"
      );
      await restoreOrderInventoryAndCoupon(order, session);
      order.status = "Cancelled";
      order.paymentStatus = "Failed";
      order.cancellationReason = "Razorpay checkout expired without a captured payment";
      order.cancelledAt = new Date();
      await order.save({ session });
      attempt.status = "Expired";
      attempt.failureDescription = "No captured Razorpay payment before checkout expiry";
      await attempt.save({ session });
    });
  } finally {
    await session.endSession();
  }
};

let reconciliationWorkerRunning = false;
export const reconcilePendingRazorpayPayments = async (io?: any, limit = 20) => {
  if (reconciliationWorkerRunning) return;
  reconciliationWorkerRunning = true;
  try {
    const attempts = await RazorpayPaymentAttempt.find({
      status: { $in: ["Created", "Authorized", "Captured", "Failed", "RefundRequired", "RefundPending"] },
      nextReconcileAt: { $lte: new Date() },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
    }).sort({ nextReconcileAt: 1 }).limit(limit);
    for (const attempt of attempts) {
      try {
        if (attempt.status === "RefundRequired") {
          await requestRequiredRefund(attempt);
          continue;
        }
        if (attempt.status === "RefundPending") {
          if (!attempt.razorpayPaymentId) continue;
          const payment: any = await getRazorpayInstance().payments.fetch(attempt.razorpayPaymentId);
          await updateRefundStateFromPayment(attempt, payment);
          await RazorpayPaymentAttempt.findByIdAndUpdate(attempt._id, {
            nextReconcileAt: new Date(Date.now() + 5 * 60_000),
          });
          continue;
        }
        const payments: any = await (getRazorpayInstance().orders as any).fetchPayments(attempt.razorpayOrderId);
        const items: any[] = Array.isArray(payments?.items) ? payments.items : [];
        const captured = items.find((item) => item.status === "captured" && item.captured === true);
        if (captured) {
          await settleRazorpayPayment(attempt._id.toString(), captured.id, io);
          continue;
        }
        const authorized = items.find((item) => item.status === "authorized");
        if (
          !authorized &&
          attempt.purpose === "CUSTOMER_ORDER" &&
          attempt.createdAt.getTime() < Date.now() - 30 * 60_000
        ) {
          await expireAbandonedCustomerAttempt(attempt._id.toString());
          continue;
        }
        attempt.status = authorized ? "Authorized" : attempt.status;
        attempt.razorpayPaymentId = authorized?.id || attempt.razorpayPaymentId;
        attempt.gatewayStatus = authorized?.status || attempt.gatewayStatus;
        attempt.lastReconciledAt = new Date();
        attempt.reconciliationAttempts += 1;
        attempt.nextReconcileAt = new Date(
          Date.now() + Math.min(30 * 60_000, 60_000 * Math.max(1, attempt.reconciliationAttempts)),
        );
        await attempt.save();
      } catch (error: any) {
        attempt.reconciliationAttempts += 1;
        attempt.lastReconciledAt = new Date();
        attempt.nextReconcileAt = new Date(Date.now() + 5 * 60_000);
        attempt.failureDescription = String(error?.message || error).slice(0, 500);
        await attempt.save();
      }
    }
  } finally {
    reconciliationWorkerRunning = false;
  }
};

export const runRazorpayPaymentWorkers = async (io?: any) => {
  await processRazorpayWebhookInbox(io);
  await reconcilePendingRazorpayPayments(io);
  if (io) await processPaymentOutbox(io);
};

export const processRefund = async (paymentId: string, amount?: number, reason?: string) => {
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment?.razorpayPaymentId) throw new Error("Razorpay payment not found");
    const refund: any = await getRazorpayInstance().payments.refund(payment.razorpayPaymentId, {
      amount: Math.round((amount || payment.amount) * 100),
      notes: { reason: reason || "Order cancelled" },
    });
    if (payment.paymentAttempt) {
      await RazorpayPaymentAttempt.findByIdAndUpdate(payment.paymentAttempt, {
        status: "RefundPending",
        refundId: refund.id,
        nextReconcileAt: new Date(Date.now() + 60_000),
      });
    }
    return { success: true, message: "Refund requested", data: { refundId: refund.id } };
  } catch (error: any) {
    return { success: false, message: error.message || "Failed to request refund" };
  }
};
