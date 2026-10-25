import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation as useLocationContext } from '../../hooks/useLocation';
import { useToast } from '../../context/ToastContext';
import ReelPlayer from './components/ReelPlayer';
import {
    getReelFeed,
    getPublicReel,
    likeReel as apiLikeReel,
    shareReel as apiShareReel,
    recordReelView,
    type Reel,
} from '../../services/api/customerReelService';
import { shareReelLink } from '../../utils/reelShare';
import { readReelsMutedPref, writeReelsMutedPref } from '../../utils/reelPrefs';

interface ReelsProps {
    /**
     * Open the feed on this reel first (shared `/reels/:id` links), then
     * continue into the normal ranked feed below it.
     */
    startReelId?: string;
}

export default function Reels({ startReelId }: ReelsProps = {}) {
    const navigate = useNavigate();
    const { location, isLocationLoading } = useLocationContext();
    const { showToast } = useToast();

    const [reels, setReels] = useState<Reel[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    // Mute preference persists across sessions (default: muted).
    const [muted, setMuted] = useState<boolean>(readReelsMutedPref);

    const persistMuted = useCallback((next: boolean) => {
        setMuted(next);
        writeReelsMutedPref(next);
    }, []);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);

    // Pull-to-refresh (Instagram-style): dragging down from the very top of the
    // feed forces a fresh shuffle. A plain browser/PWA reload already reshuffles
    // on its own (feedSeedRef resets on remount), but a mobile PWA has no
    // visible reload button, so this is the in-app equivalent.
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const pullStartYRef = useRef<number | null>(null);
    const PULL_THRESHOLD = 70;
    const PULL_MAX = 110;

    const containerRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef(false);
    // The ranked feed order for a scroll session is seeded server-side; page 1
    // always requests a fresh shuffle (seed omitted), and we echo the seed the
    // server returns back on every later page so the ranking stays stable
    // while scrolling, instead of re-shuffling under the user mid-session.
    const feedSeedRef = useRef<string | undefined>(undefined);
    // The shared reel to pin at the top of the feed (startReelId), once loaded.
    const startReelRef = useRef<Reel | null>(null);

    const lat = location?.latitude;
    const lng = location?.longitude;

    // A shared link opened cold has no in-app history, so "back" would leave
    // the site — go home instead in that case.
    const goBack = () => {
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate('/');
    };

    const loadPage = useCallback(
        async (pageNum: number) => {
            if (loadingRef.current || lat == null || lng == null) return;
            loadingRef.current = true;
            setLoading(true);
            try {
                const seedToSend = pageNum === 1 ? undefined : feedSeedRef.current;
                const res = await getReelFeed(lat, lng, pageNum, 5, seedToSend);
                feedSeedRef.current = res.data.feedSeed;
                setReels((prev) => {
                    if (pageNum === 1) {
                        // Keep a shared reel pinned first, without duplicating it
                        // if the ranked feed happens to include it too.
                        const start = startReelRef.current;
                        const rest = res.data.reels.filter((r) => r._id !== start?._id);
                        return start ? [start, ...rest] : rest;
                    }
                    const existing = new Set(prev.map((r) => r._id));
                    const fresh = res.data.reels.filter((r) => !existing.has(r._id));
                    return [...prev, ...fresh];
                });
                setHasMore(res.data.hasMore);
                setPage(pageNum);
            } catch (err) {
                console.error('Failed to load reels', err);
                showToast('Could not load reels', 'error');
            } finally {
                setLoading(false);
                setInitialLoaded(true);
                loadingRef.current = false;
            }
        },
        [lat, lng, showToast],
    );

    // Force a fresh shuffle: drop the current feed seed and reload page 1.
    const doRefresh = useCallback(async () => {
        if (loadingRef.current) return;
        setRefreshing(true);
        feedSeedRef.current = undefined;
        startReelRef.current = null; // a manual refresh is a clean reshuffle
        setActiveIndex(0);
        if (containerRef.current) containerRef.current.scrollTop = 0;
        setReels([]);
        setHasMore(true);
        await loadPage(1);
        setRefreshing(false);
        setPullDistance(0);
    }, [loadPage]);

    // Pull-to-refresh gesture: only engages when the feed is scrolled all the
    // way to the top (first reel), so it never fights with swiping between
    // reels or with the infinite-scroll pagination further down the list.
    const handlePullStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (refreshing) return;
        const el = containerRef.current;
        if (!el || el.scrollTop > 0) return;
        pullStartYRef.current = e.clientY;
    };

    const handlePullMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pullStartYRef.current == null || refreshing) return;
        const el = containerRef.current;
        if (!el || el.scrollTop > 0) {
            // Scrolled away from the top mid-gesture — this isn't a pull anymore.
            pullStartYRef.current = null;
            setPullDistance(0);
            return;
        }
        const delta = e.clientY - pullStartYRef.current;
        setPullDistance(delta > 0 ? Math.min(delta * 0.5, PULL_MAX) : 0);
    };

    const handlePullEnd = () => {
        if (pullStartYRef.current == null) return;
        pullStartYRef.current = null;
        if (pullDistance >= PULL_THRESHOLD) {
            void doRefresh();
        } else {
            setPullDistance(0);
        }
    };

    // Initial load (and reload when location changes) — always a fresh shuffle
    useEffect(() => {
        if (lat != null && lng != null) {
            feedSeedRef.current = undefined;
            setReels(startReelRef.current ? [startReelRef.current] : []);
            setInitialLoaded(false);
            setHasMore(true);
            loadPage(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lng]);

    // Shared link: fetch the target reel and pin it first. Independent of
    // location, so the shared reel shows even before/without a location fix.
    useEffect(() => {
        if (!startReelId) return;
        let cancelled = false;
        getPublicReel(startReelId)
            .then((res) => {
                if (cancelled || !res?.data) return;
                startReelRef.current = res.data;
                setReels((prev) => [res.data, ...prev.filter((r) => r._id !== res.data._id)]);
            })
            .catch(() => {
                if (!cancelled) showToast('This reel is no longer available', 'info');
            });
        return () => {
            cancelled = true;
        };
    }, [startReelId, showToast]);

    // Track the active (in-view) reel via IntersectionObserver
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                        const idx = Number(
                            (entry.target as HTMLElement).dataset.index,
                        );
                        if (!Number.isNaN(idx)) setActiveIndex(idx);
                    }
                });
            },
            { root, threshold: [0.6] },
        );

        const items = root.querySelectorAll('[data-reel-item]');
        items.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [reels.length]);

    // Infinite scroll: load the next page as we approach the end
    useEffect(() => {
        if (hasMore && !loadingRef.current && activeIndex >= reels.length - 2 && reels.length > 0) {
            loadPage(page + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, reels.length, hasMore]);

    const handleLike = useCallback(
        async (reel: Reel) => {
            // Optimistic update
            setReels((prev) =>
                prev.map((r) =>
                    r._id === reel._id
                        ? {
                              ...r,
                              liked: !r.liked,
                              likesCount: r.likesCount + (r.liked ? -1 : 1),
                          }
                        : r,
                ),
            );
            try {
                const res = await apiLikeReel(reel._id);
                setReels((prev) =>
                    prev.map((r) =>
                        r._id === reel._id
                            ? { ...r, liked: res.data.liked, likesCount: res.data.likesCount }
                            : r,
                    ),
                );
            } catch {
                // Revert on failure
                setReels((prev) =>
                    prev.map((r) =>
                        r._id === reel._id
                            ? {
                                  ...r,
                                  liked: reel.liked,
                                  likesCount: reel.likesCount,
                              }
                            : r,
                    ),
                );
            }
        },
        [],
    );

    const handleShare = useCallback(
        async (reel: Reel) => {
            // Shares the canonical /reels/:id link (opens the app once the
            // Android wrapper handles App Links; the website otherwise).
            const shared = await shareReelLink(reel, showToast);
            if (!shared) return;
            // Record the share (best-effort, optimistic count)
            setReels((prev) =>
                prev.map((r) =>
                    r._id === reel._id ? { ...r, sharesCount: r.sharesCount + 1 } : r,
                ),
            );
            apiShareReel(reel._id).catch(() => {});
        },
        [showToast],
    );

    const handleFirstPlay = useCallback((reelId: string) => {
        recordReelView(reelId);
    }, []);

    // Nothing to show: the feed loaded empty, or there's no location to load
    // it with (and no pinned shared reel).
    const showEmptyState =
        reels.length === 0 && (initialLoaded || (!isLocationLoading && lat == null));

    return (
        <div className="fixed inset-0 bg-black z-40">
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
                <button
                    onClick={goBack}
                    className="text-white p-1"
                    aria-label="Back"
                >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-white text-lg font-bold">Reels</h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => navigate('/reels/mine')}
                        className="text-white p-1.5"
                        aria-label="My reels"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </button>
                    <button
                        onClick={() => navigate('/reels/upload')}
                        className="text-white p-1.5"
                        aria-label="Upload reel"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="4" />
                            <path d="M12 8v8M8 12h8" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Pull-to-refresh indicator */}
            {(pullDistance > 0 || refreshing) && (
                <div
                    className="absolute left-1/2 top-16 z-50 -translate-x-1/2 pointer-events-none transition-opacity"
                    style={{
                        transform: `translate(-50%, ${Math.max(pullDistance, refreshing ? 28 : 0) - 28}px)`,
                        opacity: refreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
                    }}
                >
                    <div
                        className={`h-8 w-8 rounded-full border-[3px] border-white/30 border-t-white ${refreshing ? 'animate-spin' : ''}`}
                        style={!refreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : undefined}
                    />
                </div>
            )}

            {/* Feed */}
            <div
                ref={containerRef}
                className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
                style={{
                    scrollSnapType: 'y mandatory',
                    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
                    transition: pullDistance === 0 ? 'transform 0.2s ease-out' : undefined,
                }}
                onPointerDown={handlePullStart}
                onPointerMove={handlePullMove}
                onPointerUp={handlePullEnd}
                onPointerCancel={handlePullEnd}
            >
                {reels.map((reel, idx) => (
                    <div
                        key={reel._id}
                        data-reel-item
                        data-index={idx}
                        className="h-full w-full snap-start"
                    >
                        <ReelPlayer
                            reel={reel}
                            isActive={idx === activeIndex}
                            shouldLoad={Math.abs(idx - activeIndex) <= 1}
                            muted={muted}
                            onToggleMute={() => persistMuted(!muted)}
                            onAutoplayBlocked={() => persistMuted(true)}
                            onLike={handleLike}
                            onShare={handleShare}
                            onFirstPlay={handleFirstPlay}
                        />
                    </div>
                ))}

                {/* Empty / loading states (only when there is nothing to show) */}
                {showEmptyState && (
                    <div className="h-full w-full flex flex-col items-center justify-center text-center px-8">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="mb-4 opacity-60">
                            <rect x="2" y="2" width="20" height="20" rx="5" />
                            <path d="M10 8l6 4-6 4V8z" />
                        </svg>
                        <p className="text-white text-lg font-semibold mb-1">No reels here yet</p>
                        <p className="text-white/60 text-sm mb-5">
                            {lat == null
                                ? 'Enable location to see reels near you.'
                                : 'Be the first to post a reel for products in your area.'}
                        </p>
                        <button
                            onClick={() => navigate('/reels/upload')}
                            className="px-6 py-2.5 rounded-full bg-green-600 text-white font-semibold"
                        >
                            Create a Reel
                        </button>
                    </div>
                )}

                {reels.length === 0 && !showEmptyState && (
                    <div className="h-full w-full flex items-center justify-center">
                        <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                    </div>
                )}

                {/* Loading more (pagination) */}
                {loading && initialLoaded && reels.length > 0 && (
                    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                        <div className="h-7 w-7 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}
