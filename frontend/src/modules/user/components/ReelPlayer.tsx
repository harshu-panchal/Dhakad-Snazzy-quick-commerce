import { useEffect, useRef, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Reel } from '../../../services/api/customerReelService';
import { setReelAttribution } from '../../../utils/reelAttribution';

interface ReelPlayerProps {
    reel: Reel;
    isActive: boolean;
    muted: boolean;
    onToggleMute: () => void;
    onLike: (reel: Reel) => void;
    onShare: (reel: Reel) => void;
    onFirstPlay?: (reelId: string) => void;
    /** Called when the browser blocks UNMUTED autoplay, so the feed can fall back to muted. */
    onAutoplayBlocked?: () => void;
    /** Whether to mount the <video src>. Offscreen reels are unmounted to save memory/bandwidth. */
    shouldLoad: boolean;
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function priceOf(p: Reel['product']): { price: number; mrp?: number } {
    if (!p) return { price: 0 };
    const price = p.discPrice && p.discPrice > 0 ? p.discPrice : p.price;
    const mrp = p.compareAtPrice && p.compareAtPrice > price ? p.compareAtPrice : undefined;
    return { price, mrp };
}

function ReelPlayer({
    reel,
    isActive,
    muted,
    onToggleMute,
    onLike,
    onShare,
    onFirstPlay,
    onAutoplayBlocked,
    shouldLoad,
}: ReelPlayerProps) {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const viewedRef = useRef(false);
    const [likeBurst, setLikeBurst] = useState(false);

    // Keep the DOM video's muted PROPERTY in sync with the prop.
    // React only reflects `muted` to the element on mount and won't update the
    // underlying property on re-render, so tapping unmute otherwise does nothing.
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.muted = muted;
    }, [muted, shouldLoad, isActive]);

    // Play/pause follows the active state (Instagram-style single active video)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Ensure the current muted state is applied before (re)playing
        video.muted = muted;

        if (isActive && shouldLoad) {
            const onStarted = () => {
                setIsPlaying(true);
                if (!viewedRef.current) {
                    viewedRef.current = true;
                    onFirstPlay?.(reel._id);
                }
            };
            const p = video.play();
            if (p && typeof p.then === 'function') {
                p.then(onStarted).catch(() => {
                    // Autoplay was blocked. If we were trying to play WITH sound,
                    // the block is almost always the unmuted-autoplay policy — fall
                    // back to muted so the reel still plays, and tell the feed to
                    // reset the preference to muted (keeps the speaker icon honest).
                    if (!muted) {
                        video.muted = true;
                        onAutoplayBlocked?.();
                        video.play().then(onStarted).catch(() => {
                            // Still blocked (rare) — leave paused; tap will start it.
                        });
                    }
                });
            }
        } else {
            video.pause();
            setIsPlaying(false);
            // Reset non-active videos to the start so they restart cleanly
            if (!isActive) {
                try {
                    video.currentTime = 0;
                } catch {
                    /* noop */
                }
            }
        }
    }, [isActive, shouldLoad, reel._id, onFirstPlay]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            void video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    };

    const handleDoubleTapLike = () => {
        if (!reel.liked) onLike(reel);
        setLikeBurst(true);
        setTimeout(() => setLikeBurst(false), 700);
    };

    const handleBuy = () => {
        if (!reel.product?._id) return;
        // Attribute this product's purchase to the reel, then send the viewer
        // into the normal (variant/stock aware) purchase flow.
        setReelAttribution(reel.product._id, reel._id);
        navigate(`/product/${reel.product._id}`);
    };

    const { price, mrp } = priceOf(reel.product);

    return (
        <div className="relative h-full w-full bg-black overflow-hidden snap-start flex-shrink-0">
            {/* Video */}
            {shouldLoad ? (
                <video
                    ref={videoRef}
                    src={reel.videoUrl}
                    poster={reel.thumbnailUrl}
                    className="absolute inset-0 h-full w-full object-contain bg-black"
                    loop
                    muted={muted}
                    playsInline
                    preload={isActive ? 'auto' : 'metadata'}
                    onClick={togglePlay}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onCanPlay={() => setIsBuffering(false)}
                />
            ) : (
                <div
                    className="absolute inset-0 h-full w-full bg-black"
                    style={
                        reel.thumbnailUrl
                            ? {
                                  backgroundImage: `url(${reel.thumbnailUrl})`,
                                  backgroundSize: 'contain',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat',
                              }
                            : undefined
                    }
                />
            )}

            {/* Tap-to-like overlay (double tap) */}
            <div
                className="absolute inset-0 z-10"
                onDoubleClick={handleDoubleTapLike}
                onClick={togglePlay}
            />

            {/* Buffering spinner */}
            {isBuffering && isActive && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                </div>
            )}

            {/* Paused indicator */}
            {!isPlaying && isActive && !isBuffering && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="h-16 w-16 rounded-full bg-black/40 flex items-center justify-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Double-tap heart burst */}
            {likeBurst && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <svg
                        className="animate-ping-once"
                        width="110"
                        height="110"
                        viewBox="0 0 24 24"
                        fill="#ff2d55"
                        style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }}
                    >
                        <path d="M12 21s-6.7-4.3-9.3-8.1C.9 10.1 1.6 6.5 4.5 5.3 6.6 4.4 9 5.1 10.3 7c.4.6.7 1 1.7 1s1.3-.4 1.7-1C15 5.1 17.4 4.4 19.5 5.3c2.9 1.2 3.6 4.8 1.8 7.6C18.7 16.7 12 21 12 21z" />
                    </svg>
                </div>
            )}

            {/* Right action rail — Like, Share, Mute */}
            <div className="absolute right-3 bottom-32 z-30 flex flex-col items-center gap-5">
                <button
                    onClick={() => onLike(reel)}
                    className="flex flex-col items-center gap-1 text-white"
                    aria-label="Like"
                >
                    <svg
                        width="34"
                        height="34"
                        viewBox="0 0 24 24"
                        fill={reel.liked ? '#ff2d55' : 'none'}
                        stroke={reel.liked ? '#ff2d55' : 'white'}
                        strokeWidth="2"
                        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }}
                        className="transition-transform active:scale-125"
                    >
                        <path d="M12 21s-6.7-4.3-9.3-8.1C.9 10.1 1.6 6.5 4.5 5.3 6.6 4.4 9 5.1 10.3 7c.4.6.7 1 1.7 1s1.3-.4 1.7-1C15 5.1 17.4 4.4 19.5 5.3c2.9 1.2 3.6 4.8 1.8 7.6C18.7 16.7 12 21 12 21z" />
                    </svg>
                    <span className="text-xs font-semibold drop-shadow">
                        {formatCount(reel.likesCount)}
                    </span>
                </button>

                <button
                    onClick={() => onShare(reel)}
                    className="flex flex-col items-center gap-1 text-white"
                    aria-label="Share"
                >
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }}
                        className="transition-transform active:scale-110"
                    >
                        <path d="M22 2 11 13" />
                        <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                    </svg>
                    <span className="text-xs font-semibold drop-shadow">
                        {formatCount(reel.sharesCount)}
                    </span>
                </button>

                <button
                    onClick={onToggleMute}
                    className="flex flex-col items-center gap-1 text-white"
                    aria-label={muted ? 'Unmute' : 'Mute'}
                >
                    {muted ? (
                        <svg
                            width="30"
                            height="30"
                            viewBox="0 0 24 24"
                            fill="white"
                            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }}
                            className="transition-transform active:scale-110"
                        >
                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                        </svg>
                    ) : (
                        <svg
                            width="30"
                            height="30"
                            viewBox="0 0 24 24"
                            fill="white"
                            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }}
                            className="transition-transform active:scale-110"
                        >
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Bottom overlay — owner, caption, product card */}
            <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="pr-16">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                            {(reel.owner?.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white text-sm font-semibold drop-shadow">
                            {reel.owner?.name || 'Creator'}
                        </span>
                    </div>
                    {reel.caption && (
                        <p className="text-white/90 text-sm mb-3 line-clamp-2 drop-shadow">
                            {reel.caption}
                        </p>
                    )}
                </div>

                {/* Product card */}
                {reel.product && (
                    <div className="flex items-center gap-3 bg-white/95 rounded-xl p-2.5 pr-3 shadow-lg">
                        <button
                            onClick={handleBuy}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                            <img
                                src={reel.product.mainImage || '/placeholder.png'}
                                alt={reel.product.productName}
                                className="h-12 w-12 rounded-lg object-cover flex-shrink-0 bg-neutral-100"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-neutral-900 line-clamp-1">
                                    {reel.product.productName}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold text-neutral-900">
                                        ₹{price}
                                    </span>
                                    {mrp && (
                                        <span className="text-xs text-neutral-400 line-through">
                                            ₹{mrp}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                        <button
                            onClick={handleBuy}
                            className="flex-shrink-0 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold active:scale-95 transition-transform"
                        >
                            Buy
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(ReelPlayer);
