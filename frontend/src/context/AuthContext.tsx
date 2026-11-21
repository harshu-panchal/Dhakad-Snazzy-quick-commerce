import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  getAuthToken,
  removeAuthToken,
  setAuthToken,
} from "../services/api/config";
import { hasPermission, WILDCARD, type Tier } from "../modules/admin/permissions/catalog";

export interface CityScope {
  all: boolean;
  cityIds: string[];
}

interface User {
  id: string;
  userType?: "Admin" | "Seller" | "Customer" | "Delivery";
  [key: string]: any;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (
    token: string,
    userData: User,
    permissions?: string[],
    cityScope?: CityScope,
  ) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
  /**
   * Admin page permissions, as `<pageKey>:<tier>` strings. ["*"] for Super
   * Admin. Empty for non-admin user types.
   *
   * Authoritative copy comes from GET /admin/me on mount; the localStorage
   * copy only avoids a blank first paint. Tampering with it changes what the
   * menu draws and nothing else, because every endpoint re-checks.
   */
  permissions: string[];
  /**
   * The towns this admin may see. `all` for Super Admin and for an admin
   * granted every town; otherwise the listed town ids (possibly none).
   * Like permissions, the server is the authority; this only shapes the UI.
   */
  cityScope: CityScope;
  isSuperAdmin: boolean;
  /** True while the authoritative permission fetch is still in flight. */
  permissionsLoading: boolean;
  can: (pageKey: string, tier?: Tier) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const inferLegacyUserType = (
  userData: Record<string, any>,
): User["userType"] | undefined => {
  if (!userData || typeof userData !== "object") {
    return undefined;
  }

  if (userData.userType) {
    return userData.userType;
  }

  if (userData.role === "Admin" || userData.role === "Super Admin") {
    return "Admin";
  }

  if (userData.storeName || userData.sellerName) {
    return "Seller";
  }

  if (
    userData.mobile &&
    userData.city &&
    userData.status &&
    !userData.phone &&
    !userData.storeName &&
    !userData.sellerName &&
    !userData.role
  ) {
    return "Delivery";
  }

  if (userData.phone || userData.walletAmount !== undefined || userData.refCode) {
    return "Customer";
  }

  return undefined;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state synchronously from localStorage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const storedToken = getAuthToken();
    const storedUser = localStorage.getItem("userData");
    return !!(storedToken && storedUser);
  });

  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem("userData");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        const inferredUserType = inferLegacyUserType(userData);
        if (inferredUserType && !userData.userType) {
          userData.userType = inferredUserType;
        }
        return userData;
      } catch (error) {
        return null;
      }
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return getAuthToken();
  });

  // Seeded from localStorage so the sidebar can render on first paint, then
  // replaced by the authoritative GET /admin/me response below.
  const [permissions, setPermissions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("adminPermissions");
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Fail closed until the server says otherwise: no towns.
  const [cityScope, setCityScope] = useState<CityScope>(() => {
    try {
      const stored = localStorage.getItem("adminCityScope");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed && typeof parsed.all === "boolean" && Array.isArray(parsed.cityIds)) {
        return parsed as CityScope;
      }
    } catch {
      // fall through to the closed default
    }
    return { all: false, cityIds: [] };
  });

  const [permissionsLoading, setPermissionsLoading] = useState<boolean>(false);

  // Effect to sync state if localStorage changes externally or on mount validation
  useEffect(() => {
    const storedToken = getAuthToken();
    const storedUser = localStorage.getItem("userData");

    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        const inferredUserType = inferLegacyUserType(userData);
        if (inferredUserType && !userData.userType) {
          userData.userType = inferredUserType;
          localStorage.setItem("userData", JSON.stringify(userData));
        }
        // Only update if state doesn't match to avoid loops
        if (!isAuthenticated || token !== storedToken || JSON.stringify(user) !== JSON.stringify(userData)) {
          setToken(storedToken);
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (error) {
        removeAuthToken();
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } else if (isAuthenticated) {
      // Logged out
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user?.userType !== "Customer" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    import("../services/pushNotificationService").then(({ registerFCMToken }) => {
      void registerFCMToken(true);
    });
  }, [isAuthenticated, user?.id, user?.userType]);

  /**
   * Re-read identity and permissions from the server. Called on mount for an
   * admin session, and available to callers that change the current user's
   * role or need to pick up a role edit without a reload.
   */
  const refreshPermissions = useCallback(async () => {
    if (!getAuthToken()) return;

    setPermissionsLoading(true);
    try {
      const { getMe } = await import("../services/api/admin/adminProfileService");
      const response = await getMe();
      const next = response?.data;

      if (next?.permissions) {
        setPermissions(next.permissions);
        localStorage.setItem("adminPermissions", JSON.stringify(next.permissions));
      }

      if (next?.cityScope) {
        setCityScope(next.cityScope);
        localStorage.setItem("adminCityScope", JSON.stringify(next.cityScope));
      }

      if (next?.user) {
        setUser((current) => {
          const merged = { ...(current || {}), ...next.user, userType: "Admin" as const };
          localStorage.setItem("userData", JSON.stringify(merged));
          return merged;
        });
      }
    } catch (error) {
      // A 401 is handled by the axios interceptor (refresh, then redirect).
      // Anything else leaves the cached permissions in place rather than
      // locking the user out of a panel they can legitimately use.
      console.error("Failed to refresh admin permissions", error);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  // Admin sessions always confirm their permissions against the server.
  useEffect(() => {
    if (!isAuthenticated) return;

    const userType = user?.userType || (user as any)?.role;
    const isAdmin =
      userType === "Admin" || userType === "Super Admin" || user?.userType === "Admin";

    if (!isAdmin) return;

    void refreshPermissions();
    // Intentionally keyed on identity, not on `user`, so an unrelated profile
    // edit does not refetch.
  }, [isAuthenticated, user?.id, refreshPermissions]);

  const login = useCallback((newToken: string, userData: User, newPermissions?: string[], newCityScope?: CityScope) => {
    const inferredUserType = inferLegacyUserType(userData);
    const normalizedUserData = inferredUserType && !userData.userType
      ? { ...userData, userType: inferredUserType }
      : userData;
    setToken(newToken);
    setUser(normalizedUserData);
    setIsAuthenticated(true);
    setAuthToken(newToken);
    localStorage.setItem("userData", JSON.stringify(normalizedUserData));

    if (newPermissions) {
      setPermissions(newPermissions);
      localStorage.setItem("adminPermissions", JSON.stringify(newPermissions));
    }

    if (newCityScope) {
      setCityScope(newCityScope);
      localStorage.setItem("adminCityScope", JSON.stringify(newCityScope));
    }

    // Customer browser permission is requested only from the explicit Account
    // setting. Operational seller/delivery/admin apps retain login registration.
    const userType = inferredUserType;
    if (userType !== "Customer" || (typeof Notification !== "undefined" && Notification.permission === "granted")) import("../services/pushNotificationService").then(({ registerFCMToken }) => {
      registerFCMToken(true)
        .then(() => {
          // Send test notification after successful token registration
          const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

          fetch(`${apiUrl}/fcm-tokens/test`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${newToken}`,
              'Content-Type': 'application/json'
            }
          })
            .then(response => response.json())
            .then(data => {
              console.log('✅ Test notification sent:', data);
              if (data.success) {
                console.log(`📬 Notification sent to ${data.details?.totalTokens} device(s)`);
              }
            })
            .catch(error => {
              console.error('❌ Failed to send test notification:', error);
            });
        })
        .catch((error) => {
          console.error("Failed to register FCM token:", error);
        });
    });
  }, []);

  const logout = useCallback(() => {
    const currentToken = token;
    // Start token removal while the old JWT is still available. The service
    // receives it explicitly so clearing local storage cannot race the request.
    import("../services/pushNotificationService").then(({ removeFCMToken }) => {
      removeFCMToken(currentToken).catch((error) => {
        console.error("Failed to remove FCM token:", error);
      });
    });

    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setPermissions([]);
    setCityScope({ all: false, cityIds: [] });
    localStorage.removeItem("adminPermissions");
    localStorage.removeItem("adminCityScope");
    removeAuthToken();

  }, [token]);

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
    localStorage.setItem("userData", JSON.stringify(userData));
  }, []);

  const isSuperAdmin = useMemo(
    () => permissions.includes(WILDCARD),
    [permissions]
  );

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const can = useCallback(
    (pageKey: string, tier: Tier = "view") =>
      hasPermission(permissionSet, pageKey, tier),
    [permissionSet]
  );

  const value = useMemo(
    () => ({
      isAuthenticated,
      user,
      token,
      login,
      logout,
      updateUser,
      permissions,
      cityScope,
      isSuperAdmin,
      permissionsLoading,
      can,
      refreshPermissions,
    }),
    [
      isAuthenticated,
      user,
      token,
      login,
      logout,
      updateUser,
      permissions,
      cityScope,
      isSuperAdmin,
      permissionsLoading,
      can,
      refreshPermissions,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
