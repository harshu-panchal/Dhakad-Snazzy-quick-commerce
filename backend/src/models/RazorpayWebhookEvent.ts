import mongoose, { Document, Schema } from "mongoose";

export interface IRazorpayWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  status: "Pending" | "Processing" | "Processed" | "Failed" | "Ignored";
  processingAttempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RazorpayWebhookEventSchema = new Schema<IRazorpayWebhookEvent>(
  {
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true, index: true },
    payloadHash: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Processed", "Failed", "Ignored"],
      default: "Pending",
      required: true,
      index: true,
    },
    processingAttempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: String,
    processedAt: Date,
  },
  { timestamps: true },
);

RazorpayWebhookEventSchema.index({ eventId: 1 }, { unique: true });
RazorpayWebhookEventSchema.index({ status: 1, nextAttemptAt: 1 });

const RazorpayWebhookEvent =
  (mongoose.models.RazorpayWebhookEvent as mongoose.Model<IRazorpayWebhookEvent>) ||
  mongoose.model<IRazorpayWebhookEvent>("RazorpayWebhookEvent", RazorpayWebhookEventSchema);

export default RazorpayWebhookEvent;
