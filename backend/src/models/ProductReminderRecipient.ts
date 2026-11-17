import mongoose, { Document, Schema } from "mongoose";

export type ReminderRecipientStatus =
  | "Pending" | "Processing" | "AcceptedByFcm" | "InAppOnly"
  | "SkippedCooldown" | "SkippedDailyCap" | "SkippedOptOut"
  | "SkippedExpiredInterest" | "SkippedPurchased" | "SkippedInactiveCustomer"
  | "SkippedInvalidProduct" | "Failed";

export interface IProductReminderRecipient extends Document {
  campaign: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  interest: mongoose.Types.ObjectId;
  status: ReminderRecipientStatus;
  notification?: mongoose.Types.ObjectId;
  renderedTitle?: string;
  renderedBody?: string;
  fcmSuccessCount: number;
  fcmFailureCount: number;
  failureReason?: string;
  processedAt?: Date;
  processingStartedAt?: Date;
  openedAt?: Date;
  expiresAt: Date;
}

const ProductReminderRecipientSchema = new Schema<IProductReminderRecipient>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: "ProductReminderCampaign", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    interest: { type: Schema.Types.ObjectId, ref: "ProductInterest", required: true },
    status: {
      type: String,
      enum: ["Pending", "Processing", "AcceptedByFcm", "InAppOnly", "SkippedCooldown", "SkippedDailyCap", "SkippedOptOut", "SkippedExpiredInterest", "SkippedPurchased", "SkippedInactiveCustomer", "SkippedInvalidProduct", "Failed"],
      default: "Pending",
    },
    notification: { type: Schema.Types.ObjectId, ref: "Notification" },
    renderedTitle: String,
    renderedBody: String,
    fcmSuccessCount: { type: Number, default: 0 },
    fcmFailureCount: { type: Number, default: 0 },
    failureReason: String,
    processedAt: Date,
    processingStartedAt: Date,
    openedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

ProductReminderRecipientSchema.index({ campaign: 1, customer: 1 }, { unique: true });
ProductReminderRecipientSchema.index({ status: 1, createdAt: 1 });
ProductReminderRecipientSchema.index({ campaign: 1, status: 1, createdAt: 1 });
ProductReminderRecipientSchema.index({ customer: 1, processedAt: -1 });
ProductReminderRecipientSchema.index({ seller: 1, customer: 1, product: 1, status: 1, processedAt: -1 });
ProductReminderRecipientSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ProductReminderRecipient as mongoose.Model<IProductReminderRecipient> ||
  mongoose.model<IProductReminderRecipient>("ProductReminderRecipient", ProductReminderRecipientSchema);
