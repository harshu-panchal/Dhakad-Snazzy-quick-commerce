import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import Role from "../../models/Role";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import { invalidateRoleCache } from "../../services/adminPermissionService";
import { SUPER_ADMIN_ROLE } from "../../config/permissions";

/**
 * Real HTTP requests through the real router against a real database.
 *
 * This is the test that proves the whole chain works: authenticate resolves
 * the role, the prefix guards derive the right tier from the method, and the
 * login split between password and OTP is actually enforced.
 */

let server: MongoMemoryReplSet;
let httpServer: http.Server;
let baseUrl: string;

before(async () => {
  // The login limiter is real and would otherwise 429 this suite, which signs
  // in far more often than a human would. Set before the dynamic import
  // below, since the limiters read their configuration at module load.
  process.env.RATE_LIMIT_LOGIN_MAX = "10000";
  process.env.RATE_LIMIT_OTP_MAX = "10000";

  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(server.getUri());
  await seedRbac();

  // Imported after the DB is up so model registration has somewhere to go.
  const routes = (await import("../../routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", routes);

  httpServer = http.createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // --- fixtures -----------------------------------------------------------

  // Reads orders, changes nothing.
  await Role.create({
    name: "Order Viewer",
    type: "Custom",
    permissions: ["orders.pending:view", "orders.all:view"],
  });

  // Reads and writes orders.
  await Role.create({
    name: "Order Editor",
    type: "Custom",
    permissions: [
      "orders.pending:view",
      "orders.pending:manage",
      "orders.all:view",
      "orders.all:manage",
    ],
  });

  invalidateRoleCache();

  await Admin.create({
    firstName: "View",
    lastName: "Only",
    mobile: "9100000001",
    email: "viewer@example.com",
    password: "Passw0rd1",
    role: "Order Viewer",
  });

  await Admin.create({
    firstName: "Order",
    lastName: "Editor",
    mobile: "9100000002",
    email: "editor@example.com",
    password: "Passw0rd1",
    role: "Order Editor",
  });

  await Admin.create({
    firstName: "Root",
    lastName: "Admin",
    mobile: "9100000003",
    email: "root@example.com",
    password: "Passw0rd1",
    role: SUPER_ADMIN_ROLE,
  });
}, { timeout: 180_000 });

after(async () => {
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await mongoose.disconnect();
  await server?.stop();
});

/* --------------------------------- helpers -------------------------------- */

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    // Some responses have no body.
  }

  return { status: response.status, body: json, headers: response.headers };
}

async function signIn(email: string): Promise<string> {
  const result = await call("POST", "/auth/admin/login", {
    body: { email, password: "Passw0rd1" },
  });
  assert.equal(result.status, 200, `login failed for ${email}: ${JSON.stringify(result.body)}`);
  return result.body.data.token;
}

/* ------------------------------- login split ------------------------------ */

