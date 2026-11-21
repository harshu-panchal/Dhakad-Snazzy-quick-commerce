import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import City, { INDIAN_STATES, canonicalState, stateKey, townSlug, pickTown } from "../../models/City";
import Seller from "../../models/Seller";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import { seedCities } from "../../scripts/seedCities";
import { classifySellers, mapSellers } from "../../services/townMappingService";
import { generateAdminAccessToken } from "../../services/jwtService";
import { SUPER_ADMIN_ROLE } from "../../config/permissions";

/**
 * Towns across India: a town is its name PLUS its state, state names are
 * understood however a seller types them, and the list is not capped.
 */

/* ------------------------------------------------------------------------ */
/*                              State names (pure)                          */
/* ------------------------------------------------------------------------ */

test("every way of writing a state gives the official name", () => {
  for (const typed of ["mp", "MP", "M.P.", "madhya pradesh", "  MADHYA   PRADESH ", "Madhya Pradesh"]) {
    assert.equal(canonicalState(typed), "Madhya Pradesh", typed);
  }
  assert.equal(canonicalState("J&K"), "Jammu and Kashmir");
  assert.equal(canonicalState("Jammu & Kashmir"), "Jammu and Kashmir");
  assert.equal(canonicalState("orissa"), "Odisha");
  assert.equal(canonicalState("Uttaranchal"), "Uttarakhand");
  assert.equal(canonicalState("NCT of Delhi"), "Delhi");
});

test("an unrecognised state is kept as typed, not guessed at", () => {
  assert.equal(canonicalState("  Narnia "), "Narnia");
  assert.equal(canonicalState(undefined), "");
  assert.equal(canonicalState(null), "");
  assert.equal(canonicalState(42), "");
});

test("two spellings of one state share a key, different states do not", () => {
  assert.equal(stateKey("MH"), stateKey("maharashtra"));
  assert.notEqual(stateKey("Bihar"), stateKey("Maharashtra"));
});

test("the state list is the 28 states and 8 territories, with no duplicates", () => {
  assert.equal(INDIAN_STATES.length, 36);
  assert.equal(new Set(INDIAN_STATES).size, 36);
  // every official name resolves to itself
  for (const name of INDIAN_STATES) assert.equal(canonicalState(name), name);
});

test("a town's slug includes its state, so the same name in two states differs", () => {
  assert.equal(townSlug("Aurangabad", "Maharashtra"), "aurangabad-maharashtra");
  assert.notEqual(townSlug("Aurangabad", "Maharashtra"), townSlug("Aurangabad", "Bihar"));
  assert.equal(townSlug("Aurangabad", "MH"), "aurangabad-maharashtra", "a short form gives the same slug");
  assert.equal(townSlug("Biaora"), "biaora", "no state falls back to the name alone");
});

/* ------------------------------------------------------------------------ */
/*                       Choosing a town for a seller (pure)                */
/* ------------------------------------------------------------------------ */

const aurMH = { _id: "mh", name: "Aurangabad", state: "Maharashtra" };
const aurBR = { _id: "br", name: "Aurangabad", state: "Bihar" };

test("one matching town is used, with or without a seller state", () => {
  assert.equal((pickTown([aurMH]) as any).town._id, "mh");
  assert.equal((pickTown([aurMH], "Maharashtra") as any).town._id, "mh");
  assert.equal((pickTown([aurMH], "MH") as any).town._id, "mh", "a short form counts");
});

test("the seller's state picks between towns of the same name", () => {
  assert.equal((pickTown([aurMH, aurBR], "Bihar") as any).town._id, "br");
  assert.equal((pickTown([aurMH, aurBR], "mh") as any).town._id, "mh");
});

test("two towns of the same name and no seller state is ambiguous, not a guess", () => {
  assert.equal(pickTown([aurMH, aurBR]).kind, "ambiguous");
  assert.equal(pickTown([aurMH, aurBR], "").kind, "ambiguous");
});

test("a seller in a state where the city does not exist is a mismatch, not put in another state", () => {
  assert.equal(pickTown([aurMH, aurBR], "Kerala").kind, "state-mismatch");
  assert.equal(pickTown([aurMH], "Bihar").kind, "state-mismatch");
});

