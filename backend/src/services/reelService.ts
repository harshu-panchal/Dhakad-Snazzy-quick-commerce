import mongoose from "mongoose";
import crypto from "crypto";
import Reel from "../models/Reel";
import ReelLike from "../models/ReelLike";
import ReelCommission from "../models/ReelCommission";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Customer from "../models/Customer";
import Product from "../models/Product";
import Wishlist from "../models/Wishlist";
import Cart from "../models/Cart";
import CartItem from "../models/CartItem";
import AppSettings from "../models/AppSettings";
import PlatformWallet from "../models/PlatformWallet";
import { findSellersWithinRange } from "../utils/locationHelper";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const PRODUCT_SELECT =
  "productName mainImage price discPrice compareAtPrice discount seller status publish";

// Internal selection used for ranking only — superset of PRODUCT_SELECT with
// the category/subcategory/brand fields needed to score affinity. These extra
// fields are never copied into the response (see `shaped` below).
const PRODUCT_SELECT_FOR_RANKING = `${PRODUCT_SELECT} category subcategory brand`;

// ---------------------------------------------------------------------------
// Reel feed ranking
//
// Instagram-style "for you" ordering: not pure recency. Each candidate reel is
// scored from four signals — purchase/wishlist/cart affinity, engagement,
// recency, and a per-session random jitter — then diversified so one creator
// doesn't dominate consecutive slots. See the in-repo reels-affiliation-feature
// memory note for the product rationale.
// ---------------------------------------------------------------------------

/** Candidate pool size pulled per request before scoring (keeps ranking O(pool), not O(collection)). */
const CANDIDATE_POOL_RECENT = 300;
const CANDIDATE_POOL_TOP_ENGAGEMENT = 100;

/** Score weights (sum to 1). Tunable later via AppSettings if needed. */
const WEIGHT_AFFINITY = 0.4;
const WEIGHT_ENGAGEMENT = 0.25;
const WEIGHT_RECENCY = 0.15;
const WEIGHT_RANDOM = 0.2;

/** Recency half-life-ish decay constant, in hours. */
const RECENCY_DECAY_HOURS = 72;

/** Interest-vector weights by signal strength (purchases matter most). */
const AFFINITY_WEIGHT_PURCHASE = 3;
const AFFINITY_WEIGHT_WISHLIST = 1.5;
const AFFINITY_WEIGHT_CART = 1;

/** Diversity pass: no more than one reel from the same owner within this many preceding slots. */
const DIVERSITY_WINDOW = 2;

/**
 * Deterministic pseudo-random value in [0, 1) from a string seed (FNV-1a hash).
 * Same seed always reproduces the same value, which is what makes a feed
 * "shuffled but stable" across pages of the same scroll session.
 */
function seededRandom01(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

/** Min-max normalize a list of raw scores to [0, 1]; flat input maps to all-0. */
function minMaxNormalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!isFinite(min) || !isFinite(max) || max - min < 1e-9) {
    return values.map(() => 0);
  }
  return values.map((v) => (v - min) / (max - min));
}

type InterestVector = Map<string, number>; // `${dimension}:${id}` -> accumulated weight

const dimKey = (dim: "category" | "subcategory" | "brand", id: any) =>
  id ? `${dim}:${id.toString()}` : null;

/**
 * Build a customer's interest vector from delivered-order history (strongest
 * signal), wishlist, and cart — all data the platform already has. Empty for
 * a brand-new customer, which simply zeroes the affinity term for everyone
 * (cold start falls back to engagement + recency + exploration).
 */
