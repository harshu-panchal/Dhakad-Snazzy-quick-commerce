import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';
import {
    getAllWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    completeWithdrawal,
} from '../../../services/api/adminCommissionService';

export default function AdminWithdrawals() {
    const { showToast } = useToast();
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
    const [transactionRef, setTransactionRef] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        fetchWithdrawals();
    }, [filter]);

    const fetchWithdrawals = async () => {
        try {
            setLoading(true);
            const response = await getAllWithdrawals({
                status: filter === 'all' ? undefined : filter,
            });
            if (response.success) {
                setWithdrawals(response.data.requests || []);
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to load withdrawals', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        try {
            setIsProcessing(true);
            const response = await approveWithdrawal(id);
            if (response.success) {
                showToast('Withdrawal approved successfully', 'success');
                fetchWithdrawals();
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to approve withdrawal', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id: string) => {
        const remarks = prompt('Enter rejection reason (optional):');
        try {
            setIsProcessing(true);
            const response = await rejectWithdrawal(id, remarks || undefined);
            if (response.success) {
                showToast('Withdrawal rejected', 'success');
                fetchWithdrawals();
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to reject withdrawal', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleComplete = async () => {
        if (!selectedWithdrawal || !transactionRef) {
            showToast('Transaction reference is required', 'error');
            return;
        }

        try {
            setIsProcessing(true);
            const response = await completeWithdrawal(selectedWithdrawal._id, transactionRef);
            if (response.success) {
                showToast('Withdrawal completed successfully', 'success');
                setShowCompleteModal(false);
                setSelectedWithdrawal(null);
                setTransactionRef('');
                fetchWithdrawals();
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to complete withdrawal', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Withdrawal Requests</h1>

            {/* Filters */}
            <div className="flex gap-2 mb-6">
                {['all', 'Pending', 'Approved', 'Completed', 'Rejected'].map((status) => (
                    <button
                        key={status}
                        onClick={() => setFilter(status)}
                        className={`px-4 py-2 rounded-lg font-medium transition ${filter === status
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                ))}
            </div>

            {/* Withdrawals List */}
            <div className="space-y-4">
                {withdrawals.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center">
                        <p className="text-gray-500">No withdrawal requests found</p>
                    </div>
                ) : (
                    withdrawals.map((withdrawal) => (
                        <motion.div
                            key={withdrawal._id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-xl shadow-sm p-6"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-semibold text-lg">
                                        {withdrawal.userType === 'SELLER' ? 'Seller' : 'Delivery Boy'} Withdrawal
                                    </h3>
                                    <p className="text-sm text-gray-600">
                                        {withdrawal.userId?.sellerName || withdrawal.userId?.storeName || withdrawal.userId?.name || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(withdrawal.createdAt).toLocaleString('en-IN')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-gray-900">₹{withdrawal.amount.toFixed(2)}</p>
                                    <span
                                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2 ${withdrawal.status === 'Completed'
                                                ? 'bg-green-100 text-green-700'
                                                : withdrawal.status === 'Approved'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : withdrawal.status === 'Rejected'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                            }`}
                                    >
                                        {withdrawal.status}
                                    </span>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p className="text-sm text-gray-600">Payment Method</p>
                                    <p className="font-medium">{withdrawal.paymentMethod}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Bank Details</p>
                                    <p className="font-medium text-sm">
                                        {withdrawal.userId?.accountNumber ? `****${withdrawal.userId.accountNumber.slice(-4)}` : 'N/A'}
                                    </p>
                                </div>
                            </div>

                            {withdrawal.remarks && (
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-600">Remarks</p>
                                    <p className="text-sm">{withdrawal.remarks}</p>
                                </div>
                            )}

                            {/* Actions */}
                            {withdrawal.status === 'Pending' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(withdrawal._id)}
                                        disabled={isProcessing}
                                        className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleReject(withdrawal._id)}
                                        disabled={isProcessing}
                                        className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </div>
                            )}

                            {withdrawal.status === 'Approved' && (
                                <button
                                    onClick={() => {
                                        setSelectedWithdrawal(withdrawal);
                                        setShowCompleteModal(true);
                                    }}
                                    disabled={isProcessing}
                                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    Mark as Completed
                                </button>
                            )}
                        </motion.div>
                    ))
                )}
            </div>

            {/* Complete Modal */}
            {showCompleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl p-6 max-w-md w-full"
                    >
                        <h2 className="text-2xl font-bold mb-4">Complete Withdrawal</h2>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Transaction Reference
                            </label>
                            <input
                                type="text"
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter bank transaction reference"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCompleteModal(false);
                                    setSelectedWithdrawal(null);
                                    setTransactionRef('');
                                }}
                                className="flex-1 border border-gray-300 rounded-lg py-2 font-semibold hover:bg-gray-50"
                                disabled={isProcessing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleComplete}
                                className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold hover:bg-blue-700 disabled:opacity-50"
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Processing...' : 'Complete'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
