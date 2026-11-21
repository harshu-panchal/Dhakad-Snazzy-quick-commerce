import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import City from "../../models/City";
import Seller from "../../models/Seller";
import Role from "../../models/Role";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import { seedCities } from "../../scripts/seedCities";
import { softDeleteSeller } from "../../services/sellerLifecycleService";
import { forgetSeller } from "../../services/sellerAccessService";
import {
  backfillOrderTowns,
  classifyOrderTown,
  distinctSellerIdsForItems,
  townForSellers,
} from "../../services/orderTownService";
import { generateAdminAccessToken, generateToken } from "../../services/jwtService";
import { invalidateRoleCache } from "../../services/adminPermissionService";
import { SUPER_ADMIN_ROLE } from "../../config/permissions";

/**
 * Phase B: seller town hooks, soft delete, the one-seller guard on checkout,
 * and the order backfill. Real MongoDB, real router.
 */

let server: MongoMemoryReplSet;
let httpServer: http.Server;
let baseUrl: string;

before(async () => {
  process.env.RATE_LIMIT_LOGIN_MAX = "10000";

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
}, { timeout: 180_000 });

after(async () => {
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await mongoose.disconnect();
  await server?.stop();
});

/* --------------------------------- helpers -------------------------------- */

let n = 0;

async function makeSeller(
  city: string | null,
  extra: Record<string, unknown> = {},
) {
  n += 1;
  return Seller.create({
    sellerName: `Seller ${n}`,
    storeName: `Store ${n}`,
    email: `seller${n}@test.local`,
    mobile: String(7100000000 + n),
    password: "Passw0rd1",
    category: "Food",
    state: "Madhya Pradesh",
    pincode: "465674",
    commission: 10,
    status: "Approved",
    // Real sellers always have coordinates; the 2dsphere index rejects a Point
    // without them.
    location: { type: "Point", coordinates: [76.9 + n / 1000, 23.9] },
    ...(city !== null ? { city } : {}),
    ...extra,
  });
}

const townId = async (name: string) => String((await City.findOne({ name }))!._id);

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

