# Admin Panel — Role Based Access Management System

End-to-end implementation plan.

- **Repo:** `Dhakad Snazzy` (backend: Express + TypeScript + Mongoose · frontend: React 18 + Vite + react-router v6)
- **Branch at time of writing:** `deploy/admin-production-otp`
- **Status: IMPLEMENTED.** Phases 0–6 are built. Both projects typecheck, the
  frontend builds, and 87 tests pass (`npm run test:rbac` in `backend/`),
  including HTTP enforcement tests against a real server and database.

> **Deviations from this plan, and resolved open questions, are recorded in
> §13 at the end.** Read that before using §1–§12 as a description of the
> code: a few things were built differently once the codebase disagreed with
> the plan.
>
> **Remaining work: §7.12 only** — disabling action buttons on the ~50 existing
> admin pages for `view`-only roles. The backend already refuses those writes,
> so a read-only role is safe today; it just sees buttons that return 403.

---

## 1. Decisions (confirmed, not assumed)

| # | Decision | Chosen |
|---|---|---|
| 1 | Permission granularity | **Page level, two tiers per page**: `view` (page opens, GETs allowed) and `manage` (writes allowed). ~50 pages → 100 permission strings. |
| 2 | Login method | **Email + password for every role.** Super Admin is **mobile-OTP only** and cannot use the password form; the OTP endpoints reject every non-Super-Admin account. |
| 3 | Role → account binding | `Admin.role` **stays a name string** matching `Role.name`. No ObjectId ref, no migration of existing values. |
| 4 | Role rename / delete | **Cascade rename** across all holders in one transaction; **delete refused** while any admin holds the role. |
| 5 | Audit log | **Auto-capture every mutating admin request** via one middleware (no per-route wiring, no before/after diffs). |
| 6 | Password reset | **Nodemailer + SMTP**, driven by env vars. Provider-agnostic. |
| 7 | Session control | **Refresh token in an httpOnly cookie** (`Secure; HttpOnly; SameSite=None`), short-lived access token. |
| 8 | Login hardening | **Password policy** (min 8, upper + lower + digit) and **real rate limiting**. *Not* included: account lockout, forced password change on first login. |
| 9 | Open migration routes | **Locked behind Super Admin.** |

### Consequences worth stating up front

- **No account lockout** (decision 8). Rate limiting caps attempts per IP, but a distributed attacker gets unlimited tries per account. If that is not acceptable, lockout is a ~20-line addition to the login controller and `Admin` model; say so and it goes into Phase 3.
- **No forced password change** (decision 8). Super Admin creates an account, sets its password, and communicates it out of band. The admin can change it from their profile but is never compelled to. Whoever set the password knows it permanently.
- **Super Admin cannot use password login** (decision 2). Super Admin access depends entirely on the SMS gateway working. See §9.3 for the break-glass procedure this makes necessary.
- **Page-level, not action-level** (decision 1). Within one page, `manage` is all-or-nothing. A role with `finance.wallet:manage` can run a manual wallet transfer *and* approve a withdrawal, because both live on pages in the finance group. §3.4 lists the specific places where this concentrates risk.

---

## 2. What exists today

A half-built skeleton, not greenfield. Taking inventory first because several pieces are already written and merely disconnected.

### Already written, currently dead

