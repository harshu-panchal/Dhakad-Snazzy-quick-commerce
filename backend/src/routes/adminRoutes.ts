import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import {
  requirePages,
  requireTiered,
  requireSuperAdmin,
  allowSelfServiceAndLookups,
} from "../middleware/permissions";
import { auditAdminRequests } from "../middleware/auditLog";
import { ORDER_PAGES, groupPages } from "../config/permissions";

// Dashboard Controllers
import * as dashboardController from "../modules/admin/controllers/adminDashboardController";

// Product Controllers
import * as productController from "../modules/admin/controllers/adminProductController";

// Order Controllers
import * as orderController from "../modules/admin/controllers/adminOrderController";
import * as shippingController from "../modules/admin/controllers/adminShippingController";

// Customer Controllers
import * as customerController from "../modules/admin/controllers/adminCustomerController";

// Delivery Controllers
import * as deliveryController from "../modules/admin/controllers/adminDeliveryController";

// Settings Controllers
import * as settingsController from "../modules/admin/controllers/adminSettingsController";

// Coupon Controllers
import * as couponController from "../modules/admin/controllers/adminCouponController";

// Notification Controllers
import * as notificationController from "../modules/admin/controllers/adminNotificationController";
import * as notificationTemplateController from "../modules/admin/controllers/adminNotificationTemplateController";

// Wallet Controllers
import * as walletController from "../modules/admin/controllers/adminWalletController";
import * as withdrawalController from "../modules/admin/controllers/adminWithdrawalController";



// Tax Controllers
import * as taxController from "../modules/admin/controllers/adminTaxController";

// Cash Collection Controllers
import * as cashCollectionController from "../modules/admin/controllers/adminCashCollectionController";

// FAQ Controllers
import * as faqController from "../modules/admin/controllers/adminFAQController";

// Role Controllers
import * as roleController from "../modules/admin/controllers/adminRoleController";

// Audit Log Controllers
import * as auditLogController from "../modules/admin/controllers/adminAuditLogController";

// Town (city) Controllers
import * as cityController from "../modules/admin/controllers/adminCityController";

import * as paymentController from "../modules/admin/controllers/adminPaymentController";
import * as policyController from "../modules/admin/controllers/adminPolicyController";
import * as sellerController from "../modules/admin/controllers/adminSellerController";

// Profile Controllers
import * as profileController from "../modules/admin/controllers/adminProfileController";

// Shop Controllers (Shop by Store)
import {
  createShop,
  getAllShops,
  getShopById,
  updateShop,
  deleteShop,
} from "../modules/admin/controllers/adminShopController";

// System User Controllers
import * as systemUserController from "../modules/admin/controllers/adminSystemUserController";

// Home Section Controllers
import * as homeSectionController from "../modules/admin/controllers/adminHomeSectionController";

// Bestseller Card Controllers
import * as bestsellerCardController from "../modules/admin/controllers/adminBestsellerCardController";

// Lowest Prices Controllers
import * as lowestPricesController from "../modules/admin/controllers/adminLowestPricesController";

// PromoStrip Controllers
import * as promoStripController from "../modules/admin/controllers/adminPromoStripController";

// Reel Controllers
import * as reelController from "../modules/admin/controllers/adminReelController";

const router = Router();

// All routes require admin authentication. `authenticate` also resolves the
// account's current role and permissions into req.adminContext.
router.use(authenticate);
router.use(requireUserType("Admin"));

// Records every mutating request. Mounted before the permission guards so a
// denied attempt (403) is logged too, not just successful ones.
router.use(auditAdminRequests);

// ==================== Permission guards ====================
//
// Page-level enforcement. Express applies `router.use(path, mw)` to every
// method under that prefix, so one line guards a whole section below.
//
// The tier is derived from the HTTP method by requirePages:
//   GET/HEAD -> `<page>:view`,  POST/PUT/PATCH/DELETE -> `<page>:manage`
//
// Several endpoint groups are shared by multiple pages (the eight order
// status pages are one component against different filters, and the five
// delivery pages share the /delivery endpoints), hence the "any of these
// pages" lists.
//
// IMPORTANT: when adding an endpoint below, add or extend a guard here too.
// src/tests/rbac/routeCoverage.test.ts fails the build if a route ends up
// neither guarded nor explicitly allowlisted.

