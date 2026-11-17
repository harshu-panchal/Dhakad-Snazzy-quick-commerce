import mongoose, { Document, Schema } from "mongoose";

export type ProductExplorationSource =
  | "direct"
  | "home"
  | "search"
  | "category"
  | "store"
  | "reel"
  | "wishlist"
  | "order-again"
  | "similar-product"
  | "promotion";

export interface IProductExplorationEvent extends Document {
  eventId: string;
  customer: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  source: ProductExplorationSource;
  campaign?: mongoose.Types.ObjectId;
  occurredAt: Date;
  receivedAt: Date;
  productSnapshot: { name: string; image?: string; price?: number };
  expiresAt: Date;
}

const ProductExplorationEventSchema = new Schema<IProductExplorationEvent>(
  {
    eventId: { type: String, required: true, trim: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    source: {
      type: String,
      enum: ["direct", "home", "search", "category", "store", "reel", "wishlist", "order-again", "similar-product", "promotion"],
      default: "direct",
    },
    campaign: { type: Schema.Types.ObjectId, ref: "ProductReminderCampaign" },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
    productSnapshot: {
      name: { type: String, required: true },
      image: String,
      price: Number,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

ProductExplorationEventSchema.index({ eventId: 1 }, { unique: true });
ProductExplorationEventSchema.index({ seller: 1, occurredAt: -1 });
ProductExplorationEventSchema.index({ seller: 1, product: 1, occurredAt: -1 });
ProductExplorationEventSchema.index({ seller: 1, customer: 1, occurredAt: -1 });
ProductExplorationEventSchema.index({ customer: 1, occurredAt: -1 });
ProductExplorationEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ProductExplorationEvent as mongoose.Model<IProductExplorationEvent> ||
  mongoose.model<IProductExplorationEvent>("ProductExplorationEvent", ProductExplorationEventSchema);
