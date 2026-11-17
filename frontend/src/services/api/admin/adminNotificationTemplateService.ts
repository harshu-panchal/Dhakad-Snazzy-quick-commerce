import api from "../config";

export interface AdminNotificationTemplate {
  _id: string; name: string; key: string; category: "RecentProductInterest" | "BackInStock";
  titleTemplate: string; bodyTemplate: string; status: "Draft" | "Active" | "Archived"; version: number;
}
export const getNotificationTemplates = async () => (await api.get("/admin/notification-templates")).data.data as AdminNotificationTemplate[];
export const createNotificationTemplate = async (data: Omit<AdminNotificationTemplate, "_id" | "version">) => (await api.post("/admin/notification-templates", data)).data;
export const updateNotificationTemplateStatus = async (id: string, status: AdminNotificationTemplate["status"]) => (await api.patch(`/admin/notification-templates/${id}/status`, { status })).data;
