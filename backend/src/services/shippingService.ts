import { Server as SocketIOServer } from "socket.io";
import AppSettings from "../models/AppSettings";
import Delivery from "../models/Delivery";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import Shipment from "../models/Shipment";
import { getDeliveryBoyCommissionRate } from "./commissionService";
import {
  assignAwb,
  cancelShiprocketOrder,
  createShiprocketOrder,
  generateDocuments,
  getCourierQuotes,
  schedulePickup,
  ShiprocketError,
  syncSellerPickup,
  trackByAwb,
  validatePackage,
} from "./shiprocketService";

export const getSingleSellerOrderContext = async (orderId: string) => {
  const order: any = await Order.findById(orderId);
  if (!order) throw new ShiprocketError("Order not found", 404);
  if (!["Received", "Accepted"].includes(order.status)) {
    throw new ShiprocketError("Only orders awaiting manual assignment can be quoted or booked", 409);
  }
  if (order.deliveryPreference === "Self") {
    throw new ShiprocketError("Self-delivery orders cannot be assigned to Shiprocket", 400);
  }
  const items: any[] = await OrderItem.find({
    order: order._id,
    status: { $ne: "Cancelled" },
    sellerStatus: { $ne: "Rejected" },
  }).lean();
  if (!items.length) throw new ShiprocketError("Order has no fulfillable items", 400);
  const sellerIds = [...new Set(items.map((item) => String(item.seller)))];
  if (sellerIds.length !== 1) {
    throw new ShiprocketError("Shiprocket assignment requires exactly one seller per order", 400);
  }
  const seller: any = await Seller.findById(sellerIds[0]);
  if (!seller) throw new ShiprocketError("Order seller not found", 404);
  return { order, items, seller };
};

export const getPersonalDeliveryOptions = async (order: any) => {
  const [settings, deliveryBoys] = await Promise.all([
    AppSettings.getSettings(),
    Delivery.find({ status: "Active", available: "Available", isOnline: true })
      .select("name mobile city commissionRate")
      .lean(),
  ]);
  const distanceRate = Number(settings.deliveryConfig?.deliveryBoyKmRate) || 0;
  const distance = Number(order.deliveryDistanceKm) || 0;
  const distanceBased = settings.deliveryConfig?.isDistanceBased === true && distanceRate > 0 && distance > 0;

  return Promise.all(
    deliveryBoys.map(async (deliveryBoy: any) => {
      const commissionRate = distanceBased
        ? distanceRate
        : await getDeliveryBoyCommissionRate(String(deliveryBoy._id));
      const cost = distanceBased
        ? distance * commissionRate
        : (Number(order.subtotal) * commissionRate) / 100;
      return {
        deliveryBoyId: String(deliveryBoy._id),
        name: deliveryBoy.name,
        mobile: deliveryBoy.mobile,
        city: deliveryBoy.city,
        cost: Math.round(cost * 100) / 100,
        calculation: distanceBased
          ? `${distance.toFixed(2)} km × ₹${commissionRate}/km`
          : `${commissionRate}% of ₹${Number(order.subtotal).toFixed(2)}`,
      };
    }),
  );
};

export const quoteOrderShipping = async (orderId: string, rawPackage: any) => {
  const packageDetails = validatePackage(rawPackage);
  const { order, seller } = await getSingleSellerOrderContext(orderId);

  if (seller.shiprocketPickupSyncStatus !== "Synced") {
    try {
      await syncSellerPickup(String(seller._id));
      const refreshed = await Seller.findById(seller._id);
      if (refreshed) Object.assign(seller, refreshed.toObject());
    } catch (error) {
      throw new ShiprocketError(
        `Seller pickup could not be synchronized: ${error instanceof Error ? error.message : "Unknown error"}`,
        409,
      );
    }
  }

  const [couriers, personalOptions] = await Promise.all([
    getCourierQuotes({
      pickupPincode: seller.pincode,
      deliveryPincode: order.deliveryAddress.pincode,
      paymentMethod: order.paymentMethod,
      declaredValue: Number(order.total),
      packageDetails,
    }),
    getPersonalDeliveryOptions(order),
  ]);

  const cheapestShiprocket = couriers[0]?.rate;
  const cheapestPersonal = personalOptions.length
    ? Math.min(...personalOptions.map((option) => option.cost))
    : undefined;
  const recommendation =
    cheapestShiprocket === undefined && cheapestPersonal === undefined
      ? undefined
      : cheapestPersonal === undefined ||
          (cheapestShiprocket !== undefined && cheapestShiprocket < cheapestPersonal)
        ? "Shiprocket"
        : "Personal";

  return { packageDetails, couriers, personalOptions, cheapestShiprocket, cheapestPersonal, recommendation };
};

