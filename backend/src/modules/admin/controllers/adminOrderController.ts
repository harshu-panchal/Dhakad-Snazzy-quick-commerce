import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Delivery from "../../../models/Delivery";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import Return from "../../../models/Return";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import { Server as SocketIOServer } from "socket.io";
import { notifyDeliveryBoyOfAssignment, isDeliveryBoyBusy } from "../../../services/orderNotificationService";
import {
  calculateCODOrderBreakdown,
  getOrderEarningBreakdown as getOrderEarningBreakdownService,
} from "../../../services/commissionService";
import Seller from "../../../models/Seller";
import Shipment from "../../../models/Shipment";
import { cancelBookedShipment, getPersonalDeliveryOptions } from "../../../services/shippingService";
import { lockDeliveryPartnerEarning } from "../../../services/deliveryPartnerEarningService";

/**
 * Get all orders with filters
 */
export const getAllOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      seller,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const query: any = { status: { $ne: "Pending" } };

    if (status) {
      if (status === "Tracking") {
        query.deliveryBoy = { $exists: true, $ne: null };
        query.status = {
          $nin: ["Delivered", "Cancelled", "Rejected", "Returned"],
        };
      } else {
        query.status = status;
      }
    }
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search as string, $options: "i" } },
        { customerName: { $regex: search as string, $options: "i" } },
        { customerEmail: { $regex: search as string, $options: "i" } },
        { customerPhone: { $regex: search as string, $options: "i" } },
      ];
    }

    // If seller filter, need to check order items
    if (seller) {
      const orderItems = await OrderItem.find({ seller }).distinct("order");
      query._id = { $in: orderItems };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate({
          path: "items",
          populate: {
            path: "seller",
            select: "sellerName storeName",
          },
        })
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  },
);

/**
 * Settlement page: list delivered orders with COD breakdown (admin view).
 * Recent COD Self-assign delivery orders appear at top; then by orderDate desc.
 */
export const getSettlementOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;
    const match: any = { status: "Delivered", paymentMethod: "COD" };
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const limitNum = parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $addFields: {
            sortCodSelf: {
              $cond: [
                { $and: [{ $eq: ["$paymentMethod", "COD"] }, { $eq: ["$deliveryPreference", "Self"] }] },
                1,
                0,
              ],
            },
          },
        },
        { $sort: { sortCodSelf: -1, orderDate: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        { $lookup: { from: "deliveries", localField: "deliveryBoy", foreignField: "_id", as: "deliveryBoyDoc" } },
        { $unwind: { path: "$deliveryBoyDoc", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            orderNumber: 1,
            orderDate: 1,
            paymentMethod: 1,
            total: 1,
            shipping: 1,
            deliveryPreference: 1,
            status: 1,
            deliveryBoy: { $ifNull: ["$deliveryBoyDoc", null] },
          },
        },
      ]),
      Order.countDocuments(match),
    ]);

    const ordersWithBreakdown = await Promise.all(
      orders.map(async (order: any) => {
        let codBreakdown = null;
        if (order.paymentMethod === "COD") {
          try {
            codBreakdown = await calculateCODOrderBreakdown(order._id.toString());
            codBreakdown = {
              ...codBreakdown,
              sellerEarningsList: Array.from(codBreakdown.sellerEarnings.entries()).map(
                ([sellerId, amount]) => ({ sellerId, amount }),
              ),
              note: codBreakdown.isSelfAssign
                ? "Self Assign: Delivery boy has no share. Delivery charge goes to seller(s)."
                : undefined,
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
      data: { orders: ordersWithBreakdown, total, page: parseInt(page as string), limit: parseInt(limit as string), pages: Math.ceil(total / parseInt(limit as string)) },
    });
  },
);

/**
 * Get COD order breakdown (admin view: seller earnings, admin commission, delivery boy / Self Assign note)
 */
export const getOrderCODBreakdown = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await Order.findById(id).select("paymentMethod deliveryPreference deliveryProvider");
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
    const sellerEarningsList = Array.from(breakdown.sellerEarnings.entries()).map(
      ([sellerId, amount]) => ({ sellerId, amount }),
    );
    return res.status(200).json({
      success: true,
      data: {
        ...breakdown,
        sellerEarningsList,
        note: breakdown.isSelfAssign
          ? "Self Assign: Delivery boy has no share. Delivery charge goes to seller(s)."
          : order.deliveryProvider === "Shiprocket"
            ? "Shiprocket COD stays pending until the remittance is recorded."
            : undefined,
      },
    });
  },
);

