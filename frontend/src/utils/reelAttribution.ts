/**
 * Reel purchase attribution (client side).
 *
 * When a customer taps "Buy" on a reel, we remember { productId -> reelId } so
 * that when the order for that product is placed, the reel ID is sent with the
 * order item and the reel owner earns commission. Attribution is short-lived
 * (direct-buy model) and cleared once the product is ordered.
 */

const STORAGE_KEY = 'reelAttributions';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type AttributionMap = Record<string, { reelId: string; ts: number }>;

function read(): AttributionMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as AttributionMap;
        // Drop expired entries on read
        const now = Date.now();
        let changed = false;
        for (const key of Object.keys(parsed)) {
            if (!parsed[key] || now - parsed[key].ts > TTL_MS) {
                delete parsed[key];
                changed = true;
            }
        }
        if (changed) write(parsed);
        return parsed;
    } catch {
        return {};
    }
}

function write(map: AttributionMap): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // ignore storage failures (private mode etc.)
    }
}

/** Record that a product was reached via a reel. */
export function setReelAttribution(productId: string, reelId: string): void {
    if (!productId || !reelId) return;
    const map = read();
    map[productId] = { reelId, ts: Date.now() };
    write(map);
}

/** Get the reel a product is currently attributed to, if any. */
export function getReelAttribution(productId: string): string | undefined {
    if (!productId) return undefined;
    return read()[productId]?.reelId;
}

/** Clear attribution for specific products (call after a successful order). */
export function clearReelAttributions(productIds: string[]): void {
    if (!productIds || productIds.length === 0) return;
    const map = read();
    let changed = false;
    for (const id of productIds) {
        if (map[id]) {
            delete map[id];
            changed = true;
        }
    }
    if (changed) write(map);
}