const extractAwb = (response: any) => {
  const data = response?.response?.data ?? response?.data ?? response?.response ?? response;
  return {
    awb: String(data?.awb_code || data?.awb || ""),
    courierName: data?.courier_name,
    courierId: Number(data?.courier_company_id || data?.courier_id) || undefined,
  };
};

export const bookOrderWithShiprocket = async (args: {
  orderId: string;
  rawPackage: any;
  courierId: number;
}) => {
  const packageDetails = validatePackage(args.rawPackage);
  const { order, items, seller } = await getSingleSellerOrderContext(args.orderId);
  if (order.deliveryBoy) {
    throw new ShiprocketError("Remove the personal delivery assignment before booking Shiprocket", 409);
  }
  if (seller.shiprocketPickupSyncStatus !== "Synced") await syncSellerPickup(String(seller._id));
  const refreshedSeller: any = await Seller.findById(seller._id);

  const quotes = await getCourierQuotes({
    pickupPincode: refreshedSeller.pincode,
    deliveryPincode: order.deliveryAddress.pincode,
    paymentMethod: order.paymentMethod,
    declaredValue: Number(order.total),
    packageDetails,
  });
  const selectedCourier = quotes.find((quote: any) => quote.courierId === Number(args.courierId));
  if (!selectedCourier) throw new ShiprocketError("Selected courier is no longer serviceable", 409);

  const existing: any = await Shipment.findOne({ order: order._id });
  if (existing && existing.provider === "Shiprocket" && existing.awb) {
    throw new ShiprocketError("This order is already booked with Shiprocket", 409);
  }
  if (existing && existing.provider === "Personal") {
    throw new ShiprocketError("This order already has a personal delivery assignment", 409);
  }

  const shipment: any = existing || new Shipment({ order: order._id, seller: seller._id });
  shipment.provider = "Shiprocket";
  shipment.status = "Booking";
  shipment.package = packageDetails;
  shipment.pickupCode = refreshedSeller.shiprocketPickupCode;
  shipment.courierId = selectedCourier.courierId;
  shipment.courierName = selectedCourier.courierName;
  shipment.quotedRate = selectedCourier.rate;
  shipment.estimatedDeliveryDays = selectedCourier.estimatedDeliveryDays;
  shipment.codRemittanceStatus =
    String(order.paymentMethod).trim().toUpperCase() === "COD" ? "Pending" : "NotApplicable";
  if (!shipment.externalOrderReference) {
    shipment.externalOrderReference = `${order.orderNumber}-${String(shipment._id).slice(-6)}`.slice(0, 50);
  }
  await shipment.save();

  try {
    if (!shipment.shiprocketOrderId || !shipment.shiprocketShipmentId) {
      const created: any = await createShiprocketOrder({
        order,
        seller: refreshedSeller,
        items,
        packageDetails,
        externalOrderReference: shipment.externalOrderReference,
      });
      shipment.shiprocketOrderId = Number(created?.order_id);
      shipment.shiprocketShipmentId = Number(created?.shipment_id);
      if (!shipment.shiprocketOrderId || !shipment.shiprocketShipmentId) {
        throw new ShiprocketError("Shiprocket did not return order and shipment IDs", 502, created);
      }
      shipment.status = "Order Created";
      await shipment.save();
    }

    const awbResponse = await assignAwb(shipment.shiprocketShipmentId, selectedCourier.courierId);
    const awbData = extractAwb(awbResponse);
    if (!awbData.awb) throw new ShiprocketError("Shiprocket did not return an AWB", 502, awbResponse);
    shipment.awb = awbData.awb;
    shipment.courierName = awbData.courierName || selectedCourier.courierName;
    shipment.courierId = awbData.courierId || selectedCourier.courierId;
    shipment.trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(shipment.awb)}`;
    shipment.status = "AWB Assigned";
    shipment.shiprocketStatusCode = 1;
    shipment.shiprocketStatus = "AWB Assigned";
    await shipment.save();

    let warning: string | undefined;
    try {
      const pickup: any = await schedulePickup(shipment.shiprocketShipmentId);
      const pickupDate = pickup?.response?.pickup_scheduled_date || pickup?.pickup_scheduled_date;
      shipment.pickupScheduledAt = pickupDate ? new Date(pickupDate) : new Date();
      shipment.status = "Pickup Scheduled";
      shipment.shiprocketStatusCode = 3;
      shipment.shiprocketStatus = "Pickup Scheduled";
    } catch (error) {
      warning = error instanceof Error ? error.message : "Pickup scheduling failed";
      shipment.status = "Pickup Failed";
      shipment.lastError = warning;
    }

    try {
      const documents = await generateDocuments(shipment.shiprocketOrderId, shipment.shiprocketShipmentId);
      Object.assign(shipment, documents);
    } catch (error) {
      warning = [warning, error instanceof Error ? error.message : "Document generation failed"]
        .filter(Boolean)
        .join("; ");
    }
    await shipment.save();

    order.deliveryProvider = "Shiprocket";
    order.deliveryAssignmentStatus = "Assigned";
    order.deliveryAssignmentResolvedAt = new Date();
    order.assignedAt = new Date();
    order.trackingNumber = shipment.awb;
    if (selectedCourier.etd) {
      const eta = new Date(selectedCourier.etd);
      if (!Number.isNaN(eta.getTime())) order.estimatedDeliveryDate = eta;
    }
    await order.save();

    return { shipment, warning };
  } catch (error) {
    shipment.status = shipment.shiprocketOrderId ? shipment.status : "Booking Failed";
    shipment.lastError = error instanceof Error ? error.message : "Shiprocket booking failed";
    await shipment.save();
    throw error;
  }
};

const statusMap: Record<number, { shipment: string; order?: string }> = {
  1: { shipment: "AWB Assigned" },
  2: { shipment: "Label Generated" },
  3: { shipment: "Pickup Scheduled" },
  4: { shipment: "Pickup Queued" },
  5: { shipment: "Manifest Generated", order: "Processed" },
  6: { shipment: "Shipped", order: "Shipped" },
  7: { shipment: "Delivered", order: "Delivered" },
  8: { shipment: "Cancelled", order: "Cancelled" },
  9: { shipment: "RTO Initiated", order: "On the way" },
  10: { shipment: "RTO Delivered", order: "Returned" },
  12: { shipment: "Lost" },
  13: { shipment: "Pickup Error" },
  15: { shipment: "Pickup Rescheduled" },
  16: { shipment: "Cancellation Requested" },
  17: { shipment: "Out For Delivery", order: "Out for Delivery" },
  18: { shipment: "In Transit", order: "On the way" },
  19: { shipment: "Out For Pickup" },
  20: { shipment: "Pickup Exception" },
  21: { shipment: "Undelivered" },
  22: { shipment: "Delayed" },
  25: { shipment: "Damaged" },
  38: { shipment: "Reached Destination", order: "On the way" },
  40: { shipment: "RTO NDR", order: "On the way" },
  41: { shipment: "RTO Out For Delivery", order: "On the way" },
  42: { shipment: "Picked Up", order: "Picked up" },
  45: { shipment: "Cancelled Before Dispatch", order: "Cancelled" },
  46: { shipment: "RTO In Transit", order: "On the way" },
  78: { shipment: "Returned To Seller", order: "Returned" },
};

export const applyShiprocketTrackingUpdate = async (
  shipment: any,
  update: any,
  io?: SocketIOServer,
  applyOrderUpdate = true,
) => {
  const statusCode = Number(
    update.current_status_id ?? update.shipment_status_id ?? update.status_code ?? update.status,
  );
  const mapped = statusMap[statusCode];
  const status =
    update.current_status || update.shipment_status || update.status_name || mapped?.shipment || shipment.status;
  shipment.shiprocketStatusCode = Number.isFinite(statusCode) ? statusCode : shipment.shiprocketStatusCode;
  shipment.shiprocketStatus = status;
  shipment.status = mapped?.shipment || status;
  shipment.lastSyncedAt = new Date();
  shipment.lastError = undefined;

  const eventAtRaw = update.scans?.[0]?.date || update.event_time || update.updated_at;
  const eventAt = eventAtRaw ? new Date(eventAtRaw) : new Date();
  const eventKey = `${statusCode}|${Number.isNaN(eventAt.getTime()) ? "" : eventAt.toISOString()}`;
  const exists = shipment.trackingEvents?.some(
    (event: any) => `${event.statusCode}|${event.eventAt ? new Date(event.eventAt).toISOString() : ""}` === eventKey,
  );
  if (!exists) {
    shipment.trackingEvents.push({
      status,
      statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
      activity: update.activity || update.scans?.[0]?.activity,
      location: update.location || update.scans?.[0]?.location,
      eventAt: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt,
      receivedAt: new Date(),
    });
    if (shipment.trackingEvents.length > 100) shipment.trackingEvents = shipment.trackingEvents.slice(-100);
  }
  await shipment.save();

  if (applyOrderUpdate && mapped?.order) {
    const order: any = await Order.findById(shipment.order);
    if (order && !["Cancelled", "Returned"].includes(order.status)) {
      const previousStatus = order.status;
      const transitionedToDelivered = mapped.order === "Delivered" && order.status !== "Delivered";
      order.status = mapped.order;
      if (transitionedToDelivered) order.deliveredAt = new Date();
      if (mapped.order === "Cancelled") {
        order.cancelledAt = order.cancelledAt || new Date();
        order.cancellationReason = order.cancellationReason || "Cancelled by Shiprocket/courier";
      }
      await order.save();
      if (previousStatus !== order.status) {
        try {
          const { sendOrderStatusNotification } = await import("./notificationService");
          await sendOrderStatusNotification(String(order._id), String(order.customer), order.status);
        } catch (error) {
          console.error("Shiprocket customer status notification failed:", error);
        }
      }
      if (transitionedToDelivered && String(order.paymentMethod).toUpperCase() !== "COD") {
        try {
          const { distributeCommissions } = await import("./commissionService");
          await distributeCommissions(String(order._id));
          const { settleReelCommissionsForOrder } = await import("./reelService");
          await settleReelCommissionsForOrder(String(order._id));
        } catch (error) {
          console.error("Shiprocket prepaid settlement failed:", error);
        }
      }
      io?.to(`order-${String(order._id)}`).emit("order-status-update", {
        orderId: String(order._id),
        status: order.status,
        provider: "Shiprocket",
        shipmentStatus: shipment.status,
      });
    }
  }
  return shipment;
};

export const refreshShipmentTracking = async (orderId: string, io?: SocketIOServer) => {
  const shipment: any = await Shipment.findOne({ order: orderId, provider: "Shiprocket" });
  if (!shipment?.awb) throw new ShiprocketError("Shiprocket tracking is not available for this order", 404);
  const response: any = await trackByAwb(shipment.awb);
  const tracking = response?.tracking_data || response;
  const current = tracking?.shipment_track?.[0] || tracking;
  const activities = tracking?.shipment_track_activities;
  if (Array.isArray(activities)) {
    for (const activity of activities.slice().reverse()) {
      await applyShiprocketTrackingUpdate(
        shipment,
        {
          ...current,
          current_status: activity["sr-status-label"] || activity.activity || current?.current_status,
          current_status_id: activity["sr-status"] || current?.current_status_id,
          activity: activity.activity,
          location: activity.location,
          event_time: activity.date,
        },
        io,
        false,
      );
    }
  }
  await applyShiprocketTrackingUpdate(shipment, current, io);
  return shipment;
};

export const syncActiveShiprocketTracking = async (limit = 50, io?: SocketIOServer) => {
  const shipments: any[] = await Shipment.find({
    provider: "Shiprocket",
    awb: { $exists: true, $ne: "" },
    status: {
      $nin: ["Delivered", "Cancelled", "Cancelled Before Dispatch", "RTO Delivered", "Returned To Seller"],
    },
  })
    .sort({ lastSyncedAt: 1, updatedAt: 1 })
    .limit(limit);

  let synced = 0;
  let failed = 0;
  for (const shipment of shipments) {
    try {
      await refreshShipmentTracking(String(shipment.order), io);
      synced += 1;
    } catch (error) {
      failed += 1;
      shipment.lastError = error instanceof Error ? error.message : "Tracking refresh failed";
      shipment.lastSyncedAt = new Date();
      await shipment.save();
    }
  }
  return { attempted: shipments.length, synced, failed };
};

export const cancelBookedShipment = async (orderId: string) => {
  const shipment: any = await Shipment.findOne({ order: orderId, provider: "Shiprocket" });
  if (
    !shipment?.shiprocketOrderId ||
    ["Cancelled", "Cancelled Before Dispatch", "Cancellation Requested"].includes(shipment.status)
  ) {
    return shipment;
  }
  await cancelShiprocketOrder(shipment.shiprocketOrderId);
  shipment.status = "Cancellation Requested";
  shipment.shiprocketStatus = "Cancellation Requested";
  shipment.shiprocketStatusCode = 16;
  shipment.lastSyncedAt = new Date();
  await shipment.save();
  return shipment;
};

export const retryShipmentPickup = async (orderId: string) => {
  const shipment: any = await Shipment.findOne({ order: orderId, provider: "Shiprocket" });
  if (!shipment?.shiprocketShipmentId || !shipment.awb) {
    throw new ShiprocketError("AWB must be assigned before scheduling pickup", 409);
  }
  const result: any = await schedulePickup(shipment.shiprocketShipmentId);
  const pickupDate = result?.response?.pickup_scheduled_date || result?.pickup_scheduled_date;
  shipment.pickupScheduledAt = pickupDate ? new Date(pickupDate) : new Date();
  shipment.status = "Pickup Scheduled";
  shipment.lastError = undefined;
  await shipment.save();
  return shipment;
};

export const refreshShipmentDocuments = async (orderId: string) => {
  const shipment: any = await Shipment.findOne({ order: orderId, provider: "Shiprocket" });
  if (!shipment?.shiprocketOrderId || !shipment?.shiprocketShipmentId) {
    throw new ShiprocketError("Shiprocket order has not been created", 409);
  }
  const documents = await generateDocuments(shipment.shiprocketOrderId, shipment.shiprocketShipmentId);
  Object.assign(shipment, documents);
  await shipment.save();
  return shipment;
};