/**
 * Get earning breakdown for any order (COD or Online): admin commission, seller earnings, delivery split
 */
export const getOrderEarningBreakdown = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await Order.findById(id).select("paymentMethod deliveryPreference deliveryProvider");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const breakdown = await getOrderEarningBreakdownService(id);
    const sellerEarningsList = await Promise.all(
      Array.from(breakdown.sellerEarnings.entries()).map(
        async ([sellerId, amount]) => {
          const seller = await Seller.findById(sellerId).select("sellerName storeName").lean();
          const name = seller?.storeName || seller?.sellerName || sellerId;
          return { sellerId, amount, sellerName: name };
        },
      ),
    );
    const { sellerEarnings: _m, ...rest } = breakdown as any;
    const payload = {
      ...rest,
      sellerEarningsList,
      note: breakdown.isSelfAssign
          ? "Self Assign: Delivery charge goes to seller(s). Delivery boy has no share."
          : order.deliveryProvider === "Shiprocket"
            ? "Shiprocket courier cost is deducted from the admin delivery margin."
            : "Delivery partner gets delivery share; rest is admin.",
    };
    return res.status(200).json({ success: true, data: payload });
  },
);

/**
 * Get order by ID
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate({
        path: "items",
        populate: [
          {
            path: "product",
            select: "productName mainImage",
          },
          {
            path: "seller",
            select: "sellerName storeName",
          },
        ],
      })
      .populate("cancelledBy", "firstName lastName");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const shipment = await Shipment.findOne({ order: order._id }).lean();

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: { ...order.toObject(), shipment },
    });
  },
);

/**
 * Mark COD order as paid to admin (seller/delivery boy paid; order will leave seller settlement pending list)
 */
export const markOrderCODPaid = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await Order.findById(id).select("paymentMethod status codPaidToAdminAt deliveryProvider");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.paymentMethod !== "COD") {
      return res.status(400).json({ success: false, message: "Only COD orders can be marked as paid" });
    }
    if (order.deliveryProvider === "Shiprocket") {
      return res.status(409).json({
        success: false,
        message: "Record this payment through the Shiprocket COD remittance action.",
      });
    }
    if (order.codPaidToAdminAt) {
      return res.status(400).json({ success: false, message: "COD for this order is already marked as paid" });
    }
    order.codPaidToAdminAt = new Date();
    await order.save();
    return res.status(200).json({
      success: true,
      message: "COD marked as received. Order will no longer appear in seller pending settlement.",
      data: { orderId: order._id, codPaidToAdminAt: order.codPaidToAdminAt },
    });
  },
);

/**
 * Update order status
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = [
      "Received",
      "Accepted",
      "Pending",
      "Processed",
      "Shipped",
      "Picked up",
      "On the way",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Rejected",
      "Returned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const currentOrder = await Order.findById(id).select("deliveryProvider");
    if (!currentOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (currentOrder.deliveryProvider === "Shiprocket" && status !== "Cancelled") {
      return res.status(409).json({
        success: false,
        message: "Shiprocket order status is controlled by courier tracking.",
      });
    }

    const updateData: any = { status };
    if (adminNotes) updateData.adminNotes = adminNotes;

    if (status === "Delivered") {
      updateData.deliveredAt = new Date();
    }

    if (status === "Cancelled") {
      try {
        await cancelBookedShipment(id);
      } catch (error: any) {
        return res.status(error?.statusCode || 502).json({
          success: false,
          message: `Order was not cancelled because Shiprocket cancellation failed: ${error.message}`,
        });
      }
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = req.user?.userId;
    }

    const order = await Order.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .populate("items");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Trigger notification if status is "Processed" (Confirmed) or if paymentStatus changed to "Paid"
    if (status === "Processed" || order.paymentStatus === "Paid") {
      const io: SocketIOServer = req.app.get("io");
      if (io) {
        notifySellersOfOrderUpdate(io, order, "STATUS_UPDATE");
      }
    }

    // Distribute commissions if order is delivered
    if (status === "Delivered") {
      const { distributeCommissions } =
        await import("../../../services/commissionService");
      try {
        await distributeCommissions(id);
      } catch (error) {
        console.error("Error distributing commissions:", error);
      }
      try {
        const { settleReelCommissionsForOrder } = await import(
          "../../../services/reelService"
        );
        await settleReelCommissionsForOrder(id);
      } catch (reelError) {
        console.error("Error settling reel commissions:", reelError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  },
);

/**
 * Assign delivery boy to order
 */
