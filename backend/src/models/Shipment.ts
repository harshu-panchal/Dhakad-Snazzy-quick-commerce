import mongoose, { Document, Schema } from "mongoose";

export interface IShipment extends Document {
  order: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  provider: "Personal" | "Shiprocket";
  status: string;
  package: { weight: number; length: number; breadth: number; height: number };
  personalDeliveryCost?: number;
  shiprocketOrderId?: number;
  externalOrderReference?: string;
  shiprocketShipmentId?: number;
  awb?: string;
  courierId?: number;
  courierName?: string;
  quotedRate?: number;
  estimatedDeliveryDays?: string;
  estimatedDeliveryDate?: Date;
  pickupCode?: string;
  pickupScheduledAt?: Date;
  labelUrl?: string;
  manifestUrl?: string;
  invoiceUrl?: string;
  trackingUrl?: string;
  shiprocketStatusCode?: number;
  shiprocketStatus?: string;
  trackingEvents: Array<{
    status?: string;
    statusCode?: number;
    activity?: string;
    location?: string;
    eventAt?: Date;
    receivedAt: Date;
  }>;
  lastSyncedAt?: Date;
  lastError?: string;
  codRemittanceStatus: "NotApplicable" | "Pending" | "Remitted";
  codRemittedAt?: Date;
  codRemittanceReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    provider: { type: String, enum: ["Personal", "Shiprocket"], required: true },
    status: { type: String, required: true, default: "Pending" },
    package: {
      weight: { type: Number, min: 0.001 },
      length: { type: Number, min: 0.5 },
      breadth: { type: Number, min: 0.5 },
      height: { type: Number, min: 0.5 },
    },
    personalDeliveryCost: { type: Number, min: 0 },
    shiprocketOrderId: Number,
    externalOrderReference: { type: String, trim: true },
    shiprocketShipmentId: Number,
    awb: { type: String, trim: true },
    courierId: Number,
    courierName: { type: String, trim: true },
    quotedRate: { type: Number, min: 0 },
    estimatedDeliveryDays: String,
    estimatedDeliveryDate: Date,
    pickupCode: String,
    pickupScheduledAt: Date,
    labelUrl: String,
    manifestUrl: String,
    invoiceUrl: String,
    trackingUrl: String,
    shiprocketStatusCode: Number,
    shiprocketStatus: String,
    trackingEvents: [
      {
        _id: false,
        status: String,
        statusCode: Number,
        activity: String,
        location: String,
        eventAt: Date,
        receivedAt: { type: Date, default: Date.now },
      },
    ],
    lastSyncedAt: Date,
    lastError: String,
    codRemittanceStatus: {
      type: String,
      enum: ["NotApplicable", "Pending", "Remitted"],
      default: "NotApplicable",
    },
    codRemittedAt: Date,
    codRemittanceReference: String,
  },
  { timestamps: true },
);

ShipmentSchema.index({ awb: 1 }, { unique: true, sparse: true });
ShipmentSchema.index({ shiprocketShipmentId: 1 }, { unique: true, sparse: true });
ShipmentSchema.index({ provider: 1, status: 1 });
ShipmentSchema.index({ codRemittanceStatus: 1 });

const Shipment =
  (mongoose.models.Shipment as mongoose.Model<IShipment>) ||
  mongoose.model<IShipment>("Shipment", ShipmentSchema);

export default Shipment;
