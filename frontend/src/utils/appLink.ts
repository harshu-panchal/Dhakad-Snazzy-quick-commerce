/**
 * Shared-reel link helpers (Android app handoff).
 *
 * Canonical share URL: `${site}/reels/:id`. It always works in a browser, and
 * once the Android wrapper (package ANDROID_PACKAGE) declares App Links for
 * `/reels/*` (+ the site serves /.well-known/assetlinks.json), Android opens
 * the app directly when that URL is tapped — no redirect page involved.
 *
 * The `intent:` URL below is only for the "Open in app" button shown to
 * viewers who are already in an Android browser (e.g. an in-app browser that
 * doesn't honor App Links). Chrome only launches activities that declare a
 * BROWSABLE intent-filter, so until the wrapper adds one this simply falls
 * back to `browser_fallback_url` — safe to ship before the wrapper update.
 */

export const ANDROID_PACKAGE: string =
    import.meta.env.VITE_ANDROID_PACKAGE || 'com.dhakad.user';

/** Public site origin used in share links (override when the app WebView's origin differs). */
export function getPublicSiteUrl(): string {
    const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
    return (configured || window.location.origin).replace(/\/$/, '');
}

export function buildReelShareUrl(reelId: string): string {
    return `${getPublicSiteUrl()}/reels/${reelId}`;
}

export function isAndroid(): boolean {
    return /android/i.test(navigator.userAgent);
}

/**
 * True inside an Android System WebView — which is what the Flutter wrapper
 * renders the site in. Android adds "wv" to the WebView user agent
 * ("...; wv) AppleWebKit..."). Used so the app never offers to open itself.
 */
export function isInAppWebView(): boolean {
    return /;\s*wv\)/.test(navigator.userAgent);
}

/** Show "Open in app" only to Android browsers, never inside the app itself. */
export function shouldOfferOpenInApp(): boolean {
    return isAndroid() && !isInAppWebView();
}

/**
 * Android intent that opens `targetUrl` in the app's App Links activity, or
 * goes to `browser_fallback_url` when the app isn't installed / doesn't (yet)
 * handle the link. Falls back to VITE_APP_DOWNLOAD_URL when configured,
 * otherwise back to the reel page itself.
 */
export function buildAppIntentUrl(targetUrl: string): string {
    const url = new URL(targetUrl);
    const fallback =
        (import.meta.env.VITE_APP_DOWNLOAD_URL as string | undefined) || targetUrl;
    const hostAndPath = `${url.host}${url.pathname}${url.search}`;
    const scheme = url.protocol.replace(':', '');
    return (
        `intent://${hostAndPath}#Intent;` +
        `scheme=${scheme};` +
        `action=android.intent.action.VIEW;` +
        `package=${ANDROID_PACKAGE};` +
        `S.browser_fallback_url=${encodeURIComponent(fallback)};` +
        `end`
    );
}
