import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import City from "../../models/City";
import Role from "../../models/Role";
import Admin from "../../models/Admin";
import AuditLog from "../../models/AuditLog";
import { seedRbac } from "../../scripts/seedRbac";
import { seedCities } from "../../scripts/seedCities";
import { generateAdminAccessToken } from "../../services/jwtService";
import {
  invalidateRoleCache,
  resolveAdminContext,
  resolveScope,
  scopeIncludes,
} from "../../services/adminPermissionService";
import { SUPER_ADMIN_ROLE } from "../../config/permissions";

/**
 * Phase C: each admin carries a town scope. Resolved per request, returned by
 * /admin/me, editable only within limits, fail-closed by default.
 */

let server: MongoMemoryReplSet;
let httpServer: http.Server;
let baseUrl: string;

let biaora: string;
let khujner: string;
let pachore: string;

before(async () => {
  process.env.RATE_LIMIT_LOGIN_MAX = "10000";

  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(server.getUri());
  await seedRbac();
  await seedCities();

  const id = async (name: string) => String((await City.findOne({ name }))!._id);
  biaora = await id("Biaora");
  khujner = await id("Khujner");
  pachore = await id("Pachore");

  const routes = (await import("../../routes")).default;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", routes);

  httpServer = http.createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/v1`;
}, { timeout: 180_000 });

after(async () => {
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await mongoose.disconnect();
  await server?.stop();
});

/* --------------------------------- helpers -------------------------------- */

let counter = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await response.json();
  } catch {
    // no body
  }
  return { status: response.status, body: json };
}

async function makeAdmin(role: string, cityScope?: unknown, raw = false) {
  counter += 1;
  const fields = {
    firstName: "T",
    lastName: `User${counter}`,
    mobile: String(9500000000 + counter),
    email: `scope${counter}@c.test`,
    password: "Passw0rd1",
    role,
  };

  if (raw) {
    // Bypass the model so the document has NO cityScope, like an account that
    // existed before this field did.
    const hashed = "$2b$10$abcdefghijklmnopqrstuuMsm4kP9u1o6k7n0p3b8W5l1x2y3z4a5";
    const result = await Admin.collection.insertOne({ ...fields, password: hashed, isActive: true, tokenVersion: 0 });
    return (await Admin.findById(result.insertedId).select("+password"))!;
  }

  return Admin.create({ ...fields, ...(cityScope !== undefined ? { cityScope } : {}) });
}

const tokenOf = (admin: any) =>
  generateAdminAccessToken(String(admin._id), admin.role, admin.tokenVersion ?? 0);

let superToken: string;

before(async () => {
  await Role.create({
    name: "Scope Manager",
    type: "Custom",
    permissions: ["settings.system_user:view", "settings.system_user:manage"],
  });
  await Role.create({ name: "Plain Role", type: "Custom", permissions: ["dashboard:view"] });
  invalidateRoleCache();

  superToken = tokenOf(await makeAdmin(SUPER_ADMIN_ROLE));
});

/* ------------------------------------------------------------------------ */
/*                              Scope resolution                            */
/* ------------------------------------------------------------------------ */

test("Super Admin is always unrestricted, whatever is stored", () => {
  assert.deepEqual(resolveScope(true, { mode: "selected", cityIds: [] }), { all: true, cityIds: [] });
  assert.deepEqual(resolveScope(true, undefined), { all: true, cityIds: [] });
});

test("mode all means every town", () => {
  assert.deepEqual(resolveScope(false, { mode: "all", cityIds: [] }), { all: true, cityIds: [] });
});

test("selected means exactly the listed towns, de-duplicated", () => {
  assert.deepEqual(resolveScope(false, { mode: "selected", cityIds: ["a", "b", "a"] }), {
    all: false,
    cityIds: ["a", "b"],
  });
});

test("a missing or malformed scope fails closed, never open", () => {
  const none = { all: false, cityIds: [] };
  assert.deepEqual(resolveScope(false, undefined), none);
  assert.deepEqual(resolveScope(false, null), none);
  assert.deepEqual(resolveScope(false, {}), none);
  assert.deepEqual(resolveScope(false, { mode: "garbage" }), none);
  assert.deepEqual(resolveScope(false, { mode: "selected" }), none);
  assert.deepEqual(resolveScope(false, { mode: "ALL", cityIds: [] }), none, "mode is case-sensitive");
});

test("scopeIncludes honours all, the list, and unset towns", () => {
  const everything = { all: true, cityIds: [] };
  const some = { all: false, cityIds: ["a", "b"] };
  const nothing = { all: false, cityIds: [] };

  assert.equal(scopeIncludes(everything, "x"), true);
  assert.equal(scopeIncludes(everything, undefined), true, "all sees orders that have no town");
  assert.equal(scopeIncludes(some, "a"), true);
  assert.equal(scopeIncludes(some, "z"), false);
  assert.equal(scopeIncludes(some, undefined), false, "a scoped admin never sees an order with no town");
  assert.equal(scopeIncludes(nothing, "a"), false);
});

/* ------------------------------------------------------------------------ */
/*                       Defaults and what /admin/me reports                 */
/* ------------------------------------------------------------------------ */

test("a new admin defaults to no towns", async () => {
  const admin = await makeAdmin("Plain Role");
  assert.equal(admin.cityScope!.mode, "selected");
  assert.equal(admin.cityScope!.cityIds.length, 0);

  const ctx = await resolveAdminContext(String(admin._id));
  assert.deepEqual(ctx!.scope, { all: false, cityIds: [] });
});

test("an account from before the field existed fails closed", async () => {
  const legacy = await makeAdmin("Plain Role", undefined, true);
  const raw = await Admin.collection.findOne({ _id: legacy!._id });
  assert.equal(raw!.cityScope, undefined, "precondition: the document has no cityScope");

  const ctx = await resolveAdminContext(String(legacy!._id));
  assert.deepEqual(ctx!.scope, { all: false, cityIds: [] });

  const me = await call("GET", "/admin/me", tokenOf(legacy));
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.data.cityScope, { all: false, cityIds: [] });
});

test("/admin/me reports the towns an admin is limited to", async () => {
  const admin = await makeAdmin("Plain Role", {
    mode: "selected",
    cityIds: [biaora, khujner],
  });

  const me = await call("GET", "/admin/me", tokenOf(admin));
  assert.equal(me.status, 200);
  assert.equal(me.body.data.cityScope.all, false);
  assert.deepEqual([...me.body.data.cityScope.cityIds].sort(), [biaora, khujner].sort());
});

test("/admin/me reports all for Super Admin and for an admin granted every town", async () => {
  const everyTown = await makeAdmin("Plain Role", { mode: "all", cityIds: [] });

  assert.equal((await call("GET", "/admin/me", superToken)).body.data.cityScope.all, true);
  assert.equal((await call("GET", "/admin/me", tokenOf(everyTown))).body.data.cityScope.all, true);
});

test("the sign-in response carries the scope", async () => {
  const admin = await makeAdmin("Plain Role", { mode: "selected", cityIds: [pachore] });

  const result = await call("POST", "/auth/admin/login", undefined, {
    email: admin.email,
    password: "Passw0rd1",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { all: false, cityIds: [pachore] });
});

test("a scope change applies on the admin's very next request", async () => {
  const admin = await makeAdmin("Plain Role", { mode: "selected", cityIds: [biaora] });
  const token = tokenOf(admin);

  assert.deepEqual((await call("GET", "/admin/me", token)).body.data.cityScope.cityIds, [biaora]);

  const changed = await call("PUT", `/admin/system-users/${admin._id}`, superToken, {
    cityScope: { mode: "selected", cityIds: [khujner] },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  assert.deepEqual(
    (await call("GET", "/admin/me", token)).body.data.cityScope.cityIds,
    [khujner],
    "the same token must see the new towns immediately",
  );
});

/* ------------------------------------------------------------------------ */
/*                       Creating and validating through the API            */
/* ------------------------------------------------------------------------ */

const newUser = (extra: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    firstName: "New",
    lastName: `Person${counter}`,
    mobile: String(9600000000 + counter),
    email: `new${counter}@c.test`,
    password: "Passw0rd1",
    role: "Plain Role",
    ...extra,
  };
};

test("creating an admin with no cityScope stores none, not all", async () => {
  const result = await call("POST", "/admin/system-users", superToken, newUser());
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { mode: "selected", cityIds: [] });
});

test("creating an admin with towns stores them", async () => {
  const result = await call(
    "POST",
    "/admin/system-users",
    superToken,
    newUser({ cityScope: { mode: "selected", cityIds: [biaora, khujner, biaora] } }),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.data.cityScope.mode, "selected");
  assert.deepEqual([...result.body.data.cityScope.cityIds].sort(), [biaora, khujner].sort(), "duplicates are dropped");
});

test("mode all ignores any ids sent with it", async () => {
  const result = await call(
    "POST",
    "/admin/system-users",
    superToken,
    newUser({ cityScope: { mode: "all", cityIds: [biaora] } }),
  );
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.data.cityScope, { mode: "all", cityIds: [] });
});

test("a Super Admin account is stored as all regardless of what is sent", async () => {
  const result = await call(
    "POST",
    "/admin/system-users",
    superToken,
    newUser({ role: SUPER_ADMIN_ROLE, cityScope: { mode: "selected", cityIds: [biaora] } }),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { mode: "all", cityIds: [] });
});

test("a bad scope is refused and creates nothing", async () => {
  const cases: Array<[string, unknown]> = [
    ["a string", "all"],
    ["an unknown mode", { mode: "some", cityIds: [] }],
    ["no mode", { cityIds: [biaora] }],
    ["ids that are not an array", { mode: "selected", cityIds: biaora }],
    ["an invalid id", { mode: "selected", cityIds: ["not-an-id"] }],
    ["a town that does not exist", { mode: "selected", cityIds: [String(new mongoose.Types.ObjectId())] }],
  ];

  for (const [label, scope] of cases) {
    const body = newUser({ cityScope: scope });
    const result = await call("POST", "/admin/system-users", superToken, body);
    assert.equal(result.status, 400, `${label}: ${JSON.stringify(result.body)}`);
    assert.equal(await Admin.countDocuments({ email: body.email }), 0, `${label}: an account was created`);
  }
});

test("an update with a bad scope changes nothing", async () => {
  const admin = await makeAdmin("Plain Role", { mode: "selected", cityIds: [biaora] });

  const result = await call("PUT", `/admin/system-users/${admin._id}`, superToken, {
    firstName: "Changed",
    cityScope: { mode: "selected", cityIds: ["nonsense"] },
  });
  assert.equal(result.status, 400);

  const after = await Admin.findById(admin._id).lean();
  assert.equal(after!.firstName, "T", "no other field may change when the scope is rejected");
});

test("the admin list includes each admin's scope", async () => {
  const result = await call("GET", "/admin/system-users?limit=200", superToken);
  assert.equal(result.status, 200);
  assert.ok(result.body.data.length > 0);
  for (const user of result.body.data) {
    assert.ok(user.cityScope, `${user.email} has no cityScope in the list`);
    assert.ok(["all", "selected"].includes(user.cityScope.mode));
    assert.ok(Array.isArray(user.cityScope.cityIds));
  }
});

/* ------------------------------------------------------------------------ */
/*                              Role changes                                */
/* ------------------------------------------------------------------------ */

test("demoting a Super Admin does not leave them able to see every town", async () => {
  const sa = await makeAdmin(SUPER_ADMIN_ROLE, { mode: "all", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${sa._id}`, superToken, { role: "Plain Role" });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { mode: "selected", cityIds: [] });

  const ctx = await resolveAdminContext(String(sa._id));
  assert.equal(ctx!.scope.all, false, "a demoted admin must fail closed");
});

