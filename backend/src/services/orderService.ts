import Order from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import Inventory from "../models/Inventory";
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import Product from "../models/Product";
import Commission from "../models/Commission";
import Seller from "../models/Seller";
import WalletTransaction from "../models/WalletTransaction";
import { clearOrderCache } from "../socket/socketService";

/**
 * Process order status transition
 */
export const processOrderStatusTransition = async (
  orderId: string,
  newStatus: string,
  previousStatus: string
) => {
  const order = await Order.findById(orderId).populate("items");

  if (!order) {
    throw new Error("Order not found");
  }

  // Clear tracking cache if order is completed, cancelled, or rejected
  if (["Delivered", "Cancelled", "Returned", "Failed", "Rejected"].includes(newStatus)) {
    clearOrderCache(orderId);
  }

  // Handle status-specific logic
  switch (newStatus) {
    case "Cancelled":
      // Restore inventory if order was confirmed
      if (["Processed", "Shipped"].includes(previousStatus)) {
        await restoreInventory(order.items as any[]);
      }
      break;

    case "Processed":
      // Reserve inventory
      await reserveInventory(order.items as any[]);
      break;

    case "Delivered":
      // Create commissions for sellers
      await createCommissions(order.items as any[]);
      break;
  }

  return order;
};

/**
 * Reserve inventory for order items
 */
const reserveInventory = async (items: IOrderItem[]) => {
  for (const item of items) {
    const inventory = await Inventory.findOne({ product: item.product });
    if (inventory) {
      inventory.reservedStock += item.quantity;
      inventory.availableStock = Math.max(
        0,
        inventory.currentStock - inventory.reservedStock
      );
      await inventory.save();
    }
  }
};

/**
 * Restore inventory when order is cancelled
 */
const restoreInventory = async (items: IOrderItem[]) => {
  for (const item of items) {
    const inventory = await Inventory.findOne({ product: item.product });
    if (inventory) {
      inventory.reservedStock = Math.max(
        0,
        inventory.reservedStock - item.quantity
      );
      inventory.availableStock =
        inventory.currentStock - inventory.reservedStock;
      await inventory.save();
    }
  }
};

/**
 * Create commissions for sellers when order is delivered
 * Also updates seller balances and creates wallet transactions
 */
