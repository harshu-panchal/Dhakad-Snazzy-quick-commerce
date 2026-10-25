/**
 * Create the Reel collection's indexes.
 *
 * `autoIndex` is disabled in config/db.ts (so index builds never block a cold
 * start), which means indexes declared on the schema are NOT created
 * automatically — they have to be built explicitly, once, like this.
 *
 * The important one is the unique+sparse index on `orderItem`: it's what
 * guarantees one reel per delivered purchase even if two uploads for the same
 * purchase land at the same time (the application-level check alone has a
 * check-then-write race). Sparse, so reels created before this rule existed
 * (which have no `orderItem`) are excluded instead of colliding on null.
 *
 * Usage: npm run reels:create-indexes
 */
import connectDB from "../config/db";
import mongoose from "mongoose";
import Reel from "../models/Reel";

async function main() {
  await connectDB();

  console.log("\nBuilding Reel indexes…");
  // syncIndexes builds everything declared on the schema (and drops indexes
  // that are no longer declared).
  const dropped = await Reel.syncIndexes();
  if (Array.isArray(dropped) && dropped.length) {
    console.log(`Dropped stale indexes: ${dropped.join(", ")}`);
  }

  const indexes = await Reel.collection.indexes();
  console.log("\nReel indexes now:");
  for (const idx of indexes as any[]) {
    const flags = [idx.unique ? "unique" : "", idx.sparse ? "sparse" : ""]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${idx.name}  ${JSON.stringify(idx.key)}${flags ? `  [${flags}]` : ""}`);
  }

  const hasGuard = (indexes as any[]).some(
    (i) => i.key?.orderItem === 1 && i.unique
  );
  console.log(
    hasGuard
      ? "\n✓ one-reel-per-purchase guard is active"
      : "\n✗ unique orderItem index missing — check for duplicate orderItem values"
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("\nFailed to create Reel indexes:", err.message || err);
  await mongoose.disconnect();
  process.exit(1);
});
