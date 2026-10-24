import mongoose, { Document, Schema } from "mongoose";

/**
 * ReelCommission — ledger of affiliation payouts to reel owners.
 *
 * Created once per order item that was purchased directly through a reel, when
 * that order reaches "Delivered". The amount is
 *   min(reelCommissionRate% x itemSaleAmount, adminEarningOnItem)
 * and is paid out of the admin's earning: the reel owner's Customer.walletAmount
 * is credited and PlatformWallet.totalAdminEarning / currentPlatformBalance are
 * decremented by the same amount.
 *
 * `orderItem` is unique so settlement is idempotent (safe to call from every
 * place that distributes order commissions).
 */
export interface IReelCommission extends Document {
  reel: mongoose.Types.ObjectId;
  reelOwner: mongoose.Types.ObjectId; // Customer who earns
  buyer: mongoose.Types.ObjectId; // Customer who purchased
  order: mongoose.Types.ObjectId;
  orderItem: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;

  itemSaleAmount: number; // unitPrice x quantity
  adminEarningOnItem: number; // Cap (admin's product commission on the item)
  commissionRate: number; // Percentage applied
  commissionAmount: number; // Amount actually credited (after cap)

  status: "Paid" | "Reversed";
  paidAt?: Date;
  reversedAt?: Date;
  reference: string;

  createdAt: Date;
  updatedAt: Date;
}

const ReelCommissionSchema = new Schema<IReelCommission>(
  {
    reel: { type: Schema.Types.ObjectId, ref: "Reel", required: true },
    reelOwner: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    buyer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderItem: {
      type: Schema.Types.ObjectId,
      ref: "OrderItem",
      required: true,
      unique: true,
    },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },

    itemSaleAmount: { type: Number, required: true, min: 0 },
    adminEarningOnItem: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true, min: 0, max: 100 },
    commissionAmount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["Paid", "Reversed"],
      default: "Paid",
    },
    paidAt: { type: Date },
    reversedAt: { type: Date },
    reference: { type: String, required: true, unique: true },
  },
  {
    timestamps: true,
  }
);

ReelCommissionSchema.index({ reelOwner: 1, status: 1, createdAt: -1 });
ReelCommissionSchema.index({ reel: 1 });
ReelCommissionSchema.index({ order: 1 });

const ReelCommission =
  (mongoose.models.ReelCommission as mongoose.Model<IReelCommission>) ||
  mongoose.model<IReelCommission>("ReelCommission", ReelCommissionSchema);

export default ReelCommission;