// Self-service (own profile) and the read-only lookup endpoints that unrelated
// pages need for dropdowns and pickers. Must come first.
router.use(allowSelfServiceAndLookups);

// More specific prefixes first — Express matches in registration order.
router.use("/settings/sms-gateway", requirePages(["settings.sms_gateway"]));
router.use("/settings/features", requirePages(["catalog.header_category"]));
router.use("/delivery/:id/collect-cash", requirePages(["delivery.cash_collection"]));

router.use("/dashboard", requirePages(["dashboard"]));

// Catalog
router.use("/categories", requirePages(["catalog.category", "catalog.header_category"]));
router.use("/subcategories", requirePages(["catalog.subcategory", "catalog.subcategory_order"]));
router.use("/brands", requirePages(["catalog.brand"]));
router.use("/products", requirePages(["catalog.product_list"]));
router.use("/taxes", requirePages(["catalog.taxes"]));

// Sellers — three pages read these; only Manage Seller List writes.
router.use(
  "/sellers",
  requireTiered({
    view: ["sellers.list", "sellers.transaction", "sellers.location"],
    manage: ["sellers.list"],
  }),
);

// Delivery — five pages share these endpoints
router.use("/delivery", requirePages(groupPages("delivery")));
router.use("/cash-collections", requirePages(["delivery.cash_collection"]));

// Orders — all order pages share these endpoints
router.use("/orders", requirePages(ORDER_PAGES));
router.use("/shipping", requirePages(ORDER_PAGES));
router.use("/settlement", requirePages(["orders.settlement"]));
router.use("/return-requests", requirePages(["orders.returns"]));
router.use("/returns", requirePages(["orders.returns"]));

// Customers
router.use("/customers", requirePages(["customers.list", "customers.users"]));

// Finance
router.use("/financial", requirePages(["finance.wallet"]));
// /wallet carries both the earnings views and the manual-transfer and
// withdrawal-processing writes, so reads are open to either page while writes
// require the page that owns them.
router.use(
  "/wallet",
  requireTiered({
    view: ["finance.wallet", "finance.withdrawals"],
    manage: ["finance.wallet", "finance.withdrawals"],
  }),
);
router.use("/withdrawals", requirePages(["finance.withdrawals"]));
router.use(
  "/payment-methods",
  requireTiered({
    view: ["finance.payment_list", "finance.payments", "settings.billing"],
    manage: ["finance.payment_list", "finance.payments"],
  }),
);

// Marketing
router.use("/coupons", requirePages(["marketing.coupon"]));
router.use("/notifications", requirePages(["marketing.notification"]));
router.use("/notification-templates", requirePages(["marketing.notification_templates"]));
router.use("/home-sections", requirePages(["marketing.home_section"]));
router.use("/bestseller-cards", requirePages(["marketing.bestseller_cards"]));
router.use("/promo-strips", requirePages(["marketing.promo_strip"]));
router.use("/lowest-prices-sections", requirePages(["marketing.lowest_prices"]));
router.use("/lowest-prices-products", requirePages(["marketing.lowest_prices"]));
router.use("/shop", requirePages(["marketing.shop_by_store"]));
router.use("/shops", requirePages(["marketing.shop_by_store"]));
router.use("/shop-by-stores", requirePages(["marketing.shop_by_store"]));
router.use("/reels", requirePages(["marketing.reels"]));

// Content
router.use("/faqs", requirePages(["content.faq"]));
router.use("/policies", requirePages(["content.customer_app_policy", "content.delivery_app_policy"]));

// Settings
router.use("/settings", requirePages(["settings.billing", "settings.sms_gateway"]));
router.use("/system-users", requirePages(["settings.system_user"]));
router.use("/roles", requirePages(["settings.roles"]));
router.use("/audit-logs", requirePages(["settings.audit_log"]));
// GET /cities is on the lookup allowlist (pickers need it); writes and the
// mapping report require the Towns page.
router.use("/cities", requirePages(["settings.cities"]));

