import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ReelPlayer from './components/ReelPlayer';
import Reels from './Reels';
import { getPublicReel, type Reel } from '../../services/api/customerReelService';
import { shareReelLink } from '../../utils/reelShare';
import { readReelsMutedPref, writeReelsMutedPref } from '../../utils/reelPrefs';
import {
    buildAppIntentUrl,
    buildReelShareUrl,
    shouldOfferOpenInApp,
} from '../../utils/appLink';

/**
 * `/reels/:id` — target of shared reel links.
 *
 * - Logged-in customer: the normal feed, opening on the shared reel first.
 * - Anyone else: a public single-reel view (watch, share, buy); liking or
 *   "more reels" routes through login and returns here afterwards.
 *
 * Once the Android wrapper declares App Links for /reels/*, tapping a shared
 * link opens the app directly and this page loads inside its WebView (where
 * the "Open in app" pill is never shown).
 */
export default function SharedReel() {
    const { id } = useParams<{ id: string }>();
    const { isAuthenticated, user } = useAuth();
    const isCustomer = isAuthenticated && user?.userType === 'Customer';

    if (!id) return null;

    return (
        <>
            {isCustomer ? <Reels startReelId={id} /> : <PublicReelView reelId={id} />}
            {shouldOfferOpenInApp() && <OpenInAppBanner reelId={id} />}
        </>
    );
}

function PublicReelView({ reelId }: { reelId: string }) {
    const navigate = useNavigate();
    const routerLocation = useLocation();
    const { showToast } = useToast();

    const [reel, setReel] = useState<Reel | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
    const [muted, setMuted] = useState<boolean>(readReelsMutedPref);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        getPublicReel(reelId)
            .then((res) => {
                if (cancelled) return;
                setReel(res.data);
                setStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setStatus('missing');
            });
        return () => {
            cancelled = true;
        };
    }, [reelId]);

    const persistMuted = useCallback((next: boolean) => {
        setMuted(next);
        writeReelsMutedPref(next);
    }, []);

    // Login returns to this same /reels/:id, which then renders the full feed.
    const goToLogin = useCallback(() => {
        navigate('/login', { state: { from: routerLocation } });
    }, [navigate, routerLocation]);

    const handleShare = useCallback(
        (r: Reel) => {
            void shareReelLink(r, showToast);
        },
        [showToast],
    );

    const goBack = () => {
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate('/');
    };

    return (
        <div className="fixed inset-0 bg-black z-40">
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={goBack} className="text-white p-1" aria-label="Back">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-white text-lg font-bold">Reels</h1>
                <button
                    onClick={goToLogin}
                    className="text-white text-sm font-semibold px-3 py-1.5 rounded-full bg-white/15"
                >
                    More reels
                </button>
            </div>

            {status === 'ready' && reel && (
                <ReelPlayer
                    reel={reel}
                    isActive
                    shouldLoad
                    muted={muted}
                    onToggleMute={() => persistMuted(!muted)}
                    onAutoplayBlocked={() => persistMuted(true)}
                    onLike={goToLogin}
                    onShare={handleShare}
                />
            )}

            {status === 'loading' && (
                <div className="h-full w-full flex items-center justify-center">
                    <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                </div>
            )}

            {status === 'missing' && (
                <div className="h-full w-full flex flex-col items-center justify-center text-center px-8">
                    <p className="text-white text-lg font-semibold mb-1">Reel not available</p>
                    <p className="text-white/60 text-sm mb-5">
                        It may have been removed by its creator.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2.5 rounded-full bg-green-600 text-white font-semibold"
                    >
                        Go to Home
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Android-browser-only prompt to continue in the app. Until the wrapper adds
 * a BROWSABLE (App Links) intent-filter, the intent can't resolve and Chrome
 * falls back to the website, so this is harmless to show already.
 */
function OpenInAppBanner({ reelId }: { reelId: string }) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    const openInApp = () => {
        window.location.href = buildAppIntentUrl(buildReelShareUrl(reelId));
    };

    return (
        <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 flex items-center gap-2 rounded-full bg-white/95 pl-4 pr-1.5 py-1.5 shadow-lg">
            <span className="text-sm font-medium text-neutral-900 whitespace-nowrap">
                Watch in the app
            </span>
            <button
                onClick={openInApp}
                className="rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white"
            >
                Open
            </button>
            <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="h-6 w-6 flex items-center justify-center text-neutral-500"
            >
                ×
            </button>
        </div>
    );
}
