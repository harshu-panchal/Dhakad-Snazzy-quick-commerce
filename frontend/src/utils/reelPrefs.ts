/** Reels mute preference, persisted across sessions (default: muted). */
const MUTE_PREF_KEY = 'reelsMuted';

export function readReelsMutedPref(): boolean {
    try {
        const stored = localStorage.getItem(MUTE_PREF_KEY);
        return stored === null ? true : stored === 'true';
    } catch {
        return true;
    }
}

export function writeReelsMutedPref(muted: boolean): void {
    try {
        localStorage.setItem(MUTE_PREF_KEY, String(muted));
    } catch {
        // ignore storage failures (private mode etc.)
    }
}
