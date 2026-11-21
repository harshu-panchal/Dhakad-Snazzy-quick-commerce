import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

import City from "../../models/City";
import Seller from "../../models/Seller";
import Order from "../../models/Order";
import Product from "../../models/Product";
import Customer from "../../models/Customer";
import Return from "../../models/Return";
import Commission from "../../models/Commission";
import Shipment from "../../models/Shipment";
import WalletTransaction from "../../models/WalletTransaction";
import WithdrawRequest from "../../models/WithdrawRequest";
import Role from "../../models/Role";
import Admin from "../../models/Admin";
import { seedRbac } from "../../scripts/seedRbac";
import { seedCities } from "../../scripts/seedCities";
import { townScoped } from "../../services/townScope";
import { generateAdminAccessToken } from "../../services/jwtService";
import { invalidateRoleCache } from "../../services/adminPermissionService";
import { ALL_PERMISSIONS, SUPER_ADMIN_ROLE } from "../../config/permissions";

/**
 * Phase D: a town-limited admin only ever sees records in their towns.
 *
 * Method: two towns of data, then for every endpoint call it as a Biaora admin
 * and assert (a) no Khujner record appears anywhere in the response and (b) a
 * Biaora record does, so an empty response cannot pass as "no leak".
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

  // One sequential setup: the fixtures need the towns seeded above.
  await setupFixtures();
}, { timeout: 180_000 });

after(async () => {
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await mongoose.disconnect();
  await server?.stop();
});

/* --------------------------------- helpers -------------------------------- */

async function call(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (a CSV export)
  }
  return { status: response.status, body: json, text };
}

const raw = (name: string) => mongoose.connection.collection(name);

let n = 0;
const uniq = () => ++n;

/** Everything in these ids' documents that identifies them in a response. */
const has = (res: { text: string }, token: unknown) => res.text.includes(String(token));

let TOWN: { biaora: string; khujner: string };

interface Fixture {
  sellerB: Types.ObjectId;
  sellerK: Types.ObjectId;
  sellerNone: Types.ObjectId;
  productB: Types.ObjectId;
  productK: Types.ObjectId;
  custB: Types.ObjectId;
  custK: Types.ObjectId;
  custBoth: Types.ObjectId;
  custNone: Types.ObjectId;
  orderB1: Types.ObjectId;
  orderB2: Types.ObjectId;
  orderBBoth: Types.ObjectId;
  orderK1: Types.ObjectId;
  orderKBoth: Types.ObjectId;
  orderOrphan: Types.ObjectId;
  numberOf: Record<string, string>;
  returnB: Types.ObjectId;
  returnK: Types.ObjectId;
  commissionB: Types.ObjectId;
  commissionK: Types.ObjectId;
  shipmentB: Types.ObjectId;
  shipmentK: Types.ObjectId;
  walletB: Types.ObjectId;
  walletK: Types.ObjectId;
  walletDelivery: Types.ObjectId;
  withdrawB: Types.ObjectId;
  withdrawK: Types.ObjectId;
  withdrawDelivery: Types.ObjectId;
  deliveryBoy: Types.ObjectId;
}
let F: Fixture;

async function makeSeller(city: string | null) {
  const i = uniq();
  return Seller.create({
    sellerName: `Seller ${i}`,
    storeName: `Store ${i}`,
    email: `d-seller${i}@test.local`,
    mobile: String(7300000000 + i),
    password: "Passw0rd1",
    category: "Food",
    state: "Madhya Pradesh",
    pincode: "465674",
    commission: 10,
    status: "Approved",
    location: { type: "Point", coordinates: [76.9 + i / 1000, 23.9] },
    ...(city ? { city } : {}),
  });
}

