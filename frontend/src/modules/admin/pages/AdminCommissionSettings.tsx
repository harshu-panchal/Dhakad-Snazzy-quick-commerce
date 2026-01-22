import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';
import { getCommissionSettings, updateCommissionRates, getCommissionReport } from '../../../services/api/adminCommissionService';

export default function AdminCommissionSettings() {
    const { showToast } = useToast();
    const [settings, setSettings] = useState({
        sellerCommissionRate: 10,
        deliveryBoyCommissionRate: 5,
        minimumWithdrawalAmount: 100,
    });
    const [report, setReport] = useState<any>({ summary: {}, commissions: [] });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [settingsRes, reportRes] = await Promise.all([
                getCommissionSettings(),
                getCommissionReport(),
            ]);

            if (settingsRes.success) setSettings(settingsRes.data);
            if (reportRes.success) setReport(reportRes.data);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            setIsSaving(true);
            const response = await updateCommissionRates(settings);
            if (response.success) {
                showToast('Commission settings updated successfully', 'success');
                fetchData();
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update settings', 'error');
        } finally {
            setIsSaving(false);
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
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Commission Settings</h1>

            {/* Settings Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm p-6 mb-6"
            >
                <h2 className="text-lg font-semibold mb-4">Commission Rates</h2>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Seller Commission Rate (%)
                        </label>
                        <input
                            type="number"
                            value={settings.sellerCommissionRate}
                            onChange={(e) => setSettings({ ...settings, sellerCommissionRate: parseFloat(e.target.value) })}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                            min="0"
                            max="100"
                            step="0.1"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Delivery Boy Commission Rate (%)
                        </label>
                        <input
                            type="number"
                            value={settings.deliveryBoyCommissionRate}
                            onChange={(e) => setSettings({ ...settings, deliveryBoyCommissionRate: parseFloat(e.target.value) })}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                            min="0"
                            max="100"
                            step="0.1"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Minimum Withdrawal Amount (₹)
                        </label>
                        <input
                            type="number"
                            value={settings.minimumWithdrawalAmount}
                            onChange={(e) => setSettings({ ...settings, minimumWithdrawalAmount: parseFloat(e.target.value) })}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="1"
                        />
                    </div>
                </div>

                <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-1">Total Commissions</p>
                    <p className="text-2xl font-bold text-gray-900">₹{report.summary.totalCommissions?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-1">Seller Commissions</p>
                    <p className="text-2xl font-bold text-blue-600">₹{report.summary.sellerCommissions?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-1">Delivery Commissions</p>
                    <p className="text-2xl font-bold text-green-600">₹{report.summary.deliveryBoyCommissions?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-1">Pending</p>
                    <p className="text-2xl font-bold text-orange-600">₹{report.summary.pendingCommissions?.toFixed(2) || '0.00'}</p>
                </div>
            </div>

            {/* Recent Commissions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Recent Commissions</h2>
                <div className="space-y-3">
                    {report.commissions?.slice(0, 10).map((comm: any) => (
                        <div key={comm._id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-medium">{comm.type === 'SELLER' ? 'Seller' : 'Delivery Boy'} Commission</p>
                                <p className="text-sm text-gray-600">Order: {comm.order?.orderNumber || 'N/A'}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-green-600">₹{comm.commissionAmount.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">{new Date(comm.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                    {report.commissions?.length === 0 && (
                        <p className="text-center text-gray-500 py-8">No commissions yet</p>
                    )}
                </div>
            </div>
        </div>
    );
}