async function buildInterestVector(customerId: string): Promise<InterestVector> {
  const vector: InterestVector = new Map();

  const addProducts = async (productIds: mongoose.Types.ObjectId[], weight: number) => {
    if (!productIds.length) return;
    const products = await Product.find({ _id: { $in: productIds } })
      .select("category subcategory brand")
      .lean();
    for (const p of products as any[]) {
      for (const [dim, id] of [
        ["category", p.category],
        ["subcategory", p.subcategory],
        ["brand", p.brand],
      ] as const) {
        const key = dimKey(dim, id);
        if (key) vector.set(key, (vector.get(key) || 0) + weight);
      }
    }
  };

  const [deliveredOrders, wishlist, cart] = await Promise.all([
    Order.find({ customer: customerId, status: "Delivered" })
      .select("_id")
      .limit(100)
      .lean(),
    Wishlist.findOne({ customer: customerId }).select("products").lean(),
    Cart.findOne({ customer: customerId }).select("items").lean(),
  ]);

  const orderIds = (deliveredOrders as any[]).map((o) => o._id);
  if (orderIds.length) {
    const items = await OrderItem.find({ order: { $in: orderIds } })
      .select("product")
      .limit(500)
      .lean();
    await addProducts(
      (items as any[]).map((i) => i.product),
      AFFINITY_WEIGHT_PURCHASE
    );
  }

  if ((wishlist as any)?.products?.length) {
    await addProducts((wishlist as any).products, AFFINITY_WEIGHT_WISHLIST);
  }

  if ((cart as any)?.items?.length) {
    const cartItems = await CartItem.find({ _id: { $in: (cart as any).items } })
      .select("product")
      .lean();
    await addProducts(
      (cartItems as any[]).map((i) => i.product),
      AFFINITY_WEIGHT_CART
    );
  }

  return vector;
}

function affinityRawScore(product: any, vector: InterestVector): number {
  if (!product || vector.size === 0) return 0;
  let score = 0;
  for (const [dim, id] of [
    ["category", product.category],
    ["subcategory", product.subcategory],
    ["brand", product.brand],
  ] as const) {
    const key = dimKey(dim, id);
    if (key) score += vector.get(key) || 0;
  }
  return score;
}

/**
 * Diversity re-interleave: greedily pick the next highest-scoring reel whose
 * owner hasn't appeared in the last DIVERSITY_WINDOW slots, falling back to
 * the overall best remaining reel when every bucket is on cooldown (keeps the
 * feed from stalling when there are few distinct creators).
 */
function diversify<T extends { ownerId: string; finalScore: number }>(sorted: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of sorted) {
    const arr = buckets.get(item.ownerId) || [];
    arr.push(item);
    buckets.set(item.ownerId, arr);
  }

  const result: T[] = [];
  const recentOwners: string[] = [];

  while (result.length < sorted.length) {
    let chosenKey: string | null = null;
    let chosenScore = -Infinity;
    let fallbackKey: string | null = null;
    let fallbackScore = -Infinity;

    for (const [key, items] of buckets) {
      if (items.length === 0) continue;
      const headScore = items[0].finalScore;
      if (headScore > fallbackScore) {
        fallbackScore = headScore;
        fallbackKey = key;
      }
      if (!recentOwners.includes(key) && headScore > chosenScore) {
        chosenScore = headScore;
        chosenKey = key;
      }
    }

    const useKey = chosenKey ?? fallbackKey;
    if (!useKey) break;

    const item = buckets.get(useKey)!.shift()!;
    result.push(item);
    recentOwners.push(useKey);
    if (recentOwners.length > DIVERSITY_WINDOW) recentOwners.shift();
  }

  return result;
}

/**
 * Build the location-aware, ranked reel feed for a viewer.
 *
 * Hard filter (unchanged): a reel is eligible only when the viewer's
 * coordinates fall within the service radius of the seller of the reel's
 * product. Within that eligible set, reels are ranked by a blend of purchase/
 * wishlist/cart affinity, engagement, recency, and a seeded random factor —
 * then diversified so one creator doesn't dominate. `feedSeed` keeps the
 * ranking stable across pages of one scroll session (pass the seed returned
 * by the first page back on subsequent page requests); omit it to get a
 * freshly shuffled feed (e.g. on a new app open).
 */