test("password login works for a normal role and returns permissions", async () => {
  const result = await call("POST", "/auth/admin/login", {
    body: { email: "viewer@example.com", password: "Passw0rd1" },
  });

  assert.equal(result.status, 200);
  assert.ok(result.body.data.token);
  assert.equal(result.body.data.user.role, "Order Viewer");
  assert.deepEqual(result.body.data.permissions.sort(), [
    "orders.all:view",
    "orders.pending:view",
  ]);

  // The refresh token must arrive as an httpOnly cookie, never in the body.
  const setCookie = result.headers.get("set-cookie") || "";
  assert.match(setCookie, /adminRefreshToken=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.ok(!("refreshToken" in result.body.data), "refresh token must not be in the body");
});

test("password login is refused for Super Admin", async () => {
  const result = await call("POST", "/auth/admin/login", {
    body: { email: "root@example.com", password: "Passw0rd1" },
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.code, "OTP_LOGIN_REQUIRED");
});

test("OTP login is refused for a non-Super-Admin", async () => {
  const result = await call("POST", "/auth/admin/send-otp", {
    body: { mobile: "9100000001" },
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.code, "PASSWORD_LOGIN_REQUIRED");
});

test("a wrong password gives a generic error that does not confirm the account", async () => {
  const wrongPassword = await call("POST", "/auth/admin/login", {
    body: { email: "viewer@example.com", password: "WrongPass1" },
  });
  const noSuchUser = await call("POST", "/auth/admin/login", {
    body: { email: "nobody@example.com", password: "WrongPass1" },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPassword.body.message, noSuchUser.body.message);
});

test("the public admin registration endpoint is gone", async () => {
  const result = await call("POST", "/auth/admin/register", {
    body: {
      firstName: "Mallory",
      lastName: "Attacker",
      mobile: "9100009999",
      email: "mallory@example.com",
      password: "Passw0rd1",
      role: SUPER_ADMIN_ROLE,
    },
  });

  assert.equal(result.status, 404, "POST /auth/admin/register must no longer exist");
  assert.equal(
    await Admin.countDocuments({ email: "mallory@example.com" }),
    0,
    "no account may be created through that route",
  );
});

/* ------------------------------ /admin/me -------------------------------- */

test("GET /admin/me returns identity and permissions", async () => {
  const token = await signIn("viewer@example.com");
  const result = await call("GET", "/admin/me", { token });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.user.email, "viewer@example.com");
  assert.equal(result.body.data.user.isSuperAdmin, false);
  assert.ok(result.body.data.permissions.includes("orders.pending:view"));
});

test("an unauthenticated admin request is 401", async () => {
  const result = await call("GET", "/admin/me");
  assert.equal(result.status, 401);
});

/* --------------------------- tier enforcement ----------------------------- */

test("a view-only role can GET its page's endpoint", async () => {
  const token = await signIn("viewer@example.com");
  const result = await call("GET", "/admin/orders", { token });

  assert.equal(result.status, 200, JSON.stringify(result.body));
});

test("a view-only role is refused a write on the same endpoint", async () => {
  const token = await signIn("viewer@example.com");
  const result = await call("PATCH", "/admin/orders/68f2abc1234567890abcdef0/status", {
    token,
    body: { status: "Cancelled" },
  });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "FORBIDDEN");
  assert.ok(
    result.body.requiredAny.some((p: string) => p.endsWith(":manage")),
    "the error should name the manage permissions it wanted",
  );
});

test("an editor role gets past the permission guard on a write", async () => {
  const token = await signIn("editor@example.com");
  const result = await call("PATCH", "/admin/orders/68f2abc1234567890abcdef0/status", {
    token,
    body: { status: "Cancelled" },
  });

  // The order does not exist, so the handler itself fails — but anything other
  // than 403 proves the guard allowed the request through, which is what this
  // test is about.
  assert.notEqual(result.status, 403, JSON.stringify(result.body));
});

test("a role is refused a page outside its permissions entirely", async () => {
  const token = await signIn("viewer@example.com");

  for (const path of ["/admin/system-users", "/admin/roles", "/admin/audit-logs"]) {
    const result = await call("GET", path, { token });
    assert.equal(result.status, 403, `${path} should be forbidden: ${JSON.stringify(result.body)}`);
  }
});

/* ------------------------------ allowlists -------------------------------- */

test("lookup endpoints are reachable without the owning page", async () => {
  const token = await signIn("viewer@example.com");

  // The viewer holds no catalog permissions at all.
  for (const path of ["/admin/categories", "/admin/brands"]) {
    const result = await call("GET", path, { token });
    assert.equal(result.status, 200, `${path} should be an open lookup: ${JSON.stringify(result.body)}`);
  }
});

test("a lookup endpoint is still read-only", async () => {
  const token = await signIn("viewer@example.com");
  const result = await call("POST", "/admin/categories", {
    token,
    body: { name: "Should Not Be Created" },
  });

  assert.equal(result.status, 403, JSON.stringify(result.body));
});

test("every admin can reach their own profile", async () => {
  const token = await signIn("viewer@example.com");
  const result = await call("GET", "/admin/profile", { token });
  assert.equal(result.status, 200);
});

/* ------------------------------ super admin ------------------------------- */

test("super admin reaches everything, including the restricted pages", async () => {
  // Super Admin cannot use password login, so mint a token the way the OTP
  // path would and assert on authorisation rather than on signing in.
  const root = await Admin.findOne({ email: "root@example.com" });
  const { generateAdminAccessToken } = await import("../../services/jwtService");
  const token = generateAdminAccessToken(
    String(root!._id),
    root!.role,
    root!.tokenVersion ?? 0,
  );

  for (const path of ["/admin/system-users", "/admin/roles", "/admin/audit-logs", "/admin/me"]) {
    const result = await call("GET", path, { token });
    assert.equal(result.status, 200, `${path} should be allowed: ${JSON.stringify(result.body)}`);
  }
});

test("the migration endpoints are Super Admin only", async () => {
  const viewerToken = await signIn("viewer@example.com");
  const denied = await call("GET", "/admin/fix-image-domain", { token: viewerToken });

  assert.ok(
    denied.status === 403,
    `expected 403 for a non-super admin, got ${denied.status}`,
  );
});

/* ---------------------- instant permission revocation --------------------- */

test("a role edit takes effect on the next request", async () => {
  const token = await signIn("viewer@example.com");

  const before = await call("GET", "/admin/orders", { token });
  assert.equal(before.status, 200);

  const role = await Role.findOne({ name: "Order Viewer" });
  role!.permissions = [];
  await role!.save();
  invalidateRoleCache("Order Viewer");

  const after = await call("GET", "/admin/orders", { token });
  assert.equal(after.status, 403, "the same token must lose access immediately");

  role!.permissions = ["orders.pending:view", "orders.all:view"];
  await role!.save();
  invalidateRoleCache("Order Viewer");
});

test("bumping tokenVersion invalidates an issued token", async () => {
  const token = await signIn("viewer@example.com");
  assert.equal((await call("GET", "/admin/me", { token })).status, 200);

  await Admin.updateOne({ email: "viewer@example.com" }, { $inc: { tokenVersion: 1 } });

  const result = await call("GET", "/admin/me", { token });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, "SESSION_REVOKED");
});

test("a deactivated account cannot use an existing token", async () => {
  const token = await signIn("editor@example.com");
  assert.equal((await call("GET", "/admin/me", { token })).status, 200);

  await Admin.updateOne({ email: "editor@example.com" }, { $set: { isActive: false } });

  const result = await call("GET", "/admin/me", { token });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, "ACCOUNT_DISABLED");

  await Admin.updateOne({ email: "editor@example.com" }, { $set: { isActive: true } });
});