test("demoting while choosing towns in the same request keeps those towns", async () => {
  const sa = await makeAdmin(SUPER_ADMIN_ROLE, { mode: "all", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${sa._id}`, superToken, {
    role: "Plain Role",
    cityScope: { mode: "selected", cityIds: [pachore] },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { mode: "selected", cityIds: [pachore] });
});

test("promoting to Super Admin stores all", async () => {
  const admin = await makeAdmin("Plain Role", { mode: "selected", cityIds: [biaora] });

  const result = await call("PUT", `/admin/system-users/${admin._id}`, superToken, { role: SUPER_ADMIN_ROLE });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope, { mode: "all", cityIds: [] });
});

/* ------------------------------------------------------------------------ */
/*                      Who may grant what (escalation guards)              */
/* ------------------------------------------------------------------------ */

test("a limited admin cannot grant every town", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });
  const target = await makeAdmin("Plain Role", { mode: "selected", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${target._id}`, tokenOf(manager), {
    cityScope: { mode: "all", cityIds: [] },
  });
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "SCOPE_NOT_GRANTABLE");
  assert.equal((await Admin.findById(target._id).lean())!.cityScope!.mode, "selected");
});

test("a limited admin cannot grant a town they cannot see", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });
  const target = await makeAdmin("Plain Role", { mode: "selected", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${target._id}`, tokenOf(manager), {
    cityScope: { mode: "selected", cityIds: [biaora, khujner] },
  });
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "SCOPE_NOT_GRANTABLE");
});

test("a limited admin can grant towns within their own", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora, khujner] });
  const target = await makeAdmin("Plain Role", { mode: "selected", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${target._id}`, tokenOf(manager), {
    cityScope: { mode: "selected", cityIds: [khujner] },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.data.cityScope.cityIds, [khujner]);
});

