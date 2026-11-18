import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentOutboxEvent extends Document {
  deduplicationKey: string;
  type: "SELLER_NEW_ORDER";
  aggregateId: mongoose.Types.ObjectId;
  status: "Pending" | "Processing" | "Processed" | "Failed";
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOutboxEventSchema = new Schema<IPaymentOutboxEvent>(
  {
    deduplicationKey: { type: String, required: true, trim: true },
    type: { type: String, enum: ["SELLER_NEW_ORDER"], required: true },
    aggregateId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Processed", "Failed"],
      default: "Pending",
      required: true,
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: String,
    processedAt: Date,
  },
  { timestamps: true },
);

PaymentOutboxEventSchema.index({ deduplicationKey: 1 }, { unique: true });
PaymentOutboxEventSchema.index({ status: 1, nextAttemptAt: 1 });

const PaymentOutboxEvent =
  (mongoose.models.PaymentOutboxEvent as mongoose.Model<IPaymentOutboxEvent>) ||
  mongoose.model<IPaymentOutboxEvent>("PaymentOutboxEvent", PaymentOutboxEventSchema);

export default PaymentOutboxEvent;