export const getReelFeed = async (params: {
  customerId: string;
  latitude: number;
  longitude: number;
  page?: number;
  limit?: number;
  feedSeed?: string;
}) => {
  const { customerId, latitude, longitude } = params;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(params.limit) || 5));
  const skip = (page - 1) * limit;
  const feedSeed = params.feedSeed || crypto.randomBytes(8).toString("hex");

  const sellerIds = await findSellersWithinRange(latitude, longitude);
  if (!sellerIds || sellerIds.length === 0) {
    return { reels: [], page, limit, total: 0, hasMore: false, feedSeed };
  }

  // Exclude the viewer's own reels from their own feed (Instagram-style).
  const baseQuery = {
    seller: { $in: sellerIds },
    status: "Active" as const,
    customer: { $ne: new mongoose.Types.ObjectId(customerId) },
  };

  const total = await Reel.countDocuments(baseQuery);
  if (total === 0) {
    return { reels: [], page, limit, total: 0, hasMore: false, feedSeed };
  }

  // Candidate pool: most-recent N merged with top-engagement N, deduplicated.
  // Bounded so ranking cost doesn't grow with the whole collection.
  const [recentCandidates, topEngagementCandidates] = await Promise.all([
    Reel.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(CANDIDATE_POOL_RECENT)
      .populate({ path: "product", select: PRODUCT_SELECT_FOR_RANKING })
      .populate({ path: "customer", select: "name" })
      .lean(),
    Reel.aggregate([
      { $match: baseQuery },
      { $addFields: { engagementSum: { $add: ["$likesCount", "$sharesCount", "$viewsCount"] } } },
      { $sort: { engagementSum: -1 } },
      { $limit: CANDIDATE_POOL_TOP_ENGAGEMENT },
      { $project: { _id: 1 } },
    ]),
  ]);

  const candidateMap = new Map<string, any>();
  for (const r of recentCandidates) candidateMap.set(r._id.toString(), r);

  const missingIds = (topEngagementCandidates as any[])
    .map((r) => r._id.toString())
    .filter((id) => !candidateMap.has(id));
  if (missingIds.length) {
    const extra = await Reel.find({ _id: { $in: missingIds } })
      .populate({ path: "product", select: PRODUCT_SELECT_FOR_RANKING })
      .populate({ path: "customer", select: "name" })
      .lean();
    for (const r of extra) candidateMap.set(r._id.toString(), r);
  }

  const candidates = Array.from(candidateMap.values());

  const interestVector = await buildInterestVector(customerId);
  const now = Date.now();

  const scored = candidates.map((r: any) => {
    const ageHours = Math.max(0, (now - new Date(r.createdAt).getTime()) / 3_600_000);
    const recencyRaw = Math.exp(-ageHours / RECENCY_DECAY_HOURS);
    const engagementRaw =
      Math.log1p(r.likesCount || 0) * 1 +
      Math.log1p(r.sharesCount || 0) * 1.5 +
      Math.log1p(r.viewsCount || 0) * 0.5;
    const affinityRaw = affinityRawScore(r.product, interestVector);
    const randomRaw = seededRandom01(`${feedSeed}:${r._id.toString()}`);

    return {
      reel: r,
      ownerId: (r.customer?._id || r.customer)?.toString() || "unknown",
      affinityRaw,
      engagementRaw,
      recencyRaw,
      randomRaw,
    };
  });

  const affinityNorm = minMaxNormalize(scored.map((s) => s.affinityRaw));
  const engagementNorm = minMaxNormalize(scored.map((s) => s.engagementRaw));

  const withFinalScore = scored.map((s, i) => ({
    ...s,
    finalScore:
      WEIGHT_AFFINITY * affinityNorm[i] +
      WEIGHT_ENGAGEMENT * engagementNorm[i] +
      WEIGHT_RECENCY * s.recencyRaw +
      WEIGHT_RANDOM * s.randomRaw,
  }));

  withFinalScore.sort((a, b) => b.finalScore - a.finalScore);
  const ranked = diversify(withFinalScore);

  // `ranked` is bounded by the candidate pool (see CANDIDATE_POOL_* above), so
  // it may be smaller than `total` once the catalog grows past that pool size.
  // Pagination/hasMore is scoped to this session's ranked pool — once it's
  // exhausted the client requests page 1 again (no feedSeed) to pull a fresh
  // shuffle, which is how the feed keeps surfacing reels beyond the pool.
  const page_ = ranked.slice(skip, skip + limit).map((s) => s.reel);

  // Resolve the viewer's like state for this page in one query
  const reelIds = page_.map((r: any) => r._id);
  const liked = reelIds.length
    ? await ReelLike.find({ customer: customerId, reel: { $in: reelIds } })
        .select("reel")
        .lean()
    : [];
  const likedSet = new Set(liked.map((l: any) => l.reel.toString()));

  const shaped = page_.map((r: any) => ({
    _id: r._id,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    durationSec: r.durationSec,
    likesCount: r.likesCount || 0,
    sharesCount: r.sharesCount || 0,
    viewsCount: r.viewsCount || 0,
    liked: likedSet.has(r._id.toString()),
    isOwner: false, // viewer's own reels are excluded from their own feed
    owner: r.customer ? { _id: r.customer._id, name: r.customer.name } : null,
    product: r.product
      ? {
          _id: r.product._id,
          productName: r.product.productName,
          mainImage: r.product.mainImage,
          price: r.product.price,
          discPrice: r.product.discPrice,
          compareAtPrice: r.product.compareAtPrice,
          discount: r.product.discount,
          seller: r.product.seller,
        }
      : null,
    createdAt: r.createdAt,
  }));

  return {
    reels: shaped,
    page,
    limit,
    total,
    hasMore: skip + page_.length < ranked.length,
    feedSeed,
  };
};

