import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PAGES, PAGE_KEYS } from "../../config/permissions";
import { INDIAN_STATES } from "../../models/City";

/**
 * Keeps the backend permission catalog, the frontend mirror of it, and the
 * frontend admin route table in agreement.
 *
 * The frontend necessarily duplicates the catalog (its sidebar is a hardcoded
 * array and its route table needs keys at build time). These tests make the
 * duplication safe: drift fails the build instead of silently hiding a menu
 * item or leaving a page ungated.
 *
 * Parsed from source text rather than imported, because the frontend files are
 * TSX in a separate Vite project with its own tsconfig.
 */

const FRONTEND = path.resolve(__dirname, "../../../../frontend/src");
const CATALOG = path.join(FRONTEND, "modules/admin/permissions/catalog.ts");
const ROUTES = path.join(FRONTEND, "modules/admin/adminRoutes.config.tsx");
const SIDEBAR = path.join(FRONTEND, "modules/admin/components/AdminSidebar.tsx");

const read = (file: string): string | null =>
  fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;

/** All `key: "..."` values in the frontend catalog. */
function frontendCatalogKeys(source: string): string[] {
  return [...source.matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** All `permission: "..."` values, e.g. from the route table or sidebar. */
function permissionValues(source: string): string[] {
  return [...source.matchAll(/\bpermission:\s*"([^"]+)"/g)].map((m) => m[1]);
}

test("frontend catalog file exists", () => {
  assert.ok(read(CATALOG), `missing ${CATALOG}`);
});

test("frontend catalog has exactly the backend page keys", () => {
  const source = read(CATALOG);
  assert.ok(source, "frontend catalog not found");

  const frontKeys = frontendCatalogKeys(source!);
  const backKeys = [...PAGE_KEYS];

  const missing = backKeys.filter((k) => !frontKeys.includes(k));
  const extra = frontKeys.filter((k) => !backKeys.includes(k));

  assert.deepEqual(
    missing,
    [],
    `Pages in the backend catalog but not the frontend one: ${missing.join(", ")}`,
  );
  assert.deepEqual(
    extra,
    [],
    `Pages in the frontend catalog but not the backend one: ${extra.join(", ")}`,
  );
  assert.equal(frontKeys.length, backKeys.length, "duplicate keys in the frontend catalog");
});

test("frontend catalog paths match the backend catalog", () => {
  const source = read(CATALOG);
  assert.ok(source);

  // Pair each key with the path declared on the same object literal.
  const pairs = [...source!.matchAll(/\bkey:\s*"([^"]+)"[\s\S]{0,400}?\bpath:\s*"([^"]+)"/g)].map(
    (m) => [m[1], m[2]] as const,
  );

  const backend = new Map(PAGES.map((p) => [p.key, p.path]));
  const mismatched: string[] = [];

  for (const [key, frontPath] of pairs) {
    const backPath = backend.get(key);
    if (backPath && backPath !== frontPath) {
      mismatched.push(`${key}: backend "${backPath}" vs frontend "${frontPath}"`);
    }
  }

  assert.deepEqual(mismatched, [], `Path mismatches:\n  ${mismatched.join("\n  ")}`);
});

test("every admin route permission is a real page key", () => {
  const source = read(ROUTES);
  assert.ok(source, `missing ${ROUTES}`);

  const known = new Set(PAGE_KEYS);
  const unknown = permissionValues(source!).filter((p) => !known.has(p));

  assert.deepEqual(
    unknown,
    [],
    `adminRoutes.config references page keys that do not exist: ${unknown.join(", ")}`,
  );
});

test("every page in the catalog is reachable by a route", () => {
  const source = read(ROUTES);
  assert.ok(source);

  const routed = new Set(permissionValues(source!));
  const unreachable = PAGE_KEYS.filter((key) => !routed.has(key));

  assert.deepEqual(
    unreachable,
    [],
    `Pages with a permission but no route in adminRoutes.config: ${unreachable.join(", ")}. ` +
      `Either add the route or remove the page from the catalog.`,
  );
});

test("every sidebar permission is a real page key", () => {
  const source = read(SIDEBAR);
  assert.ok(source, `missing ${SIDEBAR}`);

  const known = new Set(PAGE_KEYS);
  const unknown = permissionValues(source!).filter((p) => !known.has(p));

  assert.deepEqual(
    unknown,
    [],
    `AdminSidebar references page keys that do not exist: ${unknown.join(", ")}`,
  );
});

test("every navigable sidebar entry carries a permission", () => {
  const source = read(SIDEBAR);
  assert.ok(source);

  // Paths on items that only expand a submenu; their visibility is derived
  // from whether any child survives filtering.
  const PARENT_STUBS = new Set([
    "/admin/product",
    "/admin/manage-seller",
    "/admin/manage-location",
    "/admin/delivery-boy",
    "/admin/orders",
    // The "Category" parent shares its path with its first child.
    "/admin/category",
  ]);

  // A navigable entry looks like:  path: "...",  permission: "..."
  // The optional group owns the whitespace before "permission" — a leading
  // \s* outside it would swallow the newline and the group could never match.
  const entries = [
    ...source!.matchAll(/\bpath:\s*"(\/admin[^"]*)",(\s*permission:\s*"([^"]+)",)?/g),
  ];

  const missing = entries
    .filter(([, p, , perm]) => !perm && !PARENT_STUBS.has(p))
    .map(([, p]) => p);

  assert.deepEqual(
    missing,
    [],
    `Sidebar entries with no permission (they would never render): ${missing.join(", ")}`,
  );
});

test("every catalog page is reachable from the sidebar, or deliberately is not", () => {
  const source = read(SIDEBAR);
  assert.ok(source);

  // Pages with a route but intentionally no sidebar entry (reached by link or
  // URL). Keep this list honest: adding a page here is a decision, not a
  // default. A new page that is missing from the sidebar and not listed here
  // fails this test - which is how "Manage Roles had no menu entry" is caught.
  const NO_SIDEBAR_ENTRY = new Set([
    "dashboard", // rendered as a standalone link above the menu sections
    "catalog.subcategory",
    "catalog.subcategory_order",
    "orders.detail",
    "customers.list",
    "finance.withdrawals",
    "finance.payments",
  ]);

  const inSidebar = new Set(permissionValues(source!));
  const unreachable = PAGE_KEYS.filter(
    (key) => !inSidebar.has(key) && !NO_SIDEBAR_ENTRY.has(key),
  );

  assert.deepEqual(
    unreachable,
    [],
    `Pages with no sidebar entry: ${unreachable.join(", ")}. Add a menu item, or add ` +
      `the page to NO_SIDEBAR_ENTRY if it is deliberately reached another way.`,
  );
});

test("the standalone Dashboard link is permission-gated", () => {
  const source = read(SIDEBAR);
  assert.ok(source);
  assert.match(
    source!,
    /canView\("dashboard"\)[\s\S]{0,200}Dashboard Link|Dashboard Link[\s\S]{0,200}canView\("dashboard"\)/,
    "the Dashboard link must be wrapped in canView(\"dashboard\")",
  );
});

test("db.ts builds indexes for the RBAC models (autoIndex is off in production)", () => {
  // mongoose.set('autoIndex', false) means a model's indexes only exist if db.ts
  // creates them explicitly. Role/AdminSession/AuditLog depend on unique and TTL
  // indexes, so they must be listed. In-memory test databases have autoIndex on
  // and would never reveal this, hence a source check.
  const source = fs.readFileSync(path.resolve(__dirname, "../../config/db.ts"), "utf8");
  for (const model of ["Role", "AdminSession", "AuditLog"]) {
    assert.match(source, new RegExp(`'${model}'`), `db.ts does not create indexes for ${model}`);
  }
});

test("the Towns form's state list matches the backend's", () => {
  // The backend knows short forms as well; the form only offers official names.
  // If the lists drift, a state typed in the form would not match a seller's.
  const file = path.join(FRONTEND, "modules/admin/permissions/indianStates.ts");
  const source = read(file);
  assert.ok(source, "frontend indianStates.ts not found");

  const front = [...source!.matchAll(/^\s+"([^"]+)",\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(front, [...INDIAN_STATES]);
});

