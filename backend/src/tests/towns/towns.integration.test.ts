import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import City from "../../models/City";
import Seller from "../../models/Seller";
import Role from "../../models/Role";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import { seedCities, TOWN_SEEDS } from "../../scripts/seedCities";
import { mapSellers } from "../../services/townMappingService";
import { generateAdminAccessToken } from "../../services/jwtService";
import { invalidateRoleCache } from "../../services/adminPermissionService";

/**
 * Seeding, the seller mapping and the Towns API, against a real MongoDB and a
 * real router.
 */

let server: MongoMemoryReplSet;
let httpServer: http.Server;
let baseUrl: string;

let sellerCounter = 0;

/**
 * Raw insert: Seller has many required fields that are irrelevant here. Each
 * fixture still needs its own email and mobile, because Seller's unique indexes
 * treat a missing value as null and a second null collides.
 */
async function insertSeller(storeName: string, city: string | null, lngLat?: [number, number]) {
  sellerCounter += 1;
  const doc: Record<string, unknown> = {
    storeName,
    city,
    email: `seller${sellerCounter}@test.local`,
    mobile: String(7000000000 + sellerCounter),
  };
  if (lngLat) doc.location = { type: "Point", coordinates: lngLat };
  const result = await Seller.collection.insertOne(doc);
  return result.insertedId;
}

const sellerDoc = (id: unknown) => Seller.collection.findOne({ _id: id as never });

