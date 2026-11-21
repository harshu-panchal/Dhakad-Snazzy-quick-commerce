import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { PAGES, type Tier } from "../modules/admin/permissions/catalog";

/**
 * Permission helpers for admin pages.
 *
 * Gate UI with these, but remember the backend is the enforcement boundary —
 * hiding a button is a courtesy, not a control.
 */
export function usePermissions() {
  const { can, permissions, isSuperAdmin, permissionsLoading, refreshPermissions } = useAuth();

  const canView = useCallback((pageKey: string) => can(pageKey, "view"), [can]);
  const canManage = useCallback((pageKey: string) => can(pageKey, "manage"), [can]);

  /** True when the user can view at least one page in the group. */
  const canViewGroup = useCallback(
    (group: string) =>
      PAGES.some((page) => page.group === group && can(page.key, "view")),
    [can],
  );

  /**
   * The first page this user may view, in catalog order. Used as the landing
   * target for /admin and after login, so a role without dashboard access
   * does not arrive on a page it cannot see.
   */
  const firstVisiblePath = useMemo(() => {
    const page = PAGES.find((p) => can(p.key, "view"));
    return page?.path ?? null;
  }, [can]);

  return {
    can,
    canView,
    canManage,
    canViewGroup,
    firstVisiblePath,
    permissions,
    isSuperAdmin,
    permissionsLoading,
    refreshPermissions,
  };
}

export type { Tier };
export default usePermissions;
