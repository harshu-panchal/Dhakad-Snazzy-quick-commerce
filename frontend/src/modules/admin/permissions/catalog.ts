/**
 * Admin page permission keys.
 *
 * Necessarily a mirror of backend/src/config/permissions.ts, because the
 * sidebar is a hardcoded array and the route table needs keys at build time.
 *
 * The two copies are kept honest by src/tests/permissionCatalog.test.ts, which
 * fails if the key sets diverge. The backend remains the authority at runtime:
 * GET /admin/roles/permissions drives the role editor, and every endpoint
 * re-checks server-side.
 */

export type Tier = "view" | "manage";

export const WILDCARD = "*";

export interface PageDef {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  path: string;
}

export const PAGES: readonly PageDef[] = [
  { key: "dashboard", label: "Dashboard", group: "dashboard", groupLabel: "Dashboard", path: "/admin" },

  { key: "catalog.category", label: "Category", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/category" },
  { key: "catalog.header_category", label: "Header Category", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/category/header" },
  { key: "catalog.subcategory", label: "Subcategory", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/subcategory" },
  { key: "catalog.subcategory_order", label: "Subcategory Order", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/subcategory-order" },
  { key: "catalog.brand", label: "Brand", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/brand" },
  { key: "catalog.product_list", label: "Product List", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/product/list" },
  { key: "catalog.taxes", label: "Taxes", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/product/taxes" },

  { key: "sellers.list", label: "Manage Seller List", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-seller/list" },
  { key: "sellers.transaction", label: "Seller Transaction", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-seller/transaction" },
  { key: "sellers.location", label: "Seller Location", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-location/seller-location" },

  { key: "delivery.manage", label: "Manage Delivery Boy", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/manage" },
  { key: "delivery.manual_assign", label: "Manual Assignment", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/manual-assign" },
  { key: "delivery.fund_transfer", label: "Fund Transfer", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/fund-transfer" },
  { key: "delivery.cash_collection", label: "Cash Collection", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/cash-collection" },
  { key: "delivery.tracking", label: "Delivery Tracking", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-tracking" },

  { key: "orders.all", label: "All Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/all" },
  { key: "orders.pending", label: "Pending Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/pending" },
  { key: "orders.received", label: "Received Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/received" },
  { key: "orders.processed", label: "Processed Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/processed" },
  { key: "orders.shipped", label: "Shipped Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/shipped" },
  { key: "orders.out_for_delivery", label: "Out For Delivery", group: "orders", groupLabel: "Orders", path: "/admin/orders/out-for-delivery" },
  { key: "orders.delivered", label: "Delivered Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/delivered" },
  { key: "orders.cancelled", label: "Cancelled Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/cancelled" },
  { key: "orders.detail", label: "Order Detail", group: "orders", groupLabel: "Orders", path: "/admin/orders" },
  { key: "orders.settlement", label: "Settlement", group: "orders", groupLabel: "Orders", path: "/admin/settlement" },
  { key: "orders.returns", label: "Return Requests", group: "orders", groupLabel: "Orders", path: "/admin/return" },

  { key: "customers.list", label: "Manage Customers", group: "customers", groupLabel: "Customers", path: "/admin/customers" },
  { key: "customers.users", label: "Users", group: "customers", groupLabel: "Customers", path: "/admin/users" },

  { key: "finance.wallet", label: "Wallet & Earnings", group: "finance", groupLabel: "Finance", path: "/admin/wallet" },
  { key: "finance.withdrawals", label: "Withdrawals", group: "finance", groupLabel: "Finance", path: "/admin/withdrawals" },
  { key: "finance.payments", label: "Payments", group: "finance", groupLabel: "Finance", path: "/admin/payments" },
  { key: "finance.payment_list", label: "Payment List", group: "finance", groupLabel: "Finance", path: "/admin/payment-list" },

  { key: "marketing.coupon", label: "Coupon", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/coupon" },
  { key: "marketing.notification", label: "Notification", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/notification" },
  { key: "marketing.notification_templates", label: "Reminder Templates", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/notification-templates" },
  { key: "marketing.home_section", label: "Home Section", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/home-section" },
  { key: "marketing.bestseller_cards", label: "Bestseller Cards", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/bestseller-cards" },
  { key: "marketing.promo_strip", label: "Banners & Videos", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/promo-strip" },
  { key: "marketing.lowest_prices", label: "Lowest Prices", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/lowest-prices" },
  { key: "marketing.shop_by_store", label: "Shop by Store", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/shop-by-store" },
  { key: "marketing.reels", label: "Reels", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/reels" },

  { key: "content.faq", label: "FAQ", group: "content", groupLabel: "Content", path: "/admin/faq" },
  { key: "content.customer_app_policy", label: "Customer App Policy", group: "content", groupLabel: "Content", path: "/admin/customer-app-policy" },
  { key: "content.delivery_app_policy", label: "Delivery App Policy", group: "content", groupLabel: "Content", path: "/admin/delivery-app-policy" },

  { key: "settings.billing", label: "Billing & Charges", group: "settings", groupLabel: "Settings", path: "/admin/billing-settings" },
  { key: "settings.sms_gateway", label: "SMS Gateway", group: "settings", groupLabel: "Settings", path: "/admin/sms-gateway" },
  { key: "settings.system_user", label: "System User", group: "settings", groupLabel: "Settings", path: "/admin/system-user" },
  { key: "settings.roles", label: "Manage Roles", group: "settings", groupLabel: "Settings", path: "/admin/roles" },
  { key: "settings.audit_log", label: "Audit Log", group: "settings", groupLabel: "Settings", path: "/admin/audit-log" },
  { key: "settings.cities", label: "Towns", group: "settings", groupLabel: "Settings", path: "/admin/cities" },
];

export const PAGE_KEYS: readonly string[] = PAGES.map((p) => p.key);

export const perm = (key: string, tier: Tier): string => `${key}:${tier}`;

const PAGE_BY_KEY = new Map(PAGES.map((p) => [p.key, p]));

export const pageByKey = (key: string): PageDef | undefined => PAGE_BY_KEY.get(key);

/**
 * Does this permission list grant `pageKey:tier`?
 * The wildcard (Super Admin) grants everything.
 */
export function hasPermission(
  permissions: readonly string[] | Set<string> | null | undefined,
  pageKey: string,
  tier: Tier = "view",
): boolean {
  if (!permissions) return false;
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  if (set.has(WILDCARD)) return true;
  return set.has(perm(pageKey, tier));
}
