import mongoose, { Document, Schema } from "mongoose";

export type RazorpayPaymentPurpose = "CUSTOMER_ORDER" | "DELIVERY_ADMIN_PAYOUT";
export type RazorpayPaymentAttemptStatus =
  | "Created"
  | "Authorized"
  | "Captured"
  | "Settled"
  | "Failed"
  | "Expired"
  | "RefundRequired"
  | "RefundPending"
  | "Refunded";

export interface IRazorpayPaymentAttempt extends Document {
  purpose: RazorpayPaymentPurpose;
  ownerType: "Customer" | "Delivery";
  owner: mongoose.Types.ObjectId;
  localEntity: mongoose.Types.ObjectId;
  receipt: string;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  status: RazorpayPaymentAttemptStatus;
  gatewayStatus?: string;
  failureCode?: string;
  failureDescription?: string;
  refundId?: string;
  refundAmountPaise: number;
  settledAt?: Date;
  lastReconciledAt?: Date;
  nextReconcileAt: Date;
  reconciliationAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const RazorpayPaymentAttemptSchema = new Schema<IRazorpayPaymentAttempt>(
  {
    purpose: {
      type: String,
      enum: ["CUSTOMER_ORDER", "DELIVERY_ADMIN_PAYOUT"],
      required: true,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["Customer", "Delivery"],
      required: true,
    },
    owner: { type: Schema.Types.ObjectId, required: true, index: true },
    localEntity: { type: Schema.Types.ObjectId, required: true, index: true },
    receipt: { type: String, required: true, trim: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, default: "INR", uppercase: true },
    razorpayOrderId: { type: String, required: true, trim: true },
    razorpayPaymentId: { type: String, trim: true },
    status: {
      type: String,
      enum: [
        "Created",
        "Authorized",
        "Captured",
        "Settled",
        "Failed",
        "Expired",
        "RefundRequired",
        "RefundPending",
        "Refunded",
      ],
      default: "Created",
      required: true,
      index: true,
    },
    gatewayStatus: String,
    failureCode: String,
    failureDescription: String,
    refundId: String,
    refundAmountPaise: { type: Number, default: 0, min: 0 },
    settledAt: Date,
    lastReconciledAt: Date,
    nextReconcileAt: { type: Date, default: Date.now, index: true },
    reconciliationAttempts: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

RazorpayPaymentAttemptSchema.index({ razorpayOrderId: 1 }, { unique: true });
RazorpayPaymentAttemptSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, sparse: true },
);
RazorpayPaymentAttemptSchema.index({ status: 1, nextReconcileAt: 1 });
RazorpayPaymentAttemptSchema.index({ purpose: 1, owner: 1, localEntity: 1, createdAt: -1 });

const RazorpayPaymentAttempt =
  (mongoose.models.RazorpayPaymentAttempt as mongoose.Model<IRazorpayPaymentAttempt>) ||
  mongoose.model<IRazorpayPaymentAttempt>(
    "RazorpayPaymentAttempt",
    RazorpayPaymentAttemptSchema,
  );

export default RazorpayPaymentAttempt;
