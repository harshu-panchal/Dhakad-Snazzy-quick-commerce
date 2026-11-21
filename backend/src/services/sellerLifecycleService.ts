import { Types } from "mongoose";
import Seller from "../models/Seller";
import { forgetSeller } from "./sellerAccessService";

/**
 * Seller deletion is a soft delete.
 *
 * Why: 60% of order history already points at a seller that was hard-deleted
 * (2,481 of 4,146 order items at the time of writing), which left those orders
 * with no seller name, no town and no way to attribute them. A soft delete
 * keeps the document so history still resolves.
 *
 * What it must still achieve, to match what a hard delete did:
 *  - the seller disappears from customers. Every customer query already
 *    requires `status: "Approved"`, so setting status to "Deleted" is enough;
 *    no customer query needed editing.
 *  - the seller can no longer sign in or use an old token. Login looks sellers
 *    up by mobile, which is released below, and `authenticate` rejects deleted
 *    sellers (see sellerAccessService).
 *  - the same person can register again. email and mobile are unique, and a
 *    plain flag would keep them occupied forever, so they are released and the
 *    originals saved in `deletedSnapshot` for a restore.
 */

export type SoftDeleteResult = "deleted" | "not-found" | "already-deleted";

export async function softDeleteSeller(
  sellerId: string,
  deletedBy?: string,
): Promise<SoftDeleteResult> {
  if (!Types.ObjectId.isValid(sellerId)) return "not-found";

  const seller = await Seller.findById(sellerId).select("email mobile status isDeleted").lean();
  if (!seller) return "not-found";
  if (seller.isDeleted) return "already-deleted";

  const tag = String(seller._id);

  // Conditional on not already being deleted, so two concurrent deletes cannot
  // both snapshot, and the second cannot overwrite the first's snapshot with
  // the already-released values.
  const result = await Seller.updateOne(
    { _id: seller._id, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        ...(deletedBy && Types.ObjectId.isValid(deletedBy) ? { deletedBy: new Types.ObjectId(deletedBy) } : {}),
        statusBeforeDelete: seller.status,
        status: "Deleted",
        isShopOpen: false,
        deletedSnapshot: { email: seller.email, mobile: seller.mobile },
        // Released placeholders. Unique per seller, and recognisably not real.
        email: `deleted+${tag}@deleted.invalid`,
        mobile: `deleted-${tag}`,
      },
    },
  );

  forgetSeller(tag);

  return result.modifiedCount === 1 ? "deleted" : "already-deleted";
}

/** The filter every admin list and broadcast uses to leave deleted sellers out. */
export const NOT_DELETED = { isDeleted: { $ne: true } } as const;