test("a limited admin cannot create an admin with towns beyond their own", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });

  const body = newUser({ cityScope: { mode: "selected", cityIds: [pachore] } });
  const result = await call("POST", "/admin/system-users", tokenOf(manager), body);

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(await Admin.countDocuments({ email: body.email }), 0);
});

test("a limited admin cannot edit the towns of someone who has towns they cannot see", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });
  const wider = await makeAdmin("Plain Role", { mode: "selected", cityIds: [biaora, khujner] });

  // Trimming the other admin to Biaora would quietly remove Khujner, a town the
  // manager cannot even see.
  const result = await call("PUT", `/admin/system-users/${wider._id}`, tokenOf(manager), {
    cityScope: { mode: "selected", cityIds: [biaora] },
  });
  assert.equal(result.status, 403, JSON.stringify(result.body));
});

test("a limited admin cannot change their own towns", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });

  const result = await call("PUT", `/admin/system-users/${manager._id}`, tokenOf(manager), {
    cityScope: { mode: "selected", cityIds: [] },
  });
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "SELF_SCOPE_EDIT");
});

test("saving your own form with the towns unchanged is allowed", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora] });

  const result = await call("PUT", `/admin/system-users/${manager._id}`, tokenOf(manager), {
    firstName: "Renamed",
    cityScope: { mode: "selected", cityIds: [biaora] },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.firstName, "Renamed");
});

