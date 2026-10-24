import mongoose, { Document, Schema } from "mongoose";

/**
 * ReelLike — one record per (reel, customer) pair. Presence of a record means
 * the customer currently likes the reel. The denormalized Reel.likesCount is
 * kept in sync when records are created/removed.
 */
export interface IReelLike extends Document {
  reel: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReelLikeSchema = new Schema<IReelLike>(
  {
    reel: {
      type: Schema.Types.ObjectId,
      ref: "Reel",
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// A customer can like a reel at most once
ReelLikeSchema.index({ reel: 1, customer: 1 }, { unique: true });
ReelLikeSchema.index({ customer: 1 });

const ReelLike =
  (mongoose.models.ReelLike as mongoose.Model<IReelLike>) ||
  mongoose.model<IReelLike>("ReelLike", ReelLikeSchema);

export default ReelLike;
