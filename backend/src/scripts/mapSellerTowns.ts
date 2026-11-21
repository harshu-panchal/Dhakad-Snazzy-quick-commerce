/**
 * Map sellers to towns. DRY RUN unless --apply is given.
 *
 *   npm run towns:map-sellers              # report only, writes nothing
 *   npm run towns:map-sellers -- --apply   # write Seller.cityId for clean matches
 *
 * Seeds the six towns first if they are missing (idempotent), so the report is
 * always against the real town list. Never overwrites an existing cityId and
 * never touches the free-text Seller.city.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { seedCities } from "./seedCities";
import { mapSellers } from "../services/townMappingService";

dotenv.config();

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined");
  }

  // Direct connect rather than config/db.ts, which also runs index builds on
  // unrelated collections. autoIndex off so loading models builds nothing; the
  // indexes this needs are created explicitly below.
  mongoose.set("autoIndex", false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Connected to database "${mongoose.connection.name}"`);
  console.log(APPLY ? "MODE: APPLY (will write Seller.cityId)\n" : "MODE: dry run (nothing will be written)\n");

  await (await import("../models/City")).default.createIndexes();

  const seeded = await seedCities();
  if (seeded.created.length) console.log("Towns created:", seeded.created.join(", "));
  if (Object.keys(seeded.aliasesAdded).length) console.log("Aliases added:", seeded.aliasesAdded);

  const report = await mapSellers({ apply: APPLY });

  const order = ["matched", "already-mapped", "location-outlier", "ambiguous", "no-matching-town", "no-city-text"] as const;
  console.log("\nSeller mapping:");
  for (const status of order) {
    console.log(`  ${status.padEnd(18)} ${report.counts[status]}`);
  }

  const byTown = new Map<string, number>();
  report.rows
    .filter((r) => r.status === "matched")
    .forEach((r) => byTown.set(r.townName!, (byTown.get(r.townName!) ?? 0) + 1));
  console.log("\nMatched, by town:");
  [...byTown.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${t.padEnd(16)} ${n}`));

  const needsAttention = report.rows.filter((r) =>
    ["location-outlier", "ambiguous", "no-matching-town", "no-city-text"].includes(r.status),
  );
  if (needsAttention.length) {
    console.log("\nNot mapped (needs a decision, or is test data):");
    for (const r of needsAttention) {
      console.log(
        `  ${r.status.padEnd(18)} ${(r.storeName || "").slice(0, 28).padEnd(29)} city=${JSON.stringify(r.cityText)}${r.detail ? "  - " + r.detail : ""}`,
      );
    }
  }

  console.log(
    report.applied
      ? `\nWrote cityId on ${report.written} seller(s).`
      : `\nDry run complete. ${report.counts.matched} seller(s) would be mapped. Re-run with --apply to write.`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("mapSellerTowns failed:", error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