test("a town with no state recorded accepts a seller from any state", () => {
  assert.equal(pickTown([{ _id: "x", name: "Legacy" }], "Kerala").kind, "matched");
});

test("none when nothing matches", () => {
  assert.equal(pickTown([]).kind, "none");
});

test("the mapping reports each outcome with a useful detail", () => {
  const towns = [
    { _id: "mh", name: "Aurangabad", aliases: [], state: "Maharashtra" },
    { _id: "br", name: "Aurangabad", aliases: [], state: "Bihar" },
  ];
  const rows = classifySellers(
    [
      { _id: "1", storeName: "A", city: "Aurangabad", state: "MH" },
      { _id: "2", storeName: "B", city: "Aurangabad", state: "Bihar" },
      { _id: "3", storeName: "C", city: "Aurangabad", state: null },
      { _id: "4", storeName: "D", city: "Aurangabad", state: "Kerala" },
    ],
    towns,
  );

  assert.equal(rows[0].status, "matched");
  assert.equal(rows[0].townId, "mh");
  assert.equal(rows[1].townId, "br");
  assert.equal(rows[2].status, "ambiguous");
  assert.match(rows[2].detail!, /no state to tell them apart/);
  assert.equal(rows[3].status, "state-mismatch");
  assert.match(rows[3].detail!, /Kerala/);
});

/* ------------------------------------------------------------------------ */
/*                       Database and API (real MongoDB)                    */
/* ------------------------------------------------------------------------ */

let server: MongoMemoryReplSet;
let httpServer: http.Server;
let baseUrl: string;
let token: string;

