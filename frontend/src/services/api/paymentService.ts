import api from './config';

// =============================================================================
// CASHFREE (PRIMARY gateway)
// =============================================================================

/**
 * Create Cashfree order for checkout payment
 */
export const createCashfreeOrder = async (orderId: string) => {
    try {
        const response = await api.post('/payment/cashfree/create-order', { orderId });
        return response.data;
    } catch (error: any) {
        console.error('[Cashfree] Error creating order:', error);
        throw error;
    }
};

/**
 * Verify Cashfree payment after checkout callback
 */
export const verifyCashfreePayment = async (paymentData: {
    orderId: string;
    cfOrderId: string;
    cfPaymentId?: string;
}) => {
    try {
        const response = await api.post('/payment/cashfree/verify', paymentData);
        return response.data;
    } catch (error: any) {
        console.error('[Cashfree] Error verifying payment:', error);
        throw error;
    }
};

// =============================================================================
// RAZORPAY (SECONDARY / fallback gateway) — unchanged
// =============================================================================

/**
 * Create Razorpay order for payment (fallback)
 */
export const createRazorpayOrder = async (orderId: string) => {
    try {
        const response = await api.post('/payment/create-order', { orderId });
        return response.data;
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
};

/**
 * Verify payment after Razorpay checkout (fallback)
 */
export const verifyPayment = async (paymentData: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
}) => {
    try {
        const response = await api.post('/payment/verify', paymentData);
        return response.data;
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        throw error;
    }
};

/**
 * Get payment history
 */
export const getPaymentHistory = async () => {
    try {
        const response = await api.get('/customer/payments');
        return response.data;
    } catch (error: any) {
        console.error('Error getting payment history:', error);
        throw error;
    }
};