async function adminToken(email: string, role: string, mobile: string): Promise<string> {
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

let superToken: string;
let readerToken: string;

before(async () => {
  await Role.create({ name: "Seller Reader", type: "Custom", permissions: ["sellers.list:view"] });
  invalidateRoleCache();
  superToken = await adminToken("super@b.test", SUPER_ADMIN_ROLE, "9400000001");
  readerToken = await adminToken("reader@b.test", "Seller Reader", "9400000002");
});

/* ------------------------------------------------------------------------ */
/*                       Seller town assignment (hooks)                     */
/* ------------------------------------------------------------------------ */

test("a new seller is assigned the town its city text names", async () => {
  const seller = await makeSeller("Khujner");
  assert.equal(String(seller.cityId), await townId("Khujner"));
});

test("matching ignores case and uses aliases, and never rewrites the text", async () => {
  const upper = await makeSeller("SARANGPUR");
  assert.equal(String(upper.cityId), await townId("Sarangpur"));
  assert.equal(upper.city, "SARANGPUR", "the free-text city must stay as entered");

  const alias = await makeSeller("Biaora rajgarh");
  assert.equal(String(alias.cityId), await townId("Biaora"));
});

test("a city that matches no town leaves the seller without one", async () => {
  const seller = await makeSeller("Indore");
  assert.equal(seller.cityId, undefined);
});

test("a seller with no city has no town", async () => {
  const seller = await makeSeller(null);
  assert.equal(seller.cityId, undefined);
});

test("editing the city through findByIdAndUpdate re-assigns the town", async () => {
  const seller = await makeSeller("Khujner");

  // plain-object update, the way sellerController.updateSeller calls it
  const moved = await Seller.findByIdAndUpdate(seller._id, { city: "Pachore" }, { new: true });
  assert.equal(String(moved!.cityId), await townId("Pachore"));
  assert.equal(moved!.city, "Pachore");

  // a $set update works the same way
  const again = await Seller.findOneAndUpdate(
    { _id: seller._id },
    { $set: { city: "Bhayana" } },
    { new: true },
  );
  assert.equal(String(again!.cityId), await townId("Bhayana"));
});

test("changing to a city with no town clears the old one rather than leaving it stale", async () => {
  const seller = await makeSeller("Khujner");
  assert.ok(seller.cityId);

  const moved = await Seller.findByIdAndUpdate(seller._id, { city: "Atlantis" }, { new: true });
  assert.equal(moved!.cityId, undefined);
});

test("an explicit cityId in the same update wins over the text", async () => {
  const seller = await makeSeller("Khujner");
  const biaora = await townId("Biaora");

  const updated = await Seller.findByIdAndUpdate(
    seller._id,
    { city: "Khujner", cityId: biaora },
    { new: true },
  );
  assert.equal(String(updated!.cityId), biaora);
});

test("an unrelated edit does not touch the town", async () => {
  const seller = await makeSeller("Khujner");
  const before = String(seller.cityId);

  const updated = await Seller.findByIdAndUpdate(seller._id, { storeName: "Renamed" }, { new: true });
  assert.equal(String(updated!.cityId), before);
});

test("changing city through save() re-assigns the town", async () => {
  const seller = await makeSeller("Khujner");
  seller.city = "Pachore";
  await seller.save();
  assert.equal(String(seller.cityId), await townId("Pachore"));
});

test("saving without changing the city leaves the town alone", async () => {
  const seller = await makeSeller("Khujner");
  const hand = await townId("Biaora");
  await Seller.updateOne({ _id: seller._id }, { $set: { cityId: hand } }); // hand-assigned

  const loaded = await Seller.findById(seller._id);
  loaded!.storeName = "Another name";
  await loaded!.save();

  const after = await Seller.findById(seller._id).lean();
  assert.equal(String(after!.cityId), hand, "a hand-assigned town must survive an unrelated save");
});

/* ------------------------------------------------------------------------ */
/*                                Soft delete                               */
/* ------------------------------------------------------------------------ */

test("soft delete keeps the record but hides and releases the seller", async () => {
  const seller = await makeSeller("Biaora");
  const adminId = new Types.ObjectId().toString();

  assert.equal(await softDeleteSeller(String(seller._id), adminId), "deleted");

  const doc = await Seller.findById(seller._id).lean();
  assert.ok(doc, "the document must remain");
  assert.equal(doc!.isDeleted, true);
  assert.equal(doc!.status, "Deleted", "status must leave Approved so customer queries drop it");
  assert.equal(doc!.statusBeforeDelete, "Approved");
  assert.equal(doc!.isShopOpen, false);
  assert.equal(String(doc!.deletedBy), adminId);
  assert.ok(doc!.deletedAt);

  // contact details released, originals kept for a restore
  assert.notEqual(doc!.email, seller.email);
  assert.notEqual(doc!.mobile, seller.mobile);
  assert.equal(doc!.deletedSnapshot!.email, seller.email);
  assert.equal(doc!.deletedSnapshot!.mobile, seller.mobile);

  // the town survives, so its orders can still be attributed
  assert.equal(String(doc!.cityId), await townId("Biaora"));
});

test("deleting twice does not overwrite the snapshot", async () => {
  const seller = await makeSeller("Khujner");
  await softDeleteSeller(String(seller._id));
  assert.equal(await softDeleteSeller(String(seller._id)), "already-deleted");

  const doc = await Seller.findById(seller._id).lean();
  assert.equal(doc!.deletedSnapshot!.email, seller.email, "the original email must still be the snapshot");
});

test("deleting an unknown or malformed id is not-found", async () => {
  assert.equal(await softDeleteSeller(new Types.ObjectId().toString()), "not-found");
  assert.equal(await softDeleteSeller("not-an-id"), "not-found");
});

test("the email and mobile of a deleted seller can be registered again", async () => {
  const seller = await makeSeller("Biaora");
  const { email, mobile } = seller;
  await softDeleteSeller(String(seller._id));

  const again = await Seller.create({
    sellerName: "Same Person",
    storeName: "Reopened",
    email,
    mobile,
    password: "Passw0rd1",
    category: "Food",
    state: "Madhya Pradesh",
    pincode: "465674",
    commission: 10,
    location: { type: "Point", coordinates: [77.0, 24.0] },
  });
  assert.equal(again.email, email);
  assert.notEqual(String(again._id), String(seller._id));
});

test("DELETE /sellers/:id soft-deletes over HTTP", async () => {
  const seller = await makeSeller("Sarangpur");

  const result = await call("DELETE", `/sellers/${seller._id}`, superToken);
  assert.equal(result.status, 200, JSON.stringify(result.body));

  const doc = await Seller.findById(seller._id).lean();
  assert.ok(doc, "the seller must still exist after an HTTP delete");
  assert.equal(doc!.isDeleted, true);
});

test("a second DELETE is a 409 and an unknown id a 404", async () => {
  const seller = await makeSeller("Sarangpur");
  await call("DELETE", `/sellers/${seller._id}`, superToken);

  assert.equal((await call("DELETE", `/sellers/${seller._id}`, superToken)).status, 409);
  assert.equal(
    (await call("DELETE", `/sellers/${new Types.ObjectId()}`, superToken)).status,
    404,
  );
});

test("a view-only admin cannot delete a seller", async () => {
  const seller = await makeSeller("Sarangpur");
  const result = await call("DELETE", `/sellers/${seller._id}`, readerToken);

  assert.equal(result.status, 403);
  assert.equal((await Seller.findById(seller._id).lean())!.isDeleted, false);
});

test("the admin seller list hides deleted sellers unless asked", async () => {
  const kept = await makeSeller("Khujner");
  const gone = await makeSeller("Khujner");
  await softDeleteSeller(String(gone._id));

  const ids = (r: any) => r.body.data.map((s: { _id: string }) => s._id);

  const normal = await call("GET", "/sellers", superToken);
  assert.ok(ids(normal).includes(String(kept._id)));
  assert.ok(!ids(normal).includes(String(gone._id)), "a deleted seller must not be listed");

  const withDeleted = await call("GET", "/sellers?includeDeleted=true", superToken);
  assert.ok(ids(withDeleted).includes(String(gone._id)));
});

test("the seller picker lookup hides deleted sellers", async () => {
  const gone = await makeSeller("Khujner");
  await softDeleteSeller(String(gone._id));

  const result = await call("GET", "/admin/sellers", readerToken);
  assert.equal(result.status, 200);
  const ids = result.body.data.map((s: { _id: string }) => s._id);
  assert.ok(!ids.includes(String(gone._id)));
});

test("a deleted seller cannot be re-approved or edited", async () => {
  const seller = await makeSeller("Khujner");
  await softDeleteSeller(String(seller._id));

  const approve = await call("PATCH", `/sellers/${seller._id}/status`, superToken, { status: "Approved" });
  assert.equal(approve.status, 404, "re-approving would make it visible to customers again");

  const edit = await call("PUT", `/sellers/${seller._id}`, superToken, {
    storeName: "Sneaky",
    status: "Approved",
    isDeleted: false,
  });
  assert.equal(edit.status, 404);

  const doc = await Seller.findById(seller._id).lean();
  assert.equal(doc!.status, "Deleted");
  assert.equal(doc!.isDeleted, true);
});

test("an edit cannot smuggle in lifecycle fields", async () => {
  const seller = await makeSeller("Khujner");

  const result = await call("PUT", `/sellers/${seller._id}`, superToken, {
    storeName: "Edited",
    isDeleted: true,
    status: "Deleted",
    deletedSnapshot: { email: "x@y.z" },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));

  const doc = await Seller.findById(seller._id).lean();
  assert.equal(doc!.storeName, "Edited");
  assert.equal(doc!.isDeleted, false, "isDeleted must not be settable through an edit");
  assert.notEqual(doc!.status, "Deleted");
  assert.equal(doc!.deletedSnapshot?.email, undefined);
});

test("editing a seller's city over HTTP re-assigns the town", async () => {
  const seller = await makeSeller("Khujner");
  const result = await call("PUT", `/sellers/${seller._id}`, superToken, { city: "Pachore" });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(String((await Seller.findById(seller._id).lean())!.cityId), await townId("Pachore"));
});

test("a deleted seller's token stops working immediately", async () => {
  const seller = await makeSeller("Khujner");
  const token = generateToken(String(seller._id), "Seller");

  const before = await call("GET", "/auth/seller/profile", token);
  assert.equal(before.status, 200, JSON.stringify(before.body));

  await call("DELETE", `/sellers/${seller._id}`, superToken);

  const after = await call("GET", "/auth/seller/profile", token);
  assert.equal(after.status, 401);
  assert.equal(after.body.code, "ACCOUNT_DELETED");
});

test("a token for a seller that no longer exists at all is refused", async () => {
  forgetSeller("ghost");
  const token = generateToken(String(new Types.ObjectId()), "Seller");
  assert.equal((await call("GET", "/auth/seller/profile", token)).status, 401);
});

/* ------------------------------------------------------------------------ */
/*                         One seller per order (checkout)                  */
/* ------------------------------------------------------------------------ */

async function makeProduct(sellerId: unknown, stock = 5) {
  const result = await mongoose.connection.collection("products").insertOne({
    productName: `Product ${++n}`,
    seller: sellerId,
    price: 100,
    stock,
    status: "Active",
    publish: true,
  });
  return result.insertedId;
}

const customerToken = () => generateToken(String(new Types.ObjectId()), "Customer");

test("distinctSellerIdsForItems reads sellers from the products, not the client", async () => {
  const a = await makeSeller("Biaora");
  const b = await makeSeller("Biaora");
  const pa = await makeProduct(a._id);
  const pb = await makeProduct(b._id);
  const pa2 = await makeProduct(a._id);

  const ids = await distinctSellerIdsForItems([
    { product: { id: String(pa) } },
    { product: { id: String(pa2) } },
    { product: { id: String(pb) } },
  ]);
  assert.equal(ids.length, 2);
  assert.deepEqual(ids.sort(), [String(a._id), String(b._id)].sort());
});

test("distinctSellerIdsForItems tolerates junk input", async () => {
  assert.deepEqual(await distinctSellerIdsForItems(undefined), []);
  assert.deepEqual(await distinctSellerIdsForItems([]), []);
  assert.deepEqual(
    await distinctSellerIdsForItems([{ product: { id: "not-an-id" } }, {}, null]),
    [],
  );
});

test("checkout refuses an order with items from two sellers, before touching stock", async () => {
  const a = await makeSeller("Khujner");
  const b = await makeSeller("Bhayana");
  const pa = await makeProduct(a._id, 5);
  const pb = await makeProduct(b._id, 5);

  const result = await call("POST", "/customer/orders", customerToken(), {
    items: [
      { product: { id: String(pa) }, quantity: 2 },
      { product: { id: String(pb) }, quantity: 3 },
    ],
    address: { address: "x", city: "Khujner", pincode: "465674", latitude: 23.78, longitude: 76.61 },
    paymentMethod: "COD",
  });

  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.code, "MULTI_SELLER_ORDER");

  const products = mongoose.connection.collection("products");
  assert.equal((await products.findOne({ _id: pa }))!.stock, 5, "stock must be untouched");
  assert.equal((await products.findOne({ _id: pb }))!.stock, 5, "stock must be untouched");
});

