import api from '../config';

export interface AdminProfile {
    id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    role: string;
    createdAt: string;
    updatedAt: string;
}

export interface UpdateProfileData {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
}

export interface ProfileResponse {
    success: boolean;
    message?: string;
    data: AdminProfile;
}

/**
 * Get admin profile
 */
export const getProfile = async (): Promise<ProfileResponse> => {
    const response = await api.get<ProfileResponse>('/admin/profile');
    return response.data;
};

/**
 * Update admin profile
 */
export const updateProfile = async (data: UpdateProfileData): Promise<ProfileResponse> => {
    const response = await api.put<ProfileResponse>('/admin/profile', data);
    return response.data;
};

export interface AdminMeUser {
    id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    role: string;
    userType: 'Admin';
    isSuperAdmin: boolean;
}

export interface AdminMeResponse {
    success: boolean;
    data: {
        user: AdminMeUser;
        /** `<pageKey>:<tier>` strings, or ["*"] for Super Admin. */
        permissions: string[];
    };
}

/**
 * Identity and effective permissions for the signed-in admin.
 *
 * This is the authority on what the current user can do; the copy in
 * localStorage exists only so the sidebar can render before this resolves.
 */
export const getMe = async (): Promise<AdminMeResponse> => {
    const response = await api.get<AdminMeResponse>('/admin/me');
    return response.data;
};

export interface ChangePasswordData {
    currentPassword: string;
    newPassword: string;
}

/**
 * Change your own password. Ends every session, including this one, so the
 * caller must redirect to the login page afterwards.
 */
export const changePassword = async (
    data: ChangePasswordData,
): Promise<{ success: boolean; message: string; data?: { reauthRequired: boolean } }> => {
    const response = await api.post('/admin/profile/change-password', data);
    return response.data as any;
};
