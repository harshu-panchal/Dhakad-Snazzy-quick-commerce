import crypto from 'crypto';
import Payment from '../models/Payment';
import Order from '../models/Order';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Cashfree SDK — dynamically required so the app doesn't crash if the package
// isn't installed.
// ---------------------------------------------------------------------------
let CashfreeClass: any = null;
let CFEnvironment: any = null;

try {
    const cf = require('cashfree-pg');
    CashfreeClass = cf.Cashfree;
    CFEnvironment = cf.CFEnvironment;
} catch (_e) {
    console.warn('[Cashfree] cashfree-pg package not found. Cashfree will be unavailable.');
}

// ---------------------------------------------------------------------------
// Initialise Cashfree SDK instance (v6+ API)
// ---------------------------------------------------------------------------
const getCashfree = () => {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const env = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();

    if (!appId || !secretKey || appId === 'your_cashfree_app_id_here') {
        throw new Error('Cashfree credentials not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env');
    }

    if (!CashfreeClass) {
        throw new Error('cashfree-pg package is not installed. Run: npm install cashfree-pg');
    }

    const environment = env === 'PRODUCTION'
        ? CFEnvironment.PRODUCTION
        : CFEnvironment.SANDBOX;

    return new CashfreeClass(environment, appId, secretKey);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a string to be a valid Cashfree order ID (alphanumeric + _ - only, max 50 chars) */
const sanitiseCFOrderId = (raw: string): string =>
    raw.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);

/** Cashfree order ID prefix so we can distinguish them from Razorpay receipts */
const CF_ORDER_PREFIX = 'CF_';

// ---------------------------------------------------------------------------
// Create a Cashfree Order (for customer checkout)
// ---------------------------------------------------------------------------
export const createCashfreeOrder = async (
    orderId: string,
    amount: number,
    currency: string = 'INR',
    customerInfo?: { name?: string; email?: string; phone?: string }
) => {
    try {
        const cashfree = getCashfree();

        const cfOrderId = sanitiseCFOrderId(`${CF_ORDER_PREFIX}${orderId}`);

        const env = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();
        let frontendBaseUrl = (process.env.FRONTEND_URL || 'https://dhakadsnazzy.com').trim().replace(/\/+$/, '');
        if (env === 'PRODUCTION' && !frontendBaseUrl.startsWith('https://')) {
            frontendBaseUrl = 'https://dhakadsnazzy.com';
        }

        const request = {
            order_id: cfOrderId,
            order_amount: Math.round(amount * 100) / 100, // 2-decimal precision
            order_currency: currency,
            customer_details: {
                customer_id: `cust_${orderId.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40)}`,
                customer_name: customerInfo?.name || 'Customer',
                customer_email: customerInfo?.email || 'customer@dhakadsnazzy.com',
                customer_phone: customerInfo?.phone || '9999999999',
            },
            order_meta: {
                return_url: `${frontendBaseUrl}/payment/cashfree/return?order_id={order_id}&cf_payment_id={payment_id}`,
                upi_app_priority: ['gpay', 'phonepe', 'paytm', 'bhim', 'cred'],
            },
            order_tags: {
                internalOrderId: orderId,
            },
        };

        const response = await cashfree.PGCreateOrder(request);
        const data = response.data;

        return {
            success: true,
            data: {
                cfOrderId: data.order_id,
                paymentSessionId: data.payment_session_id,
                amount: data.order_amount,
                currency: data.order_currency,
                expiresAt: data.order_expiry_time,
                cashfreeEnv: process.env.CASHFREE_ENV || 'TEST',
            },
        };
    } catch (error: any) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to create Cashfree order';
        console.error('[Cashfree] Error creating order:', msg, error?.response?.data);
        return { success: false, message: msg };
    }
};