// ==================== Profile Routes ====================
// Self-service: allowlisted above, so available to every admin regardless of
// role.
router.get("/me", profileController.getMe);
router.get("/profile", profileController.getProfile);
router.put("/profile", profileController.updateProfile);
router.post("/profile/change-password", profileController.changePassword);

// ==================== Reel Routes ====================
router.get("/reels/stats", reelController.reelStats);
router.get("/reels", reelController.listReels);
router.patch("/reels/:id/status", reelController.updateReelStatus);
router.delete("/reels/:id", reelController.deleteReel);

// ==================== Dashboard Routes ====================
router.get("/dashboard/stats", dashboardController.getDashboardStatsController);
router.get(
  "/dashboard/analytics",
  dashboardController.getSalesAnalyticsController
);
router.get(
  "/dashboard/top-sellers",
  dashboardController.getTopSellersController
);
router.get(
  "/dashboard/recent-orders",
  dashboardController.getRecentOrdersController
);
router.get(
  "/dashboard/sales-by-location",
  dashboardController.getSalesByLocationController
);
router.get(
  "/dashboard/today-sales",
  dashboardController.getTodaySalesController
);
router.get(
  "/dashboard/order-analytics",
  dashboardController.getOrderAnalyticsController
);

// ==================== Category Routes ====================
router.post("/categories", productController.createCategory);
router.get("/categories", productController.getCategories);
router.put("/categories/:id", productController.updateCategory);
router.delete("/categories/:id", productController.deleteCategory);
router.patch("/categories/:id/status", productController.toggleCategoryStatus);
router.post("/categories/bulk-delete", productController.bulkDeleteCategories);
router.put("/categories/reorder", productController.updateCategoryOrder);

// ==================== SubCategory Routes ====================
router.post("/subcategories", productController.createSubCategory);
router.get("/subcategories", productController.getSubCategories);
router.put("/subcategories/:id", productController.updateSubCategory);
router.delete("/subcategories/:id", productController.deleteSubCategory);

// ==================== Brand Routes ====================
router.post("/brands", productController.createBrand);
router.get("/brands", productController.getBrands);
router.put("/brands/:id", productController.updateBrand);
router.delete("/brands/:id", productController.deleteBrand);

// ==================== Product Routes ====================
// Admin cannot create products - only sellers can add products
// router.post("/products", productController.createProduct);
router.get("/products", productController.getProducts);
// Product order functionality removed
// router.put("/products/order", productController.updateProductOrder);
router.get("/products/:id", productController.getProductById);
router.put("/products/:id", productController.updateProduct);
router.delete("/products/:id", productController.deleteProduct);
// Product approval no longer needed - products show directly in list
// router.patch("/products/:id/approve", productController.approveProductRequest);
router.post("/products/bulk-import", productController.bulkImportProducts);
router.put("/products/bulk-update", productController.bulkUpdateProducts);

// ==================== Order Routes ====================
router.get("/orders", orderController.getAllOrders);
router.get("/orders/status/:status", orderController.getOrdersByStatus);
router.get("/settlement", orderController.getSettlementOrders);
router.get("/orders/:id", orderController.getOrderById);
router.get("/orders/:id/cod-breakdown", orderController.getOrderCODBreakdown);
router.get("/orders/:id/earning-breakdown", orderController.getOrderEarningBreakdown);
router.patch("/orders/:id/mark-cod-paid", orderController.markOrderCODPaid);
router.patch("/orders/:id/status", orderController.updateOrderStatus);
router.patch("/orders/:id/assign-delivery", orderController.assignDeliveryBoy);
router.post("/orders/:id/shipping/quotes", shippingController.getShippingQuotes);
router.post("/orders/:id/shipping/book", shippingController.bookShiprocket);
router.get("/orders/:id/shipment", shippingController.getOrderShipment);
router.post("/orders/:id/shipment/refresh", shippingController.refreshTracking);
router.post("/orders/:id/shipment/retry-pickup", shippingController.retryPickup);
router.post("/orders/:id/shipment/documents", shippingController.regenerateDocuments);
router.post("/orders/:id/shipment/cancel", shippingController.cancelShipment);
router.patch("/orders/:id/shipment/cod-remitted", shippingController.markCodRemitted);
router.get("/orders/export/csv", orderController.exportOrders);

