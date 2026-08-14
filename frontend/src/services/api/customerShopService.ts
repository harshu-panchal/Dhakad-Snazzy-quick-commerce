import api from './config';
import { Product } from './productService';

export interface ShopPreviewProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  discPrice: number;
}

export interface Shop {
  id: string;
  sellerId: string;
  storeName: string;
  logo: string;
  storeBanner: string;
  category: string;
  categories: string[];
  storeDescription: string;
  address: string;
  city: string;
  isShopOpen: boolean;
  workingHours?: {
    open?: string;
    close?: string;
    offDays?: string[];
  } | null;
  distanceKm: number | null;
  distanceText: string;
  deliveryTimeText: string;
  rating: number;
  productCount: number;
  previewProducts: ShopPreviewProduct[];
}

export interface StoreCategory {
  id: string;
  name: string;
  icon?: string;
  image?: string;
  slug: string;
}

export interface ShopDetail extends Omit<Shop, 'previewProducts'> {
  fssaiLicNo?: string;
  storeCategories: StoreCategory[];
}

export interface GetShopsParams {
  latitude?: number;
  longitude?: number;
  search?: string;
  category?: string;
  openOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface ShopListResponse {
  success: boolean;
  data: Shop[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ShopDetailResponse {
  success: boolean;
  data: ShopDetail;
}

export interface ShopProductsResponse {
  success: boolean;
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Fetch nearby shops/sellers for customer
 */
export const getNearbyShops = async (params?: GetShopsParams): Promise<ShopListResponse> => {
  const response = await api.get<ShopListResponse>('/customer/shops', { params });
  return response.data;
};

/**
 * Fetch shop details by seller ID
 */
export const getShopDetails = async (
  sellerId: string,
  latitude?: number,
  longitude?: number
): Promise<ShopDetailResponse> => {
  const params: any = {};
  if (latitude !== undefined && longitude !== undefined) {
    params.latitude = latitude;
    params.longitude = longitude;
  }
  const response = await api.get<ShopDetailResponse>(`/customer/shops/${sellerId}`, { params });
  return response.data;
};

/**
 * Fetch products belonging to a specific shop/seller
 */
export const getShopProducts = async (
  sellerId: string,
  params?: {
    category?: string;
    subcategory?: string;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }
): Promise<ShopProductsResponse> => {
  const response = await api.get<ShopProductsResponse>(`/customer/shops/${sellerId}/products`, { params });
  return response.data;
};
