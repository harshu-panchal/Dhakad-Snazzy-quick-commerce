/**
 * Run the RBAC role seed on its own.
 *
 * The seed also runs on every server start, so this is for seeding a database
 * without booting the app: verifying a deploy, or repairing roles after a
 * restore.
 *
 * Connects directly rather than through config/db.ts, which also builds
 * indexes on unrelated collections (Seller, Product, Commission ...). This
 * script touches only the roles collection.
 *
 * Usage: npm run seed:rbac
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import Role from "../models/Role";
import { seedRbac } from "./seedRbac";

dotenv.config();

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not defined");

  // autoIndex off so loading models builds nothing; the one index this needs
  // (unique role name) is created explicitly below.
  mongoose.set("autoIndex", false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Connected to database "${mongoose.connection.name}"`);

  await Role.createIndexes();
  await seedRbac();

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("seedRbac failed:", error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
