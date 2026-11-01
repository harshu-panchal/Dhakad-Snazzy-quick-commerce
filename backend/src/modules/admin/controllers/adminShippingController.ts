import crypto from "crypto";
import { Request, Response } from "express";
import Shipment from "../../../models/Shipment";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  applyShiprocketTrackingUpdate,
  bookOrderWithShiprocket,
  cancelBookedShipment,
  quoteOrderShipping,
  refreshShipmentDocuments,
  refreshShipmentTracking,
  retryShipmentPickup,
} from "../../../services/shippingService";
import {
  isShiprocketConfigured,
  ShiprocketError,
  syncPendingSellerPickups,
  syncSellerPickup,
} from "../../../services/shiprocketService";
import Seller from "../../../models/Seller";

const sendError = (res: Response, error: unknown) => {
  const status = error instanceof ShiprocketError ? error.statusCode : 500;
  return res.status(status).json({
    success: false,
    message: error instanceof Error ? error.message : "Shipping operation failed",
  });
};

export const getShippingConfiguration = asyncHandler(async (_req: Request, res: Response) => {
  const pickupCounts = await Seller.aggregate([
    { $group: { _id: "$shiprocketPickupSyncStatus", count: { $sum: 1 } } },
  ]);
  return res.json({
    success: true,
    data: {
      configured: isShiprocketConfigured(),
      pickupSync: Object.fromEntries(pickupCounts.map((entry) => [entry._id || "Pending", entry.count])),
    },
  });
});

export const getShippingQuotes = async (req: Request, res: Response) => {
  try {
    const data = await quoteOrderShipping(req.params.id, req.body.package);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const bookShiprocket = async (req: Request, res: Response) => {
  try {
    const courierId = Number(req.body.courierId);
    if (!Number.isFinite(courierId)) {
      return res.status(400).json({ success: false, message: "A valid courier is required" });
    }
    const result = await bookOrderWithShiprocket({
      orderId: req.params.id,
      rawPackage: req.body.package,
      courierId,
    });
    return res.status(201).json({
      success: true,
      message: result.warning
        ? `Shiprocket booked with warning: ${result.warning}`
        : "Shiprocket courier booked and pickup scheduled",
      data: result.shipment,
      warning: result.warning,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getOrderShipment = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await Shipment.findOne({ order: req.params.id })
    .populate("seller", "storeName sellerName address city state pincode shiprocketPickupSyncStatus")
    .lean();
  return res.json({ success: true, data: shipment || null });
});

export const refreshTracking = async (req: Request, res: Response) => {
  try {
    const shipment = await refreshShipmentTracking(req.params.id, req.app.get("io"));
    return res.json({ success: true, message: "Tracking refreshed", data: shipment });
  } catch (error) {
    return sendError(res, error);
  }
};

export const retryPickup = async (req: Request, res: Response) => {
  try {
    const shipment = await retryShipmentPickup(req.params.id);
    return res.json({ success: true, message: "Pickup scheduled", data: shipment });
  } catch (error) {
    return sendError(res, error);
  }
};

export const regenerateDocuments = async (req: Request, res: Response) => {
  try {
    const shipment = await refreshShipmentDocuments(req.params.id);
    return res.json({ success: true, message: "Shipment documents refreshed", data: shipment });
  } catch (error) {
    return sendError(res, error);
  }
};

export const cancelShipment = async (req: Request, res: Response) => {
  try {
    const shipment = await cancelBookedShipment(req.params.id);
    return res.json({ success: true, message: "Shiprocket cancellation requested", data: shipment });
  } catch (error) {
    return sendError(res, error);
  }
};

export const markCodRemitted = asyncHandler(async (req: Request, res: Response) => {
  const { reference } = req.body;
  if (!String(reference || "").trim()) {
    return res.status(400).json({ success: false, message: "Remittance reference is required" });
  }
  const pendingShipment = await Shipment.findOne({
    order: req.params.id,
    provider: "Shiprocket",
    codRemittanceStatus: "Pending",
  });
  if (!pendingShipment) {
    return res.status(409).json({
      success: false,
      message: "No pending Shiprocket COD remittance exists for this order",
    });
  }

  const { processShiprocketCODRemittance } = await import("../../../services/commissionService");
  await processShiprocketCODRemittance(req.params.id, String(reference).trim());

  const shipment = await Shipment.findOneAndUpdate(
    { _id: pendingShipment._id },
    {
      codRemittanceStatus: "Remitted",
      codRemittedAt: new Date(),
      codRemittanceReference: String(reference).trim(),
    },
    { new: true },
  );
  try {
    const { settleReelCommissionsForOrder } = await import("../../../services/reelService");
    await settleReelCommissionsForOrder(req.params.id);
  } catch (error) {
    console.error("Shiprocket COD reel settlement failed:", error);
  }
  return res.json({ success: true, message: "Shiprocket COD remittance recorded", data: shipment });
});

export const retrySellerPickup = async (req: Request, res: Response) => {
  try {
    const seller = await syncSellerPickup(req.params.sellerId);
    return res.json({ success: true, message: "Seller pickup synchronized", data: seller });
  } catch (error) {
    return sendError(res, error);
  }
};

export const migrateSellerPickups = async (req: Request, res: Response) => {
  try {
    await Seller.updateMany(
      { shiprocketPickupSyncStatus: { $exists: false } },
      { $set: { shiprocketPickupSyncStatus: "Pending" } },
    );
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 500);
    const result = await syncPendingSellerPickups(limit);
    return res.json({ success: true, message: "Seller pickup migration processed", data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

const secureEquals = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const shiprocketWebhook = async (req: Request, res: Response) => {
  const configuredToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  const suppliedToken = String(req.header("x-api-key") || "");
  if (configuredToken && !secureEquals(configuredToken, suppliedToken)) {
    return res.status(401).json({ success: false, message: "Invalid webhook token" });
  }

  // Acknowledge unknown/duplicate events with 200 so Shiprocket does not retry forever.
  const awb = String(req.body?.awb || req.body?.awb_code || "").trim();
  const shipmentId = Number(req.body?.shipment_id);
  const shipment: any = await Shipment.findOne(
    awb ? { awb } : Number.isFinite(shipmentId) ? { shiprocketShipmentId: shipmentId } : { _id: null },
  );
  if (!shipment) return res.status(200).json({ success: true, ignored: true });

  try {
    await applyShiprocketTrackingUpdate(shipment, req.body, req.app.get("io"));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Shiprocket webhook processing failed:", error);
    // Shiprocket requires a 200 acknowledgement; tracking can be recovered through manual/API refresh.
    return res.status(200).json({ success: false, accepted: true });
  }
};
