import test from "node:test";
import assert from "node:assert/strict";
import {
  requirePages,
  requireTiered,
  requireSuperAdmin,
  allowSelfServiceAndLookups,
} from "../../middleware/permissions";
import type { AdminContext } from "../../services/adminPermissionService";

/**
 * Behaviour of the permission middleware, exercised with stub req/res objects.
 * No database and no HTTP server needed.
 */

function ctx(permissions: string[], overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    adminId: "64b7f0000000000000000001",
    email: "someone@example.com",
    roleName: "Order Manager",
    isSuperAdmin: false,
    isActive: true,
    tokenVersion: 0,
    permissions: new Set(permissions),
    scope: { all: false, cityIds: [] },
    ...overrides,
  };
}

interface Result {
  nexted: boolean;
  status?: number;
  body?: any;
  req: any;
}

function run(middleware: any, options: { method: string; path?: string; adminContext?: AdminContext }): Result {
  const result: Result = { nexted: false, req: null };

  const req: any = {
    method: options.method,
    path: options.path ?? "/anything",
    adminContext: options.adminContext,
  };

  const res: any = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(payload: any) {
      result.body = payload;
      return res;
    },
  };

  middleware(req, res, () => {
    result.nexted = true;
  });

  result.req = req;
  return result;
}

/* --------------------------------- tiers --------------------------------- */

test("view permission allows GET", () => {
  const out = run(requirePages(["orders.pending"]), {
    method: "GET",
    adminContext: ctx(["orders.pending:view"]),
  });
  assert.equal(out.nexted, true);
  assert.equal(out.req.grantedPageKey, "orders.pending");
});

test("view permission refuses every write method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const out = run(requirePages(["orders.pending"]), {
      method,
      adminContext: ctx(["orders.pending:view"]),
    });
    assert.equal(out.nexted, false, `${method} should have been refused`);
    assert.equal(out.status, 403);
    assert.equal(out.body.code, "FORBIDDEN");
    assert.deepEqual(out.body.requiredAny, ["orders.pending:manage"]);
  }
});

test("manage permission allows writes", () => {
  const out = run(requirePages(["orders.pending"]), {
    method: "PATCH",
    adminContext: ctx(["orders.pending:manage", "orders.pending:view"]),
  });
  assert.equal(out.nexted, true);
});

test("manage alone does NOT grant view", () => {
  // The role editor adds the implied :view on write, but the check tests the
  // exact tier so a hand-edited database document cannot bypass it.
  const out = run(requirePages(["orders.pending"]), {
    method: "GET",
    adminContext: ctx(["orders.pending:manage"]),
  });
  assert.equal(out.nexted, false);
  assert.equal(out.status, 403);
});

/* ------------------------------ any-of logic ----------------------------- */

test("any one of the listed pages is enough", () => {
  const out = run(requirePages(["orders.all", "orders.pending", "orders.shipped"]), {
    method: "PATCH",
    adminContext: ctx(["orders.pending:manage"]),
  });
  assert.equal(out.nexted, true);
  assert.equal(out.req.grantedPageKey, "orders.pending");
});

test("holding an unrelated page is not enough", () => {
  const out = run(requirePages(["orders.all"]), {
    method: "GET",
    adminContext: ctx(["catalog.brand:view", "marketing.coupon:manage"]),
  });
  assert.equal(out.nexted, false);
  assert.equal(out.status, 403);
});

/* ----------------------------- super admin ------------------------------- */

test("super admin bypasses requirePages with no permissions at all", () => {
  const out = run(requirePages(["settings.roles"]), {
    method: "DELETE",
    adminContext: ctx([], { isSuperAdmin: true, roleName: "Super Admin" }),
  });
  assert.equal(out.nexted, true);
});

test("requireSuperAdmin refuses a non-super admin even with every permission", () => {
  const out = run(requireSuperAdmin(), {
    method: "GET",
    adminContext: ctx(["settings.roles:manage", "settings.system_user:manage"]),
  });
  assert.equal(out.nexted, false);
  assert.equal(out.status, 403);
  assert.equal(out.body.code, "SUPER_ADMIN_REQUIRED");
});

test("requireSuperAdmin allows a super admin", () => {
  const out = run(requireSuperAdmin(), {
    method: "GET",
    adminContext: ctx([], { isSuperAdmin: true }),
  });
  assert.equal(out.nexted, true);
});

/* -------------------------------- no context ----------------------------- */

test("a missing admin context is a 401, not a 403", () => {
  const out = run(requirePages(["dashboard"]), { method: "GET" });
  assert.equal(out.nexted, false);
  assert.equal(out.status, 401);
});

/* ------------------------------ requireTiered ---------------------------- */

test("requireTiered lets a view-only page read but not write", () => {
  const guard = requireTiered({
    view: ["sellers.list", "sellers.transaction", "sellers.location"],
    manage: ["sellers.list"],
  });

  const read = run(guard, {
    method: "GET",
    adminContext: ctx(["sellers.location:view"]),
  });
  assert.equal(read.nexted, true);

  const write = run(guard, {
    method: "DELETE",
    adminContext: ctx(["sellers.location:view", "sellers.location:manage"]),
  });
  assert.equal(write.nexted, false, "sellers.location:manage must not permit deleting a seller");
  assert.equal(write.status, 403);
  assert.deepEqual(write.body.requiredAny, ["sellers.list:manage"]);
});

test("requireTiered lets the owning page write", () => {
  const guard = requireTiered({
    view: ["sellers.list", "sellers.transaction"],
    manage: ["sellers.list"],
  });

  const out = run(guard, {
    method: "DELETE",
    adminContext: ctx(["sellers.list:manage", "sellers.list:view"]),
  });
  assert.equal(out.nexted, true);
});

/* -------------------------------- allowlist ------------------------------ */

test("self-service paths are flagged for any method", () => {
  for (const method of ["GET", "PUT", "POST"]) {
    const out = run(allowSelfServiceAndLookups, { method, path: "/profile" });
    assert.equal(out.nexted, true);
    assert.equal(out.req.skipPermissionCheck, true, `${method} /profile should be allowlisted`);
  }
});

test("lookup paths are flagged for GET only", () => {
  const read = run(allowSelfServiceAndLookups, { method: "GET", path: "/categories" });
  assert.equal(read.req.skipPermissionCheck, true);

  const write = run(allowSelfServiceAndLookups, { method: "POST", path: "/categories" });
  assert.notEqual(write.req.skipPermissionCheck, true);
});

test("a path outside the allowlist is not flagged", () => {
  const out = run(allowSelfServiceAndLookups, { method: "GET", path: "/system-users" });
  assert.notEqual(out.req.skipPermissionCheck, true);
});

test("allowlist matching is exact, not by prefix", () => {
  // "/products" is a lookup; "/products/68f2.../something" must not inherit it.
  const out = run(allowSelfServiceAndLookups, {
    method: "GET",
    path: "/products/68f2abc/variants",
  });
  assert.notEqual(out.req.skipPermissionCheck, true);
});

test("a flagged request bypasses requirePages entirely", () => {
  const guard = requirePages(["settings.system_user"]);
  const result: any = { nexted: false };
  const req: any = { method: "GET", path: "/categories", skipPermissionCheck: true };
  const res: any = {
    status() { return res; },
    json() { return res; },
  };
  guard(req, res, () => { result.nexted = true; });
  assert.equal(result.nexted, true);
});
