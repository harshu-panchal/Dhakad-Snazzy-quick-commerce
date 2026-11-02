import api from "./config";
import { apiCache } from "../../utils/apiCache";

export interface HomeContentResponse {
  success: boolean;
  data: {
    categories: any[];
    shops: any[];
    promoBanners: any[];
    banners?: any[];
    trending: any[];
    cookingIdeas: any[];
    promoCards?: any[];
    promoStrip?: any; // PromoStrip data from backend
    lowestPrices?: any[];
    lowestPricesSections?: any[];
    homeSections?: any[];
    searchSuggestions?: string[];
    fallbackProducts?: any[];
  };
}

export interface HomeContentRequestOptions {
  signal?: AbortSignal;
  /** Comma-separated response fields understood by the backend. */
  fields?: string[];
}

/**
 * Get home page content with caching
 * @param headerCategorySlug - Optional header category slug to filter categories (e.g., 'winter', 'wedding')
 * @param latitude - User's latitude
 * @param longitude - User's longitude
 * @param city - Optional city / location name
 * @param useCache - Whether to use cache (default: true)
 * @param cacheTTL - Cache TTL in milliseconds (default: 5 minutes)
 */
export const getHomeContent = async (
  headerCategorySlug?: string,
  latitude?: number,
  longitude?: number,
  useCache: boolean = true,
  cacheTTL: number = 5 * 60 * 1000, // 5 minutes
  skipLoader: boolean = false,
  city?: string,
  options: HomeContentRequestOptions = {}
): Promise<HomeContentResponse> => {
  const fieldsKey = options.fields?.slice().sort().join(',') || 'legacy-all';
  const cacheKey = `home-content-${headerCategorySlug || 'all'}-${latitude || 0}-${longitude || 0}-${city || 'all'}-${fieldsKey}`;

  const fetchFn = async () => {
    const params: any = headerCategorySlug ? { headerCategorySlug } : {};
    if (latitude !== undefined && longitude !== undefined) {
      params.latitude = latitude;
      params.longitude = longitude;
    }
    if (city) {
      params.city = city;
    }
    if (options.fields?.length) {
      params.fields = options.fields.join(',');
    }
    const response = await api.get<HomeContentResponse>("/customer/home", {
      params,
      skipLoader,
      signal: options.signal,
    } as any);
    return response.data;
  };

  if (useCache) {
    // Cancellable calls must not share their AbortSignal through the cache's
    // pending-request map. Reuse a completed value, otherwise fetch directly
    // and populate the cache after a successful response.
    if (options.signal) {
      const cached = apiCache.getSync<HomeContentResponse>(cacheKey);
      if (cached) return cached;
      const data = await fetchFn();
      apiCache.set(cacheKey, data, cacheTTL);
      return data;
    }
    return apiCache.getOrFetch(cacheKey, fetchFn, cacheTTL);
  }

  return fetchFn();
};

/**
 * Get products for a specific "shop" (e.g. Spiritual Store)
 */
export const getStoreProducts = async (
  storeId: string,
  latitude?: number,
  longitude?: number
): Promise<any> => {
  const params: any = {};
  if (latitude !== undefined && longitude !== undefined) {
    params.latitude = latitude;
    params.longitude = longitude;
  }
  const response = await api.get(`/customer/home/store/${storeId}`, { params });
  return response.data;
};
/**
 * Check if service is available at the given location
 */
export const checkServiceability = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<{ success: boolean; isServiceAvailable: boolean }> => {
  const response = await api.get<{ success: boolean; isServiceAvailable: boolean }>(
    "/customer/home/serviceability",
    {
      params: { latitude, longitude },
      signal,
    }
  );
  return response.data;
};