const createCommissions = async (items: IOrderItem[]) => {
  // Group items by seller to aggregate earnings
  const sellerEarningsMap = new Map<string, {
    totalAmount: number;
    commissionAmount: number;
    netEarning: number;
    items: IOrderItem[];
  }>();

  // First pass: calculate commissions and aggregate by seller
  for (const item of items) {
    const sellerId = item.seller.toString();
    const seller = await Seller.findById(item.seller);

    if (!seller) continue;

    // Determine Commission Rate Priority:
    // 1. SubSubCategory (Category Model)
    // 2. SubCategory (SubCategory Model)
    // 3. Category (Category Model)
    // 4. Seller specific rate
    // 5. Global Default (10%)

    let commissionRate = 0;
    let rateSource = "Default";

    const product = await Product.findById(item.product);

    if (product) {
      // 1. Check SubSubCategory
      if (product.subSubCategory) {
        const subSubCat = await Category.findById(product.subSubCategory);
        if (subSubCat && subSubCat.commissionRate && subSubCat.commissionRate > 0) {
          commissionRate = subSubCat.commissionRate;
          rateSource = `SubSubCategory: ${subSubCat.name}`;
        }
      }

      // 2. Check SubCategory (only if not found yet)
      if (commissionRate === 0 && product.subcategory) {
        const subCat = await SubCategory.findById(product.subcategory);
        if (subCat && subCat.commissionRate && subCat.commissionRate > 0) {
          commissionRate = subCat.commissionRate;
          rateSource = `SubCategory: ${subCat.name}`;
        }
      }

      // 3. Check Category (only if not found yet)
      if (commissionRate === 0 && product.category) {
        const cat = await Category.findById(product.category);
        if (cat && cat.commissionRate && cat.commissionRate > 0) {
          commissionRate = cat.commissionRate;
          rateSource = `Category: ${cat.name}`;
        }
      }
    }

    // 4. Check Seller specifc rate
    if (commissionRate === 0 && seller.commission !== undefined && seller.commission > 0) {
      commissionRate = seller.commission;
      rateSource = "Seller";
    }

    // 5. Global Default (fallback if everything else is 0)
    if (commissionRate === 0) {
      commissionRate = 10; // Default 10%
      rateSource = "Global Default";
    }

    const commissionAmount = (item.total * commissionRate) / 100;
    const netEarning = item.total - commissionAmount;

    console.log(`[Commission] Item: ${product?.productName}, Rate: ${commissionRate}% (${rateSource}), Amount: ${commissionAmount}`);

    // Create commission record
    await Commission.create({
      order: item.order,
      orderItem: item._id,
      seller: item.seller,
      orderAmount: item.total,
      commissionRate,
      commissionAmount,
      status: "Pending",
    });

    // Aggregate earnings by seller
    if (!sellerEarningsMap.has(sellerId)) {
      sellerEarningsMap.set(sellerId, {
        totalAmount: 0,
        commissionAmount: 0,
        netEarning: 0,
        items: [],
      });
    }

    const sellerData = sellerEarningsMap.get(sellerId)!;
    sellerData.totalAmount += item.total;
    sellerData.commissionAmount += commissionAmount;
    sellerData.netEarning += netEarning;
    sellerData.items.push(item);
  }

  // Second pass: update seller balances and create wallet transactions
  for (const [sellerId, earnings] of sellerEarningsMap.entries()) {
    const seller = await Seller.findById(sellerId);
    if (!seller) continue;

    // Update seller balance
    seller.balance = (seller.balance || 0) + earnings.netEarning;
    await seller.save();

    // Create wallet transaction
    const order = await Order.findById(items[0].order);
    const orderNumber = order?.orderNumber || `ORDER-${items[0].order}`;

    await WalletTransaction.create({
      sellerId: seller._id,
      amount: earnings.netEarning,
      type: 'Credit',
      description: `Earnings from Order #${orderNumber}`,
      reference: `ORD-${items[0].order}-${Date.now()}-${sellerId}`,
      status: 'Completed',
    });
  }
};

/**
 * Validate order can transition to new status
 */
export const validateStatusTransition = (
  currentStatus: string,
  newStatus: string
): { valid: boolean; message?: string } => {
  const validTransitions: Record<string, string[]> = {
    Received: ["Pending", "Cancelled", "Rejected"],
    Pending: ["Processed", "Cancelled", "Rejected"],
    Processed: ["Shipped", "Cancelled", "Rejected"],
    Shipped: ["Out for Delivery", "Cancelled", "Rejected"],
    "Out for Delivery": ["Delivered", "Cancelled", "Rejected"],
    Delivered: ["Returned"],
    Cancelled: [],
    Rejected: [],
    Returned: [],
  };

  const allowedStatuses = validTransitions[currentStatus] || [];

  if (!allowedStatuses.includes(newStatus)) {
    return {
      valid: false,
      message: `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${allowedStatuses.join(
        ", "
      )}`,
    };
  }

  return { valid: true };
};

/**
 * Calculate order totals
 */
export const calculateOrderTotals = async (
  items: IOrderItem[],
  couponCode?: string
) => {
  let subtotal = 0;
  let tax = 0;
  let shipping = 0;
  let discount = 0;

  // Calculate subtotal from items
  for (const item of items) {
    subtotal += item.total;
  }

  // Apply coupon discount if provided
  if (couponCode) {
    // Coupon validation and discount calculation would go here
    // For now, we'll skip this as it's handled in the coupon controller
  }

  // Calculate tax (example: 18% GST)
  tax = subtotal * 0.18;

  // Calculate shipping (example: free shipping over 500)
  if (subtotal < 500) {
    shipping = 50;
  }

  const total = subtotal + tax + shipping - discount;

  return {
    subtotal,
    tax,
    shipping,
    discount,
    total,
  };
};
