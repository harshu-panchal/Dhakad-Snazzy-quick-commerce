import { ReactNode } from "react";
import lazyWithRetry from "../../utils/lazyWithRetry";

/**
 * The admin route table.
 *
 * Replaces the long inline <Route> block that used to live in App.tsx. As a
 * data table it can be diffed against the permission catalog, which is what
 * src/tests/permissionCatalog.test.ts does — a page added here without a
 * permission, or with one that does not exist, fails the build.
 *
 * `permission` is a page key from modules/admin/permissions/catalog, or null
 * for a self-service page every admin may open.
 */

const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"), "AdminDashboard");
const AdminProfile = lazyWithRetry(() => import("./pages/AdminProfile"), "AdminProfile");
const AdminCategory = lazyWithRetry(() => import("./pages/AdminCategory"), "AdminCategory");
const AdminHeaderCategory = lazyWithRetry(() => import("./pages/AdminHeaderCategory"), "AdminHeaderCategory");
const AdminSubCategory = lazyWithRetry(() => import("./pages/AdminSubCategory"), "AdminSubCategory");
const AdminSubcategoryOrder = lazyWithRetry(() => import("./pages/AdminSubcategoryOrder"), "AdminSubcategoryOrder");
const AdminBrand = lazyWithRetry(() => import("./pages/AdminBrand"), "AdminBrand");
const AdminTaxes = lazyWithRetry(() => import("./pages/AdminTaxes"), "AdminTaxes");
const AdminStockManagement = lazyWithRetry(() => import("./pages/AdminStockManagement"), "AdminStockManagement");
const AdminManageSellerList = lazyWithRetry(() => import("./pages/AdminManageSellerList"), "AdminManageSellerList");
const AdminSellerTransaction = lazyWithRetry(() => import("./pages/AdminSellerTransaction"), "AdminSellerTransaction");
const AdminSellerLocation = lazyWithRetry(() => import("./pages/AdminSellerLocation"), "AdminSellerLocation");
const AdminManageDeliveryBoy = lazyWithRetry(() => import("./pages/AdminManageDeliveryBoy"), "AdminManageDeliveryBoy");
const AdminAssignDeliveryBoy = lazyWithRetry(() => import("./pages/AdminAssignDeliveryBoy"), "AdminAssignDeliveryBoy");
const AdminFundTransfer = lazyWithRetry(() => import("./pages/AdminFundTransfer"), "AdminFundTransfer");
const AdminCashCollection = lazyWithRetry(() => import("./pages/AdminCashCollection"), "AdminCashCollection");
const AdminDeliveryTracking = lazyWithRetry(() => import("./pages/AdminDeliveryTracking"), "AdminDeliveryTracking");
const AdminOrders = lazyWithRetry(() => import("./pages/AdminOrders"), "AdminOrders");
const AdminAllOrders = lazyWithRetry(() => import("./pages/AdminAllOrders"), "AdminAllOrders");
const AdminPendingOrders = lazyWithRetry(() => import("./pages/AdminPendingOrders"), "AdminPendingOrders");
const AdminReceivedOrders = lazyWithRetry(() => import("./pages/AdminReceivedOrders"), "AdminReceivedOrders");
const AdminProcessedOrders = lazyWithRetry(() => import("./pages/AdminProcessedOrders"), "AdminProcessedOrders");
const AdminShippedOrders = lazyWithRetry(() => import("./pages/AdminShippedOrders"), "AdminShippedOrders");
const AdminOutForDeliveryOrders = lazyWithRetry(() => import("./pages/AdminOutForDeliveryOrders"), "AdminOutForDeliveryOrders");
const AdminDeliveredOrders = lazyWithRetry(() => import("./pages/AdminDeliveredOrders"), "AdminDeliveredOrders");
const AdminCancelledOrders = lazyWithRetry(() => import("./pages/AdminCancelledOrders"), "AdminCancelledOrders");
const AdminOrderDetail = lazyWithRetry(() => import("./pages/AdminOrderDetail"), "AdminOrderDetail");
const AdminSettlement = lazyWithRetry(() => import("./pages/AdminSettlement"), "AdminSettlement");
const AdminReturnRequest = lazyWithRetry(() => import("./pages/AdminReturnRequest"), "AdminReturnRequest");
const AdminManageCustomer = lazyWithRetry(() => import("./pages/AdminManageCustomer"), "AdminManageCustomer");
const AdminUsers = lazyWithRetry(() => import("./pages/AdminUsers"), "AdminUsers");
const AdminWallet = lazyWithRetry(() => import("./pages/AdminWallet"), "AdminWallet");
const AdminWithdrawals = lazyWithRetry(() => import("./pages/AdminWithdrawals"), "AdminWithdrawals");
const AdminPayments = lazyWithRetry(() => import("./pages/AdminPayments"), "AdminPayments");
const AdminPaymentList = lazyWithRetry(() => import("./pages/AdminPaymentList"), "AdminPaymentList");
const AdminCoupon = lazyWithRetry(() => import("./pages/AdminCoupon"), "AdminCoupon");
const AdminNotification = lazyWithRetry(() => import("./pages/AdminNotification"), "AdminNotification");
const AdminNotificationTemplates = lazyWithRetry(() => import("./pages/AdminNotificationTemplates"), "AdminNotificationTemplates");
const AdminHomeSection = lazyWithRetry(() => import("./pages/AdminHomeSection"), "AdminHomeSection");
const AdminBestsellerCards = lazyWithRetry(() => import("./pages/AdminBestsellerCards"), "AdminBestsellerCards");
const AdminPromoStrip = lazyWithRetry(() => import("./pages/AdminPromoStrip"), "AdminPromoStrip");
const AdminLowestPrices = lazyWithRetry(() => import("./pages/AdminLowestPrices"), "AdminLowestPrices");
const AdminShopByStore = lazyWithRetry(() => import("./pages/AdminShopByStore"), "AdminShopByStore");
const AdminReels = lazyWithRetry(() => import("./pages/AdminReels"), "AdminReels");
const AdminFAQ = lazyWithRetry(() => import("./pages/AdminFAQ"), "AdminFAQ");
const AdminCustomerAppPolicy = lazyWithRetry(() => import("./pages/AdminCustomerAppPolicy"), "AdminCustomerAppPolicy");
const AdminDeliveryAppPolicy = lazyWithRetry(() => import("./pages/AdminDeliveryAppPolicy"), "AdminDeliveryAppPolicy");
const AdminBillingSettings = lazyWithRetry(() => import("./pages/AdminBillingSettings"), "AdminBillingSettings");
const AdminSmsGateway = lazyWithRetry(() => import("./pages/AdminSmsGateway"), "AdminSmsGateway");
const AdminSystemUser = lazyWithRetry(() => import("./pages/AdminSystemUser"), "AdminSystemUser");
const AdminRoles = lazyWithRetry(() => import("./pages/AdminRoles"), "AdminRoles");
const AdminAuditLog = lazyWithRetry(() => import("./pages/AdminAuditLog"), "AdminAuditLog");
const AdminCities = lazyWithRetry(() => import("./pages/AdminCities"), "AdminCities");

