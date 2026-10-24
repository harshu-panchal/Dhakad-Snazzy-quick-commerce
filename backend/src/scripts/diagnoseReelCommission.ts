/**
 * Diagnose why a reel owner didn't receive affiliation commission.
 *
 * Usage:
 *   npx tsx src/scripts/diagnoseReelCommission.ts                 # scan recent reel-attributed items
 *   npx tsx src/scripts/diagnoseReelCommission.ts ORD1700000000   # inspect one order by orderNumber
 *
 * It prints, for each relevant order item: whether a reel was attached, the
 * buyer vs reel owner (self-purchase?), the admin-earning cap, the configured
 * reel rate, the computed payout, and any ReelCommission ledger record.
 */
import connectDB from "../config/db";
import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Reel from "../models/Reel";
import ReelCommission from "../models/ReelCommission";
import AppSettings from "../models/AppSettings";
import Customer from "../models/Customer";
import Product from "../models/Product";
import Category from "../models/Category";
import Seller from "../models/Seller";
import { getOrderItemCommissionRate } from "../services/commissionService";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  await connectDB();

  const settings = await (AppSettings as any).getSettings();
  const rate = Number(settings?.reelCommissionRate ?? 5);
  console.log("\n==================== REEL COMMISSION DIAGNOSIS ====================");
  console.log(`Global reelCommissionRate: ${rate}%`);
  if (rate === 0) {
    console.log("⚠️  reelCommissionRate is 0 — no reel commission will ever be paid.");
  }

  const arg = process.argv[2];
  let orderIds: mongoose.Types.ObjectId[] | null = null;

  if (arg) {
    const order = await Order.findOne({ orderNumber: arg });
    if (!order) {
      console.log(`\n❌ No order found with orderNumber "${arg}".`);
      await mongoose.disconnect();
      return;
    }
    orderIds = [order._id as mongoose.Types.ObjectId];
    console.log(`\nInspecting order ${order.orderNumber} (status: ${order.status}).`);
  }

  // Order items that were tagged with a reel
  const itemQuery: any = { reel: { $ne: null } };
  if (orderIds) itemQuery.order = { $in: orderIds };

  const reelItems = await OrderItem.find(itemQuery)
    .sort({ createdAt: -1 })
    .limit(arg ? 100 : 25)
    .lean();

  if (reelItems.length === 0) {
    console.log(
      "\n❌ No order items have a reel attached (OrderItem.reel is null on all of them)."
    );
    console.log(
      "   => Attribution never reached the order. Likely causes:\n" +
        "      • The product was NOT opened via the reel's Buy button, OR\n" +
        "      • The buyer was the reel owner (self-purchase is dropped at order time), OR\n" +
        "      • More than 24h passed between tapping Buy and ordering (attribution TTL)."
    );

    // Show recent delivered orders so the user can re-run with an orderNumber
    const recent = await Order.find({ status: "Delivered" })
      .sort({ deliveredAt: -1 })
      .limit(5)
      .select("orderNumber status deliveredAt")
      .lean();
    console.log("\nRecent delivered orders (re-run with one of these):");
    recent.forEach((o: any) => console.log(`   ${o.orderNumber}  (${o.status})`));
    await mongoose.disconnect();
    return;
  }

  for (const item of reelItems) {
    const order = await Order.findById(item.order).select(
      "orderNumber status customer paymentMethod"
    );
    const reel = await Reel.findById(item.reel).select("customer status caption");
    const ledger = await ReelCommission.findOne({ orderItem: item._id });

    const buyerId = order?.customer?.toString();
    const ownerId = (item.reelOwner || reel?.customer)?.toString();

    const buyer = buyerId ? await Customer.findById(buyerId).select("name phone walletAmount") : null;
    const owner = ownerId ? await Customer.findById(ownerId).select("name phone walletAmount") : null;

    const itemSale = round2(item.total || 0);
    const cap = round2(item.commissionAmount || 0);
    const raw = round2((itemSale * rate) / 100);
    const expected = round2(Math.max(0, Math.min(raw, cap)));

    console.log("\n------------------------------------------------------------------");
    console.log(`Order:        ${order?.orderNumber || item.order}  (status: ${order?.status}, ${order?.paymentMethod})`);
    console.log(`Product:      ${item.productName}  | itemSale ₹${itemSale}`);
    console.log(`Reel:         ${item.reel}  (status: ${reel?.status})`);
    console.log(`Reel owner:   ${owner?.name || ownerId}  (wallet ₹${owner?.walletAmount ?? "?"})`);
    console.log(`Buyer:        ${buyer?.name || buyerId}`);

    // --- Commission-rate resolution (why the admin cap is what it is) ---
    const product = await Product.findById(item.product).select(
      "productName headerCategoryId category seller"
    );
    let catHeader: any = null;
    if (product?.category) {
      const cat = await Category.findById(product.category).select("headerCategoryId name");
      catHeader = cat?.headerCategoryId;
    }
    const effectiveHeader = product?.headerCategoryId || catHeader;
    const seller = await Seller.findById(item.seller).select(
      "storeName commission categoryCommissions"
    );
    const liveRate = product
      ? await getOrderItemCommissionRate(product, item.seller.toString())
      : 0;

    console.log(`Product header-category: ${product?.headerCategoryId ? "on product" : catHeader ? "via category" : "NONE ❌"}  (${effectiveHeader || "—"})`);
    console.log(`Seller.commission (general, NOT used for payout): ${seller?.commission ?? "—"}%`);
    console.log(
      `Seller.categoryCommissions: ${
        seller?.categoryCommissions?.length
          ? seller.categoryCommissions
              .map((c: any) => `${c.headerCategory}=${c.commissionRate}%`)
              .join(", ")
          : "NONE ❌"
      }`
    );
    console.log(`→ getOrderItemCommissionRate (used for admin cap): ${liveRate}%`);
    console.log(`→ Stored OrderItem.commissionAmount (admin earning / cap): ₹${cap}`);

    // Diagnose
    if (!reel) {
      console.log("🔎 RESULT: the reel no longer exists (deleted) — nothing settled.");
    } else if (ownerId && buyerId && ownerId === buyerId) {
      console.log("🔎 RESULT: SELF-PURCHASE — buyer is the reel owner, so commission is skipped by design.");
    } else if (order?.status !== "Delivered") {
      console.log(`🔎 RESULT: order is "${order?.status}", not Delivered yet — commission settles on delivery.`);
    } else if (cap === 0) {
      console.log(
        `🔎 RESULT: admin earning on this item is ₹0 (OrderItem.commissionAmount=0), ` +
          `so the payout is capped to ₹0. The product/seller has 0% platform commission.`
      );
    } else if (rate === 0) {
      console.log("🔎 RESULT: reelCommissionRate is 0% — payout is ₹0.");
    } else if (!ledger) {
      console.log(
        `🔎 RESULT: order is Delivered and payout should be ₹${expected}, but NO ReelCommission ` +
          `record exists — settlement never ran for this order. (Likely the delivery path didn't call it.)`
      );
    } else {
      console.log(
        `🔎 RESULT: settled. Ledger status=${ledger.status}, amount ₹${round2(ledger.commissionAmount)} ` +
          `(rate ${ledger.commissionRate}%, cap ₹${round2(ledger.adminEarningOnItem)}).`
      );
      if (ledger.status === "Reversed") {
        console.log("   ⚠️  This commission was REVERSED (order returned).");
      }
    }
    console.log(`   Expected payout with current config: ₹${expected} (raw ₹${raw}, cap ₹${cap})`);
  }

  console.log("\n==================================================================\n");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
