import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

// Base API URL - adjust based on your backend URL
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

// Socket.io base URL - extract from API_BASE_URL by removing /api/v1
// Socket connections need the base server URL without the API path
export const getSocketBaseURL = (): string => {
  // Use VITE_API_URL if explicitly set (for socket connections)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Otherwise, extract base URL from VITE_API_BASE_URL
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

  // Remove /api/v1 or /api from the end
  const socketUrl = apiBaseUrl.replace(/\/api\/v\d+$|\/api$/, '');

  return socketUrl || "http://localhost:5000";
};

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
  // The admin refresh token travels in an httpOnly cookie. The panel and the
  // API are on different subdomains, so the cookie is cross-site and only
  // sent when credentials are enabled.
  withCredentials: true,
});

// Request interceptor - Add token to requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("authToken");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Admin access tokens are short-lived (15 min) and renewed from the httpOnly
 * refresh cookie.
 *
 * Concurrent 401s must share one refresh call: the server rotates refresh
 * tokens and treats a replayed one as theft, so six parallel requests firing
 * six refreshes would revoke the whole session. Everything queues behind
 * `refreshInFlight`.
 */
let refreshInFlight: Promise<string | null> | null = null;

const isAdminRequest = (url?: string): boolean => {
  if (!url) return false;
  return url.includes("/admin") || url.includes("/auth/admin");
};

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // Bare axios, not `api`: going through the instance would recurse into
        // this interceptor if the refresh itself returns 401.
        const response = await axios.post(
          `${API_BASE_URL}/auth/admin/refresh`,
          {},
          { withCredentials: true },
        );

        const payload = response.data?.data;
        if (payload?.token) {
          localStorage.setItem("authToken", payload.token);
          if (payload.user) {
            localStorage.setItem(
              "userData",
              JSON.stringify({ ...payload.user, userType: "Admin" }),
            );
          }
          if (payload.permissions) {
            localStorage.setItem(
              "adminPermissions",
              JSON.stringify(payload.permissions),
            );
          }
          if (payload.cityScope) {
            localStorage.setItem("adminCityScope", JSON.stringify(payload.cityScope));
          }
          return payload.token as string;
        }
        return null;
      } catch {
        return null;
      } finally {
        // Cleared on the next tick so callers awaiting this promise all see
        // the same result before a new attempt can start.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }

  return refreshInFlight;
}

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: any) => {
    // Only handle 401 (Unauthorized) for auto-logout
    // 403 (Forbidden) means user is authenticated but doesn't have permission - DO NOT LOGOUT
    if (error.response?.status === 401) {
      const original = error.config || {};
      const isAuthEndpointEarly = original.url?.includes("/auth/");

      // One silent refresh attempt per request, for admin endpoints only.
      // `_retried` stops an infinite loop if the renewed token is also
      // rejected.
      if (
        !original._retried &&
        !isAuthEndpointEarly &&
        isAdminRequest(original.url) &&
        localStorage.getItem("authToken")
      ) {
        original._retried = true;
        const token = await refreshAccessToken();

        if (token) {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
        // Refresh failed: fall through to the redirect logic below.
      }
    }

    if (error.response?.status === 401) {
      // Check if this is an authentication endpoint (OTP verification, etc.)
      // Don't redirect for auth endpoints - let the component handle the error
      const isAuthEndpoint = error.config?.url?.includes("/auth/");

      // Check if there was a token in the request (meaning user was logged in)
      const hadToken = error.config?.headers?.Authorization;

      // Only redirect if:
      // 1. It's not an auth endpoint
      // 2. There was a token in the request (user was logged in but token expired)
      // 3. User is not already on login/signup pages
      if (!isAuthEndpoint && hadToken) {
        const currentPath = window.location.pathname;

        // Skip redirect if already on public auth pages (login/signup)
        if (currentPath.includes("/login") || currentPath.includes("/signup")) {
          return Promise.reject(error);
        }

        // Token expired or invalid - clear token and redirect to appropriate login
        // Determine which login page based on the Current URL or API endpoint
        const apiUrl = error.config?.url || "";
        let redirectPath = "/login";

        if (currentPath.includes("/admin/") || apiUrl.includes("/admin/")) {
          redirectPath = "/admin/login";
        } else if (
          currentPath.includes("/seller/") ||
          apiUrl.includes("/seller/") ||
          apiUrl.includes("/sellers")
        ) {
          redirectPath = "/seller/login";
        } else if (
          currentPath.includes("/delivery/") ||
          apiUrl.includes("/delivery/")
        ) {
          redirectPath = "/delivery/login";
        }

        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        localStorage.removeItem("adminPermissions");
        localStorage.removeItem("adminCityScope");
        window.location.href = redirectPath;
      }
      // If no token was present, user is just browsing as guest - don't redirect
      // Just reject the promise so the component can handle it gracefully
    }
    // For 403 and other errors, just reject the promise so the UI can handle it
    return Promise.reject(error);
  }
);

// Token management helpers
export const setAuthToken = (token: string) => {
  localStorage.setItem("authToken", token);
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem("authToken");
};

export const removeAuthToken = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("userData");
  localStorage.removeItem("adminPermissions");
  localStorage.removeItem("adminCityScope");
};

export default api;
