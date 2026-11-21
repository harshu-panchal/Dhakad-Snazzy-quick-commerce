import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../../../hooks/usePermissions";
import AdminNoAccess from "../pages/AdminNoAccess";

interface AdminPageGuardProps {
  /**
   * Page key required to view this route, or null for a self-service page
   * (the profile) that every admin may open.
   */
  permission: string | null;
  children: ReactNode;
}

/**
 * Route-level permission gate for admin pages.
 *
 * Wraps every entry in adminRoutes.config. The backend enforces the same
 * permission on each endpoint, so this is about not showing someone a page
 * that would only fill with 403s.
 */
export default function AdminPageGuard({ permission, children }: AdminPageGuardProps) {
  const { canView, permissionsLoading, permissions, firstVisiblePath } = usePermissions();

  // Without this, a page refresh renders "no access" for a moment before the
  // authoritative GET /admin/me response lands.
  if (permissionsLoading && permissions.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
          role="status"
          aria-label="Checking permissions"
        />
      </div>
    );
  }

  if (permission === null) {
    return <>{children}</>;
  }

  if (!canView(permission)) {
    // "/admin" is the default landing route. Rather than greeting a role that
    // lacks dashboard access with "no access", send it to the first page it
    // can view. Any other page shows the no-access notice as normal.
    if (permission === "dashboard" && firstVisiblePath && firstVisiblePath !== "/admin") {
      return <Navigate to={firstVisiblePath} replace />;
    }
    return <AdminNoAccess requiredPermission={permission} />;
  }

  return <>{children}</>;
}
