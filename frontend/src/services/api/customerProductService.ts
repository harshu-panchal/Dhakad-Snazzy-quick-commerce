import api from './config';
import { Product } from './productService'; // Reuse generic product type if compatible or define new one
import { apiCache } from '../../utils/apiCache';

export interface Category {
    _id: string; // MongoDB ID
    id?: string; // Virtual ID
    name: string;
    parent?: string | null;
    parentId?: string | null;
    image?: string;
    icon?: string;
    description?: string;
    isActive: boolean;
    order?: number;
    children?: Category[];
    subcategories?: Category[];
    headerCategoryId?: string | { _id: string; name?: string };
    totalProducts?: number;
}

export interface GetProductsParams {
    search?: string;
    category?: string;
    subcategory?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: 'price_asc' | 'price_desc' | 'popular' | 'discount';
    page?: number;
    limit?: number;
    latitude?: number; // User location latitude
    longitude?: number; // User location longitude
}

export interface ProductListResponse {
    success: boolean;
    data: Product[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export interface ProductDetailResponse {
    success: boolean;
    message?: string;
    data: Product & { similarProducts?: Product[] };
}

export interface CategoryListResponse {
    success: boolean;
    data: Category[];
}

/**
 * Get products with filters (Public)
 * Location (latitude/longitude) is required to filter products by seller's service radius
 * Cached briefly (30s) so revisiting the same Search/Category query (e.g. via
 * back navigation) doesn't always refetch - short TTL since price/stock can
 * change more often than categories.
 */
export const getProducts = async (params?: GetProductsParams): Promise<ProductListResponse> => {
    const cacheKey = `customer-products-${JSON.stringify(params || {})}`;
    return apiCache.getOrFetch(
        cacheKey,
        async () => {
            const response = await api.get<ProductListResponse>('/customer/products', { params });
            return response.data;
        },
        30 * 1000 // 30 seconds cache
    );
};

/**
 * Get product details by ID (Public)
 * Location (latitude/longitude) is required to verify product availability
 * Cached briefly (30s) - same reasoning as getProducts.
 */
export const getProductById = async (id: string, latitude?: number, longitude?: number): Promise<ProductDetailResponse> => {
    const params: any = {};
    if (latitude !== undefined && longitude !== undefined) {
        params.latitude = latitude;
        params.longitude = longitude;
    }
    const cacheKey = `customer-product-${id}-${JSON.stringify(params)}`;
    return apiCache.getOrFetch(
        cacheKey,
        async () => {
            const response = await api.get<ProductDetailResponse>(`/customer/products/${id}`, { params });
            return response.data;
        },
        30 * 1000 // 30 seconds cache
    );
};

/**
 * Get category details by ID or slug (Public)
 */
export const getCategoryById = async (id: string): Promise<any> => {
    const response = await api.get<any>(`/customer/categories/${id}`);
    return response.data;
};

/**
 * Get all categories (Public)
 * Using /tree endpoint to get hierarchy if available, otherwise just /
 * Cached for 10 minutes as categories don't change frequently
 */
export const getCategories = async (tree: boolean = false): Promise<CategoryListResponse> => {
    const cacheKey = `customer-categories-${tree ? 'tree' : 'list'}`;
    return apiCache.getOrFetch(
        cacheKey,
        async () => {
    const url = tree ? '/customer/categories/tree' : '/customer/categories';
    const response = await api.get<CategoryListResponse>(url);
    return response.data;
        },
        10 * 60 * 1000 // 10 minutes cache
    );
};
