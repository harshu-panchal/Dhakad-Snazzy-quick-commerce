/**
 * Single source of truth for admin panel permissions.
 *
 * A permission is the string `<pageKey>:<tier>`, e.g. "orders.pending:view".
 * Tier is derived from the HTTP method by the requirePages middleware:
 *   GET / HEAD                     -> "view"
 *   POST / PUT / PATCH / DELETE    -> "manage"
 *
 * "manage" does NOT imply "view". The role editor UI ticks "view" whenever
 * "manage" is ticked and the API enforces the same on write, but the
 * permission check itself tests the exact tier so a hand-edited database
 * document cannot produce a role that writes a page it cannot read.
 *
 * Super Admin holds the single sentinel "*" and bypasses every check.
 */

export type Tier = "view" | "manage";

export interface PageDef {
  /** Stable permission key. Never change these once deployed. */
  key: string;
  /** Human label shown in the role editor. */
  label: string;
  /** Group key used to cluster rows in the role editor. */
  group: string;
  /** Group heading shown in the role editor. */
  groupLabel: string;
  /** Frontend route this page lives at. */
  path: string;
}

export const SUPER_ADMIN_ROLE = "Super Admin";
export const DEFAULT_ADMIN_ROLE = "Admin";
export const WILDCARD = "*";

export const TIERS: readonly Tier[] = ["view", "manage"] as const;

export const perm = (key: string, tier: Tier): string => `${key}:${tier}`;

/**
 * The 51 admin pages. Derived from the AdminSidebar menu tree plus the eight
 * routes reachable only by direct URL (noted below), plus the two new pages
 * this system introduces.
 */