router.get("/shipping/config", shippingController.getShippingConfiguration);
router.post("/shipping/sellers/migrate", shippingController.migrateSellerPickups);
router.post("/shipping/sellers/:sellerId/retry", shippingController.retrySellerPickup);

// ==================== Return Request Routes ====================
router.get("/return-requests", orderController.getReturnRequests);
router.get("/return-requests/:id", orderController.getReturnRequestById);
router.put("/return-requests/:id", orderController.processReturnRequest);
// Legacy route support if needed, but frontend uses /return-requests
router.patch("/returns/:id/process", orderController.processReturnRequest);

// ==================== Customer Routes ====================
router.get("/customers", customerController.getAllCustomers);
router.get("/customers/:id", customerController.getCustomerById);
router.patch("/customers/:id/status", customerController.updateCustomerStatus);
router.get("/customers/:id/orders", customerController.getCustomerOrders);

// ==================== Delivery Routes ====================
router.post("/delivery", deliveryController.createDeliveryBoy);
router.get("/delivery", deliveryController.getAllDeliveryBoys);
router.get("/delivery/:id", deliveryController.getDeliveryBoyById);
router.put("/delivery/:id", deliveryController.updateDeliveryBoy);
router.patch("/delivery/:id/status", deliveryController.updateDeliveryStatus);
router.patch(
  "/delivery/:id/availability",
  deliveryController.updateDeliveryBoyAvailability
);
router.delete("/delivery/:id", deliveryController.deleteDeliveryBoy);
router.get(
  "/delivery/:id/assignments",
  deliveryController.getDeliveryAssignments
);
router.post("/delivery/:id/collect-cash", deliveryController.collectCash);
router.get(
  "/delivery/:id/cash-collections",
  deliveryController.getDeliveryBoyCashCollections
);

// ==================== Payment Routes ====================
router.get("/payment-methods", paymentController.getPaymentMethods);
router.get("/payment-methods/:id", paymentController.getPaymentMethodById);
router.put("/payment-methods/:id", paymentController.updatePaymentMethod);
router.patch(
  "/payment-methods/:id/status",
  paymentController.updatePaymentMethodStatus
);

// ==================== Settings Routes ====================
router.get("/settings", settingsController.getAppSettings);
router.put("/settings", settingsController.updateAppSettings);
// Feature flags only, no credentials. Lets the Header Category page toggle its
// display switch without needing the Billing & Charges page.
router.get("/settings/features", settingsController.getFeatureSettings);
router.put("/settings/features", settingsController.updateFeatureSettings);
router.get("/settings/payment-methods", settingsController.getPaymentMethods);
router.put(
  "/settings/payment-methods",
  settingsController.updatePaymentMethods
);
router.get("/settings/sms-gateway", settingsController.getSMSGatewaySettings);
router.put(
  "/settings/sms-gateway",
  settingsController.updateSMSGatewaySettings
);

// ==================== Coupon Routes ====================
router.post("/coupons", couponController.createCoupon);
router.get("/coupons", couponController.getCoupons);
router.get("/coupons/:id", couponController.getCouponById);
router.put("/coupons/:id", couponController.updateCoupon);
router.delete("/coupons/:id", couponController.deleteCoupon);
router.post("/coupons/validate", couponController.validateCoupon);

// ==================== Notification Routes ====================
router.post("/notification-templates", notificationTemplateController.createTemplate);
router.get("/notification-templates", notificationTemplateController.getTemplates);
router.put("/notification-templates/:id", notificationTemplateController.updateTemplate);
router.patch("/notification-templates/:id/status", notificationTemplateController.updateTemplateStatus);
router.post("/notifications", notificationController.createNotification);
router.get("/notifications", notificationController.getNotifications);
router.get("/notifications/:id", notificationController.getNotificationById);
router.put("/notifications/:id", notificationController.updateNotification);
router.delete("/notifications/:id", notificationController.deleteNotification);
router.post("/notifications/:id/send", notificationController.sendNotification);
router.patch("/notifications/:id/read", notificationController.markAsRead);
router.patch(
  "/notifications/read-all",
  notificationController.markMultipleAsRead
);
router.patch(
  "/notifications/mark-read",
  notificationController.markMultipleAsRead
); // Legacy support

