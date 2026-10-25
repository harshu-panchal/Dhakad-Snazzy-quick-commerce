import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPostLoginRedirect } from "../utils/authRedirect";

interface PublicRouteProps {
    children?: React.ReactNode;
    userType?: 'Admin' | 'Seller' | 'Customer' | 'Delivery';
}

export default function PublicRoute({ children, userType: allowedUserType }: PublicRouteProps) {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();

    if (isAuthenticated && user) {
        // Redirect authenticated users to their respective dashboards
        const currentUserType = (user as any).userType || (user as any).role;

        // If an allowedUserType is specified (e.g., 'Seller' for SellerLogin),
        // ONLY redirect if the logged-in user matches that type.
        // This allows a logged-in 'Customer' to see the 'Seller' login page.
        if (allowedUserType && currentUserType !== allowedUserType) {
            return children ? <>{children}</> : <Outlet />;
        }

        if (currentUserType === 'Admin' || currentUserType === 'Super Admin') {
            return <Navigate to="/admin" replace />;
        }

        if (currentUserType === 'Seller') {
            return <Navigate to="/seller" replace />;
        }

        if (currentUserType === 'Delivery') {
            return <Navigate to="/delivery" replace />;
        }

        // Default for Customer — back to the page that sent them to login
        // (same target Login.tsx navigates to, so the two never disagree)
        return <Navigate to={getPostLoginRedirect(location.state)} replace />;
    }

    return children ? <>{children}</> : <Outlet />;
}
