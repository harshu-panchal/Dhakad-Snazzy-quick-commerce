import Admin from "../models/Admin";
import Role from "../models/Role";
import {
  SUPER_ADMIN_ROLE,
  WILDCARD,
  Tier,
  perm,
} from "../config/permissions";

/**
 * Resolves an admin's effective permissions for a single request.
 *
 * Permissions deliberately do NOT live in the JWT: a role edit has to take
 * effect immediately, and a 7-day token would carry stale permissions until it
 * expired. So they are resolved per request, with the role document cached and
 * the admin document read fresh.
 */

/**
 * The towns an admin may see. `all` means every town (cityIds is then
 * empty and irrelevant); otherwise only the listed towns, and an empty
 * list means none.
 */
export interface AdminScope {
  all: boolean;
  cityIds: string[];
}

export interface AdminContext {
  adminId: string;
  email: string;
  roleName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  tokenVersion: number;
  permissions: Set<string>;
  scope: AdminScope;
}

interface CachedRole {
  permissions: Set<string>;
  isSuperAdmin: boolean;
  isActive: boolean;
  cachedAt: number;
}

const ROLE_CACHE_TTL_MS = Number(process.env.ROLE_CACHE_TTL_MS || 30_000);

/**
 * Role cache. Bounded by the number of roles (a handful), so a plain Map is
 * enough — no Redis, no eviction policy needed. Invalidated synchronously
 * whenever a role is written, with the TTL as a backstop for the case where
 * another process (a script, a second server instance) changes a role.
 */
const roleCache = new Map<string, CachedRole>();

/** Call after any write to a role. Pass no name to clear the whole cache. */
export function invalidateRoleCache(roleName?: string): void {
  if (roleName) {
    roleCache.delete(roleName);
  } else {
    roleCache.clear();
  }
}

async function loadRole(roleName: string): Promise<CachedRole> {
  const cached = roleCache.get(roleName);
  if (cached && Date.now() - cached.cachedAt < ROLE_CACHE_TTL_MS) {
    return cached;
  }

  const role = await Role.findOne({ name: roleName })
    .select("name permissions isActive")
    .lean();

  const permissions = new Set<string>(role?.permissions ?? []);
  const entry: CachedRole = {
    // Super Admin is identified by the wildcard, not by the name alone, so a
    // custom role cannot impersonate it by being named "Super Admin".
    isSuperAdmin: permissions.has(WILDCARD) && roleName === SUPER_ADMIN_ROLE,
    // A missing role resolves to zero permissions rather than throwing: the
    // account stays able to reach its profile and sees an empty menu.
    permissions,
    isActive: role ? role.isActive !== false : false,
    cachedAt: Date.now(),
  };

  roleCache.set(roleName, entry);
  return entry;
}

/**
 * Build the per-request admin context.
 *
 * The Admin document is read on every request and intentionally not cached:
 * it is a single indexed findById with a lean projection, and it is what makes
 * deactivation and forced logout take effect instantly.
 *
 * Returns null when the admin no longer exists.
 */
export async function resolveAdminContext(
  adminId: string,
): Promise<AdminContext | null> {
  const admin = await Admin.findById(adminId)
    .select("email role isActive tokenVersion cityScope")
    .lean();

  if (!admin) return null;

  const role = await loadRole(admin.role);

  return {
    adminId: String(admin._id),
    email: admin.email,
    roleName: admin.role,
    isSuperAdmin: role.isSuperAdmin,
    // An inactive role disables every account holding it, without having to
    // touch the accounts themselves.
    isActive: admin.isActive !== false && role.isActive,
    tokenVersion: admin.tokenVersion ?? 0,
    permissions: role.isActive ? role.permissions : new Set<string>(),
    scope: resolveScope(role.isSuperAdmin, admin.cityScope),
  };
}

/**
 * Resolve the stored scope into what applies to a request.
 *
 * Super Admin is always unrestricted. Anything missing or malformed resolves
 * to "no towns", never "all": a scope that was never set must not grant
 * access to everything.
 */
export function resolveScope(
  isSuperAdmin: boolean,
  stored?: { mode?: string; cityIds?: unknown[] } | null,
): AdminScope {
  if (isSuperAdmin) return { all: true, cityIds: [] };
  if (stored?.mode === "all") return { all: true, cityIds: [] };

  const ids = Array.isArray(stored?.cityIds) ? stored!.cityIds! : [];
  return { all: false, cityIds: [...new Set(ids.map((id) => String(id)))] };
}

/** Does this scope include the given town? An unset town is only visible to `all`. */
export function scopeIncludes(scope: AdminScope, cityId: unknown): boolean {
  if (scope.all) return true;
  if (!cityId) return false;
  return scope.cityIds.includes(String(cityId));
}

/** Does this context hold `pageKey:tier`? Super Admin always does. */
export function contextCan(
  ctx: AdminContext | undefined,
  pageKey: string,
  tier: Tier,
): boolean {
  if (!ctx) return false;
  if (ctx.isSuperAdmin) return true;
  return ctx.permissions.has(perm(pageKey, tier));
}

/**
 * The permission list sent to the frontend by GET /admin/me.
 * Super Admin gets the wildcard; the client treats it as "everything".
 */
export function serializePermissions(ctx: AdminContext): string[] {
  return ctx.isSuperAdmin ? [WILDCARD] : [...ctx.permissions].sort();
}
