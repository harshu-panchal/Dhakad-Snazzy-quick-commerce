import mongoose, { Types } from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";

/**
 * Helpers for tying orders to a town.
 *
 * An order's town is the town of its seller, saved on the order when it is
 * placed (Order.cityId). The orders that already exist are filled in by
 * backfillOrderTowns, which is conservative on purpose: it assigns a town only
 * when the answer is unambiguous, and leaves everything else without one.
 */

/* ------------------------------------------------------------------------ */
/*                     Placing an order: sellers in the items               */
/* ------------------------------------------------------------------------ */

/**
 * The distinct sellers behind the items in a checkout request, read from the
 * products themselves rather than trusted from the client.
 *
 * Used to enforce one seller per order on the server. The cart already enforces
 * it (since 2026-08-16), but createOrder reads its items from the request
 * body, so an old app build or a direct API call could otherwise place a mixed
 * order.
 */
export async function distinctSellerIdsForItems(items: unknown): Promise<string[]> {
  if (!Array.isArray(items)) return [];

  const productIds = items
    .map((item) => (item as { product?: { id?: unknown } })?.product?.id)
    .filter((id): id is string => typeof id === "string" && mongoose.isValidObjectId(id));

  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds } })
    .select("seller")
    .lean();

  return [...new Set(products.map((p) => (p.seller ? String(p.seller) : "")).filter(Boolean))];
}

/**
 * The town to save on an order, given its sellers' towns.
 *
 * Exactly one distinct town -> that town. None, or more than one -> undefined,
 * so the order is left without a town rather than given a wrong one. (More than
 * one cannot happen for a single-seller order; it is handled for safety.)
 */
export function townForSellers(
  sellers: Array<{ cityId?: unknown }>,
): Types.ObjectId | undefined {
  const towns = [
    ...new Set(sellers.map((s) => (s.cityId ? String(s.cityId) : "")).filter(Boolean)),
  ];
  return towns.length === 1 ? new Types.ObjectId(towns[0]) : undefined;
}

/* ------------------------------------------------------------------------ */
/*                           Backfilling existing orders                    */
/* ------------------------------------------------------------------------ */

export type OrderTownStatus =
  | "assign"
  | "already-set"
  | "seller-missing"
  | "seller-no-town"
  | "cross-town"
  | "no-items";

export interface OrderTownClassification {
  orderId: string;
  status: OrderTownStatus;
  townId?: string;
}

export interface OrderTownReport {
  applied: boolean;
  counts: Record<OrderTownStatus, number>;
  written: number;
  totalOrders: number;
}

interface OrderSellerFacts {
  /** distinct seller ids on the order's items */
  sellerCount: number;
  /** how many of those sellers still exist */
  sellersFound: number;
  /** distinct towns among the sellers that exist */
  townIds: string[];
  /** sellers that exist but have no town */
  sellersWithoutTown: number;
}

/**
 * Pure decision for one order, given facts about its sellers. Separated from
 * the database reads so it can be tested directly.
 */
export function classifyOrderTown(facts: OrderSellerFacts | undefined): {
  status: Exclude<OrderTownStatus, "already-set">;
  townId?: string;
} {
  if (!facts || facts.sellerCount === 0) return { status: "no-items" };

  // Any seller that no longer exists makes the answer unknowable: these are the
  // orders whose history was orphaned by a hard delete. They stay without a
  // town and are visible only to Super Admin.
  if (facts.sellersFound < facts.sellerCount) return { status: "seller-missing" };

  if (facts.sellersWithoutTown > 0) return { status: "seller-no-town" };

  if (facts.townIds.length > 1) return { status: "cross-town" };

  return { status: "assign", townId: facts.townIds[0] };
}

/**
 * Fill in Order.cityId for orders that have none. Dry run unless `apply`.
 *
 * Never overwrites an existing cityId, and writes with timestamps disabled so
 * an order's updatedAt is not disturbed by a bookkeeping change.
 */
export async function backfillOrderTowns({ apply = false }: { apply?: boolean } = {}): Promise<OrderTownReport> {
  const counts: Record<OrderTownStatus, number> = {
    assign: 0,
    "already-set": 0,
    "seller-missing": 0,
    "seller-no-town": 0,
    "cross-town": 0,
    "no-items": 0,
  };

  // Per order: its distinct sellers, how many exist, and their towns.
  const facts = await OrderItem.aggregate<{
    _id: Types.ObjectId;
    sellers: Types.ObjectId[];
    found: Array<{ _id: Types.ObjectId; cityId?: Types.ObjectId }>;
  }>([
    { $group: { _id: "$order", sellers: { $addToSet: "$seller" } } },
    {
      $lookup: {
        from: "sellers",
        localField: "sellers",
        foreignField: "_id",
        as: "found",
        pipeline: [{ $project: { _id: 1, cityId: 1 } }],
      },
    },
  ]);

  const factsByOrder = new Map<string, OrderSellerFacts>();
  for (const row of facts) {
    factsByOrder.set(String(row._id), {
      sellerCount: row.sellers.length,
      sellersFound: row.found.length,
      townIds: [...new Set(row.found.filter((s) => s.cityId).map((s) => String(s.cityId)))],
      sellersWithoutTown: row.found.filter((s) => !s.cityId).length,
    });
  }

  const orders = await Order.find({}).select("_id cityId").lean();
  const ops: Array<{
    updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
  }> = [];

  for (const order of orders) {
    if (order.cityId) {
      counts["already-set"] += 1;
      continue;
    }

    const decision = classifyOrderTown(factsByOrder.get(String(order._id)));
    counts[decision.status] += 1;

    if (decision.status === "assign" && decision.townId) {
      ops.push({
        updateOne: {
          // Conditional, so a concurrent write or a second run cannot overwrite.
          filter: { _id: order._id, cityId: { $exists: false } },
          update: { $set: { cityId: new Types.ObjectId(decision.townId) } },
        },
      });
    }
  }

  let written = 0;
  if (apply && ops.length > 0) {
    // Chunked so one huge array is never sent to the server in a single command.
    for (let i = 0; i < ops.length; i += 500) {
      const result = await Order.bulkWrite(ops.slice(i, i + 500) as never, {
        ordered: false,
        timestamps: false,
      });
      written += result.modifiedCount;
    }
  }

  return { applied: apply, counts, written, totalOrders: orders.length };
}