/* ----------------------------- role integrity ----------------------------- */

test("a role in use cannot be deleted, and renaming it cascades", async () => {
  const root = await Admin.findOne({ email: "root@example.com" });
  const { generateAdminAccessToken } = await import("../../services/jwtService");
  const token = generateAdminAccessToken(
    String(root!._id),
    root!.role,
    root!.tokenVersion ?? 0,
  );

  const role = await Role.findOne({ name: "Order Viewer" });

  // In use -> refused.
  const refused = await call("DELETE", `/admin/roles/${role!._id}`, { token });
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "ROLE_IN_USE");

  // Rename -> cascades to the holder.
  const renamed = await call("PUT", `/admin/roles/${role!._id}`, {
    token,
    body: { name: "Order Reader" },
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));

  const holder = await Admin.findOne({ email: "viewer@example.com" });
  assert.equal(holder!.role, "Order Reader", "the rename did not cascade to the admin account");
});

test("a custom role cannot be granted the wildcard through the API", async () => {
  const root = await Admin.findOne({ email: "root@example.com" });
  const { generateAdminAccessToken } = await import("../../services/jwtService");
  const token = generateAdminAccessToken(
    String(root!._id),
    root!.role,
    root!.tokenVersion ?? 0,
  );

  const created = await call("POST", "/admin/roles", {
    token,
    body: { name: "Wildcard Attempt", permissions: ["*", "dashboard:view"] },
  });

  assert.equal(created.status, 201, JSON.stringify(created.body));

  const role = await Role.findOne({ name: "Wildcard Attempt" });
  assert.ok(!role!.permissions.includes("*"), "the wildcard must be stripped");
  assert.deepEqual(role!.permissions, ["dashboard:view"]);
});