// ---------------------------------------------------------------------------
// Create a Cashfree Order for Delivery-Boy → Admin Payout
// ---------------------------------------------------------------------------
export const createCashfreePayoutOrder = async (
    receiptId: string,
    amount: number,
    deliveryBoyPhone?: string
) => {
    try {
        const cashfree = getCashfree();

        const cfOrderId = sanitiseCFOrderId(`${CF_ORDER_PREFIX}${receiptId}`);

        const env = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();
        let frontendBaseUrl = (process.env.FRONTEND_URL || 'https://dhakadsnazzy.com').trim().replace(/\/+$/, '');
        if (env === 'PRODUCTION' && !frontendBaseUrl.startsWith('https://')) {
            frontendBaseUrl = 'https://dhakadsnazzy.com';
        }

        const request = {
            order_id: cfOrderId,
            order_amount: Math.round(amount * 100) / 100,
            order_currency: 'INR',
            customer_details: {
                customer_id: `del_${receiptId.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40)}`,
                customer_name: 'Delivery Boy',
                customer_email: 'delivery@dhakadsnazzy.com',
                customer_phone: deliveryBoyPhone || '9999999999',
            },
            order_meta: {
                return_url: `${frontendBaseUrl}/delivery/wallet?order_id={order_id}&cf_payment_id={payment_id}`,
                upi_app_priority: ['gpay', 'phonepe', 'paytm', 'bhim', 'cred'],
            },
            order_tags: {
                type: 'ADMIN_PAYOUT',
                receipt: receiptId,
            },
        };

        const response = await cashfree.PGCreateOrder(request);
        const data = response.data;

        return {
            success: true,
            data: {
                cfOrderId: data.order_id,
                paymentSessionId: data.payment_session_id,
                amount: data.order_amount,
                currency: data.order_currency,
                cashfreeEnv: process.env.CASHFREE_ENV || 'TEST',
            },
        };
    } catch (error: any) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to create Cashfree payout order';
        console.error('[Cashfree] Error creating payout order:', msg);
        return { success: false, message: msg };
    }
};

// ---------------------------------------------------------------------------
// Verify Cashfree Payment (server-side, after frontend callback)
// ---------------------------------------------------------------------------
export const verifyCashfreePayment = async (cfOrderId: string): Promise<{
    success: boolean;
    paymentId?: string;
    status?: string;
    message?: string;
}> => {
    try {
        const cashfree = getCashfree();

        const response = await cashfree.PGOrderFetchPayments(cfOrderId);
        const payments: any[] = response.data;

        if (!payments || payments.length === 0) {
            return { success: false, message: 'No payments found for this order' };
        }

        // Find the most recent successful payment
        const successfulPayment = payments.find(
            (p: any) => p.payment_status === 'SUCCESS'
        );

        if (successfulPayment) {
            return {
                success: true,
                paymentId: String(successfulPayment.cf_payment_id),
                status: 'SUCCESS',
            };
        }

        // Check if payment is pending
        const pendingPayment = payments.find(
            (p: any) => p.payment_status === 'PENDING'
        );

        if (pendingPayment) {
            return {
                success: false,
                status: 'PENDING',
                message: 'Payment is still pending',
            };
        }

        return {
            success: false,
            status: payments[0]?.payment_status || 'FAILED',
            message: payments[0]?.payment_message || 'Payment failed',
        };
    } catch (error: any) {
        const msg = error?.response?.data?.message || error?.message || 'Payment verification failed';
        console.error('[Cashfree] Error verifying payment:', msg);
        return { success: false, message: msg };
    }
};

