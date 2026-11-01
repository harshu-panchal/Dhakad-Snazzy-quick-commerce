import dotenv from "dotenv";
import connectDB from "../config/db";
import Seller from "../models/Seller";
import { syncSellerPickup } from "../services/shiprocketService";

dotenv.config();

async function run() {
  await connectDB();
  await Seller.updateMany({}, { $set: { shiprocketPickupSyncStatus: "Pending" } });

  let total = { attempted: 0, synced: 0, failed: 0 };
  const cursor = Seller.find({}).select("_id").lean().cursor();
  for await (const seller of cursor) {
    total.attempted += 1;
    try {
      await syncSellerPickup(String(seller._id));
      total.synced += 1;
    } catch {
      // Failed legacy records stay visible to admins for address correction and retry.
      total.failed += 1;
    }
  }
  console.log("Shiprocket pickup migration complete:", total);
  process.exit(0);
}

run().catch((error) => {
  console.error("Shiprocket pickup migration failed:", error);
  process.exit(1);
});
