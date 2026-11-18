import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import Customer from "../models/Customer";
import Delivery from "../models/Delivery";
import Order from "../models/Order";
import Payment from "../models/Payment";
import PlatformWallet from "../models/PlatformWallet";
import WalletTransaction from "../models/WalletTransaction";
import RazorpayPaymentAttempt from "../models/RazorpayPaymentAttempt";
import RazorpayWebhookEvent from "../models/RazorpayWebhookEvent";
import PaymentOutboxEvent from "../models/PaymentOutboxEvent";
import {
  acceptRazorpayWebhook,
  createRazorpayOrder,
  processRazorpayWebhookInbox,
  reconcilePendingRazorpayPayments,
  setRazorpayClientForTests,
  verifyAndSettleRazorpayCallback,
} from "../services/paymentService";

process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "callback-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";

let replSet: MongoMemoryReplSet;
let orderCounter = 0;
const gatewayPayments = new Map<string, any>();
const gatewayOrderPayments = new Map<string, any[]>();

const gatewayClient = {
  orders: {
    create: async (input: any) => {
      orderCounter += 1;
      const id = `order_test_${orderCounter}`;
      gatewayOrderPayments.set(id, []);
      return { id, status: "created", ...input };
    },
    fetchPayments: async (orderId: string) => ({
      items: gatewayOrderPayments.get(orderId) || [],
    }),
  },
  payments: {
    fetch: async (paymentId: string) => {
      const payment = gatewayPayments.get(paymentId);
      if (!payment) throw new Error(`Unknown mock payment ${paymentId}`);
      return { ...payment };
    },
    refund: async (paymentId: string, input: any) => {
      const payment = gatewayPayments.get(paymentId);
      if (!payment) throw new Error(`Unknown mock payment ${paymentId}`);
      payment.amount_refunded = Number(payment.amount_refunded || 0) + Number(input.amount || 0);
      gatewayPayments.set(paymentId, payment);
      return { id: `rfnd_${paymentId}`, amount: input.amount, status: "processed" };
    },
  },
};

const callbackSignature = (orderId: string, paymentId: string) =>
  crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");

const webhookBody = (event: string, payment?: any, refund?: any) =>
  Buffer.from(JSON.stringify({
    entity: "event",
    event,
    payload: {
      ...(payment ? { payment: { entity: payment } } : {}),
      ...(refund ? { refund: { entity: refund } } : {}),
    },
  }));

const acceptEvent = async (eventId: string, rawBody: Buffer) =>
  acceptRazorpayWebhook({
    eventId,
    rawBody,
    signature: crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest("hex"),
  });

const createCustomerOrder = async (suffix: string, status = "Pending") => {
  const customer = await Customer.create({
    name: `Customer ${suffix}`,
    email: `customer-${suffix}@example.com`,
    phone: `9${suffix.padStart(9, "0").slice(-9)}`,
  });
  const order = await Order.create({
    orderNumber: `TEST-ORDER-${suffix}`,
    customer: customer._id,
    customerName: customer.name,
    customerEmail: customer.email || `customer-${suffix}@example.com`,
    customerPhone: customer.phone,
    deliveryAddress: { address: "Test Street", city: "Test City", pincode: "465674" },
    items: [],
    subtotal: 100,
    total: 100,
    paymentMethod: "Razorpay",
    paymentStatus: "Pending",
    status,
  });
  return { customer, order };
};

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { dbName: "razorpay-integration" });
  setRazorpayClientForTests(gatewayClient);
  await Promise.all([
    RazorpayPaymentAttempt.syncIndexes(),
    RazorpayWebhookEvent.syncIndexes(),
    PaymentOutboxEvent.syncIndexes(),
    Payment.syncIndexes(),
    WalletTransaction.syncIndexes(),
  ]);
});

