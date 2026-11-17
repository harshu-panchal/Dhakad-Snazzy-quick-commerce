import mongoose, { Document, Schema } from "mongoose";

export interface INotificationTemplate extends Document {
  name: string;
  key: string;
  category: "RecentProductInterest" | "BackInStock";
  titleTemplate: string;
  bodyTemplate: string;
  allowedPlaceholders: string[];
  status: "Draft" | "Active" | "Archived";
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, trim: true, lowercase: true },
    category: { type: String, enum: ["RecentProductInterest", "BackInStock"], required: true },
    titleTemplate: { type: String, required: true, trim: true, maxlength: 80 },
    bodyTemplate: { type: String, required: true, trim: true, maxlength: 240 },
    allowedPlaceholders: { type: [String], default: ["customerName", "productName", "storeName", "price", "mrp", "discount"] },
    status: { type: String, enum: ["Draft", "Active", "Archived"], default: "Draft" },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { timestamps: true },
);

NotificationTemplateSchema.index({ key: 1, version: 1 }, { unique: true });
NotificationTemplateSchema.index({ category: 1, status: 1 });

export default mongoose.models.NotificationTemplate as mongoose.Model<INotificationTemplate> ||
  mongoose.model<INotificationTemplate>("NotificationTemplate", NotificationTemplateSchema);
