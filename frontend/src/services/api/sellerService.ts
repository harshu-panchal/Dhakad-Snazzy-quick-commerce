import api from "./config";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Seller {
  _id: string;
  sellerName: string;
  storeName: string;
  mobile: string;
  email: string;
  logo?: string;
  balance: number;
  commission: number;
  categories: string[];
  categoryCommissions?: Array<{
    headerCategory: string;
    commissionRate: number;
  }>;
  status: "Approved" | "Pending" | "Rejected";
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  serviceableArea?: string;
  panCard?: string;
  taxName?: string;
  taxNumber?: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  serviceRadiusKm?: number;
  accountName?: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  ifsc?: string;
  profile?: string;
  idProof?: string;
  addressProof?: string;
  requireProductApproval?: boolean;
  viewCustomerDetails?: boolean;
  showInDiscovery?: boolean;
  createdAt?: string;
  updatedAt?: string;
  shiprocketPickupSyncStatus?: "Pending" | "Synced" | "Failed";
  shiprocketPickupSyncError?: string;
  shiprocketPickupCode?: string;
}

export interface GetAllSellersParams {
  status?: "Approved" | "Pending" | "Rejected";
  search?: string;
}

export interface CreateSellerData {
  sellerName: string;
  storeName: string;
  email: string;
  mobile: string;
  password: string;
  category: string;
  address?: string;
  city: string;
  serviceableArea: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  serviceRadiusKm?: number;
  panCard?: string;
  taxName?: string;
  taxNumber?: string;
  accountName?: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  ifsc?: string;
  profile?: string;
  idProof?: string;
  addressProof?: string;
  requireProductApproval: boolean;
  viewCustomerDetails: boolean;
  commission: number;
}

/**
 * Create a new seller
 */
export const createSeller = async (
  data: CreateSellerData
): Promise<ApiResponse<Seller>> => {
  const response = await api.post<ApiResponse<Seller>>("/sellers", data);
  return response.data;
};

/**
 * Get all sellers
 */
export const getAllSellers = async (
  params?: GetAllSellersParams
): Promise<ApiResponse<Seller[]>> => {
  const response = await api.get<ApiResponse<Seller[]>>("/sellers", { params });
  return response.data;
};

/**
 * Get seller by ID
 */
export const getSellerById = async (
  id: string
): Promise<ApiResponse<Seller>> => {
  const response = await api.get<ApiResponse<Seller>>(`/sellers/${id}`);
  return response.data;
};

/**
 * Update seller status
 */
export const updateSellerStatus = async (
  id: string,
  status: "Approved" | "Pending" | "Rejected"
): Promise<ApiResponse<Seller>> => {
  const response = await api.patch<ApiResponse<Seller>>(
    `/sellers/${id}/status`,
    { status }
  );
  return response.data;
};

/**
 * Update seller details
 */
export const updateSeller = async (
  id: string,
  data: Partial<Seller>
): Promise<ApiResponse<Seller>> => {
  const response = await api.put<ApiResponse<Seller>>(`/sellers/${id}`, data);
  return response.data;
};

/**
 * Delete seller
 */
export const deleteSeller = async (id: string): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(`/sellers/${id}`);
  return response.data;
};

/**
 * Update seller category commissions (Admin only)
 */
export const updateSellerCategoryCommissions = async (
  sellerId: string,
  categoryCommissions: Array<{ headerCategory: string; commissionRate: number }>
): Promise<ApiResponse<Seller>> => {
  const response = await api.put<ApiResponse<Seller>>(
    `/sellers/${sellerId}/category-commissions`,
    { categoryCommissions }
  );
  return response.data;
};

export const retrySellerPickupSync = async (sellerId: string): Promise<ApiResponse<Seller>> => {
  const response = await api.post<ApiResponse<Seller>>(`/admin/shipping/sellers/${sellerId}/retry`);
  return response.data;
};

export const migrateSellerPickups = async (limit = 100): Promise<ApiResponse<{ attempted: number; synced: number; failed: number }>> => {
  const response = await api.post<ApiResponse<{ attempted: number; synced: number; failed: number }>>(
    "/admin/shipping/sellers/migrate",
    { limit },
  );
  return response.data;
};