/**
 * Create a reel linked to a product. Seller is denormalized from the product.
 */
export const createReel = async (data: {
  customerId: string;
  productId: string;
  videoUrl: string;
  videoPublicId?: string;
  thumbnailUrl?: string;
  caption?: string;
  durationSec?: number;
  sizeBytes?: number;
  uploaderCity?: string;
  uploaderState?: string;
}) => {
  const product = await Product.findById(data.productId).select("seller status publish");
  if (!product) {
    throw new Error("Linked product not found");
  }
  if (!product.seller) {
    throw new Error("Linked product has no seller");
  }

  const reel = await Reel.create({
    customer: data.customerId,
    product: product._id,
    seller: product.seller,
    videoUrl: data.videoUrl,
    videoPublicId: data.videoPublicId,
    thumbnailUrl: data.thumbnailUrl,
    caption: data.caption,
    durationSec: data.durationSec,
    sizeBytes: data.sizeBytes,
    uploaderCity: data.uploaderCity,
    uploaderState: data.uploaderState,
  });

  return Reel.findById(reel._id)
    .populate({ path: "product", select: PRODUCT_SELECT })
    .populate({ path: "customer", select: "name" })
    .lean();
};

/**
 * Toggle a like for a customer on a reel. Returns the new state + count.
 */
export const toggleLike = async (reelId: string, customerId: string) => {
  const reel = await Reel.findById(reelId).select("_id likesCount");
  if (!reel) {
    throw new Error("Reel not found");
  }

  const existing = await ReelLike.findOne({ reel: reelId, customer: customerId });

  if (existing) {
    await ReelLike.deleteOne({ _id: existing._id });
    const updated = await Reel.findByIdAndUpdate(
      reelId,
      { $inc: { likesCount: -1 } },
      { new: true }
    ).select("likesCount");
    const count = Math.max(0, updated?.likesCount ?? 0);
    return { liked: false, likesCount: count };
  }

  try {
    await ReelLike.create({ reel: reelId, customer: customerId });
  } catch (err: any) {
    // Duplicate key (double tap race) — treat as already liked
    if (err?.code !== 11000) throw err;
  }
  const updated = await Reel.findByIdAndUpdate(
    reelId,
    { $inc: { likesCount: 1 } },
    { new: true }
  ).select("likesCount");
  return { liked: true, likesCount: updated?.likesCount ?? 1 };
};

/**
 * Record a share (increment counter). Sharing itself happens client-side via
 * the device share sheet / platform links.
 */
export const recordShare = async (reelId: string) => {
  const updated = await Reel.findByIdAndUpdate(
    reelId,
    { $inc: { sharesCount: 1 } },
    { new: true }
  ).select("sharesCount");
  if (!updated) throw new Error("Reel not found");
  return { sharesCount: updated.sharesCount };
};

/** Record a view (best-effort counter). */
export const recordView = async (reelId: string) => {
  await Reel.updateOne({ _id: reelId }, { $inc: { viewsCount: 1 } });
};

