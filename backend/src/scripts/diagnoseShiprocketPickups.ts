import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db";
import Seller from "../models/Seller";

dotenv.config();

async function run() {
  await connectDB();

  const configuration = ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "SHIPROCKET_API_URL", "SHIPROCKET_WEBHOOK_TOKEN"]
    .map((name) => ({ name, configured: Boolean(String(process.env[name] || "").trim()) }));
  const groupedErrors = await Seller.aggregate([
    { $match: { shiprocketPickupSyncStatus: "Failed" } },
    { $group: { _id: "$shiprocketPickupSyncError", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const invalidAddresses = await Seller.find({
    shiprocketPickupSyncStatus: "Failed",
    $or: [
      { state: { $in: [null, ""] } },
      { pincode: { $not: /^[1-9][0-9]{5}$/ } },
      { address: { $in: [null, ""] } },
      { city: { $in: [null, ""] } },
    ],
  })
    .select("storeName state pincode city")
    .lean();

  console.log("Shiprocket configuration:", configuration);
  console.log("Grouped pickup errors:", groupedErrors);
  console.log("Legacy sellers requiring address correction:", invalidAddresses);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Shiprocket pickup diagnosis failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
