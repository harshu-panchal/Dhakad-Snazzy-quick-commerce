/**
 * Fill in Order.cityId for existing orders. DRY RUN unless --apply is given.
 *
 *   npm run orders:backfill-towns              # report only, writes nothing
 *   npm run orders:backfill-towns -- --apply   # write Order.cityId
 *
 * Run `npm run towns:map-sellers -- --apply` FIRST: an order's town comes from
 * its seller's town, so sellers must have one before their orders can.
 *
 * Conservative by design. An order gets a town only when every seller on it
 * still exists, has a town, and they all agree. Orders whose seller was deleted
 * (the orphaned history) stay without a town and are Super-Admin-only. Never
 * overwrites an existing cityId; does not touch updatedAt.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { backfillOrderTowns } from "../services/orderTownService";

dotenv.config();

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not defined");

  // Direct connect: config/db.ts would also build indexes on unrelated collections.
  mongoose.set("autoIndex", false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Connected to database "${mongoose.connection.name}"`);
  console.log(APPLY ? "MODE: APPLY (will write Order.cityId)\n" : "MODE: dry run (nothing will be written)\n");

  const sellersWithTown = await mongoose.connection.db!
    .collection("sellers")
    .countDocuments({ cityId: { $exists: true } });
  if (sellersWithTown === 0) {
    console.log(
      "WARNING: no seller has a town yet, so no order can be assigned one.\n" +
        "         Run `npm run towns:map-sellers -- --apply` first.\n",
    );
  }

  const report = await backfillOrderTowns({ apply: APPLY });

  const label: Record<string, string> = {
    assign: "can be assigned a town",
    "already-set": "already have a town",
    "seller-missing": "seller was deleted (stay without a town)",
    "seller-no-town": "seller has no town (stay without a town)",
    "cross-town": "sellers in different towns (stay without a town)",
    "no-items": "have no order items",
  };

  console.log(`Orders examined: ${report.totalOrders}`);
  for (const [status, n] of Object.entries(report.counts)) {
    console.log(`  ${String(n).padStart(6)}  ${label[status] ?? status}`);
  }

  console.log(
    report.applied
      ? `\nWrote cityId on ${report.written} order(s).`
      : `\nDry run complete. ${report.counts.assign} order(s) would get a town. Re-run with --apply to write.`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("backfillOrderTowns failed:", error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
