import axios, { AxiosError, AxiosRequestConfig } from "axios";
import crypto from "crypto";
import Seller from "../models/Seller";

const DEFAULT_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const TOKEN_LIFETIME_MS = 9 * 24 * 60 * 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

export class ShiprocketError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 502, details?: unknown) {
    super(message);
    this.name = "ShiprocketError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const isShiprocketConfigured = () =>
  Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);

const baseUrl = () => (process.env.SHIPROCKET_API_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

const extractErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "Unknown Shiprocket error";
  const data: any = error.response?.data;
  if (typeof data === "string") return data;
  const message = typeof data?.message === "string"
    ? data.message
    : typeof data?.error === "string"
      ? data.error
      : "";
  if (data?.errors && typeof data.errors === "object") {
    const validation = Object.values(data.errors).flat().join(", ");
    return [message, validation].filter(Boolean).join(" ");
  }
  return message || error.message || "Shiprocket API request failed";
};

const isValidEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const authenticate = async (force = false): Promise<string> => {
  if (!isShiprocketConfigured()) {
    throw new ShiprocketError(
      "Shiprocket is not configured. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.",
      503,
    );
  }
  if (!force && cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  try {
    const response = await axios.post(`${baseUrl()}/auth/login`, {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    });
    const token = response.data?.token;
    if (!token) throw new ShiprocketError("Shiprocket authentication returned no token", 502);
    cachedToken = token;
    cachedTokenExpiresAt = Date.now() + TOKEN_LIFETIME_MS;
    return token;
  } catch (error) {
    if (error instanceof ShiprocketError) throw error;
    throw new ShiprocketError(`Shiprocket authentication failed: ${extractErrorMessage(error)}`, 502);
  }
};

const request = async <T = any>(config: AxiosRequestConfig, retryAuth = true): Promise<T> => {
  const token = await authenticate();
  try {
    const response = await axios.request<T>({
      ...config,
      baseURL: baseUrl(),
      timeout: Number(process.env.SHIPROCKET_TIMEOUT_MS) || 20000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(config.headers || {}),
      },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (retryAuth && axiosError.response?.status === 401) {
      await authenticate(true);
      return request<T>(config, false);
    }
    const status = axiosError.response?.status;
    throw new ShiprocketError(
      `Shiprocket API error: ${extractErrorMessage(error)}`,
      status && status >= 400 && status < 500 ? 400 : 502,
      axiosError.response?.data,
    );
  }
};

const pickupAddressHash = (seller: any): string =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        name: seller.storeName,
        contact: seller.sellerName,
        email: seller.email,
        mobile: seller.mobile,
        address: seller.address,
        city: seller.city,
        state: seller.state,
        pincode: seller.pincode,
        country: seller.country || "India",
      }),
    )
    .digest("hex");

const validatePickupAddress = (seller: any) => {
  const missing = ["sellerName", "storeName", "email", "mobile", "address", "city", "state", "pincode"]
    .filter((field) => !String(seller[field] || "").trim());
  if (missing.length) throw new ShiprocketError(`Seller pickup is missing: ${missing.join(", ")}`, 400);
  if (!/^[1-9][0-9]{5}$/.test(String(seller.pincode))) {
    throw new ShiprocketError("Seller pickup PIN code must be a valid 6-digit Indian PIN code", 400);
  }
  if (!isValidEmail(seller.email)) {
    throw new ShiprocketError("Seller pickup email must be a valid email address", 400);
  }
  if (!/^[0-9]{10}$/.test(String(seller.mobile || ""))) {
    throw new ShiprocketError("Seller pickup mobile must be a valid 10-digit number", 400);
  }
};

const newPickupCode = (seller: any, isUpdate: boolean) => {
  const id = seller._id.toString().replace(/[^a-zA-Z0-9]/g, "").slice(-16).toUpperCase();
  if (!isUpdate) return `DS${id}`.slice(0, 36);
  const version = Date.now().toString(36).slice(-7).toUpperCase();
  return `DS${id}${version}`.slice(0, 36);
};

export const markSellerPickupPending = async (sellerId: string) => {
  await Seller.updateOne(
    { _id: sellerId },
    {
      $set: { shiprocketPickupSyncStatus: "Pending" },
      $unset: { shiprocketPickupSyncError: 1 },
    },
  );
};

