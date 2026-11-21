import api from "../config";
import { ApiResponse } from "./types";

/**
 * Towns. "City" in the names below matches the vocabulary used across the
 * codebase (Seller.city etc.); every record is a town such as Biaora or
 * Khujner. See RBAC_CITY_SCOPE_PLAN.md.
 */

export interface City {
  _id: string;
  name: string;
  slug: string;
  /** Normalised spellings that map to this town. */
  aliases: string[];
  /** Grouping label only, not the scope boundary. */
  district: string;
  state: string;
  isActive: boolean;
  /** Sellers currently assigned to this town. */
  sellerCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CityInput {
  name?: string;
  aliases?: string[];
  district?: string;
  state?: string;
  isActive?: boolean;
}

export type MappingStatus =
  | "already-mapped"
  | "matched"
  | "no-city-text"
  | "no-matching-town"
  | "ambiguous"
  | "location-outlier";

export interface MappingAttentionRow {
  sellerId: string;
  storeName: string;
  cityText: string | null;
  status: MappingStatus;
  detail?: string;
}

export interface MappingReport {
  counts: Record<MappingStatus, number>;
  unmatchedTexts: Array<{ text: string; sellers: number }>;
  attention: MappingAttentionRow[];
}

/** Open to every admin: pickers on other pages need the list. */
export const getCities = async (
  includeInactive = false,
): Promise<ApiResponse<City[]>> => {
  const response = await api.get<ApiResponse<City[]>>("/admin/cities", {
    params: includeInactive ? { includeInactive: "true" } : undefined,
  });
  return response.data;
};

export const createCity = async (data: CityInput): Promise<ApiResponse<City>> => {
  const response = await api.post<ApiResponse<City>>("/admin/cities", data);
  return response.data;
};

export const updateCity = async (
  id: string,
  data: CityInput,
): Promise<ApiResponse<City>> => {
  const response = await api.put<ApiResponse<City>>(`/admin/cities/${id}`, data);
  return response.data;
};

/** Refused with 409 while any seller belongs to the town. */
export const deleteCity = async (id: string): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(`/admin/cities/${id}`);
  return response.data;
};

/** Dry run: what would be assigned and what needs a decision. Writes nothing. */
export const getMappingReport = async (): Promise<ApiResponse<MappingReport>> => {
  const response = await api.get<ApiResponse<MappingReport>>("/admin/cities/mapping-report");
  return response.data;
};

/** Assign towns to sellers for every unambiguous match. Idempotent. */
export const applySellerMapping = async (): Promise<
  ApiResponse<{ written: number; counts: MappingReport["counts"] }>
> => {
  const response = await api.post<
    ApiResponse<{ written: number; counts: MappingReport["counts"] }>
  >("/admin/cities/map-sellers");
  return response.data;
};