| File | State |
|---|---|
| [`backend/src/models/Role.ts`](backend/src/models/Role.ts) | `{name, type: "System"\|"Custom", permissions: string[], description}`. Exported from `models/index.ts`, **never queried anywhere**. |
| [`backend/src/modules/admin/controllers/adminRoleController.ts`](backend/src/modules/admin/controllers/adminRoleController.ts) | Full CRUD + paginated list + a hardcoded 18-permission list. Complete and unused. |
| [`backend/src/routes/adminRoutes.ts:316-322`](backend/src/routes/adminRoutes.ts#L316-L322) | The role routes, **commented out**. |
| [`frontend/src/services/api/admin/adminRoleService.ts`](frontend/src/services/api/admin/adminRoleService.ts) | Typed client for all six role endpoints. Exported from `admin/index.ts`. **No page imports it.** |
| [`backend/src/models/Admin.ts:99`](backend/src/models/Admin.ts#L99) | `comparePassword()` with bcrypt. **Nothing calls it** — no password login exists anywhere in the app. |

So roughly 40% of the data layer and API client already exist. The work is finishing and connecting them, plus auth and enforcement.

### Current enforcement

```
backend/src/routes/adminRoutes.ts:85-86
  router.use(authenticate);
  router.use(requireUserType("Admin"));
  ... 184 endpoints follow, all equally reachable
```

One gate for 184 endpoints. `Admin.role` is a hardcoded enum `'Super Admin' | 'Admin'` and is read only for display — [`middleware/auth.ts`](backend/src/middleware/auth.ts)'s `authorize(...roles)` helper exists but is never applied to an admin route.

### Admin surfaces outside `adminRoutes.ts`

Enforcement has to cover these too or the panel has side doors:

| Mount | File | Current guard |
|---|---|---|
| `/admin/*` | `adminRoutes.ts` | `authenticate` + `requireUserType("Admin")` |
| `/admin/withdrawals` | `adminWithdrawalRoutes.ts` | `authenticate` + `requireUserType("Admin")` |
| `/sellers` | `sellerRoutes.ts` | `authenticate` + `requireUserType("Admin")` |
| `/upload` | `uploadRoutes.ts` | `requireUserType("Admin","Seller")`, per-route, some routes intentionally open for registration |
| `/seller/taxes` | `taxRoutes.ts` | `authenticate` only — **any logged-in user type can write taxes** |
| `/admin` (migrations) | `migrationRoutes.ts` | **none** |

### Frontend

- [`AuthContext.tsx`](frontend/src/context/AuthContext.tsx) — `authToken` + `userData` in localStorage; `inferLegacyUserType()` maps `role: "Admin"\|"Super Admin"` → `userType: "Admin"`.
- [`ProtectedRoute.tsx`](frontend/src/components/ProtectedRoute.tsx) — checks `userType`. Has a `requiredRole` prop doing single-string exact match; unused by admin routes.
- [`App.tsx:696-914`](frontend/src/App.tsx#L696-L914) — one `ProtectedRoute requiredUserType="Admin"` wrapping `AdminLayout` and ~55 nested `<Route>` elements as inline JSX.
- [`AdminSidebar.tsx`](frontend/src/modules/admin/components/AdminSidebar.tsx) — 45 KB. A hardcoded `menuSections` array: 8 sections, 47 navigable paths, inline SVG per item. No permission filtering.
- [`config.ts:56`](frontend/src/services/api/config.ts#L56) — the axios interceptor already deliberately does **not** log out on 403, only on 401. This is exactly right for RBAC and needs no change.

### Gaps that make this plan bigger than it looks

1. **No email service.** Only SMS. Phase 3 adds nodemailer from scratch.
2. **Rate limiters are no-op stubs.** [`rateLimiter.ts`](backend/src/middleware/rateLimiter.ts) exports pass-through functions with the real limiters commented out — in all environments, production included.
3. **No audit infrastructure.** No model, no middleware, nothing.
4. **No test framework.** `node:test` run through `tsx` for two files. Phase 7 builds on that rather than introducing Jest.
5. **8 admin routes have no sidebar entry** and are reachable only by typing the URL: `profile`, `subcategory`, `subcategory-order`, `customers`, `collect-cash`, `withdrawals`, `payments`, `orders/:id`. They still need permissions, or they become the bypass.

---

## 3. Permission model

### 3.1 Shape

A permission is a string, `<pageKey>:<tier>`:

```
orders.pending:view
orders.pending:manage
settings.system_user:manage
```

`Role.permissions` is already `string[]`, so **no schema change to `Role` is needed** for this. Super Admin holds the single sentinel `"*"`.

Tier is derived from the HTTP method, not declared per route:

| Method | Tier required |
|---|---|
| `GET`, `HEAD` | `view` |
| `POST`, `PUT`, `PATCH`, `DELETE` | `manage` |

`manage` does **not** imply `view`. The role editor UI enforces that ticking `manage` ticks `view` (§6.6), and the seed script guarantees it, but the backend checks the exact tier so a hand-edited DB document cannot produce a role that can write a page it cannot read.

### 3.2 The catalog — 50 pages

Derived from the 47 sidebar paths plus the 8 orphan routes, minus parent stubs (`/admin/product`, `/admin/manage-seller`, `/admin/manage-location`, `/admin/delivery-boy`, `/admin/orders` — these only expand submenus), plus 2 new pages.

**`dashboard`** (1)

| Key | Route | Component |
|---|---|---|
| `dashboard` | `/admin` | `AdminDashboard` |

**`catalog`** — Product Section (7)

| Key | Route | Component |
|---|---|---|
| `catalog.category` | `/admin/category` | `AdminCategory` |
| `catalog.header_category` | `/admin/category/header` | `AdminHeaderCategory` |
| `catalog.subcategory` | `/admin/subcategory` | `AdminSubCategory` *(orphan)* |
| `catalog.subcategory_order` | `/admin/subcategory-order` | `AdminSubcategoryOrder` *(orphan)* |
| `catalog.brand` | `/admin/brand` | `AdminBrand` |
| `catalog.product_list` | `/admin/product/list` | `AdminStockManagement` |
| `catalog.taxes` | `/admin/product/taxes` | `AdminTaxes` |

**`sellers`** (3)

| Key | Route | Component |
|---|---|---|
| `sellers.list` | `/admin/manage-seller/list` | `AdminManageSellerList` |
| `sellers.transaction` | `/admin/manage-seller/transaction` | `AdminSellerTransaction` |
| `sellers.location` | `/admin/manage-location/seller-location` | `AdminSellerLocation` |

**`delivery`** (5)

| Key | Route | Component |
|---|---|---|
| `delivery.manage` | `/admin/delivery-boy/manage` | `AdminManageDeliveryBoy` |
| `delivery.manual_assign` | `/admin/delivery-boy/manual-assign` | `AdminAssignDeliveryBoy` |
| `delivery.fund_transfer` | `/admin/delivery-boy/fund-transfer` | `AdminFundTransfer` |
| `delivery.cash_collection` | `/admin/delivery-boy/cash-collection` **and** `/admin/collect-cash` | `AdminCashCollection` (same component, two routes) |
| `delivery.tracking` | `/admin/delivery-tracking` | `AdminDeliveryTracking` |

**`orders`** (11)

| Key | Route |
|---|---|
| `orders.all` | `/admin/orders/all` |
| `orders.pending` | `/admin/orders/pending` |
| `orders.received` | `/admin/orders/received` |
| `orders.processed` | `/admin/orders/processed` |
| `orders.shipped` | `/admin/orders/shipped` |
| `orders.out_for_delivery` | `/admin/orders/out-for-delivery` |
| `orders.delivered` | `/admin/orders/delivered` |
| `orders.cancelled` | `/admin/orders/cancelled` |
| `orders.detail` | `/admin/orders` and `/admin/orders/:id` |
| `orders.settlement` | `/admin/settlement` |
| `orders.returns` | `/admin/return` |

**`customers`** (2)

| Key | Route | Component | Note |
|---|---|---|---|
| `customers.list` | `/admin/customers` | `AdminManageCustomer` | *orphan* |
| `customers.users` | `/admin/users` | `AdminUsers` | Sidebar labels this "Users" but it lists **customers**. Two overlapping customer pages — worth consolidating later, out of scope here. |

**`finance`** (4)

| Key | Route | Component |
|---|---|---|
| `finance.wallet` | `/admin/wallet` | `AdminWallet` |
| `finance.withdrawals` | `/admin/withdrawals` | `AdminWithdrawals` *(orphan)* |
| `finance.payments` | `/admin/payments` | `AdminPayments` *(orphan)* |
| `finance.payment_list` | `/admin/payment-list` | `AdminPaymentList` |

**`marketing`** (9)

| Key | Route | Component |
|---|---|---|
| `marketing.coupon` | `/admin/coupon` | `AdminCoupon` |
| `marketing.notification` | `/admin/notification` | `AdminNotification` |
| `marketing.notification_templates` | `/admin/notification-templates` | `AdminNotificationTemplates` |
| `marketing.home_section` | `/admin/home-section` | `AdminHomeSection` |
| `marketing.bestseller_cards` | `/admin/bestseller-cards` | `AdminBestsellerCards` |
| `marketing.promo_strip` | `/admin/promo-strip` | `AdminPromoStrip` |
| `marketing.lowest_prices` | `/admin/lowest-prices` | `AdminLowestPrices` |
| `marketing.shop_by_store` | `/admin/shop-by-store` | `AdminShopByStore` |
| `marketing.reels` | `/admin/reels` | `AdminReels` |

**`content`** (3)

| Key | Route | Component |
|---|---|---|
| `content.faq` | `/admin/faq` | `AdminFAQ` |
| `content.customer_app_policy` | `/admin/customer-app-policy` | `AdminCustomerAppPolicy` |
| `content.delivery_app_policy` | `/admin/delivery-app-policy` | `AdminDeliveryAppPolicy` |

**`settings`** (5)

| Key | Route | Component |
|---|---|---|
| `settings.billing` | `/admin/billing-settings` | `AdminBillingSettings` |
| `settings.sms_gateway` | `/admin/sms-gateway` | `AdminSmsGateway` |
| `settings.system_user` | `/admin/system-user` | `AdminSystemUser` |
| `settings.roles` | `/admin/roles` | **new** `AdminRoles` |
| `settings.audit_log` | `/admin/audit-log` | **new** `AdminAuditLog` |

**Total: 50 pages → 100 permission strings.**

### 3.3 Unrestricted endpoints

Two sets bypass permission checks (still requiring `authenticate` + `requireUserType("Admin")`):

**Self-service** — any admin, always:
- `GET /admin/profile`, `PUT /admin/profile`
- `POST /admin/profile/change-password`
- `GET /admin/me` (returns own identity + resolved permissions)
- all `/auth/admin/*` session endpoints

**Lookups** — read-only reference data that many unrelated pages need for dropdowns and pickers. Without this allowlist, giving someone `marketing.home_section` would also force `catalog.category:view` on them, because the home-section editor fetches the category tree to build its picker.

```
GET /admin/categories
GET /admin/subcategories
GET /admin/brands
GET /admin/sellers
GET /admin/products          (picker lists)
GET /admin/products/:id
GET /admin/shipping/config
GET /admin/settings          ← see warning below
GET /admin/lowest-prices-sections/cities
GET /admin/taxes
GET /admin/payment-methods
```

> **Must verify before shipping:** `GET /admin/settings` returns the whole `AppSettings` document. Check [`adminSettingsController.getAppSettings`](backend/src/modules/admin/controllers/adminSettingsController.ts) — if it includes SMS gateway credentials, payment gateway keys, or any secret, it must **not** go in the lookup allowlist. Either add a redacting projection, or split a `GET /admin/settings/public` for the non-sensitive subset and gate the full document behind `settings.billing:view`. Do not assume it is safe. Note that `/admin/settings/sms-gateway` is a separate endpoint and stays gated regardless.

The lookup list lives in `config/permissions.ts` as an explicit array. A test asserts every entry is a GET (§7).

### 3.4 Where page-level granularity concentrates risk

A consequence of decision 1, recorded so it is a known trade-off rather than a surprise:

| Page permission | Also grants |
|---|---|
| `finance.wallet:manage` | Manual wallet transfers (`POST /wallet/transfer`) **and** withdrawal processing (`POST /wallet/withdrawal/process`) |
| `finance.withdrawals:manage` | Approve, reject, and complete withdrawals — no separation between them |
| `orders.*:manage` | Status changes, cancellation, COD-paid marking, shipment cancellation, delivery reassignment |
| `sellers.list:manage` | Edit seller, change commission rates, **and delete seller** |
| `settings.system_user:manage` | Create, edit, and delete admin accounts — including setting their role |
| `settings.roles:manage` | Edit any role's permissions — effectively self-escalation to anything short of Super Admin |

The last two are the real ones: `settings.system_user:manage` and `settings.roles:manage` are each equivalent to near-total access. **Recommendation: grant both only to Super Admin.** The seed script (§4.3) leaves them out of every non-Super-Admin preset for this reason, and §5.5 adds a hard backend guard so that no custom role can grant itself Super Admin.

If any row above needs splitting into its own permission later, the model extends naturally — add a key and a `requirePages` call with an explicit `tier` override. Nothing in the design forecloses it.

---

## 4. Backend — data layer

### 4.1 `backend/src/config/permissions.ts` *(new)*

Single source of truth.

```ts
export type Tier = "view" | "manage";

export interface PageDef {
  key: string;        // "orders.pending"
  label: string;      // "Pending Order"
  group: string;      // "orders"
  groupLabel: string; // "Order Section"
  path: string;       // "/admin/orders/pending"
}

export const SUPER_ADMIN_ROLE = "Super Admin";
export const WILDCARD = "*";

export const PAGES: readonly PageDef[] = [ /* 50 entries from §3.2 */ ];

export const perm = (key: string, tier: Tier) => `${key}:${tier}` as const;

export const ALL_PERMISSIONS: readonly string[] =
  PAGES.flatMap(p => [perm(p.key, "view"), perm(p.key, "manage")]);

export const LOOKUP_ENDPOINTS: readonly string[] = [ /* §3.3 */ ];

/** Grouped payload for GET /admin/roles/permissions */
export function permissionCatalog() { /* group → pages → tiers */ }
```

### 4.2 `Role.ts` — changes

Keep `name`, `type`, `permissions: string[]`, `description`. Add:

```ts
isActive: boolean;              // default true; inactive role = zero permissions
permissionsUpdatedAt: Date;     // bumped on every permission change, drives cache invalidation
```

Also:
- Validator rejecting any permission string not in `ALL_PERMISSIONS` (and `"*"` only for the Super Admin system role).
- Index on `name` already implied by `unique: true` — confirm it exists in the deployed DB, since `unique` only creates the index when Mongoose can build it.
- Keep the existing `type: "System" | "Custom"` guard in the controller: System roles are not editable or deletable through the API.

### 4.3 Seed — `backend/src/scripts/seedRbac.ts` *(new)*

Idempotent, safe to re-run, called from `server.ts` startup next to the existing `ensureDefaultAdmin()` and `seedHeaderCategories()`.

1. Upsert **`Super Admin`** — `type: "System"`, `permissions: ["*"]`.
2. Upsert **`Admin`** — `type: "System"`, `permissions: ALL_PERMISSIONS` **minus** `settings.roles:*` and `settings.system_user:*`.

   Rationale: existing accounts carry `role: "Admin"` and must not lose access the moment this ships, but they should not silently gain role-management either. If a current `Admin` user genuinely needs those two pages, Super Admin grants them a custom role.
3. Optionally seed **Custom** presets as starting points (freely editable/deletable): `Order Manager`, `Catalog Manager`, `Finance Manager`, `Content Manager`, `Support (read-only)`. The last is the case that only works because of the View/Manage split — every page it can reach is `view` with no `manage`.
4. Reconcile: for every distinct `Admin.role` value in the DB with no matching `Role` document, create a `Custom` role with empty permissions and log a warning. Prevents lockout from legacy data.

Because `Admin.role` stays a string and existing values are exactly `"Super Admin"` / `"Admin"`, **no data migration of admin documents is required.** This is the main saving from decision 3.

### 4.4 `Admin.ts` — changes

```ts
role: string;                     // was: enum ['Super Admin','Admin'] → now free string
isActive: boolean;                // default true; false = cannot log in, sessions revoked
passwordChangedAt?: Date;
tokenVersion: number;             // default 0; bump to invalidate every session
resetPasswordTokenHash?: string;  // sha256 of the emailed token, select: false
resetPasswordExpiresAt?: Date;
lastLoginAt?: Date;
```

Password field:
- `minlength` 6 → **8**
- validator: at least one uppercase, one lowercase, one digit
- keep `select: false` and the existing `pre('save')` bcrypt hook
- set `passwordChangedAt` in that hook

> The policy applies on write only, so existing stored hashes are unaffected. But the seeded default `Admin@123` and anything weaker will be **rejected on the next password change**, and `ensureDefaultAdmin()` itself will start failing validation if `DEFAULT_ADMIN_PASSWORD` does not satisfy the policy. Update that env var and the fallback in [`ensureDefaultAdmin.ts`](backend/src/utils/ensureDefaultAdmin.ts) in the same change.

Dropping the `role` enum means Mongoose stops validating it. Replace with a `pre('save')` check that the value matches an existing `Role.name`, so a typo cannot silently create an admin with zero permissions.

### 4.5 `AdminSession.ts` *(new)*

Refresh tokens. A separate collection rather than an array on `Admin`, so sessions are individually listable and revocable, and so TTL cleanup is the database's job.

```ts
adminId: ObjectId;        // indexed
tokenHash: string;        // sha256 of the refresh token — never the token itself
userAgent?: string;
ip?: string;
expiresAt: Date;          // TTL index, expireAfterSeconds: 0
revokedAt?: Date;
createdAt: Date;
lastUsedAt: Date;
```

### 4.6 `AuditLog.ts` *(new)*

```ts
adminId: ObjectId;        // indexed
adminEmail: string;       // denormalised — survives account deletion
adminRole: string;        // role at time of action
method: string;
path: string;             // "/admin/orders/68f2.../status"
routePattern?: string;    // "/orders/:id/status" — groups identical actions
pageKey?: string;         // permission that authorised it
resourceId?: string;      // extracted from req.params.id when present
statusCode: number;
requestBody?: unknown;    // redacted, size-capped
ip?: string;
userAgent?: string;
createdAt: Date;          // indexed
```

Indexes: `{createdAt: -1}`, `{adminId: 1, createdAt: -1}`, `{routePattern: 1, createdAt: -1}`.

Retention is a decision left open — see §10.

---

## 5. Backend — enforcement

### 5.1 Permission resolution

Permissions cannot live in the JWT: decision 7 requires a role edit to take effect immediately, and a 7-day JWT would carry stale permissions until expiry.

So `authenticate` resolves them per request. Extend [`middleware/auth.ts`](backend/src/middleware/auth.ts):

```ts
// after verifyToken succeeds, when decoded.userType === "Admin":
const ctx = await resolveAdminContext(decoded.userId);   // { admin, role, permissions:Set<string>, isSuperAdmin }
if (!ctx || !ctx.admin.isActive) return 401;
if (decoded.tokenVersion !== ctx.admin.tokenVersion) return 401;  // forced logout
req.adminContext = ctx;
```

Naive, that is 2 DB reads per request. `services/adminPermissionService.ts` *(new)* caches:

- **Role cache** — `Map<roleName, {permissions: Set<string>, permissionsUpdatedAt}>`, 30 s TTL, invalidated synchronously whenever a role is written. Small and bounded (a handful of roles), so a plain `Map` is enough; no Redis.
- **Admin doc** — read every request. It is a single indexed `findById` with a lean projection (`role isActive tokenVersion email`), and it is what makes deactivation and forced logout instant. Do not cache it.

Net cost: one lean `findById` per admin request. Acceptable; the admin panel is low-traffic relative to the storefront.

Declare the type extension alongside the existing `Express.Request` augmentation already in `middleware/auth.ts`.

### 5.2 `middleware/permissions.ts` *(new)*

```ts
export const requirePages = (
  pageKeys: string[],
  opts?: { tier?: Tier }
) => (req, res, next) => { ... };
```

Logic:
1. No `req.adminContext` → `401`.
2. `isSuperAdmin` → `next()`.
3. `tier = opts?.tier ?? (["GET","HEAD"].includes(req.method) ? "view" : "manage")`.
4. Allow if **any** `pageKeys[i]:tier` is in the permission set.
5. Otherwise `403`:

```json
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "You do not have permission to perform this action.",
  "requiredAny": ["orders.pending:manage", "orders.all:manage"]
}
```

`anyOf` semantics matter: `PATCH /admin/orders/:id/status` is called from eight different order pages, and a user with only `orders.pending:manage` must be able to use it.

Also `requireSuperAdmin()` for migrations and the role-escalation guard.

### 5.3 Wiring into `adminRoutes.ts`

**Approach: path-prefix guards, no restructuring.** `adminRoutes.ts` is already sectioned by `// ==== X Routes ====` comments. Insert ~30 `router.use(prefix, requirePages([...]))` lines, each before its section. Express applies `router.use(path, mw)` to every method under that prefix, so one line covers a whole section.

Chosen over the alternatives because it is ~30 edits instead of 184, touches no handler, and leaves the file's existing shape and ordering intact — which matters in a file where [route order is already load-bearing](backend/src/routes/index.ts) and a production deploy is in flight on this branch.

```ts
router.use(authenticate);
router.use(requireUserType("Admin"));

// self-service and lookups first — these bypass permission checks
router.use(allowSelfServiceAndLookups);

router.use("/dashboard",           requirePages(["dashboard"]));
router.use("/categories",          requirePages(["catalog.category", "catalog.header_category"]));
router.use("/subcategories",       requirePages(["catalog.subcategory", "catalog.subcategory_order"]));
router.use("/brands",              requirePages(["catalog.brand"]));
router.use("/products",            requirePages(["catalog.product_list"]));
router.use("/taxes",               requirePages(["catalog.taxes"]));
router.use("/sellers",             requirePages(["sellers.list"]));
router.use("/delivery",            requirePages(["delivery.manage", "delivery.manual_assign",
                                                 "delivery.fund_transfer", "delivery.cash_collection",
                                                 "delivery.tracking"]));
router.use("/cash-collections",    requirePages(["delivery.cash_collection"]));
router.use("/orders",              requirePages(ORDER_PAGES));     // all 9 order page keys
router.use("/settlement",          requirePages(["orders.settlement"]));
router.use("/return-requests",     requirePages(["orders.returns"]));
router.use("/returns",             requirePages(["orders.returns"]));
router.use("/shipping",            requirePages(ORDER_PAGES));
router.use("/customers",           requirePages(["customers.list", "customers.users"]));
router.use("/financial",           requirePages(["finance.wallet"]));
router.use("/wallet",              requirePages(["finance.wallet", "finance.withdrawals"]));
router.use("/withdrawals",         requirePages(["finance.withdrawals"]));
router.use("/payment-methods",     requirePages(["finance.payment_list", "finance.payments"]));
router.use("/coupons",             requirePages(["marketing.coupon"]));
router.use("/notifications",       requirePages(["marketing.notification"]));
router.use("/notification-templates", requirePages(["marketing.notification_templates"]));
router.use("/home-sections",       requirePages(["marketing.home_section"]));
router.use("/bestseller-cards",    requirePages(["marketing.bestseller_cards"]));
router.use("/promo-strips",        requirePages(["marketing.promo_strip"]));
router.use("/lowest-prices-sections", requirePages(["marketing.lowest_prices"]));
router.use("/lowest-prices-products", requirePages(["marketing.lowest_prices"]));
router.use("/shop",               requirePages(["marketing.shop_by_store"]));
router.use("/shops",              requirePages(["marketing.shop_by_store"]));
router.use("/shop-by-stores",     requirePages(["marketing.shop_by_store"]));
router.use("/reels",              requirePages(["marketing.reels"]));
router.use("/faqs",               requirePages(["content.faq"]));
router.use("/policies",           requirePages(["content.customer_app_policy", "content.delivery_app_policy"]));
router.use("/settings",           requirePages(["settings.billing", "settings.sms_gateway"]));
router.use("/system-users",       requirePages(["settings.system_user"]));
router.use("/roles",              requirePages(["settings.roles"]));
router.use("/audit-logs",         requirePages(["settings.audit_log"]));
```

Three prefixes need finer treatment than one line:

- **`/settings`** — `/settings/sms-gateway` must require `settings.sms_gateway` specifically, not the union. Add `router.use("/settings/sms-gateway", requirePages(["settings.sms_gateway"]))` *before* the broader `/settings` guard; Express matches in registration order.
- **`/delivery`** — the union is broad because five pages share the endpoints. `POST /delivery/:id/collect-cash` is the one write that should be narrower: `requirePages(["delivery.cash_collection"])` registered before the union.
- **`/orders`** — `ORDER_PAGES` is the union of 9 keys, so any order page grants all order endpoints. This is inherent to page-level granularity (the eight status pages are the same component against different filters) and is accepted.

### 5.4 Other mount points

| Mount | Change |
|---|---|
| `/admin/withdrawals` ([`index.ts:208`](backend/src/routes/index.ts#L208)) | add `requirePages(["finance.withdrawals"])` |
| `/sellers` ([`sellerRoutes.ts:16`](backend/src/routes/sellerRoutes.ts#L16)) | add `requirePages(["sellers.list"])`; keep `GET /sellers` in the lookup allowlist |
| `/admin` migrations ([`migrationRoutes.ts`](backend/src/routes/migrationRoutes.ts)) | add `authenticate`, `requireUserType("Admin")`, `requireSuperAdmin()` — **Phase 0** |
| `/upload` | leave per-route guards as they are. The registration-time open routes are intentional; narrowing them is a separate change. |
| `/seller/taxes` ([`taxRoutes.ts:9`](backend/src/routes/taxRoutes.ts#L9)) | currently `authenticate` only, so **any** authenticated user type can write taxes. Add `requireUserType("Admin","Seller")` at minimum. Flagged as a pre-existing bug; fix in Phase 0. |

### 5.5 Privilege-escalation guards

Hard backend checks, independent of permissions:

1. **No self-elevation to Super Admin.** `POST`/`PUT /admin/system-users` rejects `role === "Super Admin"` unless the caller is Super Admin.
2. **Only Super Admin creates Super Admins.** Same check.
3. **`Role.permissions` can never contain `"*"`** via the API. The wildcard is settable only by the seed script.
4. **System roles are immutable** through the API — already enforced in `adminRoleController`; keep it.
5. **No editing your own role's permissions.** If `role.name === req.adminContext.admin.role` and the caller is not Super Admin, reject. Stops `settings.roles:manage` from being a self-escalation path.
6. **Last Super Admin protected** — already in `deleteSystemUser`; extend the same check to deactivation (`isActive: false`) and to role changes away from Super Admin.
7. **No self-deactivation / no self-delete** — self-delete already guarded; add deactivation.

---

## 6. Authentication

### 6.1 Login routing

| Role | Password login | Mobile OTP |
|---|---|---|
| Super Admin | **rejected** — "Super Admin accounts sign in with mobile OTP" | yes |
| every other role | yes | **rejected** — `403` |

### 6.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/admin/login` | email + password. Rejects Super Admin, inactive accounts. Rate limited. |
| `POST` | `/auth/admin/send-otp` | **now rejects non-Super-Admin.** Rate limited. |
| `POST` | `/auth/admin/verify-otp` | same restriction. Rate limited. |
| `POST` | `/auth/admin/refresh` | reads httpOnly cookie, rotates it, returns a new access token. |
| `POST` | `/auth/admin/logout` | revokes this session, clears cookie. |
| `POST` | `/auth/admin/logout-all` | bumps `tokenVersion`, revokes every session. |
| `POST` | `/auth/admin/forgot-password` | email. **Always returns 200** regardless of whether the account exists — no enumeration. Rejects Super Admin (no password to reset). Rate limited. |
| `POST` | `/auth/admin/reset-password` | token + new password. Bumps `tokenVersion`. Rate limited. |
| `POST` | `/auth/admin/register` | **DELETE THIS ROUTE** — see Phase 0. |
| `GET` | `/admin/me` | identity + role + resolved permissions. The frontend's authority. |
| `POST` | `/admin/profile/change-password` | current + new password. Bumps `tokenVersion`, keeps the calling session alive. |

### 6.3 Tokens

- **Access token** — JWT, **15 min**, in the `Authorization: Bearer` header, held in memory + localStorage as now. Payload gains `tokenVersion` so §5.1 can detect forced logout. Permissions are **not** in the payload.
- **Refresh token** — 32 random bytes, **7 days**, sha256-hashed into `AdminSession`. Set as:

```
Set-Cookie: adminRefreshToken=<token>
  HttpOnly; Secure; SameSite=None;
  Path=/api/v1/auth/admin;
  Max-Age=604800
```

`SameSite=None` is required because the panel is on `dhakadsnazzy.com` and the API on `api.dhakadsnazzy.com` — a cross-site request. `Secure` is mandatory with `SameSite=None`; both origins are already HTTPS.

**Rotation:** every `/refresh` revokes the presented token and issues a new one. If an already-revoked token is presented, treat it as theft: revoke every session for that admin and force re-login.

Changes needed:
- `cookie-parser` added to `backend/package.json` and `app.use(cookieParser())` in `server.ts`.
- CORS already has `credentials: true` ([`server.ts:68`](backend/src/server.ts#L68)) — no change.
- **`localhost` development will not work with `SameSite=None; Secure` over plain HTTP.** Make the cookie flags environment-aware: `secure: NODE_ENV === "production"`, `sameSite: NODE_ENV === "production" ? "none" : "lax"`.
- `jwtService.generateToken` gains `tokenVersion` and a configurable expiry; add `generateRefreshToken()`. Also **remove the two `console.log`/`console.error` calls in [`verifyToken`](backend/src/services/jwtService.ts) that print the JWT secret prefix and raw token fragments** to the logs.

### 6.4 Email — `services/emailService.ts` *(new)*

`nodemailer`, configured from env:

```
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Dhakad Snazzy <no-reply@dhakadsnazzy.com>"
ADMIN_PANEL_URL=https://www.dhakadsnazzy.com
```

Add to `.env.example`. One template to start: **admin password reset**, containing `${ADMIN_PANEL_URL}/admin/reset-password?token=...`, valid 30 minutes, single-use.

Verify the SMTP connection once at startup and log a clear warning if it fails, so a misconfiguration surfaces at deploy rather than when someone needs a reset. Do not block startup on it.

### 6.5 Rate limiting — rewrite `middleware/rateLimiter.ts`

Replace the no-op stubs with real `express-rate-limit` instances (the package is already a dependency). Keep the OPTIONS skip from the current stubs — CORS preflight must not be counted.

| Limiter | Window | Max | Key |
|---|---|---|---|
| `adminLoginRateLimiter` | 15 min | 10 | IP + email |
| `otpRateLimiter` | 15 min | 5 | mobile, falling back to IP via `ipKeyGenerator` |
| `forgotPasswordRateLimiter` | 1 h | 5 | IP + email |
| `resetPasswordRateLimiter` | 1 h | 10 | IP |

Enable in **all** environments, with generous dev limits via env override rather than a bypass — a stub that is off in production is how the current situation arose.

Express needs `app.set("trust proxy", 1)` behind the production reverse proxy, or every request keys to the proxy's IP and the limiter becomes global. Verify against the actual deployment.

### 6.6 Role CRUD API

Uncomment and extend [`adminRoleController.ts`](backend/src/modules/admin/controllers/adminRoleController.ts):

| Method | Path |
|---|---|
| `GET` | `/admin/roles/permissions` → grouped catalog from `permissionCatalog()` |
| `GET` | `/admin/roles` |
| `GET` | `/admin/roles/:id` |
| `POST` | `/admin/roles` |
| `PUT` | `/admin/roles/:id` |
| `DELETE` | `/admin/roles/:id` |

Changes to the existing controller:
- `getPermissions` returns the real grouped catalog, replacing the hardcoded 18-string array.
- `createRole` / `updateRole` validate every permission against `ALL_PERMISSIONS`, reject `"*"`, and auto-add `:view` wherever `:manage` is present.
- **`updateRole` rename cascades** (decision 4): inside a transaction, update `Role.name` then `Admin.updateMany({role: oldName}, {role: newName})`. Bump `permissionsUpdatedAt` and invalidate the role cache.
- **`deleteRole` is refused while in use** (decision 4): `countDocuments({role: role.name})`; if > 0, `409` with the count — *"Cannot delete: 3 admin accounts use this role."*
- Every permission change bumps `permissionsUpdatedAt` and invalidates the cache, so edits apply within one request.
- `GET /admin/roles` includes a `userCount` per role (single `$group` aggregation on `Admin.role`).

> Mongoose transactions need a replica set. MongoDB Atlas provides one; a standalone local `mongod` does not. If the local dev DB is standalone, the rename needs a non-transactional fallback (rename the role, then `updateMany`, and log loudly if the second step fails) — check `config/db.ts` and the connection string before relying on `session`.

---

## 7. Frontend

### 7.1 `modules/admin/permissions/catalog.ts` *(new)*

The 50 page keys with labels and groups. Necessarily duplicated from the backend, because the sidebar is a hardcoded JSX array and needs keys at build time.

To keep the copies honest: `GET /admin/roles/permissions` is the runtime authority for the **role editor**, and a test (§8) asserts the frontend catalog's key set equals the backend's. Drift fails CI rather than silently hiding a menu item.

### 7.2 `AuthContext.tsx` — changes

```ts
interface AuthContextType {
  // ... existing
  permissions: string[];
  isSuperAdmin: boolean;
  can: (pageKey: string, tier?: "view" | "manage") => boolean;
  permissionsLoading: boolean;
  refreshPermissions: () => Promise<void>;
}
```

- `can()` returns `true` immediately when `isSuperAdmin`.
- On mount, if `userType === "Admin"`, fetch `GET /admin/me` and store the result. localStorage is a render-blocking cache only — **never** the authority. A tampered localStorage changes what the menu draws and nothing else, because every endpoint re-checks.
- `permissionsLoading` must gate the route guard, or a refresh briefly renders "no access" before permissions arrive.
- `login()` stores `permissions` alongside `userData`.

### 7.3 `usePermissions()` hook + `<Can>` *(new)*

```tsx
const { can, canManage, isSuperAdmin } = usePermissions();

<Can page="orders.pending" tier="manage">
  <button onClick={cancelOrder}>Cancel order</button>
</Can>
```

### 7.4 `AdminSidebar.tsx` — changes

Add `permission: string` to the `SubMenuItem` and `MenuItem` interfaces, then one key per entry across all 47 paths. Filter before render:

```ts
const visibleSections = menuSections
  .map(s => ({
    ...s,
    items: s.items
      .map(i => i.submenuItems
        ? { ...i, submenuItems: i.submenuItems.filter(si => can(si.permission, "view")) }
        : i)
      .filter(i => i.submenuItems ? i.submenuItems.length > 0 : can(i.permission!, "view")),
  }))
  .filter(s => s.items.length > 0);
```

A parent menu with no visible children disappears; a section with no visible items disappears. Compose this with the existing search filter rather than replacing it.

### 7.5 `App.tsx` — route guarding

The ~55 inline `<Route>` elements become a data table:

```ts
// modules/admin/adminRoutes.config.ts
export const ADMIN_ROUTES: Array<{
  path: string;
  element: React.ReactNode;
  permission: string | null;   // null = self-service (profile)
}> = [
  { path: "",                    element: <AdminDashboard />,  permission: "dashboard" },
  { path: "profile",             element: <AdminProfile />,    permission: null },
  { path: "orders/pending",      element: <AdminPendingOrders />, permission: "orders.pending" },
  // ... 55 entries
];
```

Rendered in one `.map()`, each wrapped in `<AdminPageGuard permission={...}>`. This replaces ~220 lines of repetitive JSX with a table that is trivially diffable against the permission catalog — and is itself the thing the §8 completeness test checks.

`AdminPageGuard` *(new)*:
- `permissionsLoading` → spinner
- `permission === null` → render
- `can(permission, "view")` → render
- else → `<AdminNoAccess />`

Plus `/admin/roles`, `/admin/audit-log`, and a `*` catch-all → `AdminNoAccess`.

### 7.6 Landing redirect

`/admin` currently renders `AdminDashboard`. A role without `dashboard:view` would land on a dead page. So `/admin` resolves to the **first page in `ADMIN_ROUTES` the user can view**, and `AdminNoAccess` only if there is none. The same resolver gives `PublicRoute`'s post-login target, replacing its hardcoded `/admin`.

### 7.7 New pages

| Page | Route | Contents |
|---|---|---|
| `AdminRoles.tsx` | `/admin/roles` | Role list (name, type, `userCount`, description) + create/edit drawer with the permission matrix: grouped accordion, 50 rows × View/Manage checkboxes, per-group and per-column select-all. System roles render read-only. Delete shows the in-use count on `409`. |
| `AdminAuditLog.tsx` | `/admin/audit-log` | Paginated table, filters on admin / date range / method / path, expandable row showing the redacted body. |
| `AdminForgotPassword.tsx` | `/admin/forgot-password` | Email field; always shows the same confirmation. |
| `AdminResetPassword.tsx` | `/admin/reset-password?token=` | New password + confirm, with live policy hints. |
| `AdminChangePassword.tsx` | `/admin/profile` *(tab)* | Current + new. Add to the existing profile page. |
| `AdminNoAccess.tsx` | fallback | "You don't have access to this page" + link to the first page they can reach. |

### 7.8 `AdminLogin.tsx` — rewrite

Currently mobile+OTP only. Becomes:
- **Default:** email + password, with a "Forgot password?" link.
- **Secondary:** "Super Admin? Sign in with mobile OTP" toggle revealing the existing mobile+`OTPInput` flow, which can be kept almost verbatim.
- Remove the dead `handleDhakadSnazzyLogin` and `handleSellerLogin` handlers (the latter is unreachable — no button renders it).
- Backend `403` on the wrong path produces a clear message: *"This account signs in with mobile OTP"* / *"Super Admin accounts cannot use password login"*.

### 7.9 `AdminSystemUser.tsx` — changes

- Replace the hardcoded `['Admin','Super Admin']` dropdown with `GET /admin/roles`.
- Hide the `Super Admin` option unless the current user is Super Admin.
- Surface `isActive` as an activate/deactivate toggle.
- Enforce the password policy client-side to match the backend.
- Gate every action button on `can('settings.system_user','manage')`.

### 7.10 `services/api/config.ts` — changes

- `withCredentials: true` on the axios instance (needed for the refresh cookie).
- **Refresh interceptor:** on `401` from a non-auth endpoint, call `/auth/admin/refresh` **once**, retry the original request on success, and only then fall back to the existing redirect-to-login. Must queue concurrent 401s behind a single in-flight refresh, or a page issuing six parallel requests fires six refreshes and the rotation logic in §6.3 treats five of them as token theft.
- Leave the 403 handling **exactly as it is** — not logging out on 403 is already correct.
- Add a 403 toast via the existing `ToastContext` so a denied action is visible rather than silent.

### 7.11 `ProtectedRoute.tsx`

No change needed. It keeps doing the `userType` check; `AdminPageGuard` handles permissions inside it. Worth noting its existing `requiredRole` prop is now actively misleading (exact-match on a single role name) — leave it unused, or delete it if nothing else references it.

### 7.12 Manage-tier UI

Across the admin pages, `can(page,'manage')` must disable Add / Edit / Delete / Save / status-toggle controls. ~50 pages is too many to retrofit in one pass, so:

1. The backend is the enforcement boundary — a read-only role is **already safe** before any UI work, it just sees buttons that return 403.
2. Retrofit by traffic priority: orders → finance → catalog → sellers → marketing → content → settings.
3. Prefer disabling with a tooltip over hiding, so the UI does not appear broken.

This is the long tail of the project and the natural place to split delivery.

---

## 8. Testing

No real test framework exists — two files run under `node:test` via `tsx` (`npm run test:razorpay`). Build on that, add `src/tests/rbac/`, and a `test:rbac` script. `mongodb-memory-server-core` is already a devDependency.

**Guard-rail tests — the ones that matter most:**

1. **Route coverage.** Walk the Express router stack of the real `adminRoutes` and assert every registered route is either covered by a `requirePages` prefix or on the self-service/lookup allowlist. **This is the test that stops a new endpoint from silently shipping unguarded** — the single highest-value test here.
2. **Catalog parity.** Backend `PAGES` key set === frontend catalog key set === `ADMIN_ROUTES` permission set (nulls excluded).
3. **Lookups are read-only.** Every `LOOKUP_ENDPOINTS` entry is a GET.
4. **No wildcard via API.** `POST`/`PUT /admin/roles` with `"*"` is rejected.

**Behavioural tests:**

5. `view` permits GET and refuses POST/PUT/PATCH/DELETE on the same prefix.
6. `manage` without `view` does not grant GET.
7. Super Admin bypasses everything.
8. Role permission edit takes effect on the **next** request (cache invalidation).
9. Role rename cascades to all `Admin.role` values; delete is refused with a count while in use.
10. Super Admin is rejected by `/auth/admin/login`; non-Super-Admin is rejected by `/auth/admin/send-otp`.
11. Refresh rotation: reusing a revoked refresh token revokes the whole session family.
12. `tokenVersion` bump invalidates existing access tokens.
13. Deactivated admin (`isActive: false`) is refused.
14. Escalation guards: non-Super-Admin cannot create a Super Admin, cannot edit their own role, cannot grant `"*"`.
15. `forgot-password` returns an identical 200 for existing and non-existing emails.

**Manual QA matrix** — one account per seeded preset role, walking: login, sidebar contents, direct-URL attempts at forbidden pages, a `view`-only page's disabled buttons, a 403 toast, permission edit reflected without re-login, forced logout, password reset end to end.

---

## 9. Phases

Ordered so each phase is independently shippable and leaves the app working.

### Phase 0 — Close the open holes *(do first, ship alone)*

Independent of RBAC. Small, urgent.

1. **Delete `POST /auth/admin/register`** ([`adminAuthRoutes.ts:14`](backend/src/routes/adminAuthRoutes.ts#L14)). Unauthenticated, accepts `role` from the body, so `curl -d '{"role":"Super Admin",...}'` mints a Super Admin. Admin creation already exists properly behind auth at `POST /admin/system-users`. Delete the route and `adminAuthController.register`.
2. **Guard `migrationRoutes.ts`** — `authenticate` + `requireUserType("Admin")` + Super-Admin check. Both routes rewrite image URLs across the whole database and are open to the internet.
3. **Guard `taxRoutes.ts`** — add `requireUserType("Admin","Seller")`; currently any authenticated user type can create and modify taxes.
4. **Remove secret logging** in [`jwtService.verifyToken`](backend/src/services/jwtService.ts) — it logs the JWT secret prefix and raw token fragments.
5. **Audit the production admin OTP bypass.** [`otpService.ts:597`](backend/src/services/otpService.ts#L597) has an `allowAdminProductionBypass` path accepting `"999999"`/`"9999"`/`DEFAULT_OTP`, and a hardcoded mobile `6268423926` at line 581. Recent commits on this branch added this deliberately, so **confirm the intent** — but once Super Admin is the OTP-only role, this is a bypass straight to full access. At minimum it must be env-gated and off in production.

> Items 1–4 are unambiguous bugs. Item 5 needs your call.

### Phase 1 — Permission foundation *(no behaviour change)*

`config/permissions.ts` · `Role` model updates · `AuditLog` + `AdminSession` models · `adminPermissionService` with cache · `resolveAdminContext` in `authenticate` · `seedRbac.ts` wired into `server.ts`.

Ends with permissions resolvable and attached to every admin request, enforced nowhere. Deployable with zero user-visible change.

### Phase 2 — Backend enforcement

`middleware/permissions.ts` · the ~30 `requirePages` lines · the three finer-grained overrides · other mount points (§5.4) · escalation guards (§5.5) · role CRUD API uncommented and extended.

**Risk point.** Until Phase 4, every existing admin carries `role: "Admin"` whose seeded permission set is everything except the two settings pages, so nothing breaks — *provided* `seedRbac` ran. Verify the seed before deploying this phase. Tests 1–9 should pass before it ships.

### Phase 3 — Authentication

`Admin` model fields + password policy · `emailService` · real rate limiters · login / refresh / logout / logout-all / forgot / reset / change-password / `GET /admin/me` · cookie-parser · OTP restricted to Super Admin · update `ensureDefaultAdmin` for the new policy.

### Phase 4 — Frontend plumbing

Frontend catalog · `AuthContext` extensions · `usePermissions` + `<Can>` · `AdminPageGuard` · `adminRoutes.config.ts` replacing the JSX block · sidebar filtering · landing resolver · axios refresh interceptor.

First phase where behaviour visibly changes: menus shrink to match the role.

### Phase 5 — New pages

`AdminRoles` (the permission matrix is the biggest single UI piece) · `AdminAuditLog` · `AdminLogin` rewrite · forgot / reset / change password · `AdminNoAccess` · `AdminSystemUser` updates.

### Phase 6 — Audit log

`middleware/auditLog.ts` on the admin router · redaction list (`password`, `currentPassword`, `newPassword`, `token`, `refreshToken`, `otp`, `apiKey`, `secret`, SMS/payment credentials) · body size cap (~8 KB, truncate with a marker) · login success/failure records · `GET /admin/audit-logs` with filters.

Write failures must **never** fail the request — log and move on.

### Phase 7 — Hardening and rollout

Full test suite · manual QA matrix · `view`-tier UI retrofit (§7.12, by priority) · rollout (§9.3).

---

### 9.3 Rollout notes

**Existing accounts.** `Admin.role` values already match the seeded role names, so no data migration. But:

- Existing `Admin`-role accounts have passwords only from `ensureDefaultAdmin` (`Admin@123`) or from `AdminSystemUser` creation. Some may be unknown or policy-violating. Because forced password change was declined (decision 8), **Super Admin must set a password for each existing non-Super-Admin account** from the System User page before Phase 3 goes live, and communicate them out of band. Enumerate those accounts before deploying.
- Super Admin accounts need no password — they stay on OTP.

**Break-glass.** Decision 2 makes Super Admin access entirely dependent on the SMS gateway. If SMS is down, there is no way into a Super Admin account. Mitigations, in order of preference:

1. A `tsx` CLI script (`npm run admin:grant-super`) that promotes an account by email, runnable from the server with DB access. Server access is already the trust boundary, so this adds no new exposure.
2. Keep the existing env-gated OTP fallback, explicitly **off** in production and flipped only during an incident.

Pick one and document it where whoever operates the server will find it.

**Deployment order.** Phase 0 alone → verify → Phase 1 → verify seed ran and `GET /admin/roles/permissions` returns 50 pages → Phase 2 → smoke-test an existing admin against every section → Phase 3 → Phase 4+5 together (the frontend is only coherent with both) → Phase 6 → Phase 7.

Backend phases must deploy **before** their frontend counterparts: a frontend calling `/admin/me` against a backend without it breaks login entirely.

---

## 10. Open questions

Not blocking the plan, but each needs an answer before the phase that touches it.

1. **Audit log retention.** Unbounded, or a TTL index (90 / 180 / 365 days)? Every mutating request is logged, so this grows steadily. *Needed before Phase 6.*
2. **`GET /admin/settings` contents.** Does it expose secrets? Determines whether it can be a lookup endpoint. *Needed before Phase 2.* (§3.3)
3. **The production OTP bypass** at [`otpService.ts:581-607`](backend/src/services/otpService.ts#L581-L607) — intended, or to be removed? *Needed in Phase 0.*
4. **`customers.users` vs `customers.list`.** `/admin/users` and `/admin/customers` are two different pages both listing customers. Keep both permissions, or consolidate the pages? *Cosmetic; can wait.*
5. **Break-glass choice** (§9.3). *Needed before Phase 3.*
6. **Seeded preset roles.** Do the five in §4.3 match how your team is actually organised, and what should each one's exact page set be? *Needed before Phase 1.*
7. **Account lockout** — declined in decision 8. Confirm that is deliberate given there is no forced password change either, so a leaked admin password stays valid indefinitely and is only protected by per-IP rate limiting.

---

## 11. File-by-file summary

### Backend — new

```
src/config/permissions.ts              Page catalog, tiers, lookup allowlist
src/middleware/permissions.ts          requirePages, requireSuperAdmin
src/middleware/auditLog.ts             Auto-capture mutating requests
src/models/AuditLog.ts
src/models/AdminSession.ts
src/services/adminPermissionService.ts Resolution + role cache
src/services/emailService.ts           Nodemailer
src/scripts/seedRbac.ts                Idempotent role seed
src/tests/rbac/*.test.ts
```

### Backend — modified

```
src/models/Admin.ts                    role→string, password policy, tokenVersion,
                                       isActive, reset fields, passwordChangedAt
src/models/Role.ts                     isActive, permissionsUpdatedAt, validator
src/middleware/auth.ts                 resolveAdminContext, tokenVersion check
src/middleware/rateLimiter.ts           Real limiters replacing the no-op stubs
src/services/jwtService.ts             tokenVersion in payload, refresh tokens,
                                       remove secret logging
src/routes/adminRoutes.ts              ~30 requirePages lines, role + audit routes
src/routes/adminAuthRoutes.ts          New auth endpoints; DELETE /register
src/routes/adminWithdrawalRoutes.ts    requirePages
src/routes/sellerRoutes.ts             requirePages
src/routes/migrationRoutes.ts          Super Admin guard                [Phase 0]
src/routes/taxRoutes.ts                requireUserType                  [Phase 0]
src/routes/index.ts                    Guard on /admin/withdrawals
src/modules/admin/controllers/adminAuthController.ts
                                       login, refresh, logout, forgot, reset,
                                       OTP→Super Admin only; remove register
src/modules/admin/controllers/adminRoleController.ts
                                       Real catalog, validation, cascade rename,
                                       in-use delete guard, userCount
src/modules/admin/controllers/adminSystemUserController.ts
                                       Role from Role collection, escalation
                                       guards, isActive
src/modules/admin/controllers/adminProfileController.ts
                                       change-password, GET /admin/me
src/utils/ensureDefaultAdmin.ts        Honour the new password policy
src/server.ts                          cookieParser, seedRbac, SMTP verify,
                                       trust proxy
package.json                           + nodemailer, cookie-parser, types;
                                       test:rbac script
.env.example                           SMTP_*, ADMIN_PANEL_URL, token TTLs
```

### Frontend — new

```
src/modules/admin/permissions/catalog.ts
src/modules/admin/adminRoutes.config.ts      Route table replacing App.tsx JSX
src/modules/admin/components/AdminPageGuard.tsx
src/modules/admin/components/Can.tsx
src/hooks/usePermissions.ts
src/modules/admin/pages/AdminRoles.tsx
src/modules/admin/pages/AdminAuditLog.tsx
src/modules/admin/pages/AdminForgotPassword.tsx
src/modules/admin/pages/AdminResetPassword.tsx
src/modules/admin/pages/AdminNoAccess.tsx
src/services/api/admin/adminAuditLogService.ts
```

### Frontend — modified

```
src/context/AuthContext.tsx            permissions, can(), isSuperAdmin,
                                       GET /admin/me on mount
src/services/api/config.ts             withCredentials, queued refresh
                                       interceptor, 403 toast
src/services/api/auth/adminAuthService.ts
                                       login, refresh, logout, forgot, reset
src/services/api/admin/adminRoleService.ts
                                       Grouped catalog type, userCount
src/services/api/admin/adminSystemUserService.ts
                                       isActive, role from catalog
src/App.tsx                            ~220 JSX lines → route table map
src/modules/admin/components/AdminSidebar.tsx
                                       permission per item, filtering
src/modules/admin/pages/AdminLogin.tsx Email+password primary, OTP for
                                       Super Admin, forgot link
src/modules/admin/pages/AdminSystemUser.tsx
                                       Dynamic roles, isActive, policy
src/modules/admin/pages/AdminProfile.tsx
                                       Change-password tab
src/components/PublicRoute.tsx         Landing resolver instead of /admin
src/modules/admin/pages/*.tsx          Progressive manage-tier gating (§7.12)
```

---

## 12. Rough sizing

| Phase | Backend | Frontend | Notes |
|---|---|---|---|
| 0 — Open holes | S | — | Ship alone, first |
| 1 — Foundation | M | — | No behaviour change |
| 2 — Enforcement | M | — | Mechanical but wide; tests carry it |
| 3 — Auth | L | — | Email + sessions are the bulk |
| 4 — FE plumbing | — | M | `App.tsx` restructure is the risk |
| 5 — New pages | S | L | Permission matrix is the big piece |
| 6 — Audit log | M | M | |
| 7 — Hardening | S | L | §7.12 is the long tail; split as needed |

Phases 0–6 deliver a complete, enforced system. Phase 7's UI retrofit is incremental and safe to trickle, because the backend is already the enforcement boundary.

---

## 13. Implementation record

What was actually built, where it differs from the plan above, and what the
open questions turned out to be.

### 13.1 Open questions, resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Audit log retention | **Unbounded by default**, opt-in via `AUDIT_LOG_RETENTION_DAYS`. For an audit trail, keeping data is the safe failure mode, so no silent expiry was imposed. Records written while it is unset never expire, so enabling it later only affects new ones. |
| 2 | Does `GET /admin/settings` expose secrets? | **Yes.** It returns `paymentGateways.razorpay.keySecret`, `paymentGateways.cashfree.secretKey` and `smsGateway.apiKey`. It is therefore **not** a lookup endpoint. It is gated behind the two settings pages and secrets are masked as `[redacted]` unless the caller holds the page that owns them. See §13.3. |
| 3 | Production OTP bypass | **Left untouched.** [`otpService.ts:581-607`](backend/src/services/otpService.ts#L581-L607) and `ALLOW_ADMIN_FIXED_OTP_IN_PRODUCTION` were added deliberately on this branch, so changing them could break your live Super Admin login. Still outstanding — see §13.5. |
| 4 | `customers.users` vs `customers.list` | Both kept as separate pages. Consolidating the two customer pages is left as its own change. |
| 5 | Break-glass | Implemented as a CLI script: `npm run admin:grant-super -- <email> [--mobile <10 digits>]` ([grantSuperAdmin.ts](backend/src/scripts/grantSuperAdmin.ts)). |
| 6 | Seeded preset roles | The five from §4.3 are seeded as **Custom**, so they are freely editable and are never overwritten by a re-run of the seed. Adjust them in Manage Roles. |
| 7 | No lockout + no forced password change | Built as decided. The consequence stands: a leaked admin password stays valid until someone changes it, protected only by per-IP/email rate limiting. |

### 13.2 Deviations from the plan

**`requireTiered` was added** (not in the plan). Three prefixes turned out to be
shared by pages that should not all be able to *write* them:

- `/sellers` and `/admin/sellers` — read by Manage Seller List, Seller
  Transaction and Seller Location; only Manage Seller List may write.
- `/admin/payment-methods` — also read by Billing & Charges.
- `/admin/wallet` — read and written by both finance pages.

A single `requirePages` list could not express that, so
[`requireTiered({ view, manage })`](backend/src/middleware/permissions.ts) takes
separate page sets per tier.

**`GET /admin/settings/features` was added** — a narrow, credential-free
endpoint for the small slice of `AppSettings` that content pages own
(`features.*` plus `allCategoryImageUrl`). Without it, the Header Category page
would have needed `settings.billing:manage` just to flip a display toggle,
which would have handed a catalog editor the payment gateway credentials.
`AdminHeaderCategory` was repointed at it.

**Guards are tagged with a symbol.** Every guard carries a non-enumerable
`Symbol.for("rbac.guard")` marker, so `routeCoverage.test.ts` can walk the
Express layer stack and prove each route sits behind one. Without the marker
the test could not tell a permission guard from any other middleware.

**`AdminSession` replaced the planned array-on-Admin** approach, with a TTL
index so expiry is the database's job.

**The dashboard route redirects rather than refusing.** A role without
`dashboard:view` opening `/admin` is sent to its first visible page instead of
being shown "no access" on arrival ([AdminPageGuard](frontend/src/modules/admin/components/AdminPageGuard.tsx)).

**`useDisabledProps` lives in `hooks/`,** not alongside `Can.tsx`, because
exporting a hook from a component file trips the `react-refresh` lint rule.

**Password reset pages are not wrapped in `PublicRoute`.** A reset revokes
every session, so the page must stay reachable while signed in; `PublicRoute`
would bounce a signed-in admin away from it.

### 13.3 Settings redaction, as built

`GET /admin/settings` requires `settings.billing:view` **or**
`settings.sms_gateway:view`, and then masks what the caller does not own:

| Caller holds | Sees payment secrets | Sees SMS apiKey |
|---|---|---|
| `settings.billing:view` only | yes | `[redacted]` |
| `settings.sms_gateway:view` only | `[redacted]` | yes |
| both, or Super Admin | yes | yes |

Values are masked rather than omitted, so the UI can still show that a
credential is configured. `GET /admin/settings/sms-gateway` remains separately
gated on `settings.sms_gateway`.

### 13.4 Test suite

`cd backend && npm run test:rbac` — **87 tests**, five files:

| File | Tests | Covers |
|---|---|---|
| `permissions.test.ts` | 16 | Catalog integrity, allowlist shape, `normalizePermissions` |
| `requirePages.test.ts` | 17 | Guard behaviour with stub req/res — tiers, any-of, super admin, allowlist |
| `routeCoverage.test.ts` | 7 | **Every admin endpoint is guarded or allowlisted** |
| `catalogParity.test.ts` | 7 | Backend catalog ≡ frontend catalog ≡ route table ≡ sidebar |
| `integration.test.ts` | 15 | Seeding, model validation, context resolution — real MongoDB |
| `httpEnforcement.test.ts` | 25 | Real HTTP through the real router — login split, tier enforcement, revocation, escalation guards, redaction |

`routeCoverage.test.ts` was verified to actually fail when an unguarded route
is added, rather than passing vacuously.

Two notes for whoever runs these:

- They need `--test-force-exit` (already in the npm script). Importing the app
  leaves open handles, so the runner would otherwise hang.
- `httpEnforcement.test.ts` raises `RATE_LIMIT_LOGIN_MAX` for itself. It signs
  in far more often than a human would and the real limiter 429s it otherwise —
  which is itself evidence the limiter is live.

### 13.5 Before you deploy

1. **Set `SMTP_*`** or forgot-password silently sends nothing. Startup logs a
   warning if SMTP is unverified; check for it.
2. **Set passwords for existing non-Super-Admin accounts** from the System User
   page. They currently hold whatever was seeded (`Admin@123`) or set at
   creation, and forced password change was declined. Enumerate those accounts
   first.
3. **Verify `TRUST_PROXY`** matches your deployment, or every rate limiter keys
   to the proxy's IP and becomes global. Auto-enabled when `NODE_ENV=production`.
4. **Confirm the OTP bypass decision** (§13.1 row 3). Once Super Admin is the
   OTP-only role, `ALLOW_ADMIN_FIXED_OTP_IN_PRODUCTION=true` is a bypass
   straight to full access.
5. **`DEFAULT_ADMIN_PASSWORD` must satisfy the new policy** (8+, upper, lower,
   digit) or `ensureDefaultAdmin` logs an error and creates nothing. Only
   matters on a fresh database.
6. **Deploy backend before frontend.** The panel calls `GET /admin/me` on
   mount; against an older backend, admin login breaks entirely.
7. **Transactions need a replica set.** The role-rename cascade uses one, with a
   logged non-transactional fallback for standalone MongoDB. Atlas is fine.
