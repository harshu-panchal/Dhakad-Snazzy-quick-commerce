import { useEffect, useState } from 'react';
import {
    listReels,
    getReelStats,
    updateReelStatus,
    deleteReel,
    type AdminReel,
    type ReelStats,
} from '../../../services/api/admin/adminReelService';

const STATUS_TABS = [
    { key: 'all', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Removed', label: 'Removed' },
];

export default function AdminReels() {
    const [reels, setReels] = useState<AdminReel[]>([]);
    const [stats, setStats] = useState<ReelStats | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState<AdminReel | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [reelsRes, statsRes] = await Promise.all([
                listReels({ status: statusFilter, limit: 50 }),
                getReelStats(),
            ]);
            setReels(reelsRes.data || []);
            setStats(statsRes.data);
        } catch (e) {
            console.error('Failed to load reels', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const handleToggleStatus = async (reel: AdminReel) => {
        const next = reel.status === 'Active' ? 'Removed' : 'Active';
        try {
            await updateReelStatus(reel._id, next);
            setReels((prev) =>
                prev.map((r) => (r._id === reel._id ? { ...r, status: next } : r)),
            );
        } catch {
            alert('Failed to update reel status');
        }
    };

    const handleDelete = async (reel: AdminReel) => {
        if (!window.confirm('Permanently delete this reel?')) return;
        try {
            await deleteReel(reel._id);
            setReels((prev) => prev.filter((r) => r._id !== reel._id));
        } catch {
            alert('Failed to delete reel');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-neutral-900 mb-1">Reels</h1>
            <p className="text-neutral-500 mb-6">
                Customer product-affiliation reels and commission payouts.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total reels" value={stats?.totalReels ?? 0} />
                <StatCard label="Active" value={stats?.activeReels ?? 0} />
                <StatCard label="Conversions" value={stats?.conversions ?? 0} />
                <StatCard
                    label="Commission paid"
                    value={`₹${(stats?.totalCommissionPaid ?? 0).toFixed(2)}`}
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {STATUS_TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setStatusFilter(t.key)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                            statusFilter === t.key
                                ? 'bg-neutral-900 text-white'
                                : 'bg-neutral-100 text-neutral-600'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 rounded-full border-4 border-neutral-200 border-t-neutral-900 animate-spin" />
                </div>
            ) : reels.length === 0 ? (
                <p className="text-neutral-500 py-12 text-center">No reels found.</p>
            ) : (
                <div className="overflow-x-auto bg-white rounded-xl border border-neutral-100">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-neutral-500 border-b border-neutral-100">
                                <th className="p-3 font-medium">Reel</th>
                                <th className="p-3 font-medium">Owner</th>
                                <th className="p-3 font-medium">Product</th>
                                <th className="p-3 font-medium">Engagement</th>
                                <th className="p-3 font-medium">Earned</th>
                                <th className="p-3 font-medium">Status</th>
                                <th className="p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reels.map((reel) => (
                                <tr key={reel._id} className="border-b border-neutral-50">
                                    <td className="p-3">
                                        <button
                                            onClick={() => setPreview(reel)}
                                            className="relative block h-16 w-10 rounded-md overflow-hidden bg-black"
                                        >
                                            {reel.thumbnailUrl ? (
                                                <img src={reel.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <video src={reel.videoUrl} muted className="h-full w-full object-cover" />
                                            )}
                                            <span className="absolute inset-0 flex items-center justify-center text-white">
                                                ▶
                                            </span>
                                        </button>
                                    </td>
                                    <td className="p-3">
                                        <p className="font-medium text-neutral-900">{reel.customer?.name || '—'}</p>
                                        <p className="text-neutral-400 text-xs">{reel.customer?.phone}</p>
                                    </td>
                                    <td className="p-3 max-w-[180px]">
                                        <p className="line-clamp-1 text-neutral-800">{reel.product?.productName || '—'}</p>
                                        <p className="text-neutral-400 text-xs">{reel.seller?.storeName || reel.seller?.sellerName}</p>
                                    </td>
                                    <td className="p-3 text-neutral-600 whitespace-nowrap">
                                        ❤ {reel.likesCount} · ↗ {reel.sharesCount} · ▶ {reel.viewsCount}
                                    </td>
                                    <td className="p-3 font-semibold text-green-700 whitespace-nowrap">
                                        ₹{reel.earnings.toFixed(2)}
                                        <span className="text-neutral-400 font-normal"> ({reel.conversions})</span>
                                    </td>
                                    <td className="p-3">
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                reel.status === 'Active'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                            }`}
                                        >
                                            {reel.status}
                                        </span>
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                        <button
                                            onClick={() => handleToggleStatus(reel)}
                                            className="text-blue-600 font-medium mr-3"
                                        >
                                            {reel.status === 'Active' ? 'Remove' : 'Restore'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(reel)}
                                            className="text-red-600 font-medium"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Preview modal */}
            {preview && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setPreview(null)}
                >
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <video
                            src={preview.videoUrl}
                            controls
                            autoPlay
                            className="max-h-[80vh] rounded-xl bg-black"
                        />
                        <button
                            onClick={() => setPreview(null)}
                            className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white text-neutral-900 flex items-center justify-center font-bold"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="bg-white rounded-xl border border-neutral-100 p-4">
            <p className="text-neutral-500 text-sm">{label}</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{value}</p>
        </div>
    );
}
