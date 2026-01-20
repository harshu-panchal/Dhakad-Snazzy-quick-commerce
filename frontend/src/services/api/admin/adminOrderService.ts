import api from "../config";


import { ApiResponse } from "./types";

export interface OrderItem {
  _id: string;
  order: string;
  product: string | { productName: string; mainImage?: string };
  seller: string | { sellerName: string; storeName: string };
  productName: string;
  productImage?: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
  total: number;
  variation?: string;
  status: "Pending" | "Shipped" | "Delivered" | "Cancelled" | "Returned";
}

export interface DeliveryAddress {
  address: string;
  city: string;
  state?: string;
  pincode: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  orderDate: string;
  customer: string | { name: string; email: string; phone: string };
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: DeliveryAddress;
  items: string[] | OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  couponCode?: string;
  total: number;
  paymentMethod: string;
  paymentStatus: "Pending" | "Paid" | "Failed" | "Refunded";
  paymentId?: string;
  status:
  | "Received"
  | "Pending"
  | "Processed"
  | "Shipped"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled"
  | "Rejected"
  | "Returned";
  deliveryBoy?: string | { _id: string; name: string; mobile: string; email?: string };
  deliveryBoyStatus?:
  | "Assigned"
  | "Picked Up"
  | "In Transit"
  | "Delivered"
  | "Failed";
  assignedAt?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  deliveredAt?: string;
  adminNotes?: string;
  customerNotes?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string | { firstName: string; lastName: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface GetOrdersParams {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  seller?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface UpdateOrderStatusData {
  status: string;
  adminNotes?: string;
}

export interface AssignDeliveryBoyData {
  deliveryBoyId: string;
}

export interface ReturnRequest {
  _id: string;
  order: string | Order;
  orderItem: string | OrderItem;
  customer: string | { name: string; email: string; phone: string };
  reason: string;
  description?: string;
  status: "Pending" | "Approved" | "Rejected" | "Processing" | "Completed";
  quantity: number;
  images?: string[];
  processedBy?: string;
  processedAt?: string;
  rejectionReason?: string;
  pickupScheduled?: string;
  pickupCompleted?: string;
  refundAmount?: number;
  refundId?: string;
}

export interface ProcessReturnRequestData {
  status: "Approved" | "Rejected" | "Processing" | "Completed";
  rejectionReason?: string;
  refundAmount?: number;
}

export interface ExportOrdersParams {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Get all orders
 */
export const getAllOrders = async (
  params?: GetOrdersParams
): Promise<ApiResponse<Order[]>> => {
  const response = await api.get<ApiResponse<Order[]>>("/admin/orders", {
    params,
  });
  return response.data;
};

/**
 * Get orders by status
 */
export const getOrdersByStatus = async (
  status: string,
  params?: { page?: number; limit?: number }
): Promise<ApiResponse<Order[]>> => {
  const response = await api.get<ApiResponse<Order[]>>(
    `/admin/orders/status/${status}`,
    { params }
  );
  return response.data;
};

/**
 * Get order by ID
 */
export const getOrderById = async (id: string): Promise<ApiResponse<Order>> => {
  const response = await api.get<ApiResponse<Order>>(`/admin/orders/${id}`);
  return response.data;
};

/**
 * Update order status
 */
export const updateOrderStatus = async (
  id: string,
  data: UpdateOrderStatusData
): Promise<ApiResponse<Order>> => {
  const response = await api.patch<ApiResponse<Order>>(
    `/admin/orders/${id}/status`,
    data
  );
  return response.data;
};

/**
 * Assign delivery boy to order
 */
export const assignDeliveryBoy = async (
  id: string,
  data: AssignDeliveryBoyData
): Promise<ApiResponse<Order>> => {
  const response = await api.patch<ApiResponse<Order>>(
    `/admin/orders/${id}/assign-delivery`,
    data
  );
  return response.data;
};

/**
 * Process return request
 */
export const processReturnRequest = async (
  id: string,
  data: ProcessReturnRequestData
): Promise<ApiResponse<ReturnRequest>> => {
  const response = await api.patch<ApiResponse<ReturnRequest>>(
    `/admin/returns/${id}/process`,
    data
  );
  return response.data;
};

/**
 * Export orders to CSV
 */
export const exportOrders = async (
  params?: ExportOrdersParams
): Promise<Blob> => {
  const response = await api.get("/admin/orders/export/csv", {
    params,
    responseType: "blob",
  });
  return response.data;
};
