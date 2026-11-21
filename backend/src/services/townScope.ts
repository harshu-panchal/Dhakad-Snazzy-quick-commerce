import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";
import mongoose, { Schema, Types, type MongooseQueryMiddleware } from "mongoose";
import { tag } from "../middleware/permissions";

/**
 * Town scope enforcement (RBAC_CITY_SCOPE_PLAN.md, Phase D).
 *
 * How it works: while a request from a town-limited admin runs inside a
 * `townScoped` route, a Mongoose plugin on the scoped models adds the town
 * condition to EVERY query on them - find, findOne, update, delete, count,
 * distinct and aggregate. So an endpoint cannot forget to filter, and a record
 * outside the admin's towns simply comes back as null, which the handlers
 * already turn into a 404 (not a 403, so its existence is not revealed).
 *
 * Nothing changes for Super Admin, an admin with every town, or any request
 * outside a `townScoped` route: no store is set and the hooks do nothing.
 *
 * shortcut: ids are materialised per request (one distinct() per kind), which is
 * fine into the low hundreds of thousands of orders; past that, join instead.
 */

export interface TownScopeStore {
  townIds: Types.ObjectId[];
  sellerIds: () => Promise<Types.ObjectId[]>;
  orderIds: () => Promise<Types.ObjectId[]>;
  customerIds: () => Promise<Types.ObjectId[]>;
}

const storage = new AsyncLocalStorage<TownScopeStore>();

export const currentTownScope = (): TownScopeStore | undefined => storage.getStore();

function makeStore(cityIds: string[]): TownScopeStore {
  const townIds = cityIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  // Raw collections on purpose: going through the models would apply this same
  // filter to the lookup that builds it.
  const memo = <T>(load: () => Promise<T>) => {
    let cached: Promise<T> | undefined;
    return () => (cached ??= load());
  };
  const raw = (name: string) => mongoose.connection.collection(name);

  return {
    townIds,
    sellerIds: memo(() => raw("sellers").distinct("_id", { cityId: { $in: townIds } })),
    orderIds: memo(() => raw("orders").distinct("_id", { cityId: { $in: townIds } })),
    customerIds: memo(() => raw("orders").distinct("customer", { cityId: { $in: townIds } })),
  };
}

/* ------------------------------------------------------------------------ */
/*                                 Strategies                               */
/* ------------------------------------------------------------------------ */

export type TownStrategy = (store: TownScopeStore) => Promise<Record<string, unknown>>;

/** The record carries the town itself (Order, Seller). An unset town never matches. */
export const byTown =
  (field = "cityId"): TownStrategy =>
  async (store) => ({ [field]: { $in: store.townIds } });

/** The record belongs to a seller in the admin's towns (Product). */
export const bySeller =
  (field = "seller"): TownStrategy =>
  async (store) => ({ [field]: { $in: await store.sellerIds() } });

/** The record belongs to an order in the admin's towns (Return, Commission, Shipment). */
export const byOrder =
  (field = "order"): TownStrategy =>
  async (store) => ({ [field]: { $in: await store.orderIds() } });

/** A customer who has ordered in the admin's towns. Customers who never ordered are not visible. */
export const byCustomer: TownStrategy = async (store) => ({
  _id: { $in: await store.customerIds() },
});

/**
 * Wallet rows and withdrawal requests: a seller's only if that seller is in the
 * admin's towns. A delivery boy's stay visible, because delivery boys are not
 * scoped (decision 10 of the plan).
 */
export const byWalletOwner: TownStrategy = async (store) => ({
  $or: [
    { userType: "DELIVERY_BOY" },
    { userType: "SELLER", userId: { $in: await store.sellerIds() } },
  ],
});

/* -------------------------------------------------------------------------- */
/*                                   Plugin                                    */
/* -------------------------------------------------------------------------- */

const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "countDocuments",
  "distinct",
] as const;

/**
 * Use as `schema.plugin(townScopePlugin, strategy)` BEFORE the model is created.
 *
 * Not covered, by design: create/save of a new document, and estimatedDocumentCount
 * (it cannot take a filter - nothing in the admin code uses it).
 */
export function townScopePlugin(schema: Schema, strategy: TownStrategy): void {
  schema.pre([...QUERY_OPS] as MongooseQueryMiddleware[], { document: false, query: true }, async function (this: any) {
    const store = storage.getStore();
    if (!store) return;
    this.and([await strategy(store)]);
  });

  schema.pre("aggregate", async function (this: any) {
    const store = storage.getStore();
    if (!store) return;
    const pipeline = this.pipeline();
    // $geoNear must stay the first stage.
    pipeline.splice(pipeline[0]?.$geoNear ? 1 : 0, 0, { $match: await strategy(store) });
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Middleware                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mount on a route prefix whose data is town-scoped. Place it after
 * `authenticate`, next to that prefix's permission guard.
 *
 * Fails closed: with no admin context the request is refused rather than run
 * unscoped.
 */
export const townScoped = tag(
  (req: Request, res: Response, next: NextFunction): void => {
    const scope = req.adminContext?.scope;

    if (!scope) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (scope.all) {
      next();
      return;
    }

    storage.run(makeStore(scope.cityIds), () => next());
  },
  { kind: "town-scoped", pages: [] },
);

/**
 * For data that cannot be split by town (platform-wide money). A town-limited
 * admin is refused outright instead of being shown partial numbers.
 */
export const requireAllTowns = () =>
  tag(
    (req: Request, res: Response, next: NextFunction): void => {
      const scope = req.adminContext?.scope;

      if (!scope) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }

      if (!scope.all) {
        res.status(403).json({
          success: false,
          code: "ALL_TOWNS_REQUIRED",
          message: "This is only available to admins with access to every town.",
        });
        return;
      }

      next();
    },
    { kind: "all-towns", pages: [] },
  );

/**
 * Admin route prefixes that are deliberately NOT town-scoped, so the coverage
 * test can tell "forgot to scope" from "global on purpose".
 */
export const TOWN_GLOBAL_PREFIXES: readonly string[] = [
  // Delivery boys are not scoped, and their cash and assignment maths reads
  // orders across towns - filtering them would give wrong totals.
  "/delivery",
  "/cash-collections",
  // Platform configuration and content.
  "/categories", "/subcategories", "/brands", "/taxes", "/payment-methods",
  "/settings", "/coupons", "/notification-templates", "/home-sections",
  "/bestseller-cards", "/promo-strips", "/lowest-prices-sections",
  "/lowest-prices-products", "/shop", "/shops", "/shop-by-stores", "/reels",
  "/faqs", "/policies",
  // Administration.
  "/system-users", "/roles", "/audit-logs", "/cities",
  // The signed-in admin's own record.
  "/me", "/profile",
];