before(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(server.getUri());
  await seedRbac();
  await seedCities();

  const routes = (await import("../../routes")).default;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", routes);

  httpServer = http.createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/v1`;

  const admin = await Admin.create({
    firstName: "S", lastName: "A", mobile: "9800000001", email: "nat@test.local",
    password: "Passw0rd1", role: SUPER_ADMIN_ROLE,
  });
  token = generateAdminAccessToken(String(admin._id), admin.role, admin.tokenVersion ?? 0);
}, { timeout: 180_000 });

after(async () => {
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await mongoose.disconnect();
  await server?.stop();
});

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, body: json };
}

let n = 0;
async function makeSeller(city: string, state?: string) {
  n += 1;
  return Seller.create({
    sellerName: `S${n}`, storeName: `Store ${n}`, email: `nat${n}@test.local`,
    mobile: String(7600000000 + n), password: "Passw0rd1", category: "Food",
    pincode: "431001", commission: 10, status: "Approved",
    location: { type: "Point", coordinates: [75.3 + n / 1000, 19.9] },
    state: state ?? "Maharashtra", city,
  });
}

/**
 * A seller with NO state, like the legacy ones in the live data: the schema now
 * requires a state, so this can only be inserted raw.
 */
async function insertSellerWithoutState(city: string) {
  n += 1;
  const r = await Seller.collection.insertOne({
    sellerName: `S${n}`, storeName: `Store ${n}`, email: `nat${n}@test.local`,
    mobile: String(7600000000 + n), category: "Food", pincode: "431001", status: "Approved", city,
    isDeleted: false,
  } as any);
  return r.insertedId;
}

test("a state is required to add a town", async () => {
  const res = await call("POST", "/admin/cities", { name: "Aurangabad" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /state/i);
  assert.equal(await City.countDocuments({ name: "Aurangabad" }), 0);
});

test("the same name in two states is two towns", async () => {
  const mh = await call("POST", "/admin/cities", { name: "Aurangabad", state: "MH", district: "Aurangabad" });
  assert.equal(mh.status, 201, JSON.stringify(mh.body));
  assert.equal(mh.body.data.state, "Maharashtra", "a short form is stored as the official name");

  const br = await call("POST", "/admin/cities", { name: "Aurangabad", state: "Bihar", district: "Aurangabad" });
  assert.equal(br.status, 201, JSON.stringify(br.body));

  assert.notEqual(mh.body.data.slug, br.body.data.slug);
  assert.equal(await City.countDocuments({ name: "Aurangabad" }), 2);
});

test("the same name twice in one state is refused, even typed differently", async () => {
  const dup = await call("POST", "/admin/cities", { name: "  aurangabad ", state: "maharashtra" });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal(dup.body.code, "TOWN_NAME_CLASH");
  assert.equal(await City.countDocuments({ name: /aurangabad/i }), 2, "nothing new was created");
});

test("an alias may be reused in another state but not within one", async () => {
  const sameState = await call("POST", "/admin/cities", { name: "Sambhajinagar", state: "Maharashtra", aliases: ["aurangabad"] });
  assert.equal(sameState.status, 409, "Aurangabad is already a Maharashtra town name");

  const otherState = await call("POST", "/admin/cities", { name: "Jalna", state: "Karnataka", aliases: ["aurangabad"] });
  assert.equal(otherState.status, 201, JSON.stringify(otherState.body));
});

test("a town cannot be moved into a state where its name is taken, or lose its state", async () => {
  const bihar = await City.findOne({ name: "Aurangabad", state: "Bihar" });

  const clash = await call("PUT", `/admin/cities/${bihar!._id}`, { state: "Maharashtra" });
  assert.equal(clash.status, 409, JSON.stringify(clash.body));

  const blank = await call("PUT", `/admin/cities/${bihar!._id}`, { state: "  " });
  assert.equal(blank.status, 400);

  assert.equal((await City.findById(bihar!._id))!.state, "Bihar", "unchanged by either refusal");
});

test("the town list has no cap", async () => {
  const docs = Array.from({ length: 600 }, (_, i) => ({
    name: `Bulk Town ${i}`, slug: `bulk-town-${i}-gujarat`, state: "Gujarat", aliases: [], isActive: true,
  }));
  await City.collection.insertMany(docs as any);

  const res = await call("GET", "/admin/cities");
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 600 + 6, `expected every town, got ${res.body.data.length}`);
});

test("seeding does not duplicate a town that has a name-only slug", async () => {
  // Towns made before slugs included the state, like the live ones.
  await City.deleteOne({ name: "Biaora" });
  await City.collection.insertOne({
    name: "Biaora", slug: "biaora", state: "Madhya Pradesh", district: "Rajgarh", aliases: [], isActive: true,
  } as any);

  await seedCities();
  await seedCities();

  assert.equal(await City.countDocuments({ name: "Biaora" }), 1, "a second Biaora would appear on every restart");
});

test("a seller is given the town in their own state", async () => {
  const mh = await City.findOne({ name: "Aurangabad", state: "Maharashtra" });
  const br = await City.findOne({ name: "Aurangabad", state: "Bihar" });

  const a = await makeSeller("Aurangabad", "MH");
  const b = await makeSeller("Aurangabad", "Bihar");

  assert.equal(String(a.cityId), String(mh!._id));
  assert.equal(String(b.cityId), String(br!._id));
  assert.equal(a.city, "Aurangabad", "the free-text city is never rewritten");
});

test("a seller whose state fits no town of that name, or has none, is left without one", async () => {
  const wrongState = await makeSeller("Aurangabad", "Kerala");
  assert.equal(wrongState.cityId, undefined);

  // The sign-up hook with no state: two towns share the name, so it must not guess.
  const { findTownIdForText } = await import("../../models/Seller");
  assert.equal(await findTownIdForText("Aurangabad", undefined), null);
  assert.equal(await findTownIdForText("Aurangabad", ""), null);
});

test("the mapping reports a wrong-state seller instead of assigning them", async () => {
  await insertSellerWithoutState("Aurangabad");
  const report = await mapSellers({ apply: false });
  const rows = report.rows.filter((r) => r.cityText === "Aurangabad");

  assert.ok(rows.some((r) => r.status === "state-mismatch"), "the Kerala seller");
  assert.ok(rows.some((r) => r.status === "ambiguous"), "the seller with no state");
  assert.equal(report.counts["state-mismatch"] >= 1, true);

  const applied = await mapSellers({ apply: true });
  const stillUnassigned = await Seller.countDocuments({ city: "Aurangabad", cityId: { $exists: false } });
  assert.ok(stillUnassigned >= 2, "neither unclear seller was assigned");
  assert.equal(applied.written, 0, "nothing unambiguous was left to write");
});

test("the Towns page report lists state mismatches for review", async () => {
  const res = await call("GET", "/admin/cities/mapping-report");
  assert.equal(res.status, 200);
  assert.ok(res.body.data.attention.some((r: { status: string }) => r.status === "state-mismatch"));
});