test("ticking manage through the API implies view", async () => {
  const root = await Admin.findOne({ email: "root@example.com" });
  const { generateAdminAccessToken } = await import("../../services/jwtService");
  const token = generateAdminAccessToken(
    String(root!._id),
    root!.role,
    root!.tokenVersion ?? 0,
  );

  await call("POST", "/admin/roles", {
    token,
    body: { name: "Manage Only Attempt", permissions: ["catalog.brand:manage"] },
  });

  const role = await Role.findOne({ name: "Manage Only Attempt" });
  assert.deepEqual(role!.permissions, ["catalog.brand:manage", "catalog.brand:view"]);
});

test("a non-super admin cannot create a Super Admin account", async () => {
  // Give the editor the system-user page, then confirm the hard guard still
  // blocks Super Admin creation.
  const role = await Role.findOne({ name: "Order Editor" });
  role!.permissions = [...role!.permissions, "settings.system_user:view", "settings.system_user:manage"];
  await role!.save();
  invalidateRoleCache("Order Editor");

  const token = await signIn("editor@example.com");

  const result = await call("POST", "/admin/system-users", {
    token,
    body: {
      firstName: "Escalate",
      lastName: "Me",
      mobile: "9100007777",
      email: "escalate@example.com",
      password: "Passw0rd1",
      role: SUPER_ADMIN_ROLE,
    },
  });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "SUPER_ADMIN_REQUIRED");
  assert.equal(await Admin.countDocuments({ email: "escalate@example.com" }), 0);
});

test("a non-super admin cannot edit their own role's permissions", async () => {
  const token = await signIn("editor@example.com");
  const role = await Role.findOne({ name: "Order Editor" });

  // Needs the roles page to even reach the handler.
  role!.permissions = [...role!.permissions, "settings.roles:view", "settings.roles:manage"];
  await role!.save();
  invalidateRoleCache("Order Editor");

  const freshToken = await signIn("editor@example.com");
  const result = await call("PUT", `/admin/roles/${role!._id}`, {
    token: freshToken,
    body: { permissions: ["settings.system_user:manage"] },
  });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(result.body.code, "SELF_ROLE_EDIT");
  void token;
});

/* -------------------------- settings redaction ---------------------------- */

test("GET /admin/settings masks credentials the caller may not see", async () => {
  const AppSettings = (await import("../../models/AppSettings")).default;
  await AppSettings.findOneAndUpdate(
    {},
    {
      $set: {
        "paymentGateways.razorpay.keySecret": "super-secret-value",
        "smsGateway.apiKey": "sms-secret-value",
      },
    },
    { upsert: true, new: true },
  );

  // Holds the SMS gateway page only.
  await Role.create({
    name: "SMS Only",
    type: "Custom",
    permissions: ["settings.sms_gateway:view"],
  });
  invalidateRoleCache();

  await Admin.create({
    firstName: "Sms",
    lastName: "Only",
    mobile: "9100000055",
    email: "smsonly@example.com",
    password: "Passw0rd1",
    role: "SMS Only",
  });

  const token = await signIn("smsonly@example.com");
  const result = await call("GET", "/admin/settings", { token });

  assert.equal(result.status, 200, JSON.stringify(result.body));

  const payment = result.body.data?.paymentGateways?.razorpay?.keySecret;
  const sms = result.body.data?.smsGateway?.apiKey;

  assert.equal(payment, "[redacted]", "payment secrets must be masked without the Billing page");
  assert.equal(sms, "sms-secret-value", "the SMS page holder should see the SMS key");
});