export interface AdminRouteDef {
  /** Path relative to the /admin/* mount. */
  path: string;
  element: ReactNode;
  /** Page key required to view, or null for self-service. */
  permission: string | null;
}

export const ADMIN_ROUTES: readonly AdminRouteDef[] = [
  { path: "", element: <AdminDashboard />, permission: "dashboard" },

  // Self-service: every admin can reach their own profile.
  { path: "profile", element: <AdminProfile />, permission: null },

  // Catalog
  { path: "category", element: <AdminCategory />, permission: "catalog.category" },
  { path: "category/header", element: <AdminHeaderCategory />, permission: "catalog.header_category" },
  { path: "subcategory", element: <AdminSubCategory />, permission: "catalog.subcategory" },
  { path: "subcategory-order", element: <AdminSubcategoryOrder />, permission: "catalog.subcategory_order" },
  { path: "brand", element: <AdminBrand />, permission: "catalog.brand" },
  { path: "product/list", element: <AdminStockManagement />, permission: "catalog.product_list" },
  { path: "product/taxes", element: <AdminTaxes />, permission: "catalog.taxes" },

  // Sellers
  { path: "manage-seller/list", element: <AdminManageSellerList />, permission: "sellers.list" },
  { path: "manage-seller/transaction", element: <AdminSellerTransaction />, permission: "sellers.transaction" },
  { path: "manage-location/seller-location", element: <AdminSellerLocation />, permission: "sellers.location" },

  // Delivery
  { path: "delivery-boy/manage", element: <AdminManageDeliveryBoy />, permission: "delivery.manage" },
  { path: "delivery-boy/manual-assign", element: <AdminAssignDeliveryBoy />, permission: "delivery.manual_assign" },
  { path: "delivery-boy/fund-transfer", element: <AdminFundTransfer />, permission: "delivery.fund_transfer" },
  { path: "delivery-boy/cash-collection", element: <AdminCashCollection />, permission: "delivery.cash_collection" },
  // Legacy alias for the same page.
  { path: "collect-cash", element: <AdminCashCollection />, permission: "delivery.cash_collection" },
  { path: "delivery-tracking", element: <AdminDeliveryTracking />, permission: "delivery.tracking" },

  // Orders — "orders" and "orders/:id" must come after the fixed order paths
  // or react-router matches ":id" against "all", "pending" and so on.
  { path: "orders/all", element: <AdminAllOrders />, permission: "orders.all" },
  { path: "orders/pending", element: <AdminPendingOrders />, permission: "orders.pending" },
  { path: "orders/received", element: <AdminReceivedOrders />, permission: "orders.received" },
  { path: "orders/processed", element: <AdminProcessedOrders />, permission: "orders.processed" },
  { path: "orders/shipped", element: <AdminShippedOrders />, permission: "orders.shipped" },
  { path: "orders/out-for-delivery", element: <AdminOutForDeliveryOrders />, permission: "orders.out_for_delivery" },
  { path: "orders/delivered", element: <AdminDeliveredOrders />, permission: "orders.delivered" },
  { path: "orders/cancelled", element: <AdminCancelledOrders />, permission: "orders.cancelled" },
  { path: "orders", element: <AdminOrders />, permission: "orders.detail" },
  { path: "orders/:id", element: <AdminOrderDetail />, permission: "orders.detail" },
  { path: "settlement", element: <AdminSettlement />, permission: "orders.settlement" },
  { path: "return", element: <AdminReturnRequest />, permission: "orders.returns" },

  // Customers
  { path: "customers", element: <AdminManageCustomer />, permission: "customers.list" },
  { path: "users", element: <AdminUsers />, permission: "customers.users" },

  // Finance
  { path: "wallet", element: <AdminWallet />, permission: "finance.wallet" },
  { path: "withdrawals", element: <AdminWithdrawals />, permission: "finance.withdrawals" },
  { path: "payments", element: <AdminPayments />, permission: "finance.payments" },
  { path: "payment-list", element: <AdminPaymentList />, permission: "finance.payment_list" },

  // Marketing
  { path: "coupon", element: <AdminCoupon />, permission: "marketing.coupon" },
  { path: "notification", element: <AdminNotification />, permission: "marketing.notification" },
  { path: "notification-templates", element: <AdminNotificationTemplates />, permission: "marketing.notification_templates" },
  { path: "home-section", element: <AdminHomeSection />, permission: "marketing.home_section" },
  { path: "bestseller-cards", element: <AdminBestsellerCards />, permission: "marketing.bestseller_cards" },
  { path: "promo-strip", element: <AdminPromoStrip />, permission: "marketing.promo_strip" },
  { path: "lowest-prices", element: <AdminLowestPrices />, permission: "marketing.lowest_prices" },
  { path: "shop-by-store", element: <AdminShopByStore />, permission: "marketing.shop_by_store" },
  { path: "reels", element: <AdminReels />, permission: "marketing.reels" },

  // Content
  { path: "faq", element: <AdminFAQ />, permission: "content.faq" },
  { path: "customer-app-policy", element: <AdminCustomerAppPolicy />, permission: "content.customer_app_policy" },
  { path: "delivery-app-policy", element: <AdminDeliveryAppPolicy />, permission: "content.delivery_app_policy" },

  // Settings
  { path: "billing-settings", element: <AdminBillingSettings />, permission: "settings.billing" },
  { path: "sms-gateway", element: <AdminSmsGateway />, permission: "settings.sms_gateway" },
  { path: "system-user", element: <AdminSystemUser />, permission: "settings.system_user" },
  { path: "roles", element: <AdminRoles />, permission: "settings.roles" },
  { path: "audit-log", element: <AdminAuditLog />, permission: "settings.audit_log" },
  { path: "cities", element: <AdminCities />, permission: "settings.cities" },
];

export default ADMIN_ROUTES;
