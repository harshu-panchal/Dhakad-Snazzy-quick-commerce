import test from "node:test";
import assert from "node:assert/strict";
import adminRoutes from "../../routes/adminRoutes";
import { guardMeta } from "../../middleware/permissions";
import {
  LOOKUP_ENDPOINTS,
  SELF_SERVICE_ENDPOINTS,
  PAGE_KEYS,
} from "../../config/permissions";

/**
 * The most important test in this suite.
 *
 * It walks the real admin router's layer stack and proves that every
 * registered endpoint sits behind a permission guard or is explicitly
 * allowlisted. Add an endpoint to adminRoutes.ts without extending the guard
 * block and this fails — which is what stops an unguarded admin endpoint from
 * shipping silently.
 */

interface RouteEntry {
  path: string;
  methods: string[];
  /** Index in the stack, so "a guard registered after the route" is detectable. */
  index: number;
}

interface GuardEntry {
  regexp: RegExp;
  pages: readonly string[];
  kind: string;
  index: number;
}

const stack: any[] = (adminRoutes as any).stack;

function collect() {
  const routes: RouteEntry[] = [];
  const guards: GuardEntry[] = [];

  stack.forEach((layer: any, index: number) => {
    if (layer.route) {
      routes.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods || {})
          .filter((m) => layer.route.methods[m])
          .map((m) => m.toUpperCase()),
        index,
      });
      return;
    }

    const meta = guardMeta(layer.handle);
    if (meta) {
      guards.push({
        regexp: layer.regexp,
        pages: meta.pages,
        kind: meta.kind,
        index,
      });
    }
  });

  return { routes, guards };
}

/** Turn "/orders/:id/status" into a concrete path the layer regexps can match. */
function concrete(path: string): string {
  return path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "sample" : segment))
    .join("/");
}

const { routes, guards } = collect();

const ALLOWLISTED = new Set<string>([...SELF_SERVICE_ENDPOINTS, ...LOOKUP_ENDPOINTS]);

test("the admin router actually registered routes", () => {
  assert.ok(routes.length > 100, `expected >100 admin routes, found ${routes.length}`);
});

test("the guard block is present", () => {
  const pageGuards = guards.filter((g) => g.kind === "pages" || g.kind === "tiered");
  assert.ok(pageGuards.length > 25, `expected >25 permission guards, found ${pageGuards.length}`);
  assert.ok(
    guards.some((g) => g.kind === "allowlist"),
    "allowSelfServiceAndLookups is not mounted",
  );
});

test("the allowlist is mounted before every permission guard", () => {
  const allowlist = guards.find((g) => g.kind === "allowlist");
  assert.ok(allowlist, "allowlist guard missing");

  const firstPageGuard = guards.find((g) => g.kind === "pages" || g.kind === "tiered");
  assert.ok(firstPageGuard, "no permission guard found");

  // If a permission guard ran first, a lookup or profile request would be
  // rejected before the allowlist could exempt it.
  assert.ok(
    allowlist!.index < firstPageGuard!.index,
    "allowSelfServiceAndLookups must be registered before the permission guards",
  );
});

test("every admin endpoint is guarded or explicitly allowlisted", () => {
  const unguarded: string[] = [];

  for (const route of routes) {
    if (ALLOWLISTED.has(route.path)) continue;

    const target = concrete(route.path);

    // A guard only protects a route if it was registered BEFORE it, since
    // Express runs the stack in order.
    const covered = guards.some(
      (guard) =>
        guard.index < route.index &&
        (guard.kind === "pages" || guard.kind === "tiered" || guard.kind === "super-admin") &&
        guard.regexp.test(target),
    );

    if (!covered) {
      unguarded.push(`${route.methods.join("/")} ${route.path}`);
    }
  }

  assert.deepEqual(
    unguarded,
    [],
    `These admin endpoints have no permission guard. Add a prefix guard in ` +
      `routes/adminRoutes.ts, or add the path to SELF_SERVICE_ENDPOINTS / ` +
      `LOOKUP_ENDPOINTS in config/permissions.ts:\n  ` +
      unguarded.join("\n  "),
  );
});

test("every guard references only real page keys", () => {
  const known = new Set(PAGE_KEYS);
  const bad: string[] = [];

  for (const guard of guards) {
    for (const page of guard.pages) {
      if (!known.has(page)) bad.push(page);
    }
  }

  assert.deepEqual(bad, [], `guards reference unknown page keys: ${bad.join(", ")}`);
});

test("allowlisted lookup paths correspond to real registered GET routes", () => {
  // Catches a typo in LOOKUP_ENDPOINTS, which would silently widen nothing but
  // would also mean the intended endpoint stays gated.
  const getPaths = new Set(
    routes.filter((r) => r.methods.includes("GET")).map((r) => r.path),
  );

  const missing = LOOKUP_ENDPOINTS.filter((endpoint) => !getPaths.has(endpoint));

  assert.deepEqual(
    missing,
    [],
    `LOOKUP_ENDPOINTS entries with no matching GET route in adminRoutes: ${missing.join(", ")}`,
  );
});

test("self-service paths correspond to real registered routes", () => {
  const allPaths = new Set(routes.map((r) => r.path));
  const missing = SELF_SERVICE_ENDPOINTS.filter((endpoint) => !allPaths.has(endpoint));

  assert.deepEqual(
    missing,
    [],
    `SELF_SERVICE_ENDPOINTS entries with no matching route: ${missing.join(", ")}`,
  );
});
