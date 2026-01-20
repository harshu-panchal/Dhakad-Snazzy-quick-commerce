import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getAuthToken,
  removeAuthToken,
  setAuthToken,
} from "../services/api/config";

interface User {
  id: string;
  userType?: "Admin" | "Seller" | "Customer" | "Delivery";
  [key: string]: any;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        // Ensure userType is set for backward compatibility
        // If user is authenticated but userType is missing, we'll infer it from context
        // For now, we'll set it when needed in OrdersContext
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

  // Effect to sync state if localStorage changes externally or on mount validation
  useEffect(() => {
    const storedToken = getAuthToken();
    const storedUser = localStorage.getItem("userData");

    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // Ensure userType is set for backward compatibility
        // If missing, we'll let OrdersContext handle it based on context
        // Only update if state doesn't match to avoid loops
        if (!isAuthenticated || token !== storedToken) {
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

  const login = (newToken: string, userData: User) => {
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    setAuthToken(newToken);
    localStorage.setItem("userData", JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    removeAuthToken();
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    localStorage.setItem("userData", JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        token,
        login,
        logout,
        updateUser,
      }}>
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
