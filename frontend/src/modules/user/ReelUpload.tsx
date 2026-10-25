import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation as useLocationContext } from '../../hooks/useLocation';
import { useToast } from '../../context/ToastContext';
import { getProducts } from '../../services/api/customerProductService';
import { uploadReel } from '../../services/api/customerReelService';

const MAX_SIZE_MB = 400;

interface PickedProduct {
    _id: string;
    productName: string;
    mainImage?: string;
    price: number;
    discPrice?: number;
}

export default function ReelUpload() {
    const navigate = useNavigate();
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

    const [search, setSearch] = useState('');
    const [results, setResults] = useState<PickedProduct[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<PickedProduct | null>(null);

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

    // Debounced product search
    useEffect(() => {
        if (!search.trim()) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await getProducts({
                    search: search.trim(),
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    limit: 15,
                });
                setResults(
                    (res.data || []).map((p: any) => ({
                        _id: p._id,
                        productName: p.productName,
                        mainImage: p.mainImage || p.mainImageUrl,
                        price: p.price,
                        discPrice: p.discPrice,
                    })),
                );
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [search, location?.latitude, location?.longitude]);

    const handleSubmit = async () => {
        if (!video) {
            showToast('Select a video first', 'error');
            return;
        }
        if (!selected) {
            showToast('Link a product to your reel', 'error');
            return;
        }
        setUploading(true);
        setProgress(0);
        try {
            await uploadReel(
                {
                    video,
                    productId: selected._id,
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

    return (
        <div className="min-h-screen bg-white pb-28">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} aria-label="Back" className="p-1">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold text-neutral-900">New Reel</h1>
            </div>

            <div className="p-4 space-y-5">
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

                {/* Product picker */}
                <div>
                    <label className="block text-sm font-semibold text-neutral-800 mb-2">
                        Tag a product
                    </label>
                    {selected ? (
                        <div className="flex items-center gap-3 border border-neutral-200 rounded-xl p-2.5">
                            <img
                                src={selected.mainImage || '/placeholder.png'}
                                alt={selected.productName}
                                className="h-12 w-12 rounded-lg object-cover bg-neutral-100"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 line-clamp-1">
                                    {selected.productName}
                                </p>
                                <p className="text-sm font-bold text-neutral-900">
                                    ₹{selected.discPrice && selected.discPrice > 0 ? selected.discPrice : selected.price}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="text-sm text-red-600 font-medium px-2"
                            >
                                Remove
                            </button>
                        </div>
                    ) : (
                        <>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search products near you..."
                                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            {searching && (
                                <p className="text-xs text-neutral-400 mt-2">Searching…</p>
                            )}
                            {results.length > 0 && (
                                <div className="mt-2 border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-72 overflow-y-auto">
                                    {results.map((p) => (
                                        <button
                                            key={p._id}
                                            onClick={() => {
                                                setSelected(p);
                                                setResults([]);
                                                setSearch('');
                                            }}
                                            className="flex items-center gap-3 p-2.5 w-full text-left hover:bg-neutral-50"
                                        >
                                            <img
                                                src={p.mainImage || '/placeholder.png'}
                                                alt={p.productName}
                                                className="h-10 w-10 rounded-lg object-cover bg-neutral-100"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-neutral-900 line-clamp-1">
                                                    {p.productName}
                                                </p>
                                                <p className="text-xs font-semibold text-neutral-600">
                                                    ₹{p.discPrice && p.discPrice > 0 ? p.discPrice : p.price}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
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
