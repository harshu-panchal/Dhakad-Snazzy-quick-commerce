import api, { setAuthToken, removeAuthToken } from '../config';

/**
 * Admin authentication.
 *
 * Login routing:
 *   Super Admin      -> mobile OTP only (sendOTP / verifyOTP)
 *   every other role -> email + password (login)
 *
 * The server replies 403 with a code when the wrong path is used:
 *   OTP_LOGIN_REQUIRED      - this is a Super Admin, use OTP
 *   PASSWORD_LOGIN_REQUIRED - this is not a Super Admin, use email + password
 */

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  role: string;
  userType?: 'Admin';
  isSuperAdmin?: boolean;
}

export interface AdminSessionPayload {
  token: string;
  user: AdminUser;
  /** `<pageKey>:<tier>` strings, or ["*"] for Super Admin. */
  permissions: string[];
}

export interface AdminSessionResponse {
  success: boolean;
  message: string;
  data: AdminSessionPayload;
}

export interface SendOTPResponse {
  success: boolean;
  message: string;
}

export interface SimpleResponse {
  success: boolean;
  message: string;
}

/** Persist what the app needs before AuthContext picks it up. */
function persist(payload: AdminSessionPayload): void {
  setAuthToken(payload.token);
  localStorage.setItem(
    'userData',
    JSON.stringify({ ...payload.user, userType: 'Admin' }),
  );
  if (payload.permissions) {
    localStorage.setItem('adminPermissions', JSON.stringify(payload.permissions));
  }
}

/**
 * Email + password login. Rejected for Super Admin accounts.
 */
export const login = async (
  email: string,
  password: string,
): Promise<AdminSessionResponse> => {
  const response = await api.post<AdminSessionResponse>('/auth/admin/login', {
    email,
    password,
  });

  if (response.data.success && response.data.data?.token) {
    persist(response.data.data);
  }

  return response.data;
};

/**
 * Send OTP to a Super Admin's mobile number. Rejected for every other role.
 */
export const sendOTP = async (mobile: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/admin/send-otp', { mobile });
  return response.data;
};

/**
 * Verify OTP and sign in a Super Admin.
 */
export const verifyOTP = async (
  mobile: string,
  otp: string,
): Promise<AdminSessionResponse> => {
  const response = await api.post<AdminSessionResponse>('/auth/admin/verify-otp', {
    mobile,
    otp,
  });

  if (response.data.success && response.data.data?.token) {
    persist(response.data.data);
  }

  return response.data;
};

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 *
 * Called by the axios interceptor in services/api/config.ts, not usually by
 * application code.
 */
export const refreshSession = async (): Promise<AdminSessionResponse> => {
  const response = await api.post<AdminSessionResponse>('/auth/admin/refresh');

  if (response.data.success && response.data.data?.token) {
    persist(response.data.data);
  }

  return response.data;
};

/**
 * End this session on the server and clear local state.
 */
export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/admin/logout');
  } catch {
    // Signing out locally must succeed even if the server call does not.
  } finally {
    removeAuthToken();
    localStorage.removeItem('adminPermissions');
  }
};

/**
 * End every session for this admin, on all devices.
 */
export const logoutAllDevices = async (): Promise<SimpleResponse> => {
  const response = await api.post<SimpleResponse>('/auth/admin/logout-all');
  removeAuthToken();
  localStorage.removeItem('adminPermissions');
  return response.data;
};

/**
 * Request a password reset link.
 *
 * Always resolves with the same message whether or not the email belongs to an
 * account — the server does not disclose which addresses exist.
 */
export const forgotPassword = async (email: string): Promise<SimpleResponse> => {
  const response = await api.post<SimpleResponse>('/auth/admin/forgot-password', {
    email,
  });
  return response.data;
};

/**
 * Complete a password reset using the emailed token.
 */
export const resetPassword = async (
  token: string,
  password: string,
): Promise<SimpleResponse> => {
  const response = await api.post<SimpleResponse>('/auth/admin/reset-password', {
    token,
    password,
  });
  return response.data;
};
