import api from "./config";

export interface CustomerInsightSummary {
  totalViews: number; uniqueCustomers: number; viewedProducts: number; repeatExplorers: number;
  eligibleRecipients: number; notificationsAccepted: number; inAppOnly: number; notificationOpens: number;
}
export interface CustomerInsight {
  _id: string;
  product: any;
  customer: { name: string; maskedId: string } | null;
  firstViewedAt: string; lastViewedAt: string; viewCount: number; lastSource: string;
  lastNotificationAt?: string; notificationCount: number; nextReminderAt: string; expiresAt: string; marketingEnabled: boolean;
}
export interface ReminderTemplate { _id: string; name: string; category: "RecentProductInterest" | "BackInStock"; titleTemplate: string; bodyTemplate: string; version: number; }

export const getCustomerInsightSummary = async () => (await api.get("/seller/customer-insights/summary")).data.data as CustomerInsightSummary;
export const getCustomerInsights = async (params?: Record<string, unknown>) => (await api.get("/seller/customer-insights", { params })).data;
export const getInsightProducts = async () => (await api.get("/seller/customer-insights/products")).data.data as any[];
export const getReminderTemplates = async () => (await api.get("/seller/customer-insights/templates")).data.data as ReminderTemplate[];
export const getReminderCampaigns = async () => (await api.get("/seller/customer-insights/campaigns")).data.data as any[];
export const createReminderCampaign = async (data: { productId: string; templateId: string; interestId?: string; campaignType: "ManualSingle" | "ManualBulk"; idempotencyKey: string }) =>
  (await api.post("/seller/customer-insights/campaigns", data)).data;
export const cancelReminderCampaign = async (id: string) => (await api.patch(`/seller/customer-insights/campaigns/${id}/cancel`)).data;
