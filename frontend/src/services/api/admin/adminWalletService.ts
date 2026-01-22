import api from "../config";
import { ApiResponse } from "./types";

// TYPES

export interface WalletStats {
  totalEarnings: number;
  paidEarnings: number;
  pendingEarnings: number;
  thisMonthEarnings: number;
}

export interface WalletTransaction {
  _id: string; // Mongoose ID
  type: string; // Credit/Debit
  userType: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  relatedOrder?: { orderNumber: string };
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  requestDate: string;
  status: "Pending" | "Approved" | "Rejected";
  paymentMethod: string;
  accountDetails: string;
  remark?: string;
}

export interface AdminEarning {
  id: string;
  source: string;
  amount: number;
  date: string;
  status: string;
  description: string;
}

export interface SellerTransaction {
  id: string;
  amount: number;
  transactionType: string;
  date: string;
  type: string;
  status: string;
  description: string;
}

// API METHODS

/**
 * Get Financial Dashboard Stats
 */
export const getFinancialDashboard = async (): Promise<ApiResponse<WalletStats>> => {
  const response = await api.get<ApiResponse<WalletStats>>("/admin/financial/dashboard");
  return response.data;
};

/**
 * Get Admin Earnings (Commissions)
 */
export const getAdminEarnings = async (
  params?: { page?: number; limit?: number; status?: string; startDate?: string; endDate?: string }
): Promise<ApiResponse<AdminEarning[]>> => {
  const response = await api.get<ApiResponse<AdminEarning[]>>(
    "/admin/wallet/earnings",
    { params }
  );
  return response.data;
};

/**
 * Get Wallet Transactions (Platform Level)
 */
export const getWalletTransactions = async (
  params?: { page?: number; limit?: number; type?: string; status?: string }
): Promise<ApiResponse<WalletTransaction[]>> => {
  const response = await api.get<ApiResponse<WalletTransaction[]>>(
    "/admin/wallet/transactions",
    { params }
  );
  return response.data;
};

/**
 * Get Withdrawal Requests
 */
export const getWithdrawalRequests = async (
  params?: { page?: number; limit?: number; status?: string }
): Promise<ApiResponse<WithdrawalRequest[]>> => {
  const response = await api.get<ApiResponse<WithdrawalRequest[]>>(
    "/admin/wallet/withdrawals",
    { params }
  );
  return response.data;
};

/**
 * Process Withdrawal (Approve/Reject)
 */
export const processWithdrawal = async (
  data: { requestId: string; action: "Approve" | "Reject"; remark?: string }
): Promise<ApiResponse<any>> => {
  const response = await api.post<ApiResponse<any>>(
    "/admin/wallet/withdrawal/process",
    data
  );
  return response.data;
};

// Legacy / Other Helpers
export const getSellerTransactions = async (
  sellerId: string,
  params?: { page?: number; limit?: number }
): Promise<ApiResponse<any[]>> => {
  const response = await api.get<ApiResponse<any[]>>(
    `/admin/wallet/seller/${sellerId}`,
    { params }
  );
  return response.data;
};
