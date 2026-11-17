import mongoose, { Document, Schema } from "mongoose";

export interface IProductReminderCampaign extends Document {
  seller: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  template: mongoose.Types.ObjectId;
  templateVersion: number;
  campaignType: "ManualBulk" | "ManualSingle" | "AutomatedInterest" | "BackInStock";
  status: "Queued" | "Processing" | "Completed" | "PartiallyCompleted" | "Failed" | "Cancelled";
  idempotencyKey: string;
  titleSnapshot: string;
  bodySnapshot: string;
  totalCandidates: number;
  processedCount: number;
  acceptedCount: number;
  inAppOnlyCount: number;
  skippedCount: number;
  failedCount: number;
  openedCount: number;
  startedAt?: Date;
  completedAt?: Date;
  createdByType: "Seller" | "System";
  createdBy?: mongoose.Types.ObjectId;
  expiresAt: Date;
}

const ProductReminderCampaignSchema = new Schema<IProductReminderCampaign>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    template: { type: Schema.Types.ObjectId, ref: "NotificationTemplate", required: true },
    templateVersion: { type: Number, required: true },
    campaignType: { type: String, enum: ["ManualBulk", "ManualSingle", "AutomatedInterest", "BackInStock"], required: true },
    status: { type: String, enum: ["Queued", "Processing", "Completed", "PartiallyCompleted", "Failed", "Cancelled"], default: "Queued" },
    idempotencyKey: { type: String, required: true, trim: true },
    titleSnapshot: { type: String, required: true },
    bodySnapshot: { type: String, required: true },
    totalCandidates: { type: Number, default: 0 },
    processedCount: { type: Number, default: 0 },
    acceptedCount: { type: Number, default: 0 },
    inAppOnlyCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    createdByType: { type: String, enum: ["Seller", "System"], required: true },
    createdBy: { type: Schema.Types.ObjectId },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

ProductReminderCampaignSchema.index({ seller: 1, createdAt: -1 });
ProductReminderCampaignSchema.index({ seller: 1, idempotencyKey: 1 }, { unique: true });
ProductReminderCampaignSchema.index({ status: 1, createdAt: 1 });
ProductReminderCampaignSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ProductReminderCampaign as mongoose.Model<IProductReminderCampaign> ||
  mongoose.model<IProductReminderCampaign>("ProductReminderCampaign", ProductReminderCampaignSchema);