afterEach(async () => {
  gatewayPayments.clear();
  gatewayOrderPayments.clear();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

after(async () => {
  setRazorpayClientForTests(undefined);
  await mongoose.disconnect();
  await replSet.stop();
});

test("authenticates the exact raw webhook bytes before durable intake", async () => {
  const original = webhookBody("payment.captured", {
    id: "pay_raw_body",
    order_id: "order_raw_body",
  });
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(original)
    .digest("hex");
  const altered = Buffer.from(`${original.toString("utf8")} `);
  await assert.rejects(
    acceptRazorpayWebhook({ eventId: "evt-altered", rawBody: altered, signature }),
    /Invalid Razorpay webhook signature/,
  );
  await assert.rejects(
    acceptRazorpayWebhook({ eventId: "", rawBody: original, signature }),
    /event-id/,
  );
  assert.equal(await RazorpayWebhookEvent.countDocuments(), 0);
});

test("persists a purpose-aware attempt and settles once across duplicate, missing-callback and reordered events", async () => {
  const { customer, order } = await createCustomerOrder("101");
  const created: any = await createRazorpayOrder({
    purpose: "CUSTOMER_ORDER",
    ownerId: customer._id.toString(),
    localEntityId: order._id.toString(),
    amount: order.total,
    receipt: order._id.toString(),
  });
  assert.equal(created.success, true);
  const attempt = await RazorpayPaymentAttempt.findOne({ razorpayOrderId: created.data.razorpayOrderId });
  assert.ok(attempt);
  assert.equal(attempt.purpose, "CUSTOMER_ORDER");
  assert.equal(attempt.amountPaise, 10_000);

  const captured = {
    id: "pay_customer_101",
    order_id: attempt.razorpayOrderId,
    amount: 10_000,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
  };
  gatewayPayments.set(captured.id, captured);
  gatewayOrderPayments.set(attempt.razorpayOrderId, [captured]);
  const rawCaptured = webhookBody("payment.captured", captured);
  assert.equal((await acceptEvent("evt-duplicate-101", rawCaptured)).duplicate, false);
  assert.equal((await acceptEvent("evt-duplicate-101", rawCaptured)).duplicate, true);
  await processRazorpayWebhookInbox(undefined, 10);

  assert.equal((await Order.findById(order._id))!.paymentStatus, "Paid");
  assert.equal((await RazorpayPaymentAttempt.findById(attempt._id))!.status, "Settled");
  assert.equal(await Payment.countDocuments({ order: order._id }), 1);

  const staleAuthorized = { ...captured, status: "authorized", captured: false };
  await acceptEvent("evt-late-authorized-101", webhookBody("payment.authorized", staleAuthorized));
  await processRazorpayWebhookInbox(undefined, 10);
  assert.equal((await RazorpayPaymentAttempt.findById(attempt._id))!.status, "Settled");

  await verifyAndSettleRazorpayCallback({
    expected: {
      purpose: "CUSTOMER_ORDER",
      ownerId: customer._id.toString(),
      localEntityId: order._id.toString(),
    },
    razorpayOrderId: attempt.razorpayOrderId,
    razorpayPaymentId: captured.id,
    razorpaySignature: callbackSignature(attempt.razorpayOrderId, captured.id),
  });
  assert.equal(await Payment.countDocuments({ order: order._id }), 1);
  assert.equal(await PaymentOutboxEvent.countDocuments({ aggregateId: order._id }), 1);
});

test("does not regress a captured payment when a delayed failed event arrives first", async () => {
  const { customer, order } = await createCustomerOrder("102");
  const created: any = await createRazorpayOrder({
    purpose: "CUSTOMER_ORDER",
    ownerId: customer._id.toString(),
    localEntityId: order._id.toString(),
    amount: 100,
    receipt: order._id.toString(),
  });
  const failed = {
    id: "pay_customer_102",
    order_id: created.data.razorpayOrderId,
    amount: 10_000,
    currency: "INR",
    status: "failed",
    captured: false,
    error_description: "UPI retry",
  };
  gatewayPayments.set(failed.id, failed);
  await acceptEvent("evt-failed-102", webhookBody("payment.failed", failed));
  await processRazorpayWebhookInbox(undefined, 10);
  assert.equal((await RazorpayPaymentAttempt.findOne({ razorpayOrderId: failed.order_id }))!.status, "Failed");

  const captured = { ...failed, status: "captured", captured: true, amount_refunded: 0 };
  gatewayPayments.set(captured.id, captured);
  await acceptEvent("evt-captured-102", webhookBody("payment.captured", captured));
  await processRazorpayWebhookInbox(undefined, 10);
  assert.equal((await Order.findById(order._id))!.paymentStatus, "Paid");
  assert.equal((await RazorpayPaymentAttempt.findOne({ razorpayOrderId: failed.order_id }))!.status, "Settled");
});

test("rejects delivery payout amount tampering and settles a correct payout only once", async () => {
  const delivery = await Delivery.create({
    name: "Delivery Test",
    mobile: "9876500201",
    email: "delivery-201@example.com",
    password: "password123",
    pendingAdminPayout: 500,
    balance: 0,
  });
  const created: any = await createRazorpayOrder({
    purpose: "DELIVERY_ADMIN_PAYOUT",
    ownerId: delivery._id.toString(),
    localEntityId: delivery._id.toString(),
    amount: 500,
    receipt: `PAYOUT-${delivery._id}`,
  });
  const payment = {
    id: "pay_delivery_201",
    order_id: created.data.razorpayOrderId,
    amount: 100,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
  };
  gatewayPayments.set(payment.id, payment);
  await assert.rejects(
    verifyAndSettleRazorpayCallback({
      expected: {
        purpose: "DELIVERY_ADMIN_PAYOUT",
        ownerId: delivery._id.toString(),
        localEntityId: delivery._id.toString(),
      },
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
      razorpaySignature: callbackSignature(payment.order_id, payment.id),
    }),
    /amount mismatch/,
  );
  assert.equal((await Delivery.findById(delivery._id))!.pendingAdminPayout, 500);
  assert.equal(await WalletTransaction.countDocuments(), 0);

  payment.amount = 50_000;
  gatewayPayments.set(payment.id, payment);
  const callback = {
    expected: {
      purpose: "DELIVERY_ADMIN_PAYOUT" as const,
      ownerId: delivery._id.toString(),
      localEntityId: delivery._id.toString(),
    },
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    razorpaySignature: callbackSignature(payment.order_id, payment.id),
  };
  await verifyAndSettleRazorpayCallback(callback);
  await verifyAndSettleRazorpayCallback(callback);
  assert.equal((await Delivery.findById(delivery._id))!.pendingAdminPayout, 0);
  assert.equal(await WalletTransaction.countDocuments({ reference: `RZP-PAYOUT-${payment.id}` }), 1);
  assert.equal((await PlatformWallet.findOne())!.currentPlatformBalance, 500);
});

test("automatically refunds a captured payment that can no longer be applied", async () => {
  const { customer, order } = await createCustomerOrder("103", "Cancelled");
  const created: any = await createRazorpayOrder({
    purpose: "CUSTOMER_ORDER",
    ownerId: customer._id.toString(),
    localEntityId: order._id.toString(),
    amount: 100,
    receipt: order._id.toString(),
  });
  const payment = {
    id: "pay_customer_103",
    order_id: created.data.razorpayOrderId,
    amount: 10_000,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
  };
  gatewayPayments.set(payment.id, payment);
  gatewayOrderPayments.set(payment.order_id, [payment]);
  await verifyAndSettleRazorpayCallback({
    expected: {
      purpose: "CUSTOMER_ORDER",
      ownerId: customer._id.toString(),
      localEntityId: order._id.toString(),
    },
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    razorpaySignature: callbackSignature(payment.order_id, payment.id),
  });
  assert.equal((await RazorpayPaymentAttempt.findOne({ razorpayOrderId: payment.order_id }))!.status, "RefundRequired");
  await reconcilePendingRazorpayPayments(undefined, 10);
  await RazorpayPaymentAttempt.updateOne(
    { razorpayOrderId: payment.order_id },
    { nextReconcileAt: new Date(0) },
  );
  await reconcilePendingRazorpayPayments(undefined, 10);
  assert.equal((await RazorpayPaymentAttempt.findOne({ razorpayOrderId: payment.order_id }))!.status, "Refunded");
  assert.equal(gatewayPayments.get(payment.id).amount_refunded, 10_000);
});
