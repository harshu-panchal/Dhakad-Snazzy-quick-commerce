/**
 * Seed the six towns on their own. The seed also runs on every server start;
 * this is for seeding a database without booting the app.
 *
 * Usage: npm run seed:cities
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import City from "../models/City";
import { seedCities } from "./seedCities";

dotenv.config();

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not defined");

  // Direct connect: config/db.ts would also build indexes on unrelated collections.
  mongoose.set("autoIndex", false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Connected to database "${mongoose.connection.name}"`);

  await City.createIndexes();
  const result = await seedCities();

  console.log("created:", result.created.length ? result.created.join(", ") : "(none)");
  console.log("aliases added:", Object.keys(result.aliasesAdded).length ? result.aliasesAdded : "(none)");
  console.log("unchanged:", result.unchanged.length ? result.unchanged.join(", ") : "(none)");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("seedCities failed:", error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
