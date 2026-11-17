import mongoose, { Document, Schema } from "mongoose";

export interface IProductInterest extends Document {
  seller: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  firstViewedAt: Date;
  lastViewedAt: Date;
  viewCount: number;
  lastSource: string;
  productSnapshot: { name: string; image?: string; price?: number };
  lastNotificationAt?: Date;
  notificationCount: number;
  nextReminderAt: Date;
  automationStatus: "Pending" | "Sent" | "Suppressed";
  expiresAt: Date;
}

const ProductInterestSchema = new Schema<IProductInterest>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    firstViewedAt: { type: Date, required: true },
    lastViewedAt: { type: Date, required: true },
    viewCount: { type: Number, default: 0, min: 0 },
    lastSource: { type: String, default: "direct" },
    productSnapshot: {
      name: { type: String, required: true },
      image: String,
      price: Number,
    },
    lastNotificationAt: Date,
    notificationCount: { type: Number, default: 0 },
    nextReminderAt: { type: Date, required: true },
    automationStatus: { type: String, enum: ["Pending", "Sent", "Suppressed"], default: "Pending" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

ProductInterestSchema.index({ seller: 1, customer: 1, product: 1 }, { unique: true });
ProductInterestSchema.index({ seller: 1, lastViewedAt: -1 });
ProductInterestSchema.index({ seller: 1, product: 1, lastViewedAt: -1 });
ProductInterestSchema.index({ automationStatus: 1, nextReminderAt: 1, expiresAt: 1 });
ProductInterestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ProductInterest as mongoose.Model<IProductInterest> ||
  mongoose.model<IProductInterest>("ProductInterest", ProductInterestSchema);
