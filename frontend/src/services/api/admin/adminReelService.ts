import api from '../config';

export interface AdminReel {
    _id: string;
    videoUrl: string;
    thumbnailUrl?: string;
    caption?: string;
    status: 'Active' | 'Removed';
    likesCount: number;
    sharesCount: number;
    viewsCount: number;
    earnings: number;
    conversions: number;
    createdAt: string;
    customer?: { _id: string; name?: string; phone?: string };
    product?: { _id: string; productName: string; mainImage?: string; price: number };
    seller?: { _id: string; storeName?: string; sellerName?: string; city?: string };
}

export interface ReelStats {
    totalReels: number;
    activeReels: number;
    totalCommissionPaid: number;
    conversions: number;
}

export const getReelStats = async (): Promise<{ success: boolean; data: ReelStats }> => {
    const res = await api.get('/admin/reels/stats');
    return res.data;
};

export const listReels = async (params?: {
    status?: string;
    page?: number;
    limit?: number;
}): Promise<{ success: boolean; data: AdminReel[]; pagination: any }> => {
    const res = await api.get('/admin/reels', { params });
    return res.data;
};

export const updateReelStatus = async (
    id: string,
    status: 'Active' | 'Removed',
): Promise<{ success: boolean; data: AdminReel }> => {
    const res = await api.patch(`/admin/reels/${id}/status`, { status });
    return res.data;
};

export const deleteReel = async (id: string): Promise<{ success: boolean }> => {
    const res = await api.delete(`/admin/reels/${id}`);
    return res.data;
};
