import api from './config';

export interface ReelProduct {
    _id: string;
    productName: string;
    mainImage?: string;
    price: number;
    discPrice?: number;
    compareAtPrice?: number;
    discount?: number;
    seller?: string;
}

export interface ReelOwner {
    _id: string;
    name?: string;
}

export interface Reel {
    _id: string;
    videoUrl: string;
    thumbnailUrl?: string;
    caption?: string;
    durationSec?: number;
    likesCount: number;
    sharesCount: number;
    viewsCount: number;
    liked: boolean;
    isOwner: boolean;
    owner: ReelOwner | null;
    product: ReelProduct | null;
    createdAt: string;
}

export interface ReelFeedResponse {
    success: boolean;
    data: {
        reels: Reel[];
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
        /** Echo back on subsequent page requests to keep this scroll session's ranked order stable. */
        feedSeed: string;
    };
}

/**
 * Location-aware, personalized reel feed. lat/lng are required — the backend
 * only returns reels whose product is deliverable to that location, ranked by
 * a blend of affinity/engagement/recency/randomness.
 *
 * Pass the `feedSeed` the first page returned back in on later pages of the
 * same scroll session to keep the ranked order stable while paginating; omit
 * it (e.g. on a fresh app open) to get a newly shuffled feed.
 */
export const getReelFeed = async (
    lat: number,
    lng: number,
    page = 1,
    limit = 5,
    feedSeed?: string,
): Promise<ReelFeedResponse> => {
    const response = await api.get<ReelFeedResponse>('/customer/reels/feed', {
        params: { lat, lng, page, limit, feedSeed },
    });
    return response.data;
};

/**
 * Upload a reel video (<=400MB) linked to a product.
 */
export const uploadReel = async (
    data: {
        video: File;
        productId: string;
        caption?: string;
        durationSec?: number;
        city?: string;
        state?: string;
    },
    onProgress?: (percent: number) => void,
): Promise<{ success: boolean; data: Reel }> => {
    const form = new FormData();
    form.append('video', data.video);
    form.append('productId', data.productId);
    if (data.caption) form.append('caption', data.caption);
    if (data.durationSec) form.append('durationSec', String(data.durationSec));
    if (data.city) form.append('city', data.city);
    if (data.state) form.append('state', data.state);

    const response = await api.post('/customer/reels', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
            if (onProgress && evt.total) {
                onProgress(Math.round((evt.loaded * 100) / evt.total));
            }
        },
        // Large uploads — give it room
        timeout: 15 * 60 * 1000,
    });
    return response.data;
};

export const likeReel = async (
    id: string,
): Promise<{ success: boolean; data: { liked: boolean; likesCount: number } }> => {
    const response = await api.post(`/customer/reels/${id}/like`);
    return response.data;
};

export const shareReel = async (
    id: string,
): Promise<{ success: boolean; data: { sharesCount: number } }> => {
    const response = await api.post(`/customer/reels/${id}/share`);
    return response.data;
};

export const recordReelView = async (id: string): Promise<void> => {
    try {
        await api.post(`/customer/reels/${id}/view`);
    } catch {
        // best-effort
    }
};

export const getMyReels = async (): Promise<{ success: boolean; data: any[] }> => {
    const response = await api.get('/customer/reels/mine');
    return response.data;
};

export const getReelEarnings = async (): Promise<{ success: boolean; data: any }> => {
    const response = await api.get('/customer/reels/earnings');
    return response.data;
};

export const deleteReel = async (id: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/customer/reels/${id}`);
    return response.data;
};
