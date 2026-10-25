import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWallet, type WalletData } from '../../services/api/customerWalletService';
import ReelBenefits from './components/ReelBenefits';

function formatDate(d: string): string {
    if (!d) return '';
    try {
        return new Date(d).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '';
    }
}

export default function Wallet() {
    const navigate = useNavigate();
    const [wallet, setWallet] = useState<WalletData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await getWallet();
                if (active) setWallet(res.data);
            } catch {
                if (active) setWallet(null);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="min-h-screen bg-neutral-50 pb-24">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} aria-label="Back" className="p-1">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold text-neutral-900">My Wallet</h1>
            </div>

            {/* Balance card */}
            <div className="p-4">
                <div className="rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 text-white p-5 shadow-sm">
                    <p className="text-sm opacity-90">Wallet balance</p>
                    <p className="text-3xl font-bold mt-1">
                        ₹{wallet ? wallet.balance.toFixed(2) : '0.00'}
                    </p>
                    <div className="mt-4 text-sm">
                        <span className="opacity-80">Total earned from reels: </span>
                        <span className="font-semibold">
                            ₹{wallet ? wallet.totalEarned.toFixed(2) : '0.00'}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-neutral-500 mt-2 px-1">
                    You earn commission when someone buys a product through your reel. Earnings are
                    added here after the order is delivered.
                </p>
            </div>

            {/* Transactions */}
            <div className="px-4">
                <h2 className="text-xs font-bold text-neutral-900 mb-2 uppercase tracking-wide">
                    Transactions
                </h2>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 rounded-full border-4 border-neutral-200 border-t-green-600 animate-spin" />
                    </div>
                ) : !wallet || wallet.transactions.length === 0 ? (
                    <div className="bg-white rounded-xl border border-neutral-200 p-5">
                        <div className="text-center mb-4">
                            <p className="text-neutral-800 font-semibold mb-1">
                                No transactions yet
                            </p>
                            <p className="text-neutral-500 text-sm">
                                Post a reel for a product you've received and start earning.
                            </p>
                        </div>
                        <ReelBenefits className="mb-4" />
                        <button
                            onClick={() => navigate('/reels/upload')}
                            className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold"
                        >
                            Create a Reel
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
                        {wallet.transactions.map((tx) => (
                            <div key={tx._id} className="flex items-center gap-3 px-3 py-3">
                                {tx.product?.mainImage ? (
                                    <img
                                        src={tx.product.mainImage}
                                        alt=""
                                        className="h-10 w-10 rounded-lg object-cover bg-neutral-100 flex-shrink-0"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 text-neutral-400">
                                        ₹
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-neutral-900 line-clamp-1">
                                        {tx.description}
                                    </p>
                                    <p className="text-xs text-neutral-400">{formatDate(tx.date)}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p
                                        className={`text-sm font-bold ${
                                            tx.type === 'Credit' ? 'text-green-600' : 'text-red-500'
                                        }`}
                                    >
                                        {tx.type === 'Credit' ? '+' : '−'}₹{tx.amount.toFixed(2)}
                                    </p>
                                    {tx.status === 'Reversed' && (
                                        <p className="text-[10px] text-red-400">Reversed</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
