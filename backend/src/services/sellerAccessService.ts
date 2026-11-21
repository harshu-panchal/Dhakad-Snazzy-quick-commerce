import Seller from "../models/Seller";

/**
 * Is this seller still allowed to use the API?
 *
 * A soft-deleted seller keeps its document, so unlike a hard delete the
 * handlers no longer 404 for a seller who is still holding a valid token (7
 * days). Without this check, deleting a seller would leave them able to accept
 * orders and edit products until the token expired.
 *
 * Called from `authenticate` for Seller tokens. To avoid a database read on
 * every seller request, a positive result is cached briefly. The cache is
 * cleared immediately when a seller is deleted in this process; the TTL is the
 * backstop for a deletion made by another process.
 */

const TTL_MS = Number(process.env.SELLER_ACCESS_CACHE_TTL_MS || 15_000);

const activeUntil = new Map<string, number>();

export function forgetSeller(sellerId: string): void {
  activeUntil.delete(sellerId);
}

export async function isSellerActive(sellerId: string): Promise<boolean> {
  const cachedUntil = activeUntil.get(sellerId);
  if (cachedUntil && cachedUntil > Date.now()) return true;

  const seller = await Seller.findById(sellerId).select("isDeleted").lean();

  // A seller that no longer exists (a legacy hard delete) is treated the same
  // as a deleted one: its token should stop working.
  const active = Boolean(seller) && seller!.isDeleted !== true;

  if (active) {
    activeUntil.set(sellerId, Date.now() + TTL_MS);
  } else {
    activeUntil.delete(sellerId);
  }

  return active;
}
