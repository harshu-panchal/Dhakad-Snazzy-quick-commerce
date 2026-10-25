import { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocation as useLocationContext } from '../../hooks/useLocation';
import { useToast } from '../../context/ToastContext';
import {
    uploadReel,
    getReelableProducts,
    type ReelableItem,
} from '../../services/api/customerReelService';
import ReelBenefits from './components/ReelBenefits';

const MAX_SIZE_MB = 400;

export default function ReelUpload() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { location } = useLocationContext();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [video, setVideo] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [durationSec, setDurationSec] = useState<number | undefined>();
    const [caption, setCaption] = useState('');
    // Poster thumbnail, captured client-side from the clip's first frame (see
    // handleCaptureThumbnail) so the feed has something to show instantly
    // while the video itself is still buffering — large reels otherwise look
    // "stuck" on a black screen until enough of the video downloads.
    const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);

    // Reels may only be created for delivered purchases, so the "product
    // picker" is really a picker over this customer's eligible order items.
    const [eligible, setEligible] = useState<ReelableItem[] | null>(null);
    const [selected, setSelected] = useState<ReelableItem | null>(null);

    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        return () => {
            if (videoUrl) URL.revokeObjectURL(videoUrl);
        };
    }, [videoUrl]);

    const handlePickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('video/')) {
            showToast('Please select a video file', 'error');
            return;
        }
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > MAX_SIZE_MB) {
            showToast(`Video is too large (${sizeMB.toFixed(0)}MB). Max ${MAX_SIZE_MB}MB.`, 'error');
            return;
        }
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        const url = URL.createObjectURL(file);
        setVideo(file);
        setVideoUrl(url);
        setThumbnailBlob(null); // stale thumbnail from a previous clip shouldn't carry over
    };

    // Grab a frame from the (locally loaded, same-origin blob: URL) preview
    // video as a small JPEG to use as the reel's poster image. Best-effort:
    // if it fails for any reason, the reel still uploads, just without a
    // poster — never blocks posting.
    const handleCaptureThumbnail = () => {
        const videoEl = videoPreviewRef.current;
        if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => {
                    if (blob) setThumbnailBlob(blob);
                },
                'image/jpeg',
                0.8,
            );
        } catch {
            // Ignore — thumbnail is a nice-to-have, not required.
        }
    };

    // Load eligible delivered purchases. If the customer arrived from a
    // specific delivered order item (?orderItem=…), preselect it so the
    // product is already linked and they go straight to picking a video.
    useEffect(() => {
        let cancelled = false;
        getReelableProducts()
            .then((res) => {
                if (cancelled) return;
                const items = res.data || [];
                setEligible(items);
                const preselectId = searchParams.get('orderItem');
                if (preselectId) {
                    const match = items.find((i) => i.orderItemId === preselectId);
                    if (match) setSelected(match);
                    else
                        showToast(
                            'You have already created a reel for that purchase',
                            'info',
                        );
                }
            })
            .catch(() => {
                if (!cancelled) setEligible([]);
            });
        return () => {
            cancelled = true;
        };
    }, [searchParams, showToast]);

    const handleSubmit = async () => {
        if (!video) {
            showToast('Select a video first', 'error');
            return;
        }
        if (!selected) {
            showToast('Choose which delivered product this reel is about', 'error');
            return;
        }
        setUploading(true);
        setProgress(0);
        try {
            await uploadReel(
                {
                    video,
                    orderItemId: selected.orderItemId,
                    caption: caption.trim() || undefined,
                    durationSec,
                    thumbnail: thumbnailBlob || undefined,
                    city: location?.city,
                    state: location?.state,
                },
                setProgress,
            );
            showToast('Reel posted!', 'success');
            navigate('/reels/mine');
        } catch (err: any) {
            const msg =
                err?.response?.data?.message || err?.message || 'Failed to upload reel';
            showToast(msg, 'error');
        } finally {
            setUploading(false);
        }
    };

    const header = (
        <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Back" className="p-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
            </button>
            <h1 className="text-lg font-bold text-neutral-900">New Reel</h1>
        </div>
    );

    // Still checking which purchases qualify
    if (eligible === null) {
        return (
            <div className="min-h-screen bg-white">
                {header}
                <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 rounded-full border-4 border-neutral-200 border-t-green-600 animate-spin" />
                </div>
            </div>
        );
    }

    // Nothing delivered yet (or every purchase already has a reel) — explain
    // how to become eligible instead of showing an unusable form.
    if (eligible.length === 0) {
        return (
            <div className="min-h-screen bg-white">
                {header}
                <div className="p-4 space-y-5">
                    <div className="text-center pt-6 pb-2">
                        <div className="text-5xl mb-3">🎬</div>
                        <h2 className="text-lg font-bold text-neutral-900 mb-1">
                            No products to feature yet
                        </h2>
                        <p className="text-sm text-neutral-500">
                            You can create a reel for any product once your order has been
                            delivered. Reels you've already posted don't appear here.
                        </p>
                    </div>

                    <ReelBenefits />

                    <button
                        onClick={() => navigate('/orders')}
                        className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold active:scale-[0.99] transition-transform"
                    >
                        View my orders
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-3 rounded-xl border border-neutral-200 text-neutral-700 font-semibold"
                    >
                        Start shopping
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white pb-28">
            {header}

            <div className="p-4 space-y-5">
                <ReelBenefits />
                {/* Video picker */}
                <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                        Video <span className="text-neutral-400 font-normal">(max {MAX_SIZE_MB}MB)</span>
                    </label>
                    {videoUrl ? (
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[55vh] mx-auto">
                            <video
                                ref={videoPreviewRef}
                                src={videoUrl}
                                controls
                                playsInline
                                className="h-full w-full object-contain"
                                onLoadedMetadata={(e) => {
                                    const el = e.currentTarget;
                                    setDurationSec(Math.round(el.duration));
                                    // Seek a touch in so we don't capture an all-black
                                    // first frame (common right after a cut/transition).
                                    try {
                                        el.currentTime = Math.min(0.3, (el.duration || 1) / 4);
                                    } catch {
                                        // Some browsers may not be ready to seek yet — the
                                        // thumbnail is best-effort, so just skip it.
                                    }
                                }}
                                onSeeked={handleCaptureThumbnail}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium"
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full aspect-[9/16] max-h-[45vh] rounded-xl border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-500 gap-2"
                        >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="4" width="20" height="16" rx="3" />
                                <path d="M10 9l5 3-5 3V9z" />
                            </svg>
                            <span className="text-sm font-medium">Tap to select a video</span>
                        </button>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handlePickVideo}
                    />
                </div>

                {/* Which delivered purchase this reel features */}
                <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-1">
                        Product
                    </label>
                    <p className="text-xs text-neutral-500 mb-2">
                        Choose one of your delivered purchases — it gets linked to the reel
                        automatically.
                    </p>
                    {selected ? (
                        <div className="flex items-center gap-3 border border-green-200 bg-green-50/50 rounded-xl p-2.5">
                            <img
                                src={selected.product.mainImage || '/placeholder.png'}
                                alt={selected.product.productName}
                                className="h-12 w-12 rounded-lg object-cover bg-neutral-100"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 line-clamp-1">
                                    {selected.product.productName}
                                </p>
                                <p className="text-xs text-neutral-500">
                                    {selected.orderNumber
                                        ? `Order ${selected.orderNumber}`
                                        : 'Delivered order'}
                                </p>
                            </div>
                            {eligible.length > 1 && (
                                <button
                                    onClick={() => setSelected(null)}
                                    className="text-sm text-green-700 font-medium px-2"
                                >
                                    Change
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-72 overflow-y-auto">
                            {eligible.map((item) => (
                                <button
                                    key={item.orderItemId}
                                    onClick={() => setSelected(item)}
                                    className="flex items-center gap-3 p-2.5 w-full text-left hover:bg-neutral-50"
                                >
                                    <img
                                        src={item.product.mainImage || '/placeholder.png'}
                                        alt={item.product.productName}
                                        className="h-10 w-10 rounded-lg object-cover bg-neutral-100"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-neutral-900 line-clamp-1">
                                            {item.product.productName}
                                        </p>
                                        <p className="text-xs text-neutral-400">
                                            {item.orderNumber
                                                ? `Order ${item.orderNumber}`
                                                : 'Delivered order'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Caption */}
                <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                        Caption <span className="text-neutral-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={3}
                        maxLength={2200}
                        placeholder="Say something about this product…"
                        className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                </div>
            </div>

            {/* Sticky submit */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 p-4">
                {uploading ? (
                    <div>
                        <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden mb-2">
                            <div
                                className="h-full bg-green-600 transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-center text-sm text-neutral-600">
                            Uploading… {progress}%
                        </p>
                    </div>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={!video || !selected}
                        className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
                    >
                        Post Reel
                    </button>
                )}
            </div>
        </div>
    );
}
