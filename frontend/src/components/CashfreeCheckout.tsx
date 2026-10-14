import React, { useEffect, useRef } from 'react';
import { createCashfreeOrder, verifyCashfreePayment } from '../services/api/paymentService';

interface CashfreeCheckoutProps {
    orderId: string;
    amount: number;
    onSuccess: (paymentId: string) => void;
    onFailure: (error: string) => void;
    customerDetails: {
        name: string;
        email: string;
        phone: string;
    };
}

declare global {
    interface Window {
        Cashfree: any;
    }
}

/** Load the Cashfree JS SDK from CDN */
const loadCashfreeScript = (env: 'sandbox' | 'production' = 'sandbox'): Promise<boolean> => {
    return new Promise((resolve) => {
        if (typeof window.Cashfree !== 'undefined') {
            resolve(true);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

const CashfreeCheckout: React.FC<CashfreeCheckoutProps> = ({
    orderId,
    amount,
    onSuccess,
    onFailure,
    customerDetails,
}) => {
    const hasInitiated = useRef(false);

    useEffect(() => {
        // Prevent double-invocation in React StrictMode
        if (hasInitiated.current) return;
        hasInitiated.current = true;

        const initiatePayment = async () => {
            try {
                // 1. Load Cashfree SDK
                const sdkLoaded = await loadCashfreeScript();
                if (!sdkLoaded) {
                    onFailure('Failed to load Cashfree SDK');
                    return;
                }

                // 2. Create Cashfree order on backend → get payment_session_id
                const orderResponse = await createCashfreeOrder(orderId);

                if (!orderResponse.success) {
                    onFailure(orderResponse.message || 'Failed to create Cashfree payment order');
                    return;
                }

                const {
                    paymentSessionId,
                    cfOrderId,
                    cashfreeEnv,
                } = orderResponse.data;

                // 3. Initialise Cashfree SDK
                const cashfree = window.Cashfree({
                    mode: (cashfreeEnv || 'TEST').toUpperCase() === 'PRODUCTION'
                        ? 'production'
                        : 'sandbox',
                });

                // 4. Open Cashfree Drop-in checkout
                const checkoutOptions = {
                    paymentSessionId,
                    redirectTarget: '_modal', // Opens in a modal overlay (no page redirect)
                };

                const result = await cashfree.checkout(checkoutOptions);

                // 5. Handle result
                if (result.error) {
                    // Cashfree returned an error or user dismissed
                    const errorMsg: string = result.error?.message || 'Cashfree payment failed or was cancelled';
                    console.warn('[Cashfree] Payment error:', result.error);
                    onFailure(errorMsg);
                    return;
                }

                if (result.paymentDetails) {
                    // Payment was successful — verify server-side before updating UI
                    try {
                        const paymentId: string = String(result.paymentDetails.paymentMessage || cfOrderId);
                        const cfPaymentId: string = String(result.paymentDetails.paymentCode || '');

                        const verifyResponse = await verifyCashfreePayment({
                            orderId,
                            cfOrderId,
                            cfPaymentId,
                        });

                        if (verifyResponse.success) {
                            onSuccess(cfPaymentId || cfOrderId);
                        } else {
                            onFailure(verifyResponse.message || 'Payment verification failed');
                        }
                    } catch (verifyError: any) {
                        console.error('[Cashfree] Verification error:', verifyError);
                        onFailure(verifyError?.response?.data?.message || 'Payment verification failed');
                    }
                } else {
                    // Unexpected state
                    onFailure('Payment could not be completed. Please try again.');
                }
            } catch (error: any) {
                console.error('[Cashfree] Payment initiation error:', error);
                onFailure(error?.response?.data?.message || error?.message || 'Failed to initiate Cashfree payment');
            }
        };

        initiatePayment();
    }, [orderId, amount, customerDetails, onSuccess, onFailure]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                <div className="text-center">
                    {/* Cashfree brand color spinner */}
                    <div
                        className="mx-auto mb-5 w-14 h-14 rounded-full border-4 border-gray-100 border-t-blue-600 animate-spin"
                        style={{ borderTopColor: '#1A5CFF' }}
                    />
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Opening Secure Payment
                    </h3>
                    <p className="text-sm text-gray-500">
                        Please wait while we connect to Cashfree
                    </p>
                    <p className="text-xs text-gray-400 mt-3">
                        Powered by <span className="font-semibold text-blue-600">Cashfree Payments</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CashfreeCheckout;
