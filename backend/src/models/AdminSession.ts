import mongoose, { Schema, model, Document, Types } from "mongoose";

/**
 * One refresh-token session per admin device.
 *
 * Kept in its own collection rather than as an array on Admin so sessions are
 * individually listable and revocable, and so expiry cleanup is the database's
 * job via a TTL index.
 *
 * Only the sha256 hash of the refresh token is stored. The token itself exists
 * solely in the httpOnly cookie on the client.
 */
export interface IAdminSession extends Document {
  adminId: Types.ObjectId;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  /**
   * Set when this session is revoked because an already-used refresh token was
   * replayed. Used to distinguish theft from an ordinary logout in the logs.
   */
  revokedReason?: "logout" | "logout-all" | "rotated" | "reuse-detected" | "password-change";
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSessionSchema = new Schema<IAdminSession>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      enum: ["logout", "logout-all", "rotated", "reuse-detected", "password-change"],
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// TTL: Mongo removes the document once expiresAt passes. Revoked-but-unexpired
// sessions are kept until then so replay of a rotated token is still detectable.
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AdminSession =
  (mongoose.models.AdminSession as mongoose.Model<IAdminSession>) ||
  model<IAdminSession>("AdminSession", adminSessionSchema);

export default AdminSession;