/** A customer's own reels with lifetime earnings per reel. */
export const getMyReels = async (customerId: string) => {
  const reels = await Reel.find({ customer: customerId })
    .sort({ createdAt: -1 })
    .populate({ path: "product", select: PRODUCT_SELECT })
    .lean();

  const reelIds = reels.map((r: any) => r._id);
  const earnings = await ReelCommission.aggregate([
    { $match: { reel: { $in: reelIds }, status: "Paid" } },
    { $group: { _id: "$reel", total: { $sum: "$commissionAmount" }, orders: { $sum: 1 } } },
  ]);
  const earnMap = new Map(earnings.map((e: any) => [e._id.toString(), e]));

  return reels.map((r: any) => ({
    ...r,
    earnings: round2(earnMap.get(r._id.toString())?.total || 0),
    conversions: earnMap.get(r._id.toString())?.orders || 0,
  }));
};

/** Delete a customer's own reel. */
export const deleteReel = async (reelId: string, customerId: string) => {
  const reel = await Reel.findOne({ _id: reelId, customer: customerId });
  if (!reel) {
    throw new Error("Reel not found or you are not the owner");
  }
  await Reel.deleteOne({ _id: reel._id });
  await ReelLike.deleteMany({ reel: reel._id });
  // Best-effort media cleanup
  try {
    if (reel.videoUrl) {
      const { deleteImage } = await import("./localStorageService");
      await deleteImage(reel.videoPublicId || reel.videoUrl);
    }
  } catch (e) {
    console.error("Failed to delete reel media:", e);
  }
  return reel;
};

/** Reel-earning summary + ledger for a customer. */
export const getReelEarnings = async (customerId: string) => {
  const rows = await ReelCommission.find({ reelOwner: customerId })
    .sort({ createdAt: -1 })
    .populate({ path: "reel", select: "caption videoUrl thumbnailUrl" })
    .populate({ path: "product", select: "productName mainImage" })
    .lean();

  const totalEarned = rows
    .filter((r: any) => r.status === "Paid")
    .reduce((s: number, r: any) => s + (r.commissionAmount || 0), 0);

  const customer = await Customer.findById(customerId).select("walletAmount");

  return {
    walletAmount: round2(customer?.walletAmount || 0),
    totalReelEarnings: round2(totalEarned),
    conversions: rows.filter((r: any) => r.status === "Paid").length,
    transactions: rows.map((r: any) => ({
      _id: r._id,
      amount: round2(r.commissionAmount),
      rate: r.commissionRate,
      status: r.status,
      product: r.product,
      reel: r.reel,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
    })),
  };
};

/**
 * Settle reel affiliation commissions for a delivered order.
 *
 * Idempotent: a ReelCommission row is unique per orderItem, so this is safe to
 * call from every commission-distribution site. For each order item that was
 * bought through a reel, the reel owner's wallet is credited with
 *   min(reelCommissionRate% x itemSale, adminEarningOnItem)
 * paid out of PlatformWallet.totalAdminEarning / currentPlatformBalance.
 */
