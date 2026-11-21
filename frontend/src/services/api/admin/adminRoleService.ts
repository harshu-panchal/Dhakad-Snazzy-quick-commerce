import api from "../config";

import { ApiResponse } from "./types";

export interface Role {
  _id: string;
  name: string;
  type: "System" | "Custom";
  permissions: string[];
  description?: string;
  isActive?: boolean;
  /** Number of admin accounts currently holding this role. */
  userCount?: number;
  /** True for Super Admin, whose permission list is reported as the full set. */
  isWildcard?: boolean;
  permissionsUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleData {
  name: string;
  permissions?: string[];
  description?: string;
}

export interface UpdateRoleData {
  name?: string;
  permissions?: string[];
  description?: string;
  isActive?: boolean;
}

export interface GetRolesParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: "System" | "Custom";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** One page in the permission catalog, with its two tier permission strings. */
export interface PermissionCatalogPage {
  key: string;
  label: string;
  path: string;
  view: string;
  manage: string;
}

export interface PermissionCatalogGroup {
  group: string;
  groupLabel: string;
  pages: PermissionCatalogPage[];
}

export interface PermissionCatalog {
  groups: PermissionCatalogGroup[];
  all: string[];
}

/**
 * Get all roles
 */
export const getRoles = async (
  params?: GetRolesParams
): Promise<ApiResponse<Role[]>> => {
  const response = await api.get<ApiResponse<Role[]>>("/admin/roles", {
    params,
  });
  return response.data;
};

/**
 * Get role by ID
 */
export const getRoleById = async (id: string): Promise<ApiResponse<Role>> => {
  const response = await api.get<ApiResponse<Role>>(`/admin/roles/${id}`);
  return response.data;
};

/**
 * Create a new role
 */
export const createRole = async (
  data: CreateRoleData
): Promise<ApiResponse<Role>> => {
  const response = await api.post<ApiResponse<Role>>("/admin/roles", data);
  return response.data;
};

/**
 * Update role. Renaming cascades to every admin account holding the old name.
 */
export const updateRole = async (
  id: string,
  data: UpdateRoleData
): Promise<ApiResponse<Role>> => {
  const response = await api.put<ApiResponse<Role>>(`/admin/roles/${id}`, data);
  return response.data;
};

/**
 * Delete role. Refused with 409 while any admin account holds it.
 */
export const deleteRole = async (id: string): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(`/admin/roles/${id}`);
  return response.data;
};

/**
 * The permission catalog, grouped for the role editor. This is the
 * authoritative list — the frontend catalog module exists only so the sidebar
 * and route table have keys at build time.
 */
export const getRolePermissions = async (): Promise<ApiResponse<PermissionCatalog>> => {
  const response = await api.get<ApiResponse<PermissionCatalog>>(
    "/admin/roles/permissions"
  );
  return response.data;
};
