import api from "../config";
import { ApiResponse } from "./types";

export interface SystemUser {
  id: string;
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  /** Role name, matching a Role document. Any role is assignable. */
  role: string;
  /** false blocks sign-in and revokes existing sessions. */
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetSystemUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  /** "true" / "false" as strings, matching the query parameter. */
  isActive?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateSystemUserData {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  password: string;
  role?: string;
}

export interface UpdateSystemUserData {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  password?: string;
  role?: string;
  isActive?: boolean;
}

/**
 * Get all system users
 */
export const getAllSystemUsers = async (
  params?: GetSystemUsersParams
): Promise<ApiResponse<SystemUser[]>> => {
  const response = await api.get<ApiResponse<SystemUser[]>>("/admin/system-users", {
    params,
  });
  return response.data;
};

/**
 * Get system user by ID
 */
export const getSystemUserById = async (
  id: string
): Promise<ApiResponse<SystemUser>> => {
  const response = await api.get<ApiResponse<SystemUser>>(
    `/admin/system-users/${id}`
  );
  return response.data;
};

/**
 * Create new system user
 */
export const createSystemUser = async (
  data: CreateSystemUserData
): Promise<ApiResponse<SystemUser>> => {
  const response = await api.post<ApiResponse<SystemUser>>(
    "/admin/system-users",
    data
  );
  return response.data;
};

/**
 * Update system user
 */
export const updateSystemUser = async (
  id: string,
  data: UpdateSystemUserData
): Promise<ApiResponse<SystemUser>> => {
  const response = await api.put<ApiResponse<SystemUser>>(
    `/admin/system-users/${id}`,
    data
  );
  return response.data;
};

/**
 * Delete system user
 */
export const deleteSystemUser = async (
  id: string
): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(
    `/admin/system-users/${id}`
  );
  return response.data;
};