// ---------------------------------------------------------------------------
// Capture Payment — update DB after successful Cashfree payment (checkout)
// ---------------------------------------------------------------------------
export const captureCashfreePayment = async (
    orderId: string,
    cfOrderId: string,
    cfPaymentId: string,
    io?: any
) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Verify the payment is actually successful before updating DB
        const verification = await verifyCashfreePayment(cfOrderId);

        if (!verification.success) {
            throw new Error(verification.message || 'Cashfree payment could not be verified');
        }

        // Find order
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error('Order not found');

        // Create payment record
        const payment = new Payment({
            order: orderId,
            customer: order.customer,
            paymentMethod: 'Online',
            paymentGateway: 'Cashfree',
            cashfreeOrderId: cfOrderId,
            cashfreePaymentId: cfPaymentId,
            amount: order.total,
            currency: 'INR',
            status: 'Completed',
            paidAt: new Date(),
            gatewayResponse: {
                success: true,
                message: 'Cashfree payment captured successfully',
            },
        });

        await payment.save({ session });

        // Update order
        order.paymentStatus = 'Paid';
        order.paymentId = cfPaymentId;
        if (order.status === 'Pending') {
            order.status = 'Received';
        }
        await order.save({ session });
        await session.commitTransaction();

        // Notify sellers
        if (io) {
            try {
                const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                await notifySellersOfOrderUpdate(io, order, 'NEW_ORDER');
                console.log(`📢 [Cashfree] Seller notification sent for order ${order.orderNumber}`);
            } catch (notifyError) {
                console.error('[Cashfree] Failed to notify sellers:', notifyError);
            }
        }

        // Create Pending Commissions
        try {
            const { createPendingCommissions } = await import('./commissionService');
            await createPendingCommissions(orderId);
        } catch (commError) {
            console.error('[Cashfree] Failed to create pending commissions:', commError);
        }

        return {
            success: true,
            message: 'Cashfree payment captured successfully',
            data: { paymentId: payment._id, orderId: order._id },
        };
    } catch (error: any) {
        await session.abortTransaction();
        console.error('[Cashfree] Error capturing payment:', error);
        return { success: false, message: error.message || 'Failed to capture Cashfree payment' };
    } finally {
        session.endSession();
    }
};

