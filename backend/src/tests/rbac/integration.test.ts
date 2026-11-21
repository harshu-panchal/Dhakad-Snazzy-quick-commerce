import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import Role from "../../models/Role";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import {
  resolveAdminContext,
  invalidateRoleCache,
  serializePermissions,
} from "../../services/adminPermissionService";
import {
  ALL_PERMISSIONS,
  ELEVATED_PAGES,
  SUPER_ADMIN_ROLE,
  PAGES,
} from "../../config/permissions";

/**
 * End-to-end checks against a real MongoDB.
 *
 * A replica set (not a standalone) because the role-rename cascade uses a
 * transaction, and transactions need one.
 */

let server: MongoMemoryReplSet;

before(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(server.getUri());
}, { timeout: 120_000 });

after(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

/* --------------------------------- seeding -------------------------------- */

test("seedRbac creates the system roles", async () => {
  await seedRbac();

  const superAdmin = await Role.findOne({ name: SUPER_ADMIN_ROLE });
  assert.ok(superAdmin, "Super Admin role not created");
  assert.equal(superAdmin!.type, "System");
  assert.deepEqual(superAdmin!.permissions, ["*"]);

  const admin = await Role.findOne({ name: "Admin" });
  assert.ok(admin, "Admin role not created");
  assert.equal(admin!.type, "System");

  // Everything except the two self-escalation pages.
  assert.equal(admin!.permissions.length, ALL_PERMISSIONS.length - ELEVATED_PAGES.length * 2);
  for (const page of ELEVATED_PAGES) {
    assert.ok(
      !admin!.permissions.includes(`${page}:view`),
      `Admin role must not include ${page}:view`,
    );
  }
});

test("seedRbac is idempotent", async () => {
  const before = await Role.countDocuments();
  await seedRbac();
  await seedRbac();
  assert.equal(await Role.countDocuments(), before);
});

test("seeded preset roles include a genuinely read-only one", async () => {
  const support = await Role.findOne({ name: "Support (read-only)" });
  assert.ok(support, "Support preset not created");

  const manageGrants = support!.permissions.filter((p) => p.endsWith(":manage"));
  assert.deepEqual(manageGrants, [], "the read-only preset must hold no manage grants");
  assert.ok(support!.permissions.length > 0, "the read-only preset should grant some views");
});

/* ------------------------------- validation ------------------------------- */

test("a custom role cannot be given the wildcard", async () => {
  await assert.rejects(
    Role.create({ name: "Sneaky", type: "Custom", permissions: ["*"] }),
    /not a known permission|validation/i,
  );
});

test("a role cannot be given an unknown permission", async () => {
  await assert.rejects(
    Role.create({ name: "Bogus", type: "Custom", permissions: ["not.a.page:view"] }),
    /not a known permission|validation/i,
  );
});

/* -------------------------- admin role validation ------------------------- */

test("an admin cannot be created with a role that does not exist", async () => {
  await assert.rejects(
    Admin.create({
      firstName: "No",
      lastName: "Role",
      mobile: "9000000001",
      email: "norole@example.com",
      password: "Passw0rd1",
      role: "Nonexistent Role",
    }),
    /does not exist/i,
  );
});

test("the password policy is enforced on write", async () => {
  await assert.rejects(
    Admin.create({
      firstName: "Weak",
      lastName: "Password",
      mobile: "9000000002",
      email: "weak@example.com",
      password: "short",
      role: "Admin",
    }),
    /at least 8 characters/i,
  );

  await assert.rejects(
    Admin.create({
      firstName: "No",
      lastName: "Digit",
      mobile: "9000000003",
      email: "nodigit@example.com",
      password: "NoDigitsHere",
      role: "Admin",
    }),
    /uppercase|lowercase|number/i,
  );
});

/* ----------------------------- context resolution ------------------------- */

test("resolveAdminContext reports a super admin", async () => {
  const admin = await Admin.create({
    firstName: "Root",
    lastName: "User",
    mobile: "9000000010",
    email: "root@example.com",
    password: "Passw0rd1",
    role: SUPER_ADMIN_ROLE,
  });

  const ctx = await resolveAdminContext(String(admin._id));
  assert.ok(ctx);
  assert.equal(ctx!.isSuperAdmin, true);
  assert.equal(ctx!.isActive, true);
  assert.deepEqual(serializePermissions(ctx!), ["*"]);
});

test("resolveAdminContext resolves a custom role's permissions", async () => {
  await Role.create({
    name: "Reader",
    type: "Custom",
    permissions: ["orders.pending:view", "dashboard:view"],
  });

  const admin = await Admin.create({
    firstName: "Read",
    lastName: "Only",
    mobile: "9000000011",
    email: "reader@example.com",
    password: "Passw0rd1",
    role: "Reader",
  });

  const ctx = await resolveAdminContext(String(admin._id));
  assert.ok(ctx);
  assert.equal(ctx!.isSuperAdmin, false);
  assert.ok(ctx!.permissions.has("orders.pending:view"));
  assert.ok(!ctx!.permissions.has("orders.pending:manage"));
});

test("a permission edit applies on the next request once the cache is invalidated", async () => {
  const admin = await Admin.findOne({ email: "reader@example.com" });
  assert.ok(admin);

  const role = await Role.findOne({ name: "Reader" });
  role!.permissions = [...role!.permissions, "orders.pending:manage"];
  await role!.save();
  invalidateRoleCache("Reader");

  const ctx = await resolveAdminContext(String(admin!._id));
  assert.ok(ctx!.permissions.has("orders.pending:manage"), "edit did not take effect");
});

test("deactivating the account makes the context inactive", async () => {
  const admin = await Admin.findOne({ email: "reader@example.com" });
  admin!.isActive = false;
  await admin!.save({ validateModifiedOnly: true } as any);

  const ctx = await resolveAdminContext(String(admin!._id));
  assert.equal(ctx!.isActive, false);

  admin!.isActive = true;
  await admin!.save({ validateModifiedOnly: true } as any);
});

test("deactivating the ROLE strips permissions from every holder", async () => {
  const role = await Role.findOne({ name: "Reader" });
  role!.isActive = false;
  await role!.save();
  invalidateRoleCache("Reader");

  const admin = await Admin.findOne({ email: "reader@example.com" });
  const ctx = await resolveAdminContext(String(admin!._id));

  assert.equal(ctx!.isActive, false, "an inactive role must disable its holders");
  assert.equal(ctx!.permissions.size, 0);

  role!.isActive = true;
  await role!.save();
  invalidateRoleCache("Reader");
});

test("an unknown role resolves to zero permissions rather than throwing", async () => {
  // Simulates a role deleted straight from the database, bypassing the API
  // guard. The account must degrade to no access, not crash the request.
  await Admin.collection.updateOne(
    { email: "reader@example.com" },
    { $set: { role: "Vanished" } },
  );
  invalidateRoleCache();

  const admin = await Admin.findOne({ email: "reader@example.com" });
  const ctx = await resolveAdminContext(String(admin!._id));

  assert.ok(ctx, "context should still resolve");
  assert.equal(ctx!.permissions.size, 0);

  await Admin.collection.updateOne(
    { email: "reader@example.com" },
    { $set: { role: "Reader" } },
  );
  invalidateRoleCache();
});

/* ------------------------------ orphan repair ----------------------------- */

test("seedRbac creates a placeholder for an orphaned role name", async () => {
  await Admin.collection.updateOne(
    { email: "reader@example.com" },
    { $set: { role: "Ghost Role" } },
  );

  await seedRbac();

  const ghost = await Role.findOne({ name: "Ghost Role" });
  assert.ok(ghost, "orphaned role name should get a placeholder");
  assert.equal(ghost!.type, "Custom");
  assert.deepEqual(ghost!.permissions, []);

  await Admin.collection.updateOne(
    { email: "reader@example.com" },
    { $set: { role: "Reader" } },
  );
});

/* ------------------------------ catalog sanity ---------------------------- */

test("the Admin system role covers every page except the elevated ones", async () => {
  const admin = await Role.findOne({ name: "Admin" });
  const covered = new Set(admin!.permissions);

  const expectedMissing = new Set(ELEVATED_PAGES);
  for (const page of PAGES) {
    const shouldHave = !expectedMissing.has(page.key);
    assert.equal(
      covered.has(`${page.key}:view`),
      shouldHave,
      `${page.key}:view coverage on the Admin role is wrong`,
    );
  }
});
