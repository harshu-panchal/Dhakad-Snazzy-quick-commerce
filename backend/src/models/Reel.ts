import mongoose, { Document, Schema } from "mongoose";

/**
 * Reel — a short product-affiliation video uploaded by a customer.
 * Each reel is linked to exactly one product. When another customer buys that
 * product directly through the reel, the reel owner earns an affiliation
 * commission (see ReelCommission) paid out of the admin's earning.
 *
 * Visibility is location based: a reel is shown to a viewer only when the
 * viewer's current location falls within the service radius of the seller of
 * the reel's product (i.e. the product is deliverable to the viewer). The
 * `seller` field is denormalized from the product so the feed query can filter
 * by the existing serviceability logic without an extra join.
 */
export interface IReel extends Document {
  customer: mongoose.Types.ObjectId; // Uploader / owner (earns commission)
  product: mongoose.Types.ObjectId; // Linked product (derived from the order item)
  seller: mongoose.Types.ObjectId; // Denormalized from product for location filter

  // Proof of purchase: a reel may only be created for a product the uploader
  // actually bought and had delivered. Both are derived server-side from the
  // order item, never trusted from the client. Optional in the schema only so
  // reels created before this rule existed stay valid; `createReel` requires
  // them for every new reel.
  order?: mongoose.Types.ObjectId;
  orderItem?: mongoose.Types.ObjectId;

  // Media
  videoUrl: string;
  videoPublicId?: string; // For deletion from storage
  thumbnailUrl?: string;
  thumbnailPublicId?: string; // For deletion from storage
  durationSec?: number;
  sizeBytes?: number;

  caption?: string;

  // Moderation / lifecycle. Reels go live immediately; admin can set "Removed".
  status: "Active" | "Removed";

  // Engagement (denormalized counters, kept in sync atomically)
  likesCount: number;
  sharesCount: number;
  viewsCount: number;

  // Uploader location snapshot (informational only)
  uploaderCity?: string;
  uploaderState?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ReelSchema = new Schema<IReel>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Reel owner (customer) is required"],
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Linked product is required"],
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },

    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
    orderItem: {
      type: Schema.Types.ObjectId,
      ref: "OrderItem",
    },

    videoUrl: {
      type: String,
      required: [true, "Video URL is required"],
      trim: true,
    },
    videoPublicId: {
      type: String,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    thumbnailPublicId: {
      type: String,
      trim: true,
    },
    durationSec: {
      type: Number,
      min: [0, "Duration cannot be negative"],
    },
    sizeBytes: {
      type: Number,
      min: [0, "Size cannot be negative"],
    },

    caption: {
      type: String,
      trim: true,
      maxlength: [2200, "Caption is too long"],
    },

    status: {
      type: String,
      enum: ["Active", "Removed"],
      default: "Active",
    },

    likesCount: {
      type: Number,
      default: 0,
      min: [0, "Likes count cannot be negative"],
    },
    sharesCount: {
      type: Number,
      default: 0,
      min: [0, "Shares count cannot be negative"],
    },
    viewsCount: {
      type: Number,
      default: 0,
      min: [0, "Views count cannot be negative"],
    },

    uploaderCity: {
      type: String,
      trim: true,
    },
    uploaderState: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Feed query: active reels for sellers that cover the viewer, newest first
ReelSchema.index({ seller: 1, status: 1, createdAt: -1 });
// "My reels" query
ReelSchema.index({ customer: 1, createdAt: -1 });
ReelSchema.index({ product: 1 });
// One reel per delivered order item. Sparse so the pre-rule reels (which have
// no orderItem) are excluded rather than colliding with each other on null.
ReelSchema.index({ orderItem: 1 }, { unique: true, sparse: true });

const Reel =
  (mongoose.models.Reel as mongoose.Model<IReel>) ||
  mongoose.model<IReel>("Reel", ReelSchema);

export default Reel;
