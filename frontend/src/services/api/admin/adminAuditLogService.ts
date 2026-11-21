import api from "../config";
import { ApiResponse } from "./types";

export interface AuditLogEntry {
  _id: string;
  adminId?: string;
  adminEmail: string;
  adminRole: string;
  kind: "request" | "auth";
  method: string;
  path: string;
  routePattern?: string;
  pageKey?: string;
  resourceId?: string;
  statusCode: number;
  event?: string;
  /** Already redacted and size-capped server-side. */
  requestBody?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogActor {
  id: string;
  email: string;
  role: string;
  lastSeen: string;
}

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  adminId?: string;
  kind?: "request" | "auth";
  method?: string;
  search?: string;
  /** ISO date or YYYY-MM-DD. */
  from?: string;
  to?: string;
}

export const getAuditLogs = async (
  params?: GetAuditLogsParams
): Promise<ApiResponse<AuditLogEntry[]>> => {
  const response = await api.get<ApiResponse<AuditLogEntry[]>>("/admin/audit-logs", {
    params,
  });
  return response.data;
};

export const getAuditLogActors = async (): Promise<ApiResponse<AuditLogActor[]>> => {
  const response = await api.get<ApiResponse<AuditLogActor[]>>(
    "/admin/audit-logs/actors"
  );
  return response.data;
};