before(async () => {
  process.env.RATE_LIMIT_LOGIN_MAX = "10000";

  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(server.getUri());
  await seedRbac();

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

/* --------------------------------- seeding -------------------------------- */

test("seedCities creates the six towns", async () => {
  const result = await seedCities();
  assert.equal(result.created.length, TOWN_SEEDS.length);
  assert.equal(await City.countDocuments(), 6);

  const biaora = await City.findOne({ name: "Biaora" });
  assert.equal(biaora!.district, "Rajgarh");
  assert.ok(biaora!.aliases.includes("biaora rajgarh"));
});

test("seedCities is idempotent", async () => {
  const before = await City.countDocuments();
  const second = await seedCities();
  assert.equal(second.created.length, 0);
  assert.deepEqual(second.aliasesAdded, {});
  assert.equal(await City.countDocuments(), before);
});

test("seedCities never discards manual edits", async () => {
  const khujner = await City.findOne({ name: "Khujner" });
  khujner!.district = "Edited District";
  khujner!.aliases = [...khujner!.aliases, "khujner local spelling"];
  khujner!.isActive = false;
  await khujner!.save();

  await seedCities();

  const after = await City.findOne({ name: "Khujner" });
  assert.equal(after!.district, "Edited District");
  assert.ok(after!.aliases.includes("khujner local spelling"), "manual alias was dropped");
  assert.equal(after!.isActive, false, "a deactivated town must stay deactivated");

  // restore for later tests
  after!.district = "Rajgarh";
  after!.isActive = true;
  await after!.save();
});

test("seedCities adds a seed alias that was removed", async () => {
  const biaora = await City.findOne({ name: "Biaora" });
  biaora!.aliases = biaora!.aliases.filter((a) => a !== "biaora rajgarh");
  await biaora!.save();

  const result = await seedCities();
  assert.deepEqual(result.aliasesAdded["Biaora"], ["biaora rajgarh"]);
});

/* ------------------------------ seller mapping ---------------------------- */

test("a dry run reports but writes nothing", async () => {
  await Seller.deleteMany({});
  const a = await insertSeller("Dubliya Bite", "Biaora");
  const b = await insertSeller("Moon light", "Biaora rajgarh");
  const c = await insertSeller("Fashion hub", "Indore");

  const report = await mapSellers({ apply: false });

  assert.equal(report.applied, false);
  assert.equal(report.written, 0);
  assert.equal(report.counts.matched, 2);
  assert.equal(report.counts["no-matching-town"], 1);
  assert.equal((await sellerDoc(a))!.cityId, undefined, "dry run must not write");
  assert.equal((await sellerDoc(b))!.cityId, undefined);
  assert.equal((await sellerDoc(c))!.cityId, undefined);
});

test("apply assigns towns to clean matches only", async () => {
  const report = await mapSellers({ apply: true });
  assert.equal(report.written, 2);

  const biaora = await City.findOne({ name: "Biaora" });
  const mapped = await Seller.collection.find({ cityId: biaora!._id }).toArray();
  assert.equal(mapped.length, 2, "both Biaora spellings should map to the one town");

  const indore = await Seller.collection.findOne({ city: "Indore" });
  assert.equal(indore!.cityId, undefined, "test data must stay unmapped");
});

test("the free-text city is never changed", async () => {
  const spelled = await Seller.collection.findOne({ storeName: "Moon light" });
  assert.equal(spelled!.city, "Biaora rajgarh", "customer-facing code still reads this text");
});

test("a second apply changes nothing", async () => {
  const report = await mapSellers({ apply: true });
  assert.equal(report.written, 0);
  assert.equal(report.counts["already-mapped"], 2);
});

test("an existing cityId is never overwritten, even if the text disagrees", async () => {
  const khujner = await City.findOne({ name: "Khujner" });
  const id = await insertSeller("Hand assigned", "Biaora");
  await Seller.collection.updateOne({ _id: id }, { $set: { cityId: khujner!._id } });

  const report = await mapSellers({ apply: true });
  const row = report.rows.find((r) => r.sellerId === String(id));

  assert.equal(row!.status, "already-mapped");
  assert.equal(String((await sellerDoc(id))!.cityId), String(khujner!._id));
});

test("an inactive town is not a mapping target", async () => {
  const pachore = await City.findOne({ name: "Pachore" });
  pachore!.isActive = false;
  await pachore!.save();

  const id = await insertSeller("Chetak collection", "Pachore");
  const report = await mapSellers({ apply: true });
  const row = report.rows.find((r) => r.sellerId === String(id));

  assert.equal(row!.status, "no-matching-town");

  pachore!.isActive = true;
  await pachore!.save();
});

/* ---------------------------------- the API -------------------------------- */

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

async function tokenFor(email: string, role: string, mobile: string): Promise<string> {
  let admin = await Admin.findOne({ email });
  if (!admin) {
    admin = await Admin.create({
      firstName: "T",
      lastName: "User",
      mobile,
      email,
      password: "Passw0rd1",
      role,
    });
  }
  return generateAdminAccessToken(String(admin._id), admin.role, admin.tokenVersion ?? 0);
}

let viewerToken: string;
let managerToken: string;
let noTownsToken: string;

before(async () => {
  await Role.create({ name: "Towns Viewer", type: "Custom", permissions: ["settings.cities:view"] });
  await Role.create({
    name: "Towns Manager",
    type: "Custom",
    permissions: ["settings.cities:view", "settings.cities:manage"],
  });
  await Role.create({ name: "Dashboard Only", type: "Custom", permissions: ["dashboard:view"] });
  invalidateRoleCache();

  viewerToken = await tokenFor("viewer@example.com", "Towns Viewer", "9300000002");
  managerToken = await tokenFor("manager@example.com", "Towns Manager", "9300000003");
  noTownsToken = await tokenFor("dash@example.com", "Dashboard Only", "9300000004");
});

test("the town list is open to any admin, even without the Towns page", async () => {
  const result = await call("GET", "/admin/cities", noTownsToken);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.length, 6);
  assert.ok(typeof result.body.data[0].sellerCount === "number");
});

test("an unauthenticated request is refused", async () => {
  assert.equal((await call("GET", "/admin/cities")).status, 401);
});

test("a view-only role cannot create a town", async () => {
  const result = await call("POST", "/admin/cities", viewerToken, { name: "Newtown", state: "Madhya Pradesh" });
  assert.equal(result.status, 403);
  assert.equal(await City.countDocuments({ name: "Newtown", state: "Madhya Pradesh" }), 0);
});

test("a role without the Towns page cannot read the mapping report", async () => {
  assert.equal((await call("GET", "/admin/cities/mapping-report", noTownsToken)).status, 403);
});

test("a viewer can read the mapping report but not apply it", async () => {
  assert.equal((await call("GET", "/admin/cities/mapping-report", viewerToken)).status, 200);
  assert.equal((await call("POST", "/admin/cities/map-sellers", viewerToken)).status, 403);
});

test("a manager can create, edit and delete a town", async () => {
  const created = await call("POST", "/admin/cities", managerToken, {
    name: "Newtown",
    state: "Madhya Pradesh",
    district: "Somewhere",
    aliases: ["  New Town  ", "NEWTOWN LOCAL"],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  // aliases are stored normalised
  assert.deepEqual(created.body.data.aliases.sort(), ["new town", "newtown local"]);

  const id = created.body.data._id;
  const edited = await call("PUT", `/admin/cities/${id}`, managerToken, { district: "Elsewhere" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.district, "Elsewhere");

  const removed = await call("DELETE", `/admin/cities/${id}`, managerToken);
  assert.equal(removed.status, 200);
  assert.equal(await City.countDocuments({ _id: id }), 0);
});

test("an alias that already belongs to another town is refused", async () => {
  const result = await call("POST", "/admin/cities", managerToken, {
    name: "Another Place",
    state: "Madhya Pradesh",
    aliases: ["biaora"],
  });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, "TOWN_NAME_CLASH");
  assert.equal(await City.countDocuments({ name: "Another Place" }), 0);
});

test("a town name that matches an existing alias is refused", async () => {
  const result = await call("POST", "/admin/cities", managerToken, { name: "Biaora Rajgarh", state: "Madhya Pradesh" });
  assert.equal(result.status, 409);
});

test("an edit cannot steal another town's alias", async () => {
  const khujner = await City.findOne({ name: "Khujner" });
  const result = await call("PUT", `/admin/cities/${khujner!._id}`, managerToken, {
    aliases: ["sarangpur"],
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "TOWN_NAME_CLASH");
});

test("a town with sellers cannot be deleted", async () => {
  const biaora = await City.findOne({ name: "Biaora" });
  const result = await call("DELETE", `/admin/cities/${biaora!._id}`, managerToken);

  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, "TOWN_IN_USE");
  assert.ok(result.body.data.sellerCount >= 2);
  assert.ok(await City.exists({ _id: biaora!._id }), "the town must still exist");
});

test("a name with no latin letters is refused with a useful message", async () => {
  const result = await call("POST", "/admin/cities", managerToken, { name: "ब्यावरा", state: "Madhya Pradesh" });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /alias/i);
});

test("the mapping report lists what needs a decision", async () => {
  await insertSeller("Mystery shop", "Atlantis");
  const result = await call("GET", "/admin/cities/mapping-report", viewerToken);

  assert.equal(result.status, 200);
  const texts = result.body.data.unmatchedTexts.map((t: { text: string }) => t.text);
  assert.ok(texts.includes("Atlantis"));
  assert.ok(
    result.body.data.attention.some((r: { cityText: string }) => r.cityText === "Atlantis"),
  );
});

test("applying the mapping over HTTP is idempotent", async () => {
  await insertSeller("Late Khujner shop", "Khujner");

  const first = await call("POST", "/admin/cities/map-sellers", managerToken);
  assert.equal(first.status, 200);
  assert.ok(first.body.data.written >= 1);

  const second = await call("POST", "/admin/cities/map-sellers", managerToken);
  assert.equal(second.body.data.written, 0);
});

/* ------------------------- lowest prices dropdown ------------------------- */

test("the serviceable-cities dropdown keeps raw spellings and adds town names", async () => {
  // Customer-side matching compares a section's city to the sellers' raw text,
  // so nothing that was selectable may disappear.
  const result = await call("GET", "/admin/lowest-prices-sections/cities", noTownsToken);
  assert.equal(result.status, 200, JSON.stringify(result.body));

  const cities: string[] = result.body.data;
  assert.equal(cities[0], "All Cities");
  assert.ok(cities.includes("Biaora"), "town name should be offered");
  assert.ok(cities.includes("Biaora rajgarh"), "a raw seller spelling must stay selectable");
  assert.ok(cities.includes("Khujner"));
});
