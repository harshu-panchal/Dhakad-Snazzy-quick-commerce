import { Request, Response, NextFunction } from "express";
import {
  Tier,
  perm,
  tierForMethod,
  SELF_SERVICE_ENDPOINTS,
  LOOKUP_ENDPOINTS,
} from "../config/permissions";

declare global {
  namespace Express {
    interface Request {
      /** Set when the request matched the self-service / lookup allowlist. */
      skipPermissionCheck?: boolean;
      /** Page key whose permission authorised this request. */
      grantedPageKey?: string;
    }
  }
}

/**
 * Page-level permission enforcement for the admin API.
 *
 * Mounted as path-prefix guards in routes/adminRoutes.ts, e.g.
 *
 *   router.use("/orders", requirePages(ORDER_PAGES));
 *
 * Express applies `router.use(path, mw)` to every method under that prefix,
 * so one line covers a whole section of the router.
 */

/**
 * Marker attached to every guard this module produces.
 *
 * src/tests/rbac/routeCoverage.test.ts walks the admin router's layer stack
 * looking for these, so it can prove that each registered endpoint sits behind
 * a guard. Without the marker the test cannot tell a permission guard apart
 * from any other middleware.
 */
export const RBAC_GUARD = Symbol.for("rbac.guard");

export type GuardKind = "pages" | "tiered" | "super-admin" | "allowlist" | "town-scoped" | "all-towns";

export interface GuardMeta {
  kind: GuardKind;
  pages: readonly string[];
}

export function tag<T extends Function>(fn: T, meta: GuardMeta): T {
  Object.defineProperty(fn, RBAC_GUARD, { value: meta, enumerable: false });
  return fn;
}

export function guardMeta(fn: unknown): GuardMeta | undefined {
  if (typeof fn !== "function") return undefined;
  return (fn as any)[RBAC_GUARD] as GuardMeta | undefined;
}

export interface RequirePagesOptions {
  /**
   * Force a tier instead of deriving it from the HTTP method. Use for a write
   * that a wider set of pages should be able to make, or for a GET that must
   * be treated as privileged.
   */
  tier?: Tier;
}

/**
 * Allow the request if the caller holds `<pageKey>:<tier>` for ANY of
 * `pageKeys`.
 *
 * The "any of" semantics matter: PATCH /admin/orders/:id/status is reachable
 * from eight different order pages, and someone holding only
 * orders.pending:manage must still be able to use it.
 *
 * Requests flagged by `allowSelfServiceAndLookups` pass through untouched.
 */
export const requirePages = (
  pageKeys: readonly string[],
  options: RequirePagesOptions = {},
) => {
  return tag((req: Request, res: Response, next: NextFunction): void => {
    if (req.skipPermissionCheck) {
      next();
      return;
    }

    const ctx = req.adminContext;

    if (!ctx) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (ctx.isSuperAdmin) {
      next();
      return;
    }

    const tier = options.tier ?? tierForMethod(req.method);
    const required = pageKeys.map((key) => perm(key, tier));
    const granted = required.find((p) => ctx.permissions.has(p));

    if (!granted) {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message:
          tier === "manage"
            ? "You do not have permission to perform this action."
            : "You do not have permission to view this page.",
        requiredAny: required,
      });
      return;
    }

    // Recorded by the audit log middleware so each entry shows which
    // permission authorised it.
    req.grantedPageKey = granted.split(":")[0];
    next();
  }, { kind: "pages", pages: pageKeys });
};

/**
 * A guard whose allowed pages differ by tier.
 *
 * For prefixes where several pages legitimately read the same endpoints but
 * only one of them should be able to write them. Example: three seller pages
 * (list, transaction, location) all read /sellers, but deleting a seller
 * belongs to the Manage Seller List page alone.
 */
export const requireTiered = (pages: { view: readonly string[]; manage: readonly string[] }) => {
  const viewGuard = requirePages(pages.view, { tier: "view" });
  const manageGuard = requirePages(pages.manage, { tier: "manage" });

  return tag((req: Request, res: Response, next: NextFunction): void => {
    if (req.skipPermissionCheck) {
      next();
      return;
    }

    if (tierForMethod(req.method) === "view") {
      viewGuard(req, res, next);
      return;
    }

    // A write must satisfy the manage list; it does not additionally need a
    // view grant, since manage is checked against its own page set.
    manageGuard(req, res, next);
  }, { kind: "tiered", pages: [...new Set([...pages.view, ...pages.manage])] });
};

/**
 * Super Admin only, regardless of permissions. Used for destructive
 * maintenance endpoints and for guarding privilege escalation.
 */
export const requireSuperAdmin = () => {
  return tag((req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminContext) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (!req.adminContext.isSuperAdmin) {
      res.status(403).json({
        success: false,
        code: "SUPER_ADMIN_REQUIRED",
        message: "This action is restricted to Super Admin.",
      });
      return;
    }

    next();
  }, { kind: "super-admin", pages: [] });
};

const SELF_SERVICE = new Set<string>(SELF_SERVICE_ENDPOINTS);
const LOOKUPS = new Set<string>(LOOKUP_ENDPOINTS);

/**
 * Flags endpoints every admin may call regardless of role: their own profile,
 * and the read-only lookups that unrelated pages need for dropdowns and
 * pickers.
 *
 * Registered with `router.use(mw)` (no path) before the prefix guards, so
 * req.path here is the path relative to the /admin mount. Matching is exact,
 * so "/products" is allowed while "/products/:id" is not.
 */
const allowSelfServiceAndLookupsImpl = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const path = req.path.replace(/\/+$/, "") || "/";

  if (SELF_SERVICE.has(path)) {
    req.skipPermissionCheck = true;
  } else if ((req.method === "GET" || req.method === "HEAD") && LOOKUPS.has(path)) {
    req.skipPermissionCheck = true;
  }

  next();
};

export const allowSelfServiceAndLookups = tag(allowSelfServiceAndLookupsImpl, {
  kind: "allowlist",
  pages: [],
});