export const syncSellerPickup = async (sellerId: string) => {
  const seller: any = await Seller.findById(sellerId);
  if (!seller) throw new ShiprocketError("Seller not found", 404);

  try {
    validatePickupAddress(seller);
    if (!isShiprocketConfigured()) {
      throw new ShiprocketError("Shiprocket credentials have not been configured", 503);
    }

    const addressHash = pickupAddressHash(seller);
    if (
      seller.shiprocketPickupSyncStatus === "Synced" &&
      seller.shiprocketPickupAddressHash === addressHash &&
      seller.shiprocketPickupCode
    ) {
      return seller;
    }

    const pickupCode = newPickupCode(seller, Boolean(seller.shiprocketPickupCode));
    const response: any = await request({
      method: "POST",
      url: "/settings/company/addpickup",
      data: {
        pickup_location: pickupCode,
        name: seller.storeName,
        email: seller.email,
        phone: seller.mobile,
        address: seller.address,
        address_2: "",
        city: seller.city,
        state: seller.state,
        country: seller.country || "India",
        pin_code: seller.pincode,
      },
    });

    const pickupLocationId =
      response?.pickup_id ?? response?.pickup_location_id ?? response?.data?.pickup_id ?? response?.data?.id;
    await Seller.updateOne(
      { _id: seller._id },
      {
        $set: {
          shiprocketPickupCode: pickupCode,
          ...(pickupLocationId ? { shiprocketPickupLocationId: String(pickupLocationId) } : {}),
          shiprocketPickupSyncStatus: "Synced",
          shiprocketPickupSyncedAt: new Date(),
          shiprocketPickupAddressHash: addressHash,
        },
        $unset: { shiprocketPickupSyncError: 1 },
      },
    );
    return Seller.findById(seller._id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pickup synchronization failed";
    await Seller.updateOne(
      { _id: seller._id },
      {
        $set: {
          shiprocketPickupSyncStatus: "Failed",
          shiprocketPickupSyncError: message.slice(0, 1000),
        },
      },
    );
    throw error;
  }
};

export const syncPendingSellerPickups = async (limit = 25) => {
  if (!isShiprocketConfigured()) return { attempted: 0, synced: 0, failed: 0 };
  const pending = await Seller.find({ shiprocketPickupSyncStatus: "Pending" })
    .select("_id")
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();
  const failed = pending.length < limit
    ? await Seller.find({ shiprocketPickupSyncStatus: "Failed" })
        .select("_id")
        .sort({ updatedAt: 1 })
        .limit(limit - pending.length)
        .lean()
    : [];
  const sellers = [...pending, ...failed];
  let synced = 0;
  let failedCount = 0;
  for (const seller of sellers) {
    try {
      await syncSellerPickup(String(seller._id));
      synced += 1;
    } catch {
      failedCount += 1;
    }
  }
  return { attempted: sellers.length, synced, failed: failedCount };
};

export interface PackageDetails {
  weight: number;
  length: number;
  breadth: number;
  height: number;
}

export const validatePackage = (value: any): PackageDetails => {
  const result = {
    weight: Number(value?.weight),
    length: Number(value?.length),
    breadth: Number(value?.breadth),
    height: Number(value?.height),
  };
  if (!Number.isFinite(result.weight) || result.weight <= 0) {
    throw new ShiprocketError("Package weight must be greater than 0 kg", 400);
  }
  for (const field of ["length", "breadth", "height"] as const) {
    if (!Number.isFinite(result[field]) || result[field] < 0.5) {
      throw new ShiprocketError(`Package ${field} must be at least 0.5 cm`, 400);
    }
  }
  return result;
};

const courierCost = (courier: any) => {
  const explicit = Number(courier.rate ?? courier.total_charge ?? courier.cost);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return ["freight_charge", "cod_charges", "coverage_charges", "other_charges"]
    .map((key) => Number(courier[key]) || 0)
    .reduce((sum, amount) => sum + amount, 0);
};

export const getCourierQuotes = async (args: {
  pickupPincode: string;
  deliveryPincode: string;
  paymentMethod: string;
  declaredValue: number;
  packageDetails: PackageDetails;
}) => {
  const data: any = await request({
    method: "GET",
    url: "/courier/serviceability/",
    params: {
      pickup_postcode: args.pickupPincode,
      delivery_postcode: args.deliveryPincode,
      cod: args.paymentMethod.trim().toUpperCase() === "COD" ? 1 : 0,
      weight: args.packageDetails.weight,
      length: args.packageDetails.length,
      breadth: args.packageDetails.breadth,
      height: args.packageDetails.height,
      declared_value: Math.max(1, args.declaredValue),
    },
  });
  const couriers = data?.data?.available_courier_companies;
  if (!Array.isArray(couriers) || couriers.length === 0) return [];
  return couriers
    .map((courier: any) => ({
      courierId: Number(courier.courier_company_id),
      courierName: courier.courier_name,
      rate: Math.round(courierCost(courier) * 100) / 100,
      freightCharge: Number(courier.freight_charge) || 0,
      codCharges: Number(courier.cod_charges) || 0,
      rating: Number(courier.rating) || 0,
      estimatedDeliveryDays: String(courier.estimated_delivery_days || ""),
      etd: courier.etd || undefined,
      mode: courier.is_surface ? "Surface" : "Air",
      minWeight: Number(courier.min_weight) || undefined,
      chargeWeight: Number(courier.charge_weight) || undefined,
    }))
    .filter((courier: any) => Number.isFinite(courier.courierId) && courier.rate >= 0)
    .sort((a: any, b: any) => a.rate - b.rate)
    .map((courier: any, index: number) => ({ ...courier, cheapest: index === 0 }));
};

const formatOrderDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const createShiprocketOrder = async (args: {
  order: any;
  seller: any;
  items: any[];
  packageDetails: PackageDetails;
  externalOrderReference: string;
}) => {
  const { order, seller, items, packageDetails, externalOrderReference } = args;
  if (!seller.shiprocketPickupCode || seller.shiprocketPickupSyncStatus !== "Synced") {
    throw new ShiprocketError("Seller pickup location is not synchronized with Shiprocket", 409);
  }
  const address = order.deliveryAddress;
  if (!address?.address || !address?.city || !address?.state || !/^[1-9][0-9]{5}$/.test(String(address?.pincode))) {
    throw new ShiprocketError("Customer delivery address must include address, city, state and a valid PIN code", 400);
  }
  const customerEmail = String(order.customerEmail || "").trim();
  const fallbackEmail = String(process.env.SHIPROCKET_BILLING_EMAIL || "").trim();
  const billingEmail = isValidEmail(customerEmail)
    ? customerEmail
    : isValidEmail(fallbackEmail)
      ? fallbackEmail
      : "";
  if (!billingEmail) {
    throw new ShiprocketError(
      "Customer email is invalid. Correct the customer's email or configure SHIPROCKET_BILLING_EMAIL.",
      400,
    );
  }
  if (!/^[0-9]{10}$/.test(String(order.customerPhone || ""))) {
    throw new ShiprocketError("Customer phone must be a valid 10-digit number", 400);
  }

  return request<any>({
    method: "POST",
    url: "/orders/create/adhoc",
    data: {
      order_id: externalOrderReference,
      order_date: formatOrderDate(new Date(order.orderDate || Date.now())),
      pickup_location: seller.shiprocketPickupCode,
      billing_customer_name: order.customerName,
      billing_last_name: "",
      billing_address: address.address,
      billing_address_2: address.landmark || "",
      billing_city: address.city,
      billing_pincode: Number(address.pincode),
      billing_state: address.state,
      billing_country: "India",
      billing_email: billingEmail,
      billing_phone: order.customerPhone,
      shipping_is_billing: true,
      order_items: items.map((item) => ({
        name: item.productName,
        sku: item.sku || String(item._id),
        units: item.quantity,
        selling_price: item.unitPrice,
        discount: 0,
        tax: 0,
      })),
      payment_method: String(order.paymentMethod).trim().toUpperCase() === "COD" ? "COD" : "PREPAID",
      shipping_charges: Number(order.shipping) || 0,
      giftwrap_charges: order.giftPackaging ? 0 : 0,
      transaction_charges: Number(order.platformFee) || 0,
      total_discount: Number(order.discount) || 0,
      sub_total: items.reduce((sum, item) => sum + Number(item.total || 0), 0),
      ...packageDetails,
    },
  });
};

export const assignAwb = (shipmentId: number, courierId: number) =>
  request<any>({
    method: "POST",
    url: "/courier/assign/awb",
    data: { shipment_id: shipmentId, courier_id: courierId },
  });

export const schedulePickup = (shipmentId: number) =>
  request<any>({
    method: "POST",
    url: "/courier/generate/pickup",
    data: { shipment_id: [shipmentId] },
  });

export const generateDocuments = async (shiprocketOrderId: number, shipmentId: number) => {
  const settled = await Promise.allSettled([
    request<any>({ method: "POST", url: "/courier/generate/label", data: { shipment_id: [shipmentId] } }),
    request<any>({ method: "POST", url: "/manifests/generate", data: { shipment_id: [shipmentId] } }),
    request<any>({ method: "POST", url: "/orders/print/invoice", data: { ids: [shiprocketOrderId] } }),
  ]);
  const value = (index: number): any => (settled[index].status === "fulfilled" ? settled[index].value : null);
  return {
    labelUrl: value(0)?.label_url,
    manifestUrl: value(1)?.manifest_url,
    invoiceUrl: value(2)?.invoice_url,
  };
};

export const trackByAwb = (awb: string) =>
  request<any>({ method: "GET", url: `/courier/track/awb/${encodeURIComponent(awb)}` });

export const cancelShiprocketOrder = (shiprocketOrderId: number) =>
  request<any>({ method: "POST", url: "/orders/cancel", data: { ids: [shiprocketOrderId] } });

export const createReturnShipment = (payload: Record<string, unknown>) =>
  request<any>({ method: "POST", url: "/shipments/create/return-shipment", data: payload });

export const getShiprocketOrder = (shiprocketOrderId: number) =>
  request<any>({ method: "GET", url: `/orders/show/${shiprocketOrderId}` });