async function makeCustomer(label: string) {
  const i = uniq();
  const r = await raw("customers").insertOne({
    name: `Cust ${label}`,
    email: `d-cust${i}@test.local`,
    phone: String(7400000000 + i),
    refCode: `REF${i}`,
    status: "Active",
    walletAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return r.insertedId;
}

async function makeProduct(seller: Types.ObjectId, label: string) {
  const r = await raw("products").insertOne({
    productName: `Product ${label} ${uniq()}`,
    seller,
    price: 100,
    stock: 5,
    status: "Active",
    publish: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return r.insertedId;
}

async function makeOrder(
  customer: Types.ObjectId,
  seller: Types.ObjectId,
  product: Types.ObjectId,
  cityId: string | null,
  numberOf: Record<string, string>,
  key: string,
) {
  const i = uniq();
  const orderNumber = `ORD-D-${key}-${i}`;
  numberOf[key] = orderNumber;

  const order = await raw("orders").insertOne({
    orderNumber,
    customer,
    customerName: "Name",
    customerEmail: `o${i}@test.local`,
    customerPhone: "9999999999",
    status: "Received",
    paymentStatus: "Paid",
    paymentMethod: "COD",
    orderDate: new Date(),
    subtotal: 100,
    total: 100,
    deliveryAddress: { address: "x", city: "Biaora", pincode: "465674" },
    items: [],
    ...(cityId ? { cityId: new Types.ObjectId(cityId) } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const item = await raw("orderitems").insertOne({
    order: order.insertedId,
    seller,
    product,
    productName: "P",
    quantity: 1,
    price: 100,
    total: 100,
  });
  await raw("orders").updateOne({ _id: order.insertedId }, { $set: { items: [item.insertedId] } });
  return order.insertedId;
}

let superToken: string;
let tokenB: string;
let tokenBK: string;
let tokenNone: string;
let tokenAll: string;
let adminB: any;

async function admin(label: string, role: string, scope: unknown) {
  const i = uniq();
  const a = await Admin.create({
    firstName: label,
    lastName: "Admin",
    mobile: String(9700000000 + i),
    email: `d-admin${i}@test.local`,
    password: "Passw0rd1",
    role,
    cityScope: scope,
  });
  return { doc: a, token: generateAdminAccessToken(String(a._id), a.role, a.tokenVersion ?? 0) };
}

async function setupFixtures() {
  const id = async (name: string) => String((await City.findOne({ name }))!._id);
  TOWN = { biaora: await id("Biaora"), khujner: await id("Khujner") };

  // A role that can open every page, so these tests exercise TOWN limits and
  // not page permissions.
  await Role.create({ name: "Everything", type: "Custom", permissions: [...ALL_PERMISSIONS] });
  invalidateRoleCache();

  const sellerB = await makeSeller("Biaora");
  const sellerK = await makeSeller("Khujner");
  const sellerNone = await makeSeller(null);
  assert.equal(String(sellerB.cityId), TOWN.biaora, "fixture: Biaora seller should have its town");
  assert.equal(String(sellerK.cityId), TOWN.khujner);
  assert.equal(sellerNone.cityId, undefined);

  const productB = await makeProduct(sellerB._id, "B");
  const productK = await makeProduct(sellerK._id, "K");

  const custB = await makeCustomer("B");
  const custK = await makeCustomer("K");
  const custBoth = await makeCustomer("Both");
  const custNone = await makeCustomer("Never ordered");

  const numberOf: Record<string, string> = {};
  const orderB1 = await makeOrder(custB, sellerB._id, productB, TOWN.biaora, numberOf, "B1");
  const orderB2 = await makeOrder(custB, sellerB._id, productB, TOWN.biaora, numberOf, "B2");
  const orderBBoth = await makeOrder(custBoth, sellerB._id, productB, TOWN.biaora, numberOf, "BBoth");
  const orderK1 = await makeOrder(custK, sellerK._id, productK, TOWN.khujner, numberOf, "K1");
  const orderKBoth = await makeOrder(custBoth, sellerK._id, productK, TOWN.khujner, numberOf, "KBoth");
  // An order whose seller had no town / was deleted: only Super Admin may see it.
  const orderOrphan = await makeOrder(custB, sellerNone._id, productB, null, numberOf, "Orphan");

  const oid = () => new Types.ObjectId();
  const ins = async (collection: string, doc: Record<string, unknown>) =>
    (await raw(collection).insertOne({ createdAt: new Date(), updatedAt: new Date(), ...doc })).insertedId;

  const returnB = await ins("returns", { order: orderB1, customer: custB, status: "Pending" });
  const returnK = await ins("returns", { order: orderK1, customer: custK, status: "Pending" });

  const commissionB = await ins("commissions", { order: orderB1, seller: sellerB._id, type: "SELLER", amount: 10, status: "Pending" });
  const commissionK = await ins("commissions", { order: orderK1, seller: sellerK._id, type: "SELLER", amount: 10, status: "Pending" });

  const shipmentB = await ins("shipments", { order: orderB1, seller: sellerB._id, provider: "Shiprocket", shiprocketOrderId: "SR-B", status: "Pending" });
  const shipmentK = await ins("shipments", { order: orderK1, seller: sellerK._id, provider: "Shiprocket", shiprocketOrderId: "SR-K", status: "Pending" });

  const deliveryBoy = await ins("deliveries", { name: "Rider", mobile: "9000000000", email: "rider@test.local", status: "Active", city: "Anywhere" });

  const walletB = await ins("wallettransactions", { userId: sellerB._id, userType: "SELLER", reference: "WT-REF-1", type: "Credit", amount: 50, status: "Completed" });
  const walletK = await ins("wallettransactions", { userId: sellerK._id, userType: "SELLER", reference: "WT-REF-2", type: "Credit", amount: 50, status: "Completed" });
  const walletDelivery = await ins("wallettransactions", { userId: deliveryBoy, userType: "DELIVERY_BOY", reference: "WT-REF-3", type: "Credit", amount: 20, status: "Completed" });

  const withdrawB = await ins("withdrawrequests", { userId: sellerB._id, userType: "SELLER", amount: 100, status: "Pending" });
  const withdrawK = await ins("withdrawrequests", { userId: sellerK._id, userType: "SELLER", amount: 100, status: "Pending" });
  const withdrawDelivery = await ins("withdrawrequests", { userId: deliveryBoy, userType: "DELIVERY_BOY", amount: 100, status: "Pending" });

  void oid;
  F = {
    sellerB: sellerB._id, sellerK: sellerK._id, sellerNone: sellerNone._id,
    productB, productK, custB, custK, custBoth, custNone,
    orderB1, orderB2, orderBBoth, orderK1, orderKBoth, orderOrphan, numberOf,
    returnB, returnK, commissionB, commissionK, shipmentB, shipmentK,
    walletB, walletK, walletDelivery, withdrawB, withdrawK, withdrawDelivery, deliveryBoy,
  };

  superToken = (await admin("Super", SUPER_ADMIN_ROLE, undefined)).token;
  const b = await admin("Biaora", "Everything", { mode: "selected", cityIds: [TOWN.biaora] });
  adminB = b.doc;
  tokenB = b.token;
  tokenBK = (await admin("Both", "Everything", { mode: "selected", cityIds: [TOWN.biaora, TOWN.khujner] })).token;
  tokenNone = (await admin("Nobody", "Everything", { mode: "selected", cityIds: [] })).token;
  tokenAll = (await admin("HQ", "Everything", { mode: "all", cityIds: [] })).token;
}

/**
 * Run `fn` the way a town-limited request would: inside townScoped, with the
 * given towns. This is the same middleware the routes use.
 */
function asScoped<T>(cityIds: string[], fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req: any = { adminContext: { scope: { all: false, cityIds } } };
    townScoped(req, {} as any, () => {
      fn().then(resolve, reject);
    });
  });
}

/* ------------------------------------------------------------------------ */
/*                    The plugin, directly (every query kind)               */
/* ------------------------------------------------------------------------ */

test("outside a scoped request nothing is filtered", async () => {
  assert.equal(await Order.countDocuments({}), 6);
});

test("find, findOne, findById and exists respect the towns", async () => {
  await asScoped([TOWN.biaora], async () => {
    const found = await Order.find({}).lean();
    assert.deepEqual(found.map((o) => String(o._id)).sort(), [F.orderB1, F.orderB2, F.orderBBoth].map(String).sort());

    assert.ok(await Order.findById(F.orderB1));
    assert.equal(await Order.findById(F.orderK1), null, "another town's order is not found");
    assert.equal(await Order.findOne({ orderNumber: F.numberOf.K1 }), null);
    assert.equal(await Order.exists({ _id: F.orderK1 }), null);
  });
});

test("an order with no town is invisible to any town-limited admin", async () => {
  await asScoped([TOWN.biaora, TOWN.khujner], async () => {
    assert.equal(await Order.findById(F.orderOrphan), null);
    assert.equal(await Order.countDocuments({}), 5, "all five orders that have a town, none that do not");
  });
});

test("an empty scope sees nothing on any model", async () => {
  await asScoped([], async () => {
    assert.equal(await Order.countDocuments({}), 0);
    assert.equal(await Seller.countDocuments({}), 0);
    assert.equal(await Product.countDocuments({}), 0);
    assert.equal(await Customer.countDocuments({}), 0);
    assert.equal(await Return.countDocuments({}), 0);
    assert.equal(await Commission.countDocuments({}), 0);
    assert.equal(await Shipment.countDocuments({}), 0);
  });
});

test("every scoped model is actually filtered (proves the plugin is attached to each)", async () => {
  const unscoped = {
    Order: await Order.countDocuments({}),
    Seller: await Seller.countDocuments({}),
    Product: await Product.countDocuments({}),
    Customer: await Customer.countDocuments({}),
    Return: await Return.countDocuments({}),
    Commission: await Commission.countDocuments({}),
    Shipment: await Shipment.countDocuments({}),
    WalletTransaction: await WalletTransaction.countDocuments({}),
    WithdrawRequest: await WithdrawRequest.countDocuments({}),
  };
  for (const [name, count] of Object.entries(unscoped)) {
    assert.ok(count > 0, `fixture: ${name} should have data`);
  }

  await asScoped([TOWN.biaora], async () => {
    // fewer than unscoped means the filter is on; each fixture has Khujner data
    assert.ok((await Order.countDocuments({})) < unscoped.Order, "Order");
    assert.ok((await Seller.countDocuments({})) < unscoped.Seller, "Seller");
    assert.ok((await Product.countDocuments({})) < unscoped.Product, "Product");
    assert.ok((await Customer.countDocuments({})) < unscoped.Customer, "Customer");
    assert.ok((await Return.countDocuments({})) < unscoped.Return, "Return");
    assert.ok((await Commission.countDocuments({})) < unscoped.Commission, "Commission");
    assert.ok((await Shipment.countDocuments({})) < unscoped.Shipment, "Shipment");
    assert.ok((await WalletTransaction.countDocuments({})) < unscoped.WalletTransaction, "WalletTransaction");
    assert.ok((await WithdrawRequest.countDocuments({})) < unscoped.WithdrawRequest, "WithdrawRequest");
  });
});

test("updates and deletes cannot touch another town's record", async () => {
  await asScoped([TOWN.biaora], async () => {
    const u = await Order.updateOne({ _id: F.orderK1 }, { $set: { status: "Cancelled" } });
    assert.equal(u.matchedCount, 0);

    const many = await Order.updateMany({}, { $set: { notes: "touched" } });
    assert.equal(many.matchedCount, 3, "updateMany reaches only this town's three orders");

    assert.equal(await Order.findOneAndUpdate({ _id: F.orderK1 }, { $set: { status: "Cancelled" } }), null);
    assert.equal(await Order.findOneAndDelete({ _id: F.orderK1 }), null);
    assert.equal((await Order.deleteOne({ _id: F.orderK1 })).deletedCount, 0);
    assert.equal((await Order.deleteMany({ _id: F.orderK1 })).deletedCount, 0);
  });

  const k = await raw("orders").findOne({ _id: F.orderK1 });
  assert.equal(k!.status, "Received", "the Khujner order must be untouched");
  assert.equal(k!.notes, undefined);
  await raw("orders").updateMany({}, { $unset: { notes: "" } });
});

test("distinct and aggregate respect the towns", async () => {
  await asScoped([TOWN.biaora], async () => {
    const customers = await Order.distinct("customer");
    assert.equal(customers.length, 2, "only customers who ordered in Biaora");

    const totals = await Order.aggregate([{ $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$total" } } }]);
    assert.equal(totals[0].n, 3);
    assert.equal(totals[0].sum, 300);
  });
});

test("an aggregate starting with $geoNear keeps it first", async () => {
  // $geoNear must be the first stage or MongoDB rejects the pipeline.
  await asScoped([TOWN.biaora], async () => {
    const rows = await Seller.aggregate([
      { $geoNear: { near: { type: "Point", coordinates: [76.9, 23.9] }, distanceField: "d", spherical: true, key: "location" } },
    ]);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => String(r.cityId) === TOWN.biaora), "only Biaora sellers come back");
  });
});

test("populate only fills in records the admin may see", async () => {
  await asScoped([TOWN.biaora], async () => {
    const order = await Order.findById(F.orderBBoth).populate("customer").lean();
    assert.ok((order!.customer as any)?._id, "a customer who ordered in Biaora is populated");
  });

  // custK ordered only in Khujner, so a Biaora admin cannot see them.
  await asScoped([TOWN.biaora], async () => {
    assert.equal(await Customer.findById(F.custK), null);
  });
});

test("a customer is visible for any order in the admin's towns, not just their first", async () => {
  await asScoped([TOWN.biaora], async () => {
    assert.ok(await Customer.findById(F.custBoth), "ordered in both towns");
    assert.ok(await Customer.findById(F.custB));
    assert.equal(await Customer.findById(F.custNone), null, "never ordered, so no town");
  });
  await asScoped([TOWN.khujner], async () => {
    assert.ok(await Customer.findById(F.custBoth), "also visible from Khujner");
  });
});

test("seller wallet rows are limited, delivery rows stay visible", async () => {
  await asScoped([TOWN.biaora], async () => {
    const ids = (await WalletTransaction.find({}).lean()).map((t) => String(t._id));
    assert.ok(ids.includes(String(F.walletB)));
    assert.ok(!ids.includes(String(F.walletK)), "another town's seller");
    assert.ok(ids.includes(String(F.walletDelivery)), "delivery boys are not scoped");

    const w = (await WithdrawRequest.find({}).lean()).map((t) => String(t._id));
    assert.ok(w.includes(String(F.withdrawB)));
    assert.ok(!w.includes(String(F.withdrawK)));
    assert.ok(w.includes(String(F.withdrawDelivery)));
  });
});

test("returns, commissions and shipments follow their order", async () => {
  await asScoped([TOWN.biaora], async () => {
    assert.ok(await Return.findById(F.returnB));
    assert.equal(await Return.findById(F.returnK), null);
    assert.ok(await Commission.findById(F.commissionB));
    assert.equal(await Commission.findById(F.commissionK), null);
    assert.ok(await Shipment.findById(F.shipmentB));
    assert.equal(await Shipment.findById(F.shipmentK), null);
  });
});

test("a Super Admin or an admin with every town never gets a store, so nothing is filtered", async () => {
  const proceeded = await new Promise<boolean>((resolve) => {
    townScoped({ adminContext: { scope: { all: true, cityIds: [] } } } as any, {} as any, () => resolve(true));
  });
  assert.equal(proceeded, true);
  assert.equal(await Order.countDocuments({}), 6);
});

test("with no admin context the request is refused, never run unscoped", async () => {
  let status = 0;
  const res: any = { status(c: number) { status = c; return res; }, json() { return res; } };
  let reached = false;
  townScoped({} as any, res, () => { reached = true; });
  assert.equal(status, 401);
  assert.equal(reached, false);
});

/* ------------------------------------------------------------------------ */
/*                       Over HTTP: lists never leak                        */
/* ------------------------------------------------------------------------ */

/**
 * Call a list endpoint as the Biaora admin: nothing from Khujner may appear, and
 * something from Biaora must (so an empty page cannot pass).
 */
async function assertListScoped(path: string, mine: unknown[], theirs: unknown[]) {
  const res = await call("GET", path, tokenB);
  assert.equal(res.status, 200, `${path}: ${res.text.slice(0, 200)}`);
  for (const t of mine) assert.ok(has(res, t), `${path}: expected ${t} to be present`);
  for (const t of theirs) assert.ok(!has(res, t), `${path}: LEAK, found ${t}`);
}

test("orders list", async () => {
  await assertListScoped("/admin/orders?limit=100", [F.numberOf.B1, F.numberOf.B2], [F.numberOf.K1, F.numberOf.KBoth, F.numberOf.Orphan]);
});

test("orders by status", async () => {
  await assertListScoped("/admin/orders/status/Received?limit=100", [F.numberOf.B1], [F.numberOf.K1, F.numberOf.Orphan]);
});

test("settlement list", async () => {
  const res = await call("GET", "/admin/settlement", tokenB);
  assert.equal(res.status, 200, res.text.slice(0, 200));
  assert.ok(!has(res, F.numberOf.K1) && !has(res, F.numberOf.KBoth) && !has(res, F.numberOf.Orphan));
});

test("orders CSV export", async () => {
  const res = await call("GET", "/admin/orders/export/csv", tokenB);
  assert.equal(res.status, 200, res.text.slice(0, 200));
  assert.ok(has(res, F.numberOf.B1), "Biaora order should be in the export");
  assert.ok(!has(res, F.numberOf.K1) && !has(res, F.numberOf.KBoth) && !has(res, F.numberOf.Orphan), "LEAK in CSV");
});

test("return requests list", async () => {
  await assertListScoped("/admin/return-requests", [F.returnB], [F.returnK]);
});

test("customers list", async () => {
  await assertListScoped("/admin/customers?limit=100", [F.custB, F.custBoth], [F.custK, F.custNone]);
});

test("products list", async () => {
  await assertListScoped("/admin/products?limit=100", [F.productB], [F.productK]);
});

test("sellers list, and the open seller picker", async () => {
  await assertListScoped("/sellers", [F.sellerB], [F.sellerK, F.sellerNone]);
  await assertListScoped("/admin/sellers", [F.sellerB], [F.sellerK, F.sellerNone]);
});

test("the product picker lookup is scoped even though every admin may call it", async () => {
  await assertListScoped("/admin/products", [F.productB], [F.productK]);
});

test("wallet transactions", async () => {
  await assertListScoped("/admin/wallet/transactions?limit=100", [F.walletB, F.walletDelivery], [F.walletK]);
});

test("withdrawal requests, through both mounts", async () => {
  await assertListScoped("/admin/wallet/withdrawals?limit=100", [F.withdrawB], [F.withdrawK]);
  await assertListScoped("/admin/withdrawals?limit=100", [F.withdrawB], [F.withdrawK]);
});

test("earnings", async () => {
  const res = await call("GET", "/admin/wallet/earnings?limit=100", tokenB);
  assert.equal(res.status, 200, res.text.slice(0, 200));
  assert.ok(!has(res, F.commissionK) && !has(res, F.numberOf.K1), "LEAK in earnings");
});

test("a customer's orders are limited to the admin's towns", async () => {
  // custBoth ordered in both towns.
  const res = await call("GET", `/admin/customers/${F.custBoth}/orders`, tokenB);
  assert.equal(res.status, 200, res.text.slice(0, 200));
  assert.ok(has(res, F.numberOf.BBoth));
  assert.ok(!has(res, F.numberOf.KBoth), "the Khujner order must not appear");
});

test("the dashboard counts only the admin's towns", async () => {
  const mine = await call("GET", "/admin/dashboard/stats", tokenB);
  const all = await call("GET", "/admin/dashboard/stats", superToken);
  assert.equal(mine.status, 200, mine.text.slice(0, 200));
  assert.equal(all.status, 200);
  assert.notEqual(mine.text, all.text, "a limited admin must not see the platform totals");

  const none = await call("GET", "/admin/dashboard/stats", tokenNone);
  assert.equal(none.status, 200);
  assert.ok(!/"totalOrders":\s*[1-9]/.test(none.text) && !/"totalCustomers":\s*[1-9]/.test(none.text), "nobody sees nothing");
});

/* ------------------------------------------------------------------------ */
/*                  Over HTTP: records by id, reads and writes              */
/* ------------------------------------------------------------------------ */

test("another town's order is a 404 by id, and an order with no town is too", async () => {
  assert.equal((await call("GET", `/admin/orders/${F.orderB1}`, tokenB)).status, 200);
  assert.equal((await call("GET", `/admin/orders/${F.orderK1}`, tokenB)).status, 404);
  assert.equal((await call("GET", `/admin/orders/${F.orderOrphan}`, tokenB)).status, 404);
  assert.equal((await call("GET", `/admin/orders/${F.orderOrphan}`, superToken)).status, 200, "Super Admin still sees it");
});

test("every order sub-resource refuses another town's order", async () => {
  for (const path of [
    `/admin/orders/${F.orderK1}/cod-breakdown`,
    `/admin/orders/${F.orderK1}/earning-breakdown`,
  ]) {
    const res = await call("GET", path, tokenB);
    assert.equal(res.status, 404, `${path} -> ${res.status} ${res.text.slice(0, 120)}`);
  }

  // The shipment lookup answers 200 with no data when there is nothing to show,
  // so what matters is that the Khujner shipment is not in the response.
  const shipment = await call("GET", `/admin/orders/${F.orderK1}/shipment`, tokenB);
  assert.ok(shipment.status === 404 || shipment.body?.data == null, shipment.text.slice(0, 160));
  assert.ok(!has(shipment, F.shipmentK), "LEAK: the Khujner shipment");
});

test("writes to another town's order are refused and change nothing", async () => {
  // [method, path, body, statuses that count as a refusal]. A few handlers
  // validate their body before they look the order up, so they may answer 400;
  // either way nothing may succeed and nothing may change.
  const attempts: Array<[string, string, unknown, number[]]> = [
    ["PATCH", `/admin/orders/${F.orderK1}/status`, { status: "Cancelled" }, [404]],
    ["PATCH", `/admin/orders/${F.orderK1}/mark-cod-paid`, {}, [404]],
    ["PATCH", `/admin/orders/${F.orderK1}/assign-delivery`, { deliveryBoyId: String(F.deliveryBoy) }, [404]],
    ["POST", `/admin/orders/${F.orderK1}/shipping/quotes`, {}, [400, 404]],
    ["POST", `/admin/orders/${F.orderK1}/shipment/cancel`, {}, [400, 404]],
  ];

  for (const [method, path, body, refused] of attempts) {
    const res = await call(method, path, tokenB, body);

    // The shipment actions look the shipment up through the scoped model, get
    // null, and return before calling Shiprocket, so they answer 200 with no
    // data instead of 404. That is a refusal too: nothing is acted on.
    const emptySuccess = path.includes("/shipment/") && res.status === 200 && res.body?.data == null;
    assert.ok(
      refused.includes(res.status) || emptySuccess,
      `${method} ${path} -> ${res.status} ${res.text.slice(0, 120)}`,
    );
  }

  // If the cancel had reached the real shipment it would have changed its
  // status (and tried to call Shiprocket).
  const shipment = await raw("shipments").findOne({ _id: F.shipmentK });
  assert.equal(shipment!.status, "Pending", "the Khujner shipment must be untouched");

  const k = await raw("orders").findOne({ _id: F.orderK1 });
  assert.equal(k!.status, "Received");
  assert.equal(k!.deliveryBoy, undefined);
});

test("another town's seller: read, edit, approve and delete are all refused", async () => {
  assert.equal((await call("GET", `/sellers/${F.sellerB}`, tokenB)).status, 200);

  assert.equal((await call("GET", `/sellers/${F.sellerK}`, tokenB)).status, 404);
  assert.equal((await call("PUT", `/sellers/${F.sellerK}`, tokenB, { storeName: "Hijacked" })).status, 404);
  assert.equal((await call("PATCH", `/sellers/${F.sellerK}/status`, tokenB, { status: "Rejected" })).status, 404);
  assert.equal((await call("DELETE", `/sellers/${F.sellerK}`, tokenB)).status, 404);

  const k = await Seller.findById(F.sellerK).lean();
  assert.notEqual(k!.storeName, "Hijacked");
  assert.equal(k!.status, "Approved");
  assert.equal(k!.isDeleted, false, "the seller must not have been deleted");
});

test("a seller with no town is invisible to a limited admin", async () => {
  assert.equal((await call("GET", `/sellers/${F.sellerNone}`, tokenB)).status, 404);
  assert.equal((await call("GET", `/sellers/${F.sellerNone}`, superToken)).status, 200);
});

test("another town's product: read, edit and delete are refused", async () => {
  assert.equal((await call("GET", `/admin/products/${F.productB}`, tokenB)).status, 200);
  assert.equal((await call("GET", `/admin/products/${F.productK}`, tokenB)).status, 404);
  assert.equal((await call("PUT", `/admin/products/${F.productK}`, tokenB, { productName: "Hijacked" })).status, 404);
  assert.equal((await call("DELETE", `/admin/products/${F.productK}`, tokenB)).status, 404);

  const k = await raw("products").findOne({ _id: F.productK });
  assert.ok(k, "the product must still exist");
  assert.notEqual(k!.productName, "Hijacked");
});

test("another town's customer is refused by id", async () => {
  assert.equal((await call("GET", `/admin/customers/${F.custB}`, tokenB)).status, 200);
  assert.equal((await call("GET", `/admin/customers/${F.custK}`, tokenB)).status, 404);
  assert.equal((await call("GET", `/admin/customers/${F.custNone}`, tokenB)).status, 404);
  assert.equal((await call("PATCH", `/admin/customers/${F.custK}/status`, tokenB, { status: "Inactive" })).status, 404);

  assert.equal((await raw("customers").findOne({ _id: F.custK }))!.status, "Active");
});

test("another town's return is refused by id", async () => {
  assert.equal((await call("GET", `/admin/return-requests/${F.returnK}`, tokenB)).status, 404);
  assert.equal((await call("PUT", `/admin/return-requests/${F.returnK}`, tokenB, { status: "Approved" })).status, 404);
  assert.equal((await raw("returns").findOne({ _id: F.returnK }))!.status, "Pending");
});

test("another town's seller withdrawal cannot be approved, rejected or completed", async () => {
  for (const action of ["approve", "reject", "complete"]) {
    const res = await call("PUT", `/admin/withdrawals/${F.withdrawK}/${action}`, tokenB, { transactionReference: "REF-1" });
    assert.equal(res.status, 404, `${action} -> ${res.status} ${res.text.slice(0, 120)}`);
  }
  assert.equal((await raw("withdrawrequests").findOne({ _id: F.withdrawK }))!.status, "Pending");
});

/* ------------------------------------------------------------------------ */
/*                          Who sees what, by scope                         */
/* ------------------------------------------------------------------------ */

test("an admin with two towns sees both, and still not an order with no town", async () => {
  const res = await call("GET", "/admin/orders?limit=100", tokenBK);
  assert.equal(res.status, 200);
  assert.ok(has(res, F.numberOf.B1) && has(res, F.numberOf.K1));
  assert.ok(!has(res, F.numberOf.Orphan));
});

test("an admin limited to no towns sees nothing, and gets 404 for any record", async () => {
  const list = await call("GET", "/admin/orders?limit=100", tokenNone);
  assert.equal(list.status, 200);
  assert.ok(!has(list, F.numberOf.B1) && !has(list, F.numberOf.K1));

  assert.equal((await call("GET", `/admin/orders/${F.orderB1}`, tokenNone)).status, 404);
  assert.equal((await call("GET", `/sellers/${F.sellerB}`, tokenNone)).status, 404);
  assert.equal((await call("GET", `/admin/customers/${F.custB}`, tokenNone)).status, 404);
});

test("an admin granted every town, and Super Admin, see everything including an order with no town", async () => {
  for (const token of [tokenAll, superToken]) {
    const res = await call("GET", "/admin/orders?limit=100", token);
    assert.equal(res.status, 200);
    for (const key of ["B1", "K1", "Orphan"]) assert.ok(has(res, F.numberOf[key]), `${key} missing`);
  }
});

test("a change to an admin's towns applies on their next request", async () => {
  assert.equal((await call("GET", `/admin/orders/${F.orderK1}`, tokenB)).status, 404);

  await Admin.updateOne({ _id: adminB._id }, { $set: { "cityScope.cityIds": [TOWN.biaora, TOWN.khujner] } });
  assert.equal((await call("GET", `/admin/orders/${F.orderK1}`, tokenB)).status, 200, "same token, new towns");

  await Admin.updateOne({ _id: adminB._id }, { $set: { "cityScope.cityIds": [TOWN.biaora] } });
  assert.equal((await call("GET", `/admin/orders/${F.orderK1}`, tokenB)).status, 404, "and removed again");
});

/* ------------------------------------------------------------------------ */
/*                  Platform money, delivery, and notifications             */
/* ------------------------------------------------------------------------ */

test("platform-wide money is refused to a limited admin, outright", async () => {
  const dash = await call("GET", "/admin/financial/dashboard", tokenB);
  assert.equal(dash.status, 403);
  assert.equal(dash.body.code, "ALL_TOWNS_REQUIRED");

  const transfer = await call("POST", "/admin/wallet/transfer", tokenB, { userId: String(F.deliveryBoy), userType: "DELIVERY_BOY", amount: 1 });
  assert.equal(transfer.status, 403);
  assert.equal(transfer.body.code, "ALL_TOWNS_REQUIRED");
});

test("platform-wide money is open to Super Admin and to an admin with every town", async () => {
  for (const token of [superToken, tokenAll]) {
    const dash = await call("GET", "/admin/financial/dashboard", token);
    assert.notEqual(dash.status, 403, "must not be refused for the town reason");
    const transfer = await call("POST", "/admin/wallet/transfer", token, {});
    assert.notEqual(transfer.status, 403);
  }
});

test("delivery boys are not scoped: a limited admin still sees every one", async () => {
  const res = await call("GET", "/admin/delivery", tokenB);
  assert.equal(res.status, 200, res.text.slice(0, 200));
  assert.ok(has(res, F.deliveryBoy));
});

test("a limited admin cannot broadcast to delivery boys or to everyone", async () => {
  for (const recipientType of ["Delivery", "All"]) {
    const res = await call("POST", "/admin/notifications", tokenB, { recipientType, title: "t", message: "m" });
    assert.equal(res.status, 403, `${recipientType}: ${res.text.slice(0, 160)}`);
    assert.equal(res.body.code, "ALL_TOWNS_REQUIRED");
  }
});

test("a seller broadcast reaches only the admin's towns", async () => {
  await raw("notifications").deleteMany({});
  const res = await call("POST", "/admin/notifications", tokenB, { recipientType: "Seller", title: "Hello", message: "Biaora only" });
  assert.ok([200, 201].includes(res.status), `${res.status} ${res.text.slice(0, 200)}`);

  const recipients = (await raw("notifications").find({ recipientType: "Seller" }).toArray()).map((x) => String(x.recipientId));
  assert.ok(recipients.includes(String(F.sellerB)), "the Biaora seller is notified");
  assert.ok(!recipients.includes(String(F.sellerK)), "the Khujner seller must NOT be");
  assert.ok(!recipients.includes(String(F.sellerNone)));
});

test("a message to one named seller or customer outside the towns is refused", async () => {
  const seller = await call("POST", "/admin/notifications", tokenB, { recipientType: "Seller", recipientId: String(F.sellerK), title: "t", message: "m" });
  assert.equal(seller.status, 404);

  const customer = await call("POST", "/admin/notifications", tokenB, { recipientType: "Customer", recipientId: String(F.custK), title: "t", message: "m" });
  assert.equal(customer.status, 404);
});

/* ------------------------------------------------------------------------ */
/*                        Coverage: nothing left unscoped                   */
/* ------------------------------------------------------------------------ */

test("the seller routes mounted outside the admin router are scoped too", async () => {
  // /sellers is its own router; prove it by the result already asserted above,
  // and by the router carrying the guard.
  const { default: sellerRoutes } = await import("../../routes/sellerRoutes");
  const { guardMeta } = await import("../../middleware/permissions");
  const layers = (sellerRoutes as any).stack as any[];
  assert.ok(layers.some((l) => guardMeta(l.handle)?.kind === "town-scoped"), "sellerRoutes has no townScoped layer");
});