test("a single-seller checkout gets past the seller guard", async () => {
  const a = await makeSeller("Khujner");
  const p1 = await makeProduct(a._id);
  const p2 = await makeProduct(a._id);

  // No address, so it fails later with the address message, which proves the
  // seller guard did not reject it.
  const result = await call("POST", "/customer/orders", customerToken(), {
    items: [
      { product: { id: String(p1) }, quantity: 1 },
      { product: { id: String(p2) }, quantity: 1 },
    ],
    paymentMethod: "COD",
  });

  assert.equal(result.status, 400);
  assert.notEqual(result.body.code, "MULTI_SELLER_ORDER");
  assert.match(result.body.message, /address/i);
});

test("townForSellers picks the one town, or none when unsure", () => {
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();

  assert.equal(String(townForSellers([{ cityId: a }])), String(a));
  assert.equal(String(townForSellers([{ cityId: a }, { cityId: a }])), String(a));
  assert.equal(townForSellers([{ cityId: a }, { cityId: b }]), undefined);
  assert.equal(townForSellers([{}]), undefined);
  assert.equal(townForSellers([]), undefined);
});

/* ------------------------------------------------------------------------ */
/*                              Order backfill                              */
/* ------------------------------------------------------------------------ */

test("classifyOrderTown covers every branch", () => {
  const one = { sellerCount: 1, sellersFound: 1, townIds: ["t1"], sellersWithoutTown: 0 };

  assert.deepEqual(classifyOrderTown(one), { status: "assign", townId: "t1" });
  assert.equal(classifyOrderTown(undefined).status, "no-items");
  assert.equal(classifyOrderTown({ ...one, sellerCount: 0, sellersFound: 0 }).status, "no-items");
  assert.equal(classifyOrderTown({ ...one, sellerCount: 2, sellersFound: 1 }).status, "seller-missing");
  assert.equal(classifyOrderTown({ ...one, townIds: [], sellersWithoutTown: 1 }).status, "seller-no-town");
  assert.equal(classifyOrderTown({ ...one, sellerCount: 2, sellersFound: 2, townIds: ["t1", "t2"] }).status, "cross-town");
  // a missing seller outranks everything: the answer is unknowable
  assert.equal(
    classifyOrderTown({ sellerCount: 2, sellersFound: 1, townIds: ["t1"], sellersWithoutTown: 0 }).status,
    "seller-missing",
  );
});