// ---------------------------------------------------------------------------
// Verify Cashfree Webhook Signature
// ---------------------------------------------------------------------------
export const verifyCashfreeWebhookSignature = (
    rawBody: string,
    timestamp: string,
    signature: string
): boolean => {
    try {
        const cashfree = getCashfree();
        return cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (error) {
        // Fallback to manual HMAC verification
        try {
            const secretKey = process.env.CASHFREE_SECRET_KEY;
            if (!secretKey) return false;
            const signatureData = timestamp + rawBody;
            const expectedSignature = crypto
                .createHmac('sha256', secretKey)
                .update(signatureData)
                .digest('base64');
            return expectedSignature === signature;
        } catch (e) {
            console.error('[Cashfree] Error verifying webhook signature:', e);
            return false;
        }
    }
};

// ---------------------------------------------------------------------------
// Handle Cashfree Webhook Events
// ---------------------------------------------------------------------------
export const handleCashfreeWebhook = async (
    body: any,
    rawBody: string,
    timestamp: string,
    signature: string,
    io?: any
): Promise<{ success: boolean; message: string }> => {
    try {
        // Verify webhook signature
        const isValid = verifyCashfreeWebhookSignature(rawBody, timestamp, signature);

        if (!isValid) {
            console.error('[Cashfree] Invalid webhook signature');
            throw new Error('Invalid webhook signature');
        }

        const eventType: string = body.type || body.event_type;
        const data = body.data;

        console.log(`[Cashfree] Webhook received: ${eventType}`);

        switch (eventType) {
            case 'PAYMENT_SUCCESS_WEBHOOK':
            case 'PAYMENT_SUCCESS':
                await handleCashfreePaymentSuccess(data, io);
                break;

            case 'PAYMENT_FAILED_WEBHOOK':
            case 'PAYMENT_FAILED':
            case 'PAYMENT_USER_DROPPED':
                await handleCashfreePaymentFailed(data);
                break;

            case 'REFUND_STATUS_WEBHOOK':
            case 'REFUND_PROCESSED':
                await handleCashfreeRefund(data);
                break;

            default:
                console.log(`[Cashfree] Unhandled webhook event: ${eventType}`);
        }

        return { success: true, message: 'Cashfree webhook processed' };
    } catch (error: any) {
        console.error('[Cashfree] Webhook error:', error);
        return { success: false, message: error.message || 'Webhook processing failed' };
    }
};

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------
const handleCashfreePaymentSuccess = async (data: any, io?: any) => {
    try {
        const order = data.order;
        const payment = data.payment;

        const cfOrderId: string = order?.order_id || payment?.cf_order_id;
        const cfPaymentId: string = String(payment?.cf_payment_id);

        // Find the existing payment record by cashfreeOrderId
        const existingPayment = await Payment.findOne({ cashfreeOrderId: cfOrderId });

        if (existingPayment) {
            const wasAlreadyComplete = existingPayment.status === 'Completed';
            existingPayment.status = 'Completed';
            existingPayment.cashfreePaymentId = cfPaymentId;
            existingPayment.paidAt = new Date();
            await existingPayment.save();

            const dbOrder = await Order.findById(existingPayment.order);
            if (dbOrder) {
                dbOrder.paymentStatus = 'Paid';
                dbOrder.paymentId = cfPaymentId;
                if (dbOrder.status === 'Pending') {
                    dbOrder.status = 'Received';
                }
                await dbOrder.save();

                if (!wasAlreadyComplete && io) {
                    try {
                        const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                        await notifySellersOfOrderUpdate(io, dbOrder, 'NEW_ORDER');
                    } catch (_e) { /* non-critical */ }
                }
            }
        }
    } catch (error) {
        console.error('[Cashfree] handleCashfreePaymentSuccess error:', error);
    }
};

const handleCashfreePaymentFailed = async (data: any) => {
    try {
        const order = data.order;
        const cfOrderId: string = order?.order_id;

        const existingPayment = await Payment.findOne({ cashfreeOrderId: cfOrderId });
        if (existingPayment) {
            existingPayment.status = 'Failed';
            existingPayment.gatewayResponse = {
                success: false,
                message: data.payment?.payment_message || 'Payment failed',
                rawResponse: data,
            };
            await existingPayment.save();

            const dbOrder = await Order.findById(existingPayment.order);
            if (dbOrder && dbOrder.status === 'Pending') {
                const { restoreOrderInventoryAndCoupon } = await import('../modules/customer/controllers/customerOrderController');
                await restoreOrderInventoryAndCoupon(dbOrder._id);
                dbOrder.status = 'Cancelled';
                dbOrder.paymentStatus = 'Failed';
                dbOrder.cancellationReason = data.payment?.payment_message || 'Payment failed or cancelled';
                await dbOrder.save();
            } else if (dbOrder) {
                dbOrder.paymentStatus = 'Failed';
                await dbOrder.save();
            }
        }
    } catch (error) {
        console.error('[Cashfree] handleCashfreePaymentFailed error:', error);
    }
};

const handleCashfreeRefund = async (data: any) => {
    try {
        const cfPaymentId = String(data.refund?.cf_payment_id);
        const existingPayment = await Payment.findOne({ cashfreePaymentId: cfPaymentId });

        if (existingPayment) {
            existingPayment.status = 'Refunded';
            existingPayment.refundAmount = (data.refund?.refund_amount || 0);
            existingPayment.refundedAt = new Date();
            await existingPayment.save();

            await Order.findByIdAndUpdate(existingPayment.order, { paymentStatus: 'Refunded' });
        }
    } catch (error) {
        console.error('[Cashfree] handleCashfreeRefund error:', error);
    }
};

// ---------------------------------------------------------------------------
// Process Refund via Cashfree
// ---------------------------------------------------------------------------
export const processCashfreeRefund = async (
    paymentId: string,
    amount?: number,
    reason?: string
) => {
    try {
        const cashfree = getCashfree();

        const payment = await Payment.findById(paymentId);
        if (!payment) throw new Error('Payment not found');

        if (!payment.cashfreeOrderId || !payment.cashfreePaymentId) {
            throw new Error('This payment was not made via Cashfree');
        }

        const refundAmount = amount || payment.amount;
        const refundId = `REFUND_${payment.cashfreePaymentId}_${Date.now()}`;

        const refundRequest = {
            refund_amount: refundAmount,
            refund_id: refundId,
            refund_note: reason || 'Order cancelled',
        };

        await cashfree.PGOrderCreateRefund(
            payment.cashfreeOrderId,
            refundRequest
        );

        payment.status = 'Refunded';
        payment.refundAmount = refundAmount;
        payment.refundedAt = new Date();
        payment.refundReason = reason;
        await payment.save();

        return {
            success: true,
            message: 'Cashfree refund initiated successfully',
            data: { refundId, amount: refundAmount },
        };
    } catch (error: any) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to process refund';
        console.error('[Cashfree] Error processing refund:', msg);
        return { success: false, message: msg };
    }
};