export const assignDeliveryBoy = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery boy ID is required",
      });
    }

    // Verify delivery boy exists and is active
    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    if (deliveryBoy.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Delivery boy is not active",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.deliveryPreference === "Self") {
      return res.status(400).json({
        success: false,
        message: "This order is self-delivery (seller delivers). Cannot assign a delivery boy.",
      });
    }

    const existingShipment = await Shipment.findOne({ order: order._id });
    if (existingShipment?.provider === "Shiprocket" && existingShipment.shiprocketOrderId) {
      return res.status(409).json({
        success: false,
        message: "This order is booked with Shiprocket. Cancel that shipment before assigning a personal partner.",
      });
    }

    // Prevent loading one delivery boy with multiple concurrent orders — they must
    // complete (or the order must be cancelled/returned) before taking another.
    const busyCheck = await isDeliveryBoyBusy(deliveryBoyId, id);
    if (busyCheck.busy) {
      return res.status(400).json({
        success: false,
        message: `This delivery boy is already handling order ${busyCheck.orderNumber}. They must complete it before another order can be assigned.`,
      });
    }

    // Update order
    order.deliveryBoy = deliveryBoyId as any;
    order.deliveryProvider = "Personal";
    order.deliveryBoyStatus = "Assigned";
    order.assignedAt = new Date();
    order.deliveryAssignmentStatus = "Assigned" as any;
    order.deliveryAssignmentResolvedAt = new Date();
    await lockDeliveryPartnerEarning(order, deliveryBoyId);
    await order.save();

    const personalOptions = await getPersonalDeliveryOptions(order);
    const selectedCost = personalOptions.find((option) => option.deliveryBoyId === deliveryBoyId)?.cost;
    await Shipment.findOneAndUpdate(
      { order: order._id },
      {
        order: order._id,
        seller: (await OrderItem.findOne({ order: order._id }).select("seller").lean())?.seller,
        provider: "Personal",
        status: "Assigned",
        personalDeliveryCost: selectedCost,
        codRemittanceStatus: "NotApplicable",
      },
      { upsert: true, new: true, runValidators: true },
    );

    // Create or update delivery assignment
    await DeliveryAssignment.findOneAndUpdate(
      { order: id },
      {
        order: id,
        deliveryBoy: deliveryBoyId,
        assignedAt: new Date(),
        assignedBy: req.user?.userId,
        status: "Assigned",
      },
      { upsert: true, new: true },
    );

    const updatedOrder = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email")
      .populate("items");

    // Trigger notification to delivery boy
    const io: SocketIOServer = req.app.get("io");
    if (io) {
      notifyDeliveryBoyOfAssignment(io, updatedOrder, deliveryBoyId);
    }

    return res.status(200).json({
      success: true,
      message: "Delivery boy assigned successfully",
      data: updatedOrder,
    });
  },
);

/**
 * Get orders by status
 */
export const getOrdersByStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const validStatuses = [
      "Received",
      "Accepted",
      "Pending",
      "Processed",
      "Shipped",
      "Picked up",
      "On the way",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Rejected",
      "Returned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find({ status })
        .populate("customer", "name email phone")
        .populate("deliveryBoy", "name mobile")
        .populate("items")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments({ status }),
    ]);

    return res.status(200).json({
      success: true,
      message: `Orders with status ${status} fetched successfully`,
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  },
);

/**
 * Get all return requests
 */
