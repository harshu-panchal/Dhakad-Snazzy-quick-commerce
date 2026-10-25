import { useEffect, useState } from 'react';
import { getReelConfig } from '../services/api/customerReelService';

interface ReelConfig {
    reelCommissionRate: number;
    maxReelSizeMB: number;
}

/** Module-level cache — the rate is global and changes rarely, so the
 *  benefits copy on several screens shouldn't refetch it each time. */
let cached: ReelConfig | null = null;

/**
 * Live reel settings (commission rate / max size) for the "why create a reel"
 * copy. Returns null until loaded so callers can omit the number rather than
 * flash a wrong one.
 */
export function useReelConfig(): ReelConfig | null {
    const [config, setConfig] = useState<ReelConfig | null>(cached);

    useEffect(() => {
        if (cached) return;
        let cancelled = false;
        getReelConfig()
            .then((res) => {
                if (cancelled || !res?.data) return;
                cached = res.data;
                setConfig(res.data);
            })
            .catch(() => {
                // Non-fatal: copy just renders without the percentage.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return config;
}