test("an admin granted every town may grant any town", async () => {
  const hq = await makeAdmin("Scope Manager", { mode: "all", cityIds: [] });
  const target = await makeAdmin("Plain Role", { mode: "selected", cityIds: [] });

  const result = await call("PUT", `/admin/system-users/${target._id}`, tokenOf(hq), {
    cityScope: { mode: "selected", cityIds: [biaora, khujner, pachore] },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
});

/* ------------------------------------------------------------------------ */
/*                         Towns an admin points at                         */
/* ------------------------------------------------------------------------ */

test("a town an admin is limited to cannot be deleted", async () => {
  const town = await City.create({ name: "Scratch Town", slug: "scratch-town", aliases: [] });
  const admin = await makeAdmin("Plain Role", { mode: "selected", cityIds: [town._id] });

  const refused = await call("DELETE", `/admin/cities/${town._id}`, superToken);
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "TOWN_IN_USE");
  assert.equal(refused.body.data.adminCount, 1);
  assert.ok(await City.exists({ _id: town._id }), "the town must still exist");

  await Admin.updateOne({ _id: admin._id }, { $set: { "cityScope.cityIds": [] } });
  const allowed = await call("DELETE", `/admin/cities/${town._id}`, superToken);
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
});

/* ------------------------------------------------------------------------ */
/*                                   Audit                                  */
/* ------------------------------------------------------------------------ */

async function latestAudit(match: Record<string, unknown>) {
  // The audit write happens when the response finishes, so give it a moment.
  for (let i = 0; i < 20; i += 1) {
    const doc = await AuditLog.findOne(match).sort({ createdAt: -1 }).lean();
    if (doc) return doc;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

test("the audit log records the towns an admin was limited to", async () => {
  const manager = await makeAdmin("Scope Manager", { mode: "selected", cityIds: [biaora, khujner] });
  const target = await makeAdmin("Plain Role", { mode: "selected", cityIds: [] });

  await call("PUT", `/admin/system-users/${target._id}`, tokenOf(manager), { firstName: "Audited" });

  const entry = await latestAudit({ adminEmail: manager.email, method: "PUT" });
  assert.ok(entry, "no audit entry found");
  assert.equal(entry!.adminScope!.all, false);
  assert.deepEqual([...entry!.adminScope!.cityIds].sort(), [biaora, khujner].sort());
});

test("the audit log records all for an unrestricted admin", async () => {
  const target = await makeAdmin("Plain Role");
  await call("PUT", `/admin/system-users/${target._id}`, superToken, { firstName: "AuditedToo" });

  const entry = await latestAudit({ path: new RegExp(`/admin/system-users/${target._id}$`), method: "PUT" });
  assert.ok(entry);
  assert.equal(entry!.adminScope!.all, true);
});