// ==================== Wallet & Withdrawal Routes ====================
router.get("/financial/dashboard", walletController.getFinancialDashboard);
router.get("/wallet/earnings", walletController.getAdminEarnings);
router.get("/wallet/transactions", walletController.getWalletTransactions);
router.get("/wallet/summary", walletController.getWalletSummary);
router.post("/wallet/transfer", walletController.createManualTransfer);
router.get("/wallet/withdrawals", withdrawalController.getAllWithdrawals);
router.post("/wallet/withdrawal/process", walletController.processWithdrawalWrapper);

// Direct withdrawal routes (if used elsewhere)
router.put("/withdrawals/:id/approve", withdrawalController.approveWithdrawal);
router.put("/withdrawals/:id/reject", withdrawalController.rejectWithdrawal);
router.put("/withdrawals/:id/complete", withdrawalController.completeWithdrawal);



// ==================== Tax Routes ====================
router.get("/taxes", taxController.getTaxes);
router.get("/taxes/:id", taxController.getTaxById);
router.post("/taxes", taxController.createTax);
router.put("/taxes/:id", taxController.updateTax);
router.patch("/taxes/:id/status", taxController.updateTaxStatus);
router.delete("/taxes/:id", taxController.deleteTax);

// ==================== Cash Collection Routes ====================
router.get("/cash-collections", cashCollectionController.getCashCollections);
router.get(
  "/cash-collections/:id",
  cashCollectionController.getCashCollectionById
);
router.post("/cash-collections", cashCollectionController.createCashCollection);
router.put(
  "/cash-collections/:id",
  cashCollectionController.updateCashCollection
);
router.patch(
  "/cash-collections/:id/confirm",
  cashCollectionController.confirmCashCollection
);
router.delete(
  "/cash-collections/:id",
  cashCollectionController.deleteCashCollection
);

// ==================== FAQ Routes ====================
router.get("/faqs", faqController.getFAQs);
router.get("/faqs/:id", faqController.getFAQById);
router.post("/faqs", faqController.createFAQ);
router.put("/faqs/:id", faqController.updateFAQ);
router.patch("/faqs/:id/status", faqController.updateFAQStatus);
router.delete("/faqs/:id", faqController.deleteFAQ);
router.put("/faqs/order", faqController.updateFAQOrder);

// ==================== Role Routes ====================
// "permissions" must be registered before "/:id" or it is read as an id.
router.get("/roles/permissions", roleController.getPermissions);
router.get("/roles", roleController.getRoles);
router.get("/roles/:id", roleController.getRoleById);
router.post("/roles", roleController.createRole);
router.put("/roles/:id", roleController.updateRole);
router.delete("/roles/:id", roleController.deleteRole);

// ==================== Audit Log Routes ====================
// Read-only by design: records are written by middleware/auditLog.ts and there
// is no endpoint that edits or deletes one.
router.get("/audit-logs/actors", auditLogController.getAuditLogActors);
router.get("/audit-logs", auditLogController.getAuditLogs);

// ==================== Town (City) Routes ====================
// "mapping-report" and "map-sellers" must be registered before "/:id".
router.get("/cities/mapping-report", cityController.getMappingReport);
router.post("/cities/map-sellers", cityController.applySellerMapping);
router.get("/cities", cityController.getCities);
router.post("/cities", cityController.createCity);
router.put("/cities/:id", cityController.updateCity);
router.delete("/cities/:id", cityController.deleteCity);

// ==================== Maintenance (Super Admin only) ====================
// Mounted here rather than in migrationRoutes so the Super Admin requirement
// sits next to the rest of the admin surface.
router.use("/maintenance", requireSuperAdmin());

// ==================== Policy Routes ====================
router.post("/policies", policyController.createPolicy);
router.get("/policies", policyController.getPolicies);
router.put("/policies/:id", policyController.updatePolicy);
router.delete("/policies/:id", policyController.deletePolicy);

