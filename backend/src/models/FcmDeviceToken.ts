import mongoose, { Document, Schema } from "mongoose";

export interface IFcmDeviceToken extends Document {
  token: string;
  userId: mongoose.Types.ObjectId;
  userType: "Customer" | "Admin" | "Seller" | "Delivery";
  platform: "web" | "mobile";
  lastSeenAt: Date;
}

const FcmDeviceTokenSchema = new Schema<IFcmDeviceToken>(
  {
    token: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    userType: { type: String, enum: ["Customer", "Admin", "Seller", "Delivery"], required: true },
    platform: { type: String, enum: ["web", "mobile"], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

FcmDeviceTokenSchema.index({ token: 1 }, { unique: true });
FcmDeviceTokenSchema.index({ userType: 1, userId: 1, lastSeenAt: -1 });

export default mongoose.models.FcmDeviceToken as mongoose.Model<IFcmDeviceToken> ||
  mongoose.model<IFcmDeviceToken>("FcmDeviceToken", FcmDeviceTokenSchema);