export const settleReelCommissionsForOrder = async (orderId: string) => {
  const order = await Order.findById(orderId);
  if (!order) return { success: false, message: "Order not found" };
  if (order.status !== "Delivered") {
    return { success: false, message: "Order is not delivered yet" };
  }

  const reelItems = await OrderItem.find({
    order: orderId,
    reel: { $ne: null },
  });
  if (reelItems.length === 0) {
    console.log(
      `[Reel] Order ${order.orderNumber || orderId} delivered with no reel-attributed items — no reel commission.`
    );
    return { success: true, message: "No reel items on this order", credited: 0 };
  }

  const settings = await (AppSettings as any).getSettings();
  const rate = Math.max(0, Math.min(100, Number(settings?.reelCommissionRate ?? 5)));

  let creditedTotal = 0;

  for (const item of reelItems) {
    // Idempotency guard
    const already = await ReelCommission.findOne({ orderItem: item._id });
    if (already) continue;

    const reel = await Reel.findById(item.reel);
    if (!reel) continue; // reel deleted — nothing to attribute

    const reelOwnerId = (item.reelOwner || reel.customer)?.toString();
    if (!reelOwnerId) continue;

    // Never pay a buyer for purchasing through their own reel
    if (reelOwnerId === order.customer.toString()) {
      console.log(
        `[Reel] Skipping self-purchase on order ${order.orderNumber || orderId} (buyer is the reel owner).`
      );
      continue;
    }

    const itemSale = round2(item.total || 0);
    const adminEarningOnItem = round2(item.commissionAmount || 0);
    const rawCommission = round2((itemSale * rate) / 100);
    const commissionAmount = round2(Math.max(0, Math.min(rawCommission, adminEarningOnItem)));

    if (commissionAmount === 0) {
      console.log(
        `[Reel] Order ${order.orderNumber || orderId}: reel commission computed as 0 ` +
          `(rate ${rate}%, itemSale ${itemSale}, adminEarningCap ${adminEarningOnItem}). ` +
          `Owner credited 0 — check the product's commission rate and reelCommissionRate.`
      );
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const reference = `REEL-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 8)
        .toUpperCase()}`;

      await ReelCommission.create(
        [
          {
            reel: reel._id,
            reelOwner: reelOwnerId,
            buyer: order.customer,
            order: order._id,
            orderItem: item._id,
            product: item.product,
            seller: item.seller,
            itemSaleAmount: itemSale,
            adminEarningOnItem,
            commissionRate: rate,
            commissionAmount,
            status: "Paid",
            paidAt: new Date(),
            reference,
          },
        ],
        { session }
      );

      if (commissionAmount > 0) {
        // Credit the reel owner's wallet
        await Customer.findByIdAndUpdate(
          reelOwnerId,
          { $inc: { walletAmount: commissionAmount } },
          { session }
        );

        // Pay out of the admin's earning
        const wallet = await PlatformWallet.findOne().session(session);
        if (wallet) {
          wallet.totalAdminEarning = Math.max(
            0,
            round2((wallet.totalAdminEarning || 0) - commissionAmount)
          );
          wallet.currentPlatformBalance = Math.max(
            0,
            round2((wallet.currentPlatformBalance || 0) - commissionAmount)
          );
          await wallet.save({ session });
        }
      }

      await session.commitTransaction();
      creditedTotal += commissionAmount;
    } catch (err: any) {
      await session.abortTransaction();
      // Unique-key collision means another process settled it first — fine.
      if (err?.code !== 11000) {
        console.error(
          `Failed to settle reel commission for order item ${item._id}:`,
          err
        );
      }
    } finally {
      session.endSession();
    }
  }

  return { success: true, credited: round2(creditedTotal) };
};

/**
 * Reverse paid reel commissions for an order (e.g. full return after delivery).
 * Debits the reel owner's wallet (not below zero) and restores admin earning.
 */
export const reverseReelCommissionsForOrder = async (orderId: string) => {
  const paid = await ReelCommission.find({ order: orderId, status: "Paid" });
  if (paid.length === 0) return { success: true, reversed: 0 };

  let reversedTotal = 0;
  for (const rc of paid) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      rc.status = "Reversed";
      rc.reversedAt = new Date();
      await rc.save({ session });

      if (rc.commissionAmount > 0) {
        const customer = await Customer.findById(rc.reelOwner).session(session);
        if (customer) {
          customer.walletAmount = Math.max(
            0,
            round2((customer.walletAmount || 0) - rc.commissionAmount)
          );
          await customer.save({ session });
        }
        const wallet = await PlatformWallet.findOne().session(session);
        if (wallet) {
          wallet.totalAdminEarning = round2(
            (wallet.totalAdminEarning || 0) + rc.commissionAmount
          );
          wallet.currentPlatformBalance = round2(
            (wallet.currentPlatformBalance || 0) + rc.commissionAmount
          );
          await wallet.save({ session });
        }
      }

      await session.commitTransaction();
      reversedTotal += rc.commissionAmount;
    } catch (err) {
      await session.abortTransaction();
      console.error(`Failed to reverse reel commission ${rc._id}:`, err);
    } finally {
      session.endSession();
    }
  }

  return { success: true, reversed: round2(reversedTotal) };
};
