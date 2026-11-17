import mongoose, { Document, Schema } from "mongoose";

export interface ICustomerPromotionDailyQuota extends Document {
  customer: mongoose.Types.ObjectId;
  localDate: string;
  reservedCount: number;
  expiresAt: Date;
}

const CustomerPromotionDailyQuotaSchema = new Schema<ICustomerPromotionDailyQuota>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    localDate: { type: String, required: true },
    reservedCount: { type: Number, default: 0, min: 0, max: 3 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

CustomerPromotionDailyQuotaSchema.index({ customer: 1, localDate: 1 }, { unique: true });
CustomerPromotionDailyQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.CustomerPromotionDailyQuota as mongoose.Model<ICustomerPromotionDailyQuota> ||
  mongoose.model<ICustomerPromotionDailyQuota>("CustomerPromotionDailyQuota", CustomerPromotionDailyQuotaSchema);
