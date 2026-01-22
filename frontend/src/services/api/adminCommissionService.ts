import api from './config';

/**
 * Get commission settings
 */
export const getCommissionSettings = async () => {
    try {
        const response = await api.get('/admin/commissions/settings');
        return response.data;
    } catch (error: any) {
        console.error('Error getting commission settings:', error);
        throw error;
    }
};

/**
 * Update commission rates
 */
export const updateCommissionRates = async (data: {
    sellerCommissionRate?: number;
    deliveryBoyCommissionRate?: number;
    minimumWithdrawalAmount?: number;
}) => {
    try {
        const response = await api.put('/admin/commissions/settings', data);
        return response.data;
    } catch (error: any) {
        console.error('Error updating commission rates:', error);
        throw error;
    }
};

/**
 * Get commission report
 */
export const getCommissionReport = async (filters?: {
    startDate?: string;
    endDate?: string;
    type?: string;
    status?: string;
}) => {
    try {
        const response = await api.get('/admin/commissions/report', { params: filters });
        return response.data;
    } catch (error: any) {
        console.error('Error getting commission report:', error);
        throw error;
    }
};

/**
 * Get all withdrawal requests
 */
export const getAllWithdrawals = async (filters?: {
    status?: string;
    userType?: string;
    page?: number;
    limit?: number;
}) => {
    try {
        const response = await api.get('/admin/withdrawals', { params: filters });
        return response.data;
    } catch (error: any) {
        console.error('Error getting withdrawals:', error);
        throw error;
    }
};

/**
 * Approve withdrawal
 */
export const approveWithdrawal = async (id: string) => {
    try {
        const response = await api.put(`/admin/withdrawals/${id}/approve`);
        return response.data;
    } catch (error: any) {
        console.error('Error approving withdrawal:', error);
        throw error;
    }
};

/**
 * Reject withdrawal
 */
export const rejectWithdrawal = async (id: string, remarks?: string) => {
    try {
        const response = await api.put(`/admin/withdrawals/${id}/reject`, { remarks });
        return response.data;
    } catch (error: any) {
        console.error('Error rejecting withdrawal:', error);
        throw error;
    }
};

/**
 * Complete withdrawal
 */
export const completeWithdrawal = async (id: string, transactionReference: string) => {
    try {
        const response = await api.put(`/admin/withdrawals/${id}/complete`, { transactionReference });
        return response.data;
    } catch (error: any) {
        console.error('Error completing withdrawal:', error);
        throw error;
    }
};