export const getReturnRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      seller,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Date filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Search filter (complex because we need to search populated fields)
    // For now, simpler implementation - search by order ID or return reason or customer
    if (search) {
      // Find orders matching search first
      const orders = await Order.find({
        orderNumber: { $regex: search as string, $options: "i" },
      }).select("_id");
      const orderIds = orders.map((o) => o._id);

      query.$or = [
        { order: { $in: orderIds } },
        { reason: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
      ];
    }

    // Seller filter requires looking up order items
    if (seller && seller !== "all") {
      // Find order items for this seller
      const orderItems = await OrderItem.find({ seller }).select("_id");
      const orderItemIds = orderItems.map((oi) => oi._id);
      query.orderItem = { $in: orderItemIds };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const [requests, total] = await Promise.all([
      Return.find(query)
        .populate("order", "orderNumber")
        .populate("customer", "name email phone")
        .populate({
          path: "orderItem",
          populate: {
            path: "product",
            select: "productName mainImage",
          },
        })
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Return.countDocuments(query),
    ]);

    // Transform logic to match frontend expectations if necessary
    // AdminReturnRequest.tsx expects: _id, orderItemId, userName, productName, variant, price, quantity, total, status, requestedAt
    // It seems flattened. Let's send structured data and let frontend handle it, or flatten it here.
    // The frontend uses "request.orderItemId", "request.userName", "request.productName" etc.
    // This implies a flattened structure.

    const transformedRequests = requests.map((req: any) => ({
      _id: req._id,
      orderId: req.order?._id,
      orderNumber: req.order?.orderNumber,
      orderItemId: req.orderItem?._id, // Frontend displays this
      userId: req.customer?._id,
      userName: req.customer?.name || "Unknown",
      // product info from orderItem
      productId: req.orderItem?.product?._id,
      productName: req.orderItem?.productName || "Unknown Product",
      variant: req.orderItem?.variation,
      price: req.orderItem?.unitPrice || 0,
      quantity: req.quantity,
      total: req.quantity * (req.orderItem?.unitPrice || 0),
      reason: req.reason,
      status: req.status,
      requestedAt: req.createdAt,
      processedAt: req.processedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Return requests fetched successfully",
      data: transformedRequests,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  },
);

/**
 * Get return request by ID
 */
export const getReturnRequestById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const returnRequest = await Return.findById(id)
      .populate("order")
      .populate("customer", "name email phone")
      .populate({
        path: "orderItem",
        populate: [
          { path: "product", select: "productName mainImage" },
          { path: "seller", select: "sellerName storeName" },
        ],
      })
      .populate("processedBy", "firstName lastName");

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return request details fetched successfully",
      data: returnRequest,
    });
  },
);

/**
 * Process return request (Update)
 */
export const processReturnRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, rejectionReason, refundAmount, adminNotes } = req.body;

    const validStatuses = ["Approved", "Rejected", "Processing", "Completed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const returnRequest = await Return.findById(id);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    const updateData: any = {
      processedBy: req.user?.userId,
      processedAt: new Date(),
    };

    if (status) updateData.status = status;

    // Handle rejection reason (frontend sends 'adminNotes' for rejection reason)
    if (status === "Rejected") {
      if (rejectionReason) updateData.rejectionReason = rejectionReason;
      else if (adminNotes) updateData.rejectionReason = adminNotes;
    }

    if (status === "Approved" && refundAmount) {
      updateData.refundAmount = refundAmount;
    }

    const updatedReturn = await Return.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("order")
      .populate("orderItem")
      .populate("customer", "name email phone");

    return res.status(200).json({
      success: true,
      message: `Return request ${status ? status.toLowerCase() : "updated"
        } successfully`,
      data: updatedReturn,
    });
  },
);

/**
 * Export orders to CSV
 */
export const exportOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const { status, dateFrom, dateTo } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom as string);
      if (dateTo) query.orderDate.$lte = new Date(dateTo as string);
    }

    const orders = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort({ orderDate: -1 })
      .lean();

    // Convert to CSV format
    const csvHeaders = [
      "Order Number",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Order Date",
      "Status",
      "Payment Status",
      "Total Amount",
      "Delivery Address",
      "Delivery Boy",
    ];

    const csvRows = orders.map((order) => [
      order.orderNumber,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.orderDate.toISOString(),
      order.status,
      order.paymentStatus,
      order.total.toString(),
      `${order.deliveryAddress.address}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}`,
      order.deliveryPreference === 'Self' ? 'Self Assigned' : (order.deliveryBoy ? (order.deliveryBoy as any).name : "Not Assigned"),
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=orders_${Date.now()}.csv`,
    );
    res.send(csvContent);
  },
);