const orders = () => mongoose.connection.collection("orders");
const orderItems = () => mongoose.connection.collection("orderitems");

async function makeOrder(
  sellerIds: unknown[],
  extra: Record<string, unknown> = {},
  itemsPerSeller = 1,
) {
  const result = await orders().insertOne({
    orderNumber: `ORD-${++n}`,
    status: "Delivered",
    orderDate: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...extra,
  });
  for (const sellerId of sellerIds) {
    for (let i = 0; i < itemsPerSeller; i += 1) {
      await orderItems().insertOne({ order: result.insertedId, seller: sellerId });
    }
  }
  return result.insertedId;
}

test("the backfill assigns towns only where it is unambiguous", async () => {
  await orders().deleteMany({});
  await orderItems().deleteMany({});

  const biaora1 = await makeSeller("Biaora");
  const biaora2 = await makeSeller("Biaora");
  const khujner = await makeSeller("Khujner");
  const noTown = await makeSeller("Indore");
  const goneSeller = new Types.ObjectId(); // never existed: an orphaned order
  const softDeleted = await makeSeller("Sarangpur");
  await softDeleteSeller(String(softDeleted._id));

  const ids = {
    single: await makeOrder([biaora1._id]),
    twoItems: await makeOrder([biaora1._id], {}, 2),
    sameTown: await makeOrder([biaora1._id, biaora2._id]),
    crossTown: await makeOrder([biaora1._id, khujner._id]),
    noTown: await makeOrder([noTown._id]),
    orphan: await makeOrder([goneSeller]),
    noItems: await makeOrder([]),
    softDeleted: await makeOrder([softDeleted._id]),
    already: await makeOrder([biaora1._id], { cityId: new Types.ObjectId(await townId("Khujner")) }),
  };

  const dry = await backfillOrderTowns({ apply: false });
  assert.equal(dry.written, 0);
  assert.equal(dry.totalOrders, 9);
  assert.deepEqual(dry.counts, {
    assign: 4, // single, twoItems, sameTown, softDeleted
    "already-set": 1,
    "seller-missing": 1,
    "seller-no-town": 1,
    "cross-town": 1,
    "no-items": 1,
  });
  assert.equal((await orders().findOne({ _id: ids.single }))!.cityId, undefined, "a dry run must write nothing");

  const applied = await backfillOrderTowns({ apply: true });
  assert.equal(applied.written, 4);

  const cityOf = async (id: unknown) => (await orders().findOne({ _id: id as never }))!.cityId;
  const biaoraId = await townId("Biaora");

  assert.equal(String(await cityOf(ids.single)), biaoraId);
  assert.equal(String(await cityOf(ids.twoItems)), biaoraId);
  assert.equal(String(await cityOf(ids.sameTown)), biaoraId);
  assert.equal(String(await cityOf(ids.softDeleted)), await townId("Sarangpur"), "a soft-deleted seller keeps its orders' town");

  // left alone
  assert.equal(await cityOf(ids.crossTown), undefined);
  assert.equal(await cityOf(ids.noTown), undefined);
  assert.equal(await cityOf(ids.orphan), undefined, "orders from a deleted seller stay without a town");
  assert.equal(await cityOf(ids.noItems), undefined);

  // never overwritten, even though the seller says Biaora
  assert.equal(String(await cityOf(ids.already)), await townId("Khujner"));
});

test("the backfill does not disturb updatedAt", async () => {
  const doc = await orders().findOne({ cityId: { $exists: true }, orderNumber: /^ORD-/ });
  assert.equal(
    new Date(doc!.updatedAt).toISOString(),
    new Date("2026-01-02").toISOString(),
    "bookkeeping must not change an order's updatedAt",
  );
});

test("a second backfill changes nothing", async () => {
  const again = await backfillOrderTowns({ apply: true });
  assert.equal(again.written, 0);
  assert.equal(again.counts.assign, 0);
});