export const PAGES: readonly PageDef[] = [
  // ---------------------------------------------------------------- dashboard
  { key: "dashboard", label: "Dashboard", group: "dashboard", groupLabel: "Dashboard", path: "/admin" },

  // ------------------------------------------------------------------ catalog
  { key: "catalog.category", label: "Category", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/category" },
  { key: "catalog.header_category", label: "Header Category", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/category/header" },
  // no sidebar entry
  { key: "catalog.subcategory", label: "Subcategory", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/subcategory" },
  // no sidebar entry
  { key: "catalog.subcategory_order", label: "Subcategory Order", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/subcategory-order" },
  { key: "catalog.brand", label: "Brand", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/brand" },
  { key: "catalog.product_list", label: "Product List", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/product/list" },
  { key: "catalog.taxes", label: "Taxes", group: "catalog", groupLabel: "Product & Catalog", path: "/admin/product/taxes" },

  // ------------------------------------------------------------------ sellers
  { key: "sellers.list", label: "Manage Seller List", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-seller/list" },
  { key: "sellers.transaction", label: "Seller Transaction", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-seller/transaction" },
  { key: "sellers.location", label: "Seller Location", group: "sellers", groupLabel: "Sellers", path: "/admin/manage-location/seller-location" },

  // ----------------------------------------------------------------- delivery
  { key: "delivery.manage", label: "Manage Delivery Boy", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/manage" },
  { key: "delivery.manual_assign", label: "Manual Assignment", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/manual-assign" },
  { key: "delivery.fund_transfer", label: "Fund Transfer", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/fund-transfer" },
  { key: "delivery.cash_collection", label: "Cash Collection", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-boy/cash-collection" },
  { key: "delivery.tracking", label: "Delivery Tracking", group: "delivery", groupLabel: "Delivery", path: "/admin/delivery-tracking" },

  // ------------------------------------------------------------------- orders
  { key: "orders.all", label: "All Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/all" },
  { key: "orders.pending", label: "Pending Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/pending" },
  { key: "orders.received", label: "Received Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/received" },
  { key: "orders.processed", label: "Processed Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/processed" },
  { key: "orders.shipped", label: "Shipped Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/shipped" },
  { key: "orders.out_for_delivery", label: "Out For Delivery", group: "orders", groupLabel: "Orders", path: "/admin/orders/out-for-delivery" },
  { key: "orders.delivered", label: "Delivered Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/delivered" },
  { key: "orders.cancelled", label: "Cancelled Orders", group: "orders", groupLabel: "Orders", path: "/admin/orders/cancelled" },
  // no sidebar entry (/admin/orders and /admin/orders/:id)
  { key: "orders.detail", label: "Order Detail", group: "orders", groupLabel: "Orders", path: "/admin/orders" },
  { key: "orders.settlement", label: "Settlement", group: "orders", groupLabel: "Orders", path: "/admin/settlement" },
  { key: "orders.returns", label: "Return Requests", group: "orders", groupLabel: "Orders", path: "/admin/return" },

  // ---------------------------------------------------------------- customers
  // no sidebar entry
  { key: "customers.list", label: "Manage Customers", group: "customers", groupLabel: "Customers", path: "/admin/customers" },
  { key: "customers.users", label: "Users", group: "customers", groupLabel: "Customers", path: "/admin/users" },

  // ------------------------------------------------------------------ finance
  { key: "finance.wallet", label: "Wallet & Earnings", group: "finance", groupLabel: "Finance", path: "/admin/wallet" },
  // no sidebar entry
  { key: "finance.withdrawals", label: "Withdrawals", group: "finance", groupLabel: "Finance", path: "/admin/withdrawals" },
  // no sidebar entry
  { key: "finance.payments", label: "Payments", group: "finance", groupLabel: "Finance", path: "/admin/payments" },
  { key: "finance.payment_list", label: "Payment List", group: "finance", groupLabel: "Finance", path: "/admin/payment-list" },

  // ---------------------------------------------------------------- marketing
  { key: "marketing.coupon", label: "Coupon", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/coupon" },
  { key: "marketing.notification", label: "Notification", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/notification" },
  { key: "marketing.notification_templates", label: "Reminder Templates", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/notification-templates" },
  { key: "marketing.home_section", label: "Home Section", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/home-section" },
  { key: "marketing.bestseller_cards", label: "Bestseller Cards", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/bestseller-cards" },
  { key: "marketing.promo_strip", label: "Banners & Videos", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/promo-strip" },
  { key: "marketing.lowest_prices", label: "Lowest Prices", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/lowest-prices" },
  { key: "marketing.shop_by_store", label: "Shop by Store", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/shop-by-store" },
  { key: "marketing.reels", label: "Reels", group: "marketing", groupLabel: "Promotion & Marketing", path: "/admin/reels" },

  // ------------------------------------------------------------------ content
  { key: "content.faq", label: "FAQ", group: "content", groupLabel: "Content", path: "/admin/faq" },
  { key: "content.customer_app_policy", label: "Customer App Policy", group: "content", groupLabel: "Content", path: "/admin/customer-app-policy" },
  { key: "content.delivery_app_policy", label: "Delivery App Policy", group: "content", groupLabel: "Content", path: "/admin/delivery-app-policy" },

  // ----------------------------------------------------------------- settings
  { key: "settings.billing", label: "Billing & Charges", group: "settings", groupLabel: "Settings", path: "/admin/billing-settings" },
  { key: "settings.sms_gateway", label: "SMS Gateway", group: "settings", groupLabel: "Settings", path: "/admin/sms-gateway" },
  { key: "settings.system_user", label: "System User", group: "settings", groupLabel: "Settings", path: "/admin/system-user" },
  { key: "settings.roles", label: "Manage Roles", group: "settings", groupLabel: "Settings", path: "/admin/roles" },
  { key: "settings.audit_log", label: "Audit Log", group: "settings", groupLabel: "Settings", path: "/admin/audit-log" },
  { key: "settings.cities", label: "Towns", group: "settings", groupLabel: "Settings", path: "/admin/cities" },
];

export const PAGE_KEYS: readonly string[] = PAGES.map((p) => p.key);

export const ALL_PERMISSIONS: readonly string[] = PAGES.flatMap((p) => [
  perm(p.key, "view"),
  perm(p.key, "manage"),
]);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export const isValidPermission = (value: string): boolean => PERMISSION_SET.has(value);

/** All page keys in a group, e.g. groupPages("orders"). */
export const groupPages = (group: string): string[] =>
  PAGES.filter((p) => p.group === group).map((p) => p.key);

/** Every order page key. The order endpoints are shared across all of them. */
export const ORDER_PAGES: readonly string[] = groupPages("orders");

/**
 * Permissions equivalent to near-total access, kept off the seeded "Admin"
 * system role. Role editing is a self-escalation path; system-user management
 * lets an account mint new admins.
 */
export const ELEVATED_PAGES: readonly string[] = [
  "settings.roles",
  "settings.system_user",
];

/**
 * Admin endpoints every authenticated admin may call regardless of role.
 *
 * SELF_SERVICE covers an admin acting on their own account.
 *
 * LOOKUP endpoints are read-only reference data that unrelated pages need to
 * populate dropdowns and pickers. Without this allowlist, granting
 * "marketing.home_section" would also force "catalog.category:view" on the
 * role, because the home-section editor fetches the category tree to build
 * its picker.
 *
 * Paths are relative to the /admin mount and matched against req.path.
 * Every LOOKUP entry MUST be a GET - asserted by test.
 */
export const SELF_SERVICE_ENDPOINTS: readonly string[] = [
  "/me",
  "/profile",
  "/profile/change-password",
];

export const LOOKUP_ENDPOINTS: readonly string[] = [
  "/categories",
  "/subcategories",
  "/brands",
  "/sellers",
  "/products",
  "/taxes",
  "/payment-methods",
  "/shipping/config",
  "/settings/features",
  "/cities",
  "/lowest-prices-sections/cities",
];

/** Grouped payload served by GET /admin/roles/permissions. */
export interface PermissionGroup {
  group: string;
  groupLabel: string;
  pages: Array<{
    key: string;
    label: string;
    path: string;
    view: string;
    manage: string;
  }>;
}

export function permissionCatalog(): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  const byKey = new Map<string, PermissionGroup>();

  for (const page of PAGES) {
    let group = byKey.get(page.group);
    if (!group) {
      group = { group: page.group, groupLabel: page.groupLabel, pages: [] };
      byKey.set(page.group, group);
      groups.push(group);
    }
    group.pages.push({
      key: page.key,
      label: page.label,
      path: page.path,
      view: perm(page.key, "view"),
      manage: perm(page.key, "manage"),
    });
  }

  return groups;
}

/**
 * Normalise a submitted permission list: drop unknown entries, drop the
 * wildcard, de-duplicate, and ensure every ":manage" carries its ":view".
 */
export function normalizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!isValidPermission(value)) continue;
    out.add(value);
    if (value.endsWith(":manage")) {
      out.add(`${value.slice(0, -":manage".length)}:view`);
    }
  }

  return [...out].sort();
}

/** The tier an HTTP method requires. */
export function tierForMethod(method: string): Tier {
  return method === "GET" || method === "HEAD" ? "view" : "manage";
}
