import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGES,
  PAGE_KEYS,
  ALL_PERMISSIONS,
  LOOKUP_ENDPOINTS,
  SELF_SERVICE_ENDPOINTS,
  normalizePermissions,
  tierForMethod,
  isValidPermission,
  permissionCatalog,
  ORDER_PAGES,
  groupPages,
} from "../../config/permissions";

/* --------------------------- catalog integrity --------------------------- */

test("page keys are unique", () => {
  assert.equal(new Set(PAGE_KEYS).size, PAGE_KEYS.length);
});

test("page paths are unique", () => {
  const paths = PAGES.map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("every page yields exactly a view and a manage permission", () => {
  assert.equal(ALL_PERMISSIONS.length, PAGES.length * 2);
  for (const page of PAGES) {
    assert.ok(isValidPermission(`${page.key}:view`), `${page.key}:view missing`);
    assert.ok(isValidPermission(`${page.key}:manage`), `${page.key}:manage missing`);
  }
});

test("page keys use the group they declare as their prefix", () => {
  for (const page of PAGES) {
    if (page.group === "dashboard") continue; // single bare key
    assert.ok(
      page.key.startsWith(`${page.group}.`),
      `${page.key} declares group "${page.group}" but does not use it as a prefix`,
    );
  }
});

test("every page has a non-empty label and an /admin path", () => {
  for (const page of PAGES) {
    assert.ok(page.label.trim().length > 0, `${page.key} has no label`);
    assert.ok(page.path.startsWith("/admin"), `${page.key} path is not under /admin`);
  }
});

test("permission catalog covers every page exactly once", () => {
  const groups = permissionCatalog();
  const keys = groups.flatMap((g) => g.pages.map((p) => p.key));
  assert.equal(keys.length, PAGES.length);
  assert.deepEqual([...keys].sort(), [...PAGE_KEYS].sort());
});

test("ORDER_PAGES is the whole orders group", () => {
  assert.deepEqual([...ORDER_PAGES].sort(), [...groupPages("orders")].sort());
  assert.ok(ORDER_PAGES.length >= 9);
});

/* ------------------------------- allowlists ------------------------------ */

test("lookup endpoints are all distinct and rooted", () => {
  assert.equal(new Set(LOOKUP_ENDPOINTS).size, LOOKUP_ENDPOINTS.length);
  for (const endpoint of LOOKUP_ENDPOINTS) {
    assert.ok(endpoint.startsWith("/"), `${endpoint} must start with /`);
    assert.ok(!endpoint.endsWith("/"), `${endpoint} must not end with /`);
    // A lookup must be a concrete path. A parameterised one would widen the
    // allowlist to arbitrary records.
    assert.ok(!endpoint.includes(":"), `${endpoint} must not be parameterised`);
  }
});

test("self-service endpoints are distinct and rooted", () => {
  assert.equal(new Set(SELF_SERVICE_ENDPOINTS).size, SELF_SERVICE_ENDPOINTS.length);
  for (const endpoint of SELF_SERVICE_ENDPOINTS) {
    assert.ok(endpoint.startsWith("/"), `${endpoint} must start with /`);
    assert.ok(!endpoint.includes(":"), `${endpoint} must not be parameterised`);
  }
});

/* --------------------------------- tiers --------------------------------- */

test("tier is derived from the HTTP method", () => {
  assert.equal(tierForMethod("GET"), "view");
  assert.equal(tierForMethod("HEAD"), "view");
  assert.equal(tierForMethod("POST"), "manage");
  assert.equal(tierForMethod("PUT"), "manage");
  assert.equal(tierForMethod("PATCH"), "manage");
  assert.equal(tierForMethod("DELETE"), "manage");
});

/* --------------------------- normalizePermissions ------------------------ */

test("normalizePermissions drops unknown entries", () => {
  const result = normalizePermissions([
    "orders.pending:view",
    "not.a.page:view",
    "orders.pending:destroy",
    "",
    42,
    null,
  ]);
  assert.deepEqual(result, ["orders.pending:view"]);
});

test("normalizePermissions refuses the wildcard", () => {
  assert.deepEqual(normalizePermissions(["*"]), []);
  assert.deepEqual(normalizePermissions(["*", "dashboard:view"]), ["dashboard:view"]);
});

test("normalizePermissions adds the implied view for every manage", () => {
  assert.deepEqual(normalizePermissions(["orders.pending:manage"]), [
    "orders.pending:manage",
    "orders.pending:view",
  ]);
});

test("normalizePermissions de-duplicates and sorts", () => {
  const result = normalizePermissions([
    "dashboard:view",
    "dashboard:view",
    "catalog.brand:view",
  ]);
  assert.deepEqual(result, ["catalog.brand:view", "dashboard:view"]);
});

test("normalizePermissions tolerates non-array input", () => {
  assert.deepEqual(normalizePermissions(undefined), []);
  assert.deepEqual(normalizePermissions("orders.pending:view"), []);
  assert.deepEqual(normalizePermissions({}), []);
});

test("normalizePermissions trims whitespace", () => {
  assert.deepEqual(normalizePermissions(["  dashboard:view  "]), ["dashboard:view"]);
});
