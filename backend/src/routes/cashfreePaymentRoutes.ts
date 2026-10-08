import { Router } from 'express';
import { authenticate, requireUserType } from '../middleware/auth';
import { Request, Response } from 'express';
import Order from '../models/Order';
import {
    createCashfreeOrder,
    captureCashfreePayment,
    handleCashfreeWebhook,
    verifyCashfreePayment,
} from '../services/cashfreeService';

const router = Router();

/**
 * Create Cashfree order for customer checkout
 * POST /payment/cashfree/create-order
 */
router.post(
    '/create-order',
    authenticate,
    requireUserType('Customer'),
    async (req: Request, res: Response) => {
        try {
            const { orderId } = req.body;

            if (!orderId) {
                return res.status(400).json({ success: false, message: 'Order ID is required' });
            }

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            if (order.customer.toString() !== req.user!.userId) {
                return res.status(403).json({ success: false, message: 'Unauthorized access to order' });
            }

            // Extract customer info directly from Order fields or fallback to req.user
            const customerName = order.customerName || (req.user as any)?.name || 'Customer';
            const customerPhone = order.customerPhone || (req.user as any)?.phone || '9999999999';
            const customerEmail = order.customerEmail || (req.user as any)?.email || 'customer@dhakadsnazzy.com';

            const result = await createCashfreeOrder(orderId, order.total, 'INR', {
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
            });

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.status(200).json(result);
        } catch (error: any) {
            console.error('[Cashfree] Error creating order:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to create Cashfree payment order',
            });
        }
    }
);

/**
 * Verify Cashfree payment after frontend callback
 * POST /payment/cashfree/verify
 */
router.post(
    '/verify',
    authenticate,
    requireUserType('Customer'),
    async (req: Request, res: Response) => {
        try {
            const { orderId, cfOrderId, cfPaymentId } = req.body;

            if (!orderId || !cfOrderId) {
                return res.status(400).json({
                    success: false,
                    message: 'orderId and cfOrderId are required',
                });
            }

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            if (order.customer.toString() !== req.user!.userId) {
                return res.status(403).json({ success: false, message: 'Unauthorized access to order' });
            }

            // First verify payment status with Cashfree API
            const verification = await verifyCashfreePayment(cfOrderId);
            if (!verification.success) {
                return res.status(400).json({
                    success: false,
                    message: verification.message || 'Payment verification failed',
                });
            }

            // Capture payment in DB
            const io = req.app.get('io');
            const result = await captureCashfreePayment(
                orderId,
                cfOrderId,
                cfPaymentId || verification.paymentId || '',
                io
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.status(200).json(result);
        } catch (error: any) {
            console.error('[Cashfree] Error verifying payment:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to verify Cashfree payment',
            });
        }
    }
);

/**
 * Cashfree Webhook endpoint
 * POST /payment/cashfree/webhook
 * NOTE: This must receive the raw body - ensure express.raw() is applied in server.ts
 */
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const timestamp = req.headers['x-webhook-timestamp'] as string;
        const signature = req.headers['x-webhook-signature'] as string;

        if (!signature) {
            return res.status(400).json({ success: false, message: 'Missing webhook signature' });
        }

        // Raw body for signature verification (may be buffer or string)
        const rawBody = req.body instanceof Buffer
            ? req.body.toString('utf8')
            : JSON.stringify(req.body);

        const parsedBody = typeof req.body === 'object' && !(req.body instanceof Buffer)
            ? req.body
            : JSON.parse(rawBody);

        const io = req.app.get('io');
        const result = await handleCashfreeWebhook(
            parsedBody,
            rawBody,
            timestamp || '',
            signature,
            io
        );

        // Always return 200 to Cashfree so they don't retry
        return res.status(200).json(result);
    } catch (error: any) {
        console.error('[Cashfree] Webhook error:', error);
        return res.status(200).json({ success: false, message: 'Webhook error' });
    }
});

export default router;
