import { Request, Response } from "express";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";
import { notifyDeliveryBoysOfNewOrder } from "../../../services/orderNotificationService";
import { Server as SocketIOServer } from "socket.io";
import {
  calculateCODOrderBreakdown,
  getOrderEarningBreakdown,
} from "../../../services/commissionService";

/**
 * Get seller's orders with filters, sorting, and pagination
 */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const {
    dateFrom,
    dateTo,
    status,
    search,
    page = "1",
    limit = "10",
    sortBy = "orderDate",
    sortOrder = "desc",
  } = req.query;

  // Find all order IDs that contain items from this seller
  const orderItems = await OrderItem.find({ seller: sellerId }).distinct(
    "order",
  );

  // Build query - filter by orders containing this seller's items
  const query: any = { _id: { $in: orderItems } };

  // Date range filter
  if (dateFrom || dateTo) {
    query.orderDate = {};
    if (dateFrom) {
      query.orderDate.$gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      query.orderDate.$lte = new Date(dateTo as string);
    }
  }

  // Status filter
  if (status && status !== "All Status") {
    if (status === "Tracking") {
      // Include orders where a delivery boy is assigned and the order is still active
      query.deliveryBoy = { $exists: true, $ne: null };
      query.status = {
        $nin: ["Delivered", "Cancelled", "Rejected", "Returned"],
      };
    } else {
      // Map frontend status to backend status
      const statusMapping: Record<string, string> = {
        Pending: "Pending",
        Accepted: "Accepted",
        "On the way": "On the way",
        Delivered: "Delivered",
        Cancelled: "Cancelled",
        Rejected: "Rejected",
      };
      query.status = statusMapping[status as string] || status;
    }
  }

  // Search filter
  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { invoiceNumber: { $regex: search, $options: "i" } },
      { "deliveryAddress.name": { $regex: search, $options: "i" } },
      { "deliveryAddress.phone": { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort: any = {};
  sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

  // Get orders with populated customer and delivery info
  const orders = await Order.find(query)
    .populate("customer", "name email phone")
    .populate("deliveryBoy", "name mobile")
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Order.countDocuments(query);

  // Format response for frontend
  const formattedOrders = orders.map((order) => ({
    id: order._id,
    orderId: order.orderNumber,
    deliveryDate: order.estimatedDeliveryDate
      ? order.estimatedDeliveryDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
      : order.orderDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
    orderDate: order.orderDate.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: order.status === "On the way" ? "On the way" : order.status,
    amount: order.total,
    customerName: (order.customer as any)?.name || order.customerName || "",
    customerPhone: (order.customer as any)?.phone || order.customerPhone || "",
    deliveryBoyName: order.deliveryPreference === 'Self' ? 'Self Assigned' : (order.deliveryBoy as any)?.name || "",
    deliveryBoyPhone: order.deliveryPreference === 'Self' ? '' : (order.deliveryBoy as any)?.mobile || "",
    deliveryPreference: order.deliveryPreference,
  }));

  return res.status(200).json({
    success: true,
    message: "Orders fetched successfully",
    data: formattedOrders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Settlement page: list seller's delivered orders with COD breakdown.
 * settlementStatus=pending (default): only orders where COD not yet paid to admin (so list "hat jata hai" after pay).
 * settlementStatus=settled: only COD orders already paid to admin. all: no filter.
 */
export const getSettlementOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { page = 1, limit = 20, settlementStatus = "pending" } = req.query;
    const orderIds = await OrderItem.find({ seller: sellerId }).distinct("order");
    const query: any = { _id: { $in: orderIds }, status: "Delivered", paymentMethod: "COD" };
    if (settlementStatus === "pending") {
      query.codPaidToAdminAt = null;
    } else if (settlementStatus === "settled") {
      query.codPaidToAdminAt = { $ne: null };
    }
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const orders = await Order.find(query)
      .select("orderNumber orderDate paymentMethod total shipping deliveryPreference status codPaidToAdminAt")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .lean();
    const total = await Order.countDocuments(query);

    const ordersWithBreakdown = await Promise.all(
      orders.map(async (order: any) => {
        let codBreakdown = null;
        if (order.paymentMethod === "COD") {
          try {
            const full = await calculateCODOrderBreakdown(order._id.toString());
            const myEarning = full.sellerEarnings.get(sellerId) ?? 0;
            codBreakdown = {
              orderId: full.orderId,
              orderNumber: full.orderNumber,
              adminProductCommission: full.adminProductCommission,
              platformFee: full.platformFee,
              totalDeliveryCharge: full.totalDeliveryCharge,
              deliveryBoyCommission: full.deliveryBoyCommission,
              isSelfAssign: full.isSelfAssign,
              totalAdminEarning: full.totalAdminEarning,
              yourEarning: myEarning,
              note: full.isSelfAssign
                ? "Self Assign: Delivery charge added to your earning. Delivery boy has no share."
                : "Amount to pay admin & your earning.",
            };
          } catch {
            // ignore
          }
        }
        return { order, codBreakdown };
      }),
    );

    return res.status(200).json({
      success: true,
      data: {
        orders: ordersWithBreakdown,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  },
);

/**
 * Get COD order breakdown for seller (admin commission visible; Self Assign = delivery boy gets nothing)
 */
export const getOrderCODBreakdown = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const hasItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!hasItems) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = await Order.findById(id).select("paymentMethod deliveryPreference");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.paymentMethod !== "COD") {
      return res.status(400).json({
        success: false,
        message: "COD breakdown is only available for COD orders",
      });
    }
    const breakdown = await calculateCODOrderBreakdown(id);
    const myEarning = breakdown.sellerEarnings.get(sellerId) ?? 0;
    return res.status(200).json({
      success: true,
      data: {
        orderId: breakdown.orderId,
        orderNumber: breakdown.orderNumber,
        adminProductCommission: breakdown.adminProductCommission,
        platformFee: breakdown.platformFee,
        totalDeliveryCharge: breakdown.totalDeliveryCharge,
        deliveryBoyCommission: breakdown.deliveryBoyCommission,
        isSelfAssign: breakdown.isSelfAssign,
        totalAdminEarning: breakdown.totalAdminEarning,
        yourEarning: myEarning,
        note: breakdown.isSelfAssign
          ? "Self Assign: Delivery charge added to seller earning. Delivery boy has no share."
          : "Admin commission and your earning for this COD order.",
      },
    });
  },
);

/**
 * Get earning breakdown for this order (COD or Online): your earning, admin commission, delivery (Self = you get delivery charge)
 */
export const getOrderEarningBreakdownSeller = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const hasItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!hasItems) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const breakdown = await getOrderEarningBreakdown(id);
    const yourEarning = breakdown.sellerEarnings.get(sellerId) ?? 0;
    const payload = {
      orderId: breakdown.orderId,
      orderNumber: breakdown.orderNumber,
      adminProductCommission: breakdown.adminProductCommission,
      platformFee: breakdown.platformFee,
      totalDeliveryCharge: breakdown.totalDeliveryCharge,
      deliveryBoyCommission: breakdown.deliveryBoyCommission,
      isSelfAssign: breakdown.isSelfAssign,
      totalAdminEarning: breakdown.totalAdminEarning,
      yourEarning,
      note: breakdown.isSelfAssign
        ? "Self Assign: Delivery charge is included in your earning. Delivery partner has no share."
        : "Delivery partner gets delivery share. Your earning is from product sale (after commission).",
    };
    return res.status(200).json({ success: true, data: payload });
  },
);