// ==================== Seller Routes ====================
router.get("/sellers", sellerController.getAllSellers);

// ==================== Shop Management ====================
// Legacy routes (keep for backward compatibility)
router.post("/shop/create", createShop);
router.get("/shops", getAllShops);
router.get("/shop/:id", getShopById);
router.put("/shop/:id", updateShop);
router.delete("/shop/:id", deleteShop);

// Shop by Store routes (matching frontend API expectations)
router.post("/shop-by-stores", createShop);
router.get("/shop-by-stores", getAllShops);
router.get("/shop-by-stores/:id", getShopById);
router.put("/shop-by-stores/:id", updateShop);
router.delete("/shop-by-stores/:id", deleteShop);

// ==================== System User Routes ====================
router.get("/system-users", systemUserController.getAllSystemUsers);
router.get("/system-users/:id", systemUserController.getSystemUserById);
router.post("/system-users", systemUserController.createSystemUser);
router.put("/system-users/:id", systemUserController.updateSystemUser);
router.delete("/system-users/:id", systemUserController.deleteSystemUser);

// ==================== Home Section Routes ====================
router.get("/home-sections", homeSectionController.getHomeSections);
router.get("/home-sections/:id", homeSectionController.getHomeSectionById);
router.post("/home-sections", homeSectionController.createHomeSection);
router.put("/home-sections/:id", homeSectionController.updateHomeSection);
router.delete("/home-sections/:id", homeSectionController.deleteHomeSection);
router.put("/home-sections/reorder", homeSectionController.reorderHomeSections);

// ==================== Bestseller Card Routes ====================
router.get("/bestseller-cards", bestsellerCardController.getBestsellerCards);
router.get("/bestseller-cards/:id", bestsellerCardController.getBestsellerCardById);
router.post("/bestseller-cards", bestsellerCardController.createBestsellerCard);
router.put("/bestseller-cards/:id", bestsellerCardController.updateBestsellerCard);
router.delete("/bestseller-cards/:id", bestsellerCardController.deleteBestsellerCard);
router.put("/bestseller-cards/reorder", bestsellerCardController.reorderBestsellerCards);

// ==================== Lowest Prices Section Routes ====================
router.get("/lowest-prices-sections/cities", lowestPricesController.getServiceableCities);
router.get("/lowest-prices-sections", lowestPricesController.getLowestPricesSections);
router.get("/lowest-prices-sections/:id", lowestPricesController.getLowestPricesSectionById);
router.post("/lowest-prices-sections", lowestPricesController.createLowestPricesSection);
router.put("/lowest-prices-sections/:id", lowestPricesController.updateLowestPricesSection);
router.delete("/lowest-prices-sections/:id", lowestPricesController.deleteLowestPricesSection);
router.post("/lowest-prices-sections/:id/products", lowestPricesController.addProductToSection);
router.put("/lowest-prices-sections/:id/products/reorder", lowestPricesController.reorderSectionProducts);
router.put("/lowest-prices-sections/:id/products/:productId", lowestPricesController.updateSectionProduct);
router.delete("/lowest-prices-sections/:id/products/:productId", lowestPricesController.removeProductFromSection);

// ==================== Lowest Prices Product Routes (Legacy) ====================
router.get("/lowest-prices-products", lowestPricesController.getLowestPricesProducts);
router.get("/lowest-prices-products/:id", lowestPricesController.getLowestPricesProductById);
router.post("/lowest-prices-products", lowestPricesController.createLowestPricesProduct);
router.put("/lowest-prices-products/:id", lowestPricesController.updateLowestPricesProduct);
router.delete("/lowest-prices-products/:id", lowestPricesController.deleteLowestPricesProduct);
router.put("/lowest-prices-products/reorder", lowestPricesController.reorderLowestPricesProducts);

// ==================== PromoStrip Routes ====================
router.get("/promo-strips", promoStripController.getAllPromoStrips);
router.get("/promo-strips/:id", promoStripController.getPromoStripById);
router.post("/promo-strips", promoStripController.createPromoStrip);
router.put("/promo-strips/:id", promoStripController.updatePromoStrip);
router.delete("/promo-strips/:id", promoStripController.deletePromoStrip);

export default router;
