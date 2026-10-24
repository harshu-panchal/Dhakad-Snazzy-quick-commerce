import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
    getMyReels,
    getReelEarnings,
    deleteReel as apiDeleteReel,
} from '../../services/api/customerReelService';

interface MyReel {
    _id: string;
    videoUrl: string;
    thumbnailUrl?: string;
    caption?: string;
    likesCount: number;
    sharesCount: number;
    viewsCount: number;
    status: string;
    earnings: number;
    conversions: number;
    product?: { _id: string; productName: string; mainImage?: string };
}

export default function MyReels() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [reels, setReels] = useState<MyReel[]>([]);
    const [summary, setSummary] = useState<{ walletAmount: number; totalReelEarnings: number; conversions: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const [reelsRes, earnRes] = await Promise.all([getMyReels(), getReelEarnings()]);
            setReels(reelsRes.data || []);
            setSummary({
                walletAmount: earnRes.data.walletAmount,
                totalReelEarnings: earnRes.data.totalReelEarnings,
                conversions: earnRes.data.conversions,
            });
        } catch {
            showToast('Failed to load your reels', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this reel? This cannot be undone.')) return;
        try {
            await apiDeleteReel(id);
            setReels((prev) => prev.filter((r) => r._id !== id));
            showToast('Reel deleted', 'success');
        } catch {
            showToast('Failed to delete reel', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50 pb-20">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} aria-label="Back" className="p-1">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold text-neutral-900">My Reels</h1>
            </div>

            {/* Earnings summary */}
            <div className="p-4">
                <div className="rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 text-white p-5 shadow-sm">
                    <p className="text-sm opacity-90">Reel earnings (wallet)</p>
                    <p className="text-3xl font-bold mt-1">
                        ₹{summary ? summary.totalReelEarnings.toFixed(2) : '0.00'}
                    </p>
                    <div className="flex items-center gap-6 mt-4 text-sm">
                        <div>
                            <p className="opacity-80">Wallet balance</p>
                            <p className="font-semibold">₹{summary ? summary.walletAmount.toFixed(2) : '0.00'}</p>
                        </div>
                        <div>
                            <p className="opacity-80">Conversions</p>
                            <p className="font-semibold">{summary?.conversions ?? 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reels grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 rounded-full border-4 border-neutral-200 border-t-green-600 animate-spin" />
                </div>
            ) : reels.length === 0 ? (
                <div className="text-center px-8 py-16">
                    <p className="text-neutral-800 font-semibold mb-1">You haven't posted any reels</p>
                    <p className="text-neutral-500 text-sm mb-5">
                        Post a reel linked to a product and earn commission on every sale through it.
                    </p>
                    <button
                        onClick={() => navigate('/reels/upload')}
                        className="px-6 py-2.5 rounded-full bg-green-600 text-white font-semibold"
                    >
                        Create a Reel
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
                    {reels.map((reel) => (
                        <div
                            key={reel._id}
                            className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] group"
                        >
                            {reel.thumbnailUrl ? (
                                <img src={reel.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <video src={reel.videoUrl} muted playsInline className="h-full w-full object-cover" />
                            )}
                            {reel.status === 'Removed' && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-semibold">
                                    Removed
                                </div>
                            )}
                            <button
                                onClick={() => handleDelete(reel._id)}
                                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center"
                                aria-label="Delete reel"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                </svg>
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white">
                                <div className="flex items-center justify-between text-[11px] mb-0.5">
                                    <span className="flex items-center gap-1">
                                        ❤ {reel.likesCount}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        ↗ {reel.sharesCount}
                                    </span>
                                    <span>▶ {reel.viewsCount}</span>
                                </div>
                                <p className="text-[11px] font-semibold text-green-300">
                                    Earned ₹{reel.earnings.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