/**
 * Seller marks COD as paid to admin (order will leave pending settlement list)
 */
export const markOrderCODPaidSeller = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const hasItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!hasItems) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = await Order.findById(id).select("paymentMethod status codPaidToAdminAt");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.paymentMethod !== "COD") {
      return res.status(400).json({ success: false, message: "Only COD orders can be marked as paid" });
    }
    if (order.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders appear in settlement. Mark the order as Delivered first, then you can mark as paid to admin.",
      });
    }
    if (order.codPaidToAdminAt) {
      return res.status(400).json({ success: false, message: "COD for this order is already marked as paid" });
    }
    order.codPaidToAdminAt = new Date();
    await order.save();
    return res.status(200).json({
      success: true,
      message: "Marked as paid to admin. This order will no longer appear in your pending settlement list.",
      data: { orderId: order._id, codPaidToAdminAt: order.codPaidToAdminAt },
    });
  },
);

/**
 * Get order by ID with populated order items, customer, and delivery info
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;

    // First check if this seller has items in this order
    const sellerItems = await OrderItem.find({ order: id, seller: sellerId })
      .populate("seller", "storeName")
      .populate("product");

    if (!sellerItems || sellerItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get order with populated data
    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get only this seller's order items
    const orderItems = sellerItems;

    // Format order items for frontend
    // Format order items for frontend
    const formattedItems = orderItems.map((item) => {
      let unit = item.variation || "N/A";
      let variationMatched = false;

      // Try to resolve variation value from product if it exists
      // item.product is populated now
      const product = item.product as any;
      if (product && product.variations && Array.isArray(product.variations)) {
        // 1. Try to match by ID or Value if validation is present
        if (item.variation) {
          const variationById = product.variations.find(
            (v: any) => v._id.toString() === item.variation,
          );
          if (variationById) {
            unit = variationById.value;
            variationMatched = true;
          } else {
            const variationByValue = product.variations.find(
              (v: any) => v.value === item.variation,
            );
            if (variationByValue) {
              unit = variationByValue.value;
              variationMatched = true;
            }
          }
        }

        // 2. Fallback: If not matched yet (even if we have a value like '250'), try to recover
        if (!variationMatched) {
          const variationByPrice = product.variations.find(
            (v: any) =>
              v.price === item.unitPrice || v.discPrice === item.unitPrice,
          );
          if (variationByPrice) {
            unit = variationByPrice.value;
            variationMatched = true;
          } else if (product.variations.length === 1) {
            // 3. Last Resort: If there is only one variation, assume it's that one
            unit = product.variations[0].value;
          }
        }
      }

      return {
        srNo: item._id.toString().slice(-4), // Use last 4 chars of ID as srNo
        product: item.productName || "Unknown Product",
        soldBy: (item.seller as any)?.storeName || "N/A",
        unit: unit,
        price: item.unitPrice || 0,
        tax: 0,
        taxPercent: 0,
        qty: item.quantity || 0,
        subtotal: item.total || 0,
      };
    });

    // Format order data for frontend
    const orderDetail = {
      id: order._id,
      invoiceNumber: order.invoiceNumber || order.orderNumber || "N/A",
      orderDate: order.orderDate
        ? order.orderDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      deliveryDate: order.estimatedDeliveryDate
        ? order.estimatedDeliveryDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      timeSlot: order.timeSlot || "N/A",
      status: order.status === "On the way" ? "Out For Delivery" : order.status,
      customerName: (order.customer as any)?.name || order.customerName || "",
      customerEmail:
        (order.customer as any)?.email || order.customerEmail || "",
      customerPhone:
        (order.customer as any)?.phone || order.customerPhone || "",
      deliveryBoyName: order.deliveryPreference === 'Self' ? 'Self Assigned' : (order.deliveryBoy as any)?.name || "",
      deliveryBoyPhone: order.deliveryPreference === 'Self' ? '' : (order.deliveryBoy as any)?.mobile || "",
      deliveryPreference: order.deliveryPreference,
      deliveryOption: order.deliveryOption,
      items: formattedItems,
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      grandTotal: order.total || 0,
      paymentMethod: order.paymentMethod || "N/A",
      paymentStatus: order.paymentStatus || "Pending",
      deliveryAddress: order.deliveryAddress || {},
    };

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully",
      data: orderDetail,
    });
  },
);

/**
 * Update order status (seller can update: Accepted, On the way, Delivered, Cancelled)
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const { status, deliveryPreference } = req.body;

    // Validate allowed status updates for seller
    const allowedStatuses = [
      "Accepted",
      "On the way",
      "Delivered",
      "Cancelled",
      "Rejected",
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Seller can only update to: ${allowedStatuses.join(", ")}`,
      });
    }

    // Check if this seller has items in this order
    const sellerItems = await OrderItem.findOne({
      order: id,
      seller: sellerId,
    });

    if (!sellerItems) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found or you are not authorized to manage this order",
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Allow same status only when updating deliveryPreference (e.g. seller chose Self after Accept)
    const previousStatus = order.status;
    if (order.status === status && !deliveryPreference) {
      return res.status(400).json({
        success: false,
        message: `Order is already ${status}`,
      });
    }
    if (order.status !== status) {
      order.status = status;
    }

    if (deliveryPreference && (status === "Accepted" || order.status === "Accepted")) {
      // For Instant delivery, never persist "Admin" — delivery is auto-assigned, order must not go to admin
      if (order.deliveryOption === "Instant" && deliveryPreference === "Admin") {
        order.deliveryPreference = undefined;
      } else {
        order.deliveryPreference = deliveryPreference;
      }
      // When seller chooses Self, ensure no delivery boy is assigned (order must not go to delivery boy)
      if (deliveryPreference === "Self") {
        order.deliveryBoy = undefined;
      }
    }

    await order.save();

    // For Instant: notify delivery boys only when seller did NOT choose Self (Self = seller delivers, no delivery boy)
    // For Standard: only notify when seller did not choose Self or Admin (legacy/fallback)
    const isInstantAccept =
      status === "Accepted" &&
      previousStatus !== "Accepted" &&
      order.deliveryOption === "Instant" &&
      order.deliveryPreference !== "Self";
    const isStandardAutoAccept =
      status === "Accepted" &&
      previousStatus !== "Accepted" &&
      order.deliveryOption !== "Instant" &&
      (!deliveryPreference || (deliveryPreference !== "Self" && deliveryPreference !== "Admin"));

    if (isInstantAccept || isStandardAutoAccept) {
      try {
        console.log(
          `\n🔔 [SELLER] Order ${order.orderNumber} accepted by seller. Triggering delivery broadcast...`,
        );
        const io: SocketIOServer = req.app.get("io") as SocketIOServer;
        if (io) {
          const fullOrder = await Order.findById(order._id)
            .populate({
              path: "items",
              populate: { path: "seller" },
            })
            .lean();

          if (fullOrder) {
            await notifyDeliveryBoysOfNewOrder(io, fullOrder);
            console.log(
              `✅ [SELLER] Delivery notification broadcast initiated for ${order.orderNumber}`,
            );
          } else {
            console.error(
              `❌ [SELLER] Could not fetch full order details for ${order._id}`,
            );
          }
        } else {
          console.error(`❌ [SELLER] Socket.io instance (io) not found in app`);
        }
      } catch (notifyError) {
        console.error(
          "❌ [SELLER ERROR] Error notifying delivery boys:",
          notifyError,
        );
      }
    } else if (status === "Accepted") {
      console.log(
        `ℹ️ [SELLER] Order ${order.orderNumber} accepted, broadcast skipped. Type: ${order.deliveryOption}, Prev: ${previousStatus}`,
      );
    }

    // If order is delivered, use commission service (handles Self Assign: seller gets net + delivery charge; no delivery boy)
    if (status === "Delivered" && previousStatus !== "Delivered") {
      try {
        const { distributeCommissions } = await import(
          "../../../services/commissionService"
        );
        await distributeCommissions(order._id.toString());
      } catch (commissionError) {
        console.error(
          "Error distributing commissions on seller delivery:",
          commissionError,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: {
        id: order._id,
        status: order.status,
      },
    });
  },
);
