import { PAGES, hasPermission } from "../modules/admin/permissions/catalog";

/**
 * Where an admin should land after signing in, or when they open /admin.
 *
 * "/admin" renders the dashboard, but a role without `dashboard:view` would
 * arrive on a page it cannot see. So resolve to the first page in catalog
 * order that this role can view.
 *
 * Returns "/admin" when permissions are not yet known — AdminPageGuard shows
 * its spinner and then the no-access page if it turns out there is nothing.
 */
export function resolveAdminLanding(permissions: readonly string[] | null | undefined): string {
  if (!permissions || permissions.length === 0) return "/admin";

  if (hasPermission(permissions, "dashboard", "view")) return "/admin";

  const first = PAGES.find((page) => hasPermission(permissions, page.key, "view"));
  return first?.path ?? "/admin";
}

/** Permissions cached in localStorage, for use outside React. */
export function readCachedAdminPermissions(): string[] {
  try {
    const raw = localStorage.getItem("adminPermissions");
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default resolveAdminLanding;
