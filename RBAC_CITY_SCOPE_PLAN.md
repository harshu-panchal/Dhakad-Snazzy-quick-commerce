# Admin Panel — City-Scoped Access

Extension of the role based access system in [RBAC_IMPLEMENTATION_PLAN.md](RBAC_IMPLEMENTATION_PLAN.md).

- **Status:** plan only. No code has been written for this.
- **Depends on:** the RBAC work (Phases 0–6 of the first plan) being deployed first. The production database currently has **0 roles**, so it has not been deployed yet.
- **Based on:** a read-only audit of the live `dhakadsnazzy` database (§2). Nothing was written to it.
- **Terminology:** the scope unit is the **town**. "City" in this plan, and in names like `City`, `cityId` and `settings.cities`, means a town such as Biaora or Khujner. Each town also records the **district** it belongs to (all six live towns are in Rajgarh district, §12) so admins can later be given a whole district at once, but the district is a grouping label, not the scope boundary.

---

## 1. Decisions (confirmed)

| # | Decision |
|---|---|
| 1 | **Anchor = the seller's city.** An order belongs to the city of the seller it was bought from. The customer's delivery city is *not* used. |
| 2 | **One order, one seller, so one town.** The cart already allows only one seller (since 2026-08-16), so no separate town rule is needed. |
| 3 | **An admin can cover several cities.** |
| 4 | **Admins can see customers** — defined as customers who have ordered from a seller in the admin's cities (§5.3). |
| 5 | **"Biaora" and "Biaora rajgarh" are one city.** "Narasingarh" and "Narsinghgarh" are one city. |
| 6 | **The Indore, Odisha and "Appzeto" sellers are test data** and get no real city. |
| 7 | **Orders from deleted sellers are Super-Admin-only.** |
| 8 | **The scope unit is the town** (chosen after the Google Maps lookup showed all six live towns are in one district, §12). Six towns: Biaora, Khujner, Narsinghgarh, Sarangpur, Pachore, Bhayana. The district is stored as a grouping label. |
| 9 | **Marketing and content pages, reels and the platform wallet stay global** in this version. |
| 10 | **Delivery boys are not scoped, and the delivery assignment flow is not touched.** It keeps working from the seller's service radius. No `cityId` on delivery boys, no change to who can be assigned to an order. |

### Corrections to earlier assumptions

- **Decision 2 was already implemented, and an earlier version of this plan said otherwise.** The cart allows a single seller (`customerCartController.addToCart`, added 2026-08-16) and offers to replace the cart on a conflict. The earlier claim came from reading only `createOrder`, which takes its items from the request body and never looked at the cart. The 61 multi-seller orders in the data all predate that change (the last was 2026-08-15). Because a cart has one seller, an order always has one town, so the cross-town cart rule once planned here is **not needed** and the warning that it would block carts such as Khujner + Bhayana was wrong: those carts were already blocked.
- **What the cart does not cover** is `createOrder` itself, which reads its items from the request. An old app build or a direct API call could still send a mixed order, so Phase B adds the same one-seller check on the server (§6).
---

## 2. What the live data looks like

| Fact | Number | Consequence |
|---|---|---|
| Sellers | 41 (31 real; 10 are test/dummy) | The town list can be built and mapped by hand |
| Real towns | Biaora ≈15, Khujner 6, Narsinghgarh 4, Sarangpur 4, Pachore 1, Bhayana 1 | These six are the scope units. All sit in Rajgarh district (§12) |
| Sellers with no city | 4 | All test accounts |
| Orders | 3,143 | |
| **Order items whose seller no longer exists** | **2,481 of 4,146** | **1,884 orders (60%) cannot be tied to a city through their seller** |
| Distinct delivery-city values on orders | 178, including Hindi spellings and "Test City" | Delivery city is unusable as a scope |
| Seller city ≠ order delivery city | 628 of 1,317 (48%) | Customers live in villages around the seller's town |
| Delivery boys | 69, with 30 spellings of city (villages, "Ka", Odisha) | **Left alone** (decision 10). Not scoped, not mapped |
| Customers | 3,349; 326 have no city; 512 distinct spellings | Cannot be scoped by their own city |
| Admins | 3, all Super Admin | None are affected when this ships |

**The orphaned-order finding drives the design.** `DELETE /sellers/:id` hard-deletes, and 60% of order history already points at a seller that is gone. A city filter that joins orders to sellers would hide most history from every city manager. So the city is **saved on the order when it is placed**, and the filter reads the order, never the seller.

Also: the order filter already joins `OrderItem.seller` ([adminOrderController.ts:64](backend/src/modules/admin/controllers/adminOrderController.ts#L64)), so the pattern is familiar, but it is the wrong source of truth for scope.

---

## 3. Model: permission × scope

The page-level roles we built answer **what** an admin can do. City scope answers **where**. They are independent.

- Scope lives on the **admin account**, not on the role. One "Order Manager" role works for every city; the alternative (a role per city) multiplies the 5 preset roles by every city.
- **Super Admin is never scoped.**
- **Fail closed.** A non-Super-Admin with no cities selected sees no city-scoped data. A forgotten assignment shows an empty page, not every city.
- Scope is resolved **per request** alongside permissions, never put in the JWT, so changing someone's cities applies on their next request.

```
Admin.cityScope = { mode: "all" | "selected", cityIds: ObjectId[] }

mode "all"                  -> sees every city (HQ roles such as Finance Manager)
mode "selected", cityIds[]  -> sees only those cities
mode "selected", []         -> sees nothing city-scoped   (default for new admins)
Super Admin                 -> always all
```

---

## 4. Data layer

### 4.1 `City` collection (new) — one record per **town**

```
name       "Khujner"
slug       "khujner"           unique
aliases    ["khujner", "khujner mp"]       spellings that map to this town
district   "Rajgarh"           grouping label (used for the "select all in district" shortcut)
state      "Madhya Pradesh"
isActive   boolean
```

Seeded with the six towns:

| Town | Aliases to merge | District |
|---|---|---|
| Biaora | "Biaora", "Biaora rajgarh", "ब्यावरा" | Rajgarh |
| Khujner | "Khujner" | Rajgarh |
| Narsinghgarh | "Narsinghgarh", "Narasingarh" | Rajgarh |
| Sarangpur | "Sarangpur", "SARANGPUR" | Rajgarh |
| Pachore | "Pachore" | Rajgarh |
| Bhayana | "Bhayana" | Rajgarh |

It replaces the `distinct()` calls in `getServiceableCities`, which currently build the dropdown from free-text fields.

**Mapping a seller to a town uses the seller's own `city` text** (after alias matching), not the Google locality. The geocoder returns village names for some Biaora sellers (Khuri, Aranya, Kachnaria), but those sellers are Biaora's, and the declared town is what the business means. Coordinates are used only as a **check**: a seller whose location is outside Rajgarh district is flagged as probable test data (this is how "Naval Centre", city "Indore", located in Odisha, shows up).

### 4.2 New fields

| Model | Field | Set when |
|---|---|---|
| `Seller` | `cityId` | Backfilled from the mapping; required on create/edit afterwards |
| **`Order`** | **`cityId`** | **At order creation, from the seller's `cityId`. A snapshot. Never recomputed.** |

Indexes: `Order {cityId, orderDate:-1}`, `Order {customer, cityId}`, `Seller {cityId}`.

Delivery boys get no new field.

Existing text fields (`Seller.city` etc.) stay as they are. Nothing is removed.

### 4.3 Scope strategy per entity

Each entity declares one strategy, so there is no guesswork per endpoint:

| Strategy | Entities |
|---|---|
| **direct** — has `cityId` | Order, Seller |
| **via order** | Return, Commission, Shipment (through their order) |
| **via seller** | Product, seller WalletTransaction, seller WithdrawRequest |
| **via orders** | Customer: visible if the customer has any order in scope |
| **global** | Category, Brand, Tax, Settings, Roles, System Users, Audit Log, Policies, FAQ, platform wallet, **and everything about delivery boys** (their list, wallets, withdrawals, cash collection, tracking, manual assignment) |

`via order` and `via seller` resolve to an `$in` list of ids computed once per request.

---

## 5. Enforcement

### 5.1 A scope helper, applied everywhere

`req.adminContext.scope` is filled in by `authenticate`. A helper returns a Mongo filter for an entity, or `null` for "no restriction" (Super Admin / mode "all"). Every controller adds it to its query.

### 5.2 The risk that matters most: single-record endpoints

Filtering lists is the easy part. The dangerous bug is filtering `GET /orders` but not `PATCH /orders/:id/status`, which would let a Biaora manager change a Khujner order by guessing an id.

Rules:
- **Every by-id read, write and delete** loads the record through the scope filter. Out of scope → **404**, not 403, so existence isn't revealed.
- **Writes that accept a reference** also check it: creating or editing a seller must pick a town in scope. `assign-delivery` checks only that the **order** is in scope; the delivery boy it receives is not checked, because the assignment flow is unchanged (decision 10).
- **Lookups.** `/admin/sellers`, `/admin/products` and similar are on the open lookup allowlist for every admin. They must be scoped too, or they leak other cities' seller and product names.
- **Exports** (`/orders/export/csv`) are scoped.
- **Aggregations** (dashboard ≈8 pipelines, wallet ≈8, reels, notifications): the scope `$match` goes first. Scoped admins see city-attributed totals only.

### 5.3 Customers

A scoped admin sees a customer if that customer has any order whose `cityId` is in scope. Consequence to accept: **a customer who has never ordered is invisible to city managers.** Super Admin sees everyone.

### 5.4 Money

- **Seller** wallets, withdrawals and transactions are scoped by their seller.
- The **platform wallet and platform-wide financial totals are global**, so they are hidden from scoped admins. Grant those pages only to HQ roles with scope "all".
- **Delivery boy** wallets, withdrawals, fund transfer and cash collection are **global** (decision 10). A town manager who holds a delivery page sees every delivery boy's figures, in every town. So grant `delivery.*` and `finance.withdrawals` only to roles that are meant to see all of them.

### 5.5 Notifications

- Admin new-order alerts currently go to *every* admin (`notificationService.ts:201`). Change to: admins whose scope includes the order's city, plus scope-"all" admins.
- Broadcasts: a scoped admin may only target their own towns' sellers (by `cityId`) and customers (via orders). Broadcasting to delivery boys, or to "All", is refused for them, since delivery boys have no town.

### 5.6 The scope coverage test

Like `routeCoverage.test.ts`, which stops unguarded endpoints: a test walks the admin router and fails if any guarded prefix has neither a scope strategy from §4.3 nor an explicit "global" declaration. A new endpoint cannot ship without deciding how it is scoped.

---

## 6. One seller per order

**Already true in the app.** Since 2026-08-16 the cart allows one seller at a time. Adding an item from another seller returns a conflict and offers to replace the cart, so every order placed through the app has one seller and therefore one town. No cross-town rule is needed.

**The gap:** `createOrder` reads its items from the request body, not from the cart, so the cart's rule is not enforced where the order is created.

**What Phase B adds:** a server-side check in `createOrder`, before any stock is decremented. It looks up the sellers behind the products in the request (not what the client says) and rejects an order with more than one, with the code `MULTI_SELLER_ORDER`. A normal order is unaffected. No order placed since the cart rule has had two sellers, so no real traffic is refused.

---

## 7. Phases

Each phase ships on its own and leaves the app working.

### Phase A — City list and mapping *(no behaviour change)*
`City` model, seeded with the six towns · admin page to manage towns (new permission `settings.cities`) · mapping script, **dry run first**, that sets `Seller.cityId` from the seller's own city text and aliases · report of anything unmatched, and of sellers located outside Rajgarh (test data) · `getServiceableCities` reads `City`.

### Phase B — Order town, soft delete, and the server-side one-seller check
`Order.cityId` set at creation · backfill of existing orders from their seller where the seller still exists (≈1,260 of 3,143); **orders from deleted sellers keep `cityId = null`** · server-side one-seller check in `createOrder` · **sellers are soft-deleted from now on** (`DELETE /sellers/:id` marks the seller deleted and inactive instead of removing it; deleted sellers disappear from customer-facing and admin lists but their orders, products and wallet history stay intact).

### Phase C — Admin scope
`Admin.cityScope` · resolved into `adminContext` · returned by `GET /admin/me` · city picker on the System User form · audit log records the scope in force.

### Phase D — Enforcement
Scope helper · every controller, by-id endpoint, lookup, export and aggregation in §5 · notifications · the scope coverage test · HTTP tests of cross-city access.

### Phase E — Frontend
Town picker with a **"select all in Rajgarh"** shortcut, Towns page, scope shown in the header ("Showing: Biaora, Khujner"), town filters limited to the admin's towns, empty-state wording for an admin with no towns.

### Phase F — Rollout
Backfill on a **restored copy** first · run dry-run reports and review unmatched rows by hand · deploy A and B (no visible change) · assign scopes · deploy C–E.

---

## 8. Tests

1. **Scope coverage** (§5.6): every guarded prefix has a strategy or is declared global.
2. **Cross-town access, over real HTTP:** for each of orders, sellers, customers, returns, seller withdrawals — a Biaora-scoped admin cannot read, update or delete a Khujner record, and gets 404.
3. A scoped admin's **lists, dashboard totals, lookups and CSV export** exclude other cities.
4. **Fail closed:** a scoped admin with no cities sees nothing; Super Admin and scope "all" see everything.
5. **Orders with `cityId = null`** are invisible to every scoped admin.
6. **One seller per order:** a two-seller checkout is rejected before any stock changes; a single-seller one is not.
7. **Delivery is untouched:** a scoped admin can still assign any delivery boy to an order in their towns, exactly as before; `assign-delivery` on an order in another town returns 404.
8. **Backfill:** idempotent; dry run writes nothing; unmatched rows are reported, not guessed.
9. A scope change applies on the admin's next request.

---

## 9. Sizing

| Phase | Size | Note |
|---|---|---|
| A | S | Six towns to seed and 31 sellers to map; delivery boys are out of scope |
| B | M | Soft delete reaches many queries; the order and seller changes are small |
| C | S | |
| D | **L** | ~15 admin files plus ~16 aggregations; the bulk of the work and of the risk |
| E | M | |
| F | S | |

---

## 10. Open decisions

1. ~~Town or district as the scope unit~~ **Resolved: town.** A district-wide manager is made by giving an admin all six towns (the "select all in Rajgarh" shortcut). Because a cart already has one seller (§6), an order always has one town, so town scope needs no extra cart rule.
2. ~~Marketing and content pages stay global in this version~~ **Confirmed.** Grant those pages only to HQ roles until they are scoped in a later version.
3. ~~Platform wallet hidden from scoped admins~~ **Confirmed** (§5.4).
4. ~~Stop hard-deleting sellers~~ **Confirmed:** sellers are soft-deleted (Phase B). Orders keep their own town, so existing and future history stays correct either way.
5. ~~The 69 delivery boys~~ **Resolved (decision 10):** not scoped, no change.
6. ~~Reels~~ **Confirmed global** in this version. They carry a free-text `uploaderCity`, so scoping them later would need a mapping step of its own.
7. ~~Can a delivery boy cover more than one town?~~ **Not applicable** (decision 10).

---

## 11. One thing found along the way

The audit script printed `deliveryConfig`, which includes `googleMapsKey` — so that key appeared in this session's output. It is also returned by `GET /admin/settings` to holders of the Billing or SMS Gateway page; the redaction built in the first plan masks payment and SMS secrets but not this. A Maps key is meant for browsers, so the fix is to **restrict it by referrer in Google Cloud**; if it is not restricted, rotate it. No code change is needed unless you want it masked in the API too.

---

## 12. District audit (Google Maps reverse geocoding)

Each seller's stored coordinates were reverse-geocoded with the Google Geocoding API, sending only latitude and longitude. 37 sellers (4 "Appzeto" dummies excluded), 34 distinct locations, 0 failures.

Google's India hierarchy puts the **division** at one level (`Bhopal Division`) and the **district** one level below it (`Rajgarh`). The district is the field to use.

### 12.1 Result

| District | State | Sellers | Towns (from the sellers' own `city` text) |
|---|---|---|---|
| **Rajgarh** (Bhopal Division) | Madhya Pradesh | **31** | Biaora, Khujner, Narsinghgarh / Narasingarh, Sarangpur, Pachore, Bhayana |
| Indore (Indore Division) | Madhya Pradesh | 5 | the test sellers: "chirag ki shop", "Fashion hub", "Naval Centre", "abc", "John's Mart" |
| Ganjam | Odisha | 1 | "home branch", also a test seller |

Mapping by coordinates also settles two of the spellings: "Narasingarh" and "Narsinghgarh" geocode to the same place, as do "Biaora" and "Biaora rajgarh".

Some small localities inside the town clusters came back with their own names (Khuri, Aranya, Kachnaria, Panda, Dubali, Mehrimoti, Dev Badli, Bakhtyarpura). They are villages around the towns, all still in Rajgarh district. Sellers there keep the town they declared (Biaora, Khujner, Narsinghgarh, Sarangpur); the locality is not used.

### 12.2 What this means

- **Decision: scope by town.** The audit shows one district, so a district-scoped admin would currently see everything. Town scope is what separates a Biaora manager from a Khujner manager. The district stays on each town record as a grouping label.
- **The test data is separable by coordinates:** 6 sellers sit outside Rajgarh. Those get no town, consistent with decision 6.
- **Delivery boys** are not part of this work (decision 10).

### 12.3 The Maps key

The lookup worked from a plain script with no browser referrer, so the key is **not referrer-restricted** and the Geocoding API is enabled on it. Anyone who obtains it can spend against your Google billing. This audit made 34 requests, which is negligible. Restrict the key in Google Cloud (HTTP referrers for the browser use, and only the APIs you need) or rotate it. The key is also returned by `GET /admin/settings` to Billing and SMS Gateway page holders, and it is in the same database field that was printed earlier in this session.

---

## 13. Status

All decisions are now closed. Nothing in this plan is waiting on an answer.

**Before Phase A starts:** the base RBAC work (the first plan) is built but not yet deployed or committed, and the production database has 0 roles. Town scope builds on it, so it should be committed and deployed first, or the two shipped together.

**Soft delete, as decided, is a behaviour change to `DELETE /sellers/:id`:** an admin who deletes a seller will no longer remove the record. It needs a visible "deleted" state, and anything that lists sellers (customer app, admin lists, lookups, the serviceable-areas logic) must exclude deleted ones. That is part of Phase B's size.

---

## 14. Phase A: built

**Done:** `City` model and the six seeded towns · `Seller.cityId` (optional) · the Towns admin page and API with alias-clash and in-use protection · the seller mapping service and CLI (`npm run towns:map-sellers`, dry run unless `--apply`) · new permission page `settings.cities` · 42 tests, all passing.

**In the live database:** 7 roles and 6 towns were seeded. No seller record has been changed. The dry run reports 31 sellers would map (Biaora 15, Khujner 6, Narsinghgarh 4, Sarangpur 4, Pachore 1, Bhayana 1); the other 10 are the test accounts. Applying it is a separate step: `npm run towns:map-sellers -- --apply`, or the "Assign sellers" button on the Towns page. It only sets `cityId` where none exists, and is undone by unsetting that field.

**Found while building, affects Phase B:** the customer home page matches a Lowest Prices section's city against the sellers' **raw `city` text** (`customerHomeController.ts`, `detectedCities`). So `Seller.city` must keep its current text, and the Lowest Prices city dropdown was made **additive** (town names added, nothing removed) rather than replaced as §4.1 first said. Moving that matching onto `cityId` is a change to what customers see, and belongs with Phase B or later, not before.

**Deliberately not done in Phase A:** making `cityId` required when a seller is created or edited. Seller sign-up is public, so a required field would break it; that waits until the seller forms have a town picker.

---

## 15. Phase B: built

**Orders**
- `Order.cityId` is saved when an order is placed, from the seller's town (a snapshot; left unset when the seller has no town).
- `createOrder` rejects an order with items from more than one seller, before touching stock.
- `npm run orders:backfill-towns` fills in existing orders (dry run unless `--apply`; never overwrites; leaves `updatedAt` alone).

**Sellers**
- A seller's town now follows their city text automatically: on sign-up, on a profile edit, and when an admin edits the city. A hand-set town survives unrelated edits, and a city that matches no town clears the old one instead of leaving it stale.
- **Soft delete.** `DELETE /sellers/:id` marks the seller deleted instead of removing it. The seller's status becomes `Deleted`, which every customer query already excludes (they all require `Approved`), so customers stop seeing them without editing those queries. Their email and mobile are released (the originals are kept in `deletedSnapshot`) so the same person can register again, and a deleted seller's login token stops working immediately.
- Deleted sellers are hidden from the admin seller list and picker (shown with `?includeDeleted=true`), from broadcasts, from delivery-partner order discovery, from Shiprocket pickup syncing, and cannot be re-approved or edited through the admin API.
- An edit can no longer set `isDeleted`, `deletedAt` or the other lifecycle fields through the update body.

**Two things the tests caught**
- `Order.cityId` was declared on the TypeScript interface and indexed but missing from the Mongoose schema, so strict mode would have dropped it on every save and the order town would never have been stored.
- Mongoose's timestamps plugin hands a hook a *mixed* update (the caller's fields at the top level, only `updatedAt` inside `$set`), so the first version of the city hook never saw the city.

**Not done, deliberately**
- Orders and wallet history of an already deleted seller cannot be recovered: those 1,829 orders stay without a town.
- Open orders of a seller who is deleted are left as they are (as with the old hard delete). Nothing cancels or reassigns them.
- No "restore seller" button. `deletedSnapshot` and `statusBeforeDelete` keep what a restore needs.
- A deleted seller's products are not unpublished; they are hidden because the seller fails every `Approved` check, and the shop is marked closed.

**Live data, projected (read-only):** once the 31 sellers are mapped, the backfill would give **936 of 3,146 orders** a town (Biaora 738, Khujner 119, Narsinghgarh 70, Sarangpur 9). 1,829 stay without one (deleted seller) and 379 belong to the test sellers. Pachore and Bhayana have no orders yet.

---

## 16. Applied to the live database (2026-11-21)

| Step | Result |
|---|---|
| `npm run seed:rbac` | 7 roles created (Super Admin, Admin, five presets) |
| `npm run seed:cities` | 6 towns created |
| `npm run towns:map-sellers -- --apply` | **31 sellers** given a town: Biaora 15, Khujner 6, Narsinghgarh 4, Sarangpur 4, Pachore 1, Bhayana 1. The 10 left over are the test accounts. |
| `npm run orders:backfill-towns -- --apply` | **936 of 3,146 orders** given a town: Biaora 738, Khujner 119, Narsinghgarh 70, Sarangpur 9 |

Checked afterwards directly in the database: every order's town agrees with its seller's town, the free-text `Seller.city` is untouched, and re-running either command finds nothing left to do.

**`updatedAt` was not disturbed.** A check shortly afterwards showed 23 sellers with a recent `updatedAt`. That is not these writes: all 23 are sellers whose Shiprocket pickup sync is in the `Failed` state, which the application's own background sync retries on a timer. The 18 sellers in the `Synced` state, 17 of them freshly mapped, show no recent `updatedAt`.

**Not yet true until Phase B is deployed.** The backend now running does not save a town on new orders, so orders placed before the deploy have none. Re-run `npm run orders:backfill-towns -- --apply` after deploying; it is safe to repeat.

**Side finding, not part of this work.** 23 sellers are stuck in Shiprocket pickup `Failed` with errors such as *"Seller pickup is missing: state, pincode"*. 14 of them are real, mapped sellers (for example "Chetak collection"), so they cannot ship through Shiprocket until the missing address fields are filled in.

---

## 17. Phase C: built

Each admin now carries a town scope. **Nothing is filtered by it yet** (that is Phase D), so this changes no behaviour for anyone.

**What was added**
- `Admin.cityScope`: `{ mode: "all" | "selected", cityIds }`. A new admin defaults to "selected" with no towns. Super Admin is never limited, whatever is stored.
- **Fail closed everywhere.** A missing, malformed or unknown scope resolves to *no towns*, never *all*. An account from before the field existed has no scope and is treated that way. (The three live admins are all Super Admin, so none is affected.)
- The scope is resolved on every request alongside permissions, so a change applies on the admin's very next request. It is returned by `GET /admin/me` and by the sign-in and refresh responses.
- System User form: a town picker (All towns / Only selected towns), with a "Select all in Rajgarh" shortcut per district, and a Towns column in the table.
- The audit log records the towns an admin was limited to when they made each request.
- A town that an admin is limited to cannot be deleted.

**Who may grant towns**
- Super Admin, and an admin granted every town, may grant anything.
- Anyone else may grant only towns they can see themselves, may not grant "all towns", may not change their own towns, and may not edit an admin who has towns they cannot see. Without this, whoever holds the System User page could widen their own limit and the limit would mean nothing.
- Resending an unchanged scope is a no-op, so saving your own form still works.

**A gap I closed while building it:** a Super Admin is stored as "all", so demoting one would have left them able to see every town. A demotion now resets the scope to none unless the same request chooses towns, and a promotion stores "all".

**Phase D must flip a switch.** The form shows a notice that town limits are saved but not enforced yet, controlled by `CITY_SCOPE_ENFORCED` in `frontend/src/modules/admin/permissions/cityScopeConfig.ts`. Set it to true in the same change that ships enforcement, and delete the notice, or the form will keep saying a working limit is not working.

**Tests:** 32 new (107 town tests, 197 backend in total): resolution and fail-closed defaults, what `/admin/me` and sign-in report, validation, every grant rule, demotion and promotion, deleting a town in use, and the audit record.

---

## 18. Phase D: built

A town-limited admin now only ever sees records in their towns. Super Admin and an admin granted every town are unaffected.

**How (a change from §5.1, which planned an explicit helper in each controller).** A Mongoose plugin on nine models adds the town condition to every query while a limited admin's request runs inside a `townScoped` route (`backend/src/services/townScope.ts`). It covers find, findOne, update, delete, count, distinct and aggregate, so a handler cannot forget to filter, and a record outside the towns simply comes back as `null`, which the existing handlers turn into a 404 (not a 403, so its existence is not revealed). With no scope the hooks do nothing, so customer and seller traffic is unchanged.

| Model | Visible when |
|---|---|
| Order, Seller | its `cityId` is in the admin's towns (an order or seller with no town is never visible to a limited admin) |
| Product | its seller is in the towns |
| Return, Commission, Shipment | its order is in the towns |
| Customer | they have an order in the towns (a customer who never ordered is not visible) |
| WalletTransaction, WithdrawRequest | a seller's only if that seller is in the towns; a delivery boy's stay visible |

**Scoped route groups:** dashboard, products, sellers (and the open seller and product pickers), orders, shipping, settlement, returns, customers, wallet, withdrawals, notifications. Everything else is declared global in `TOWN_GLOBAL_PREFIXES` (delivery, cash collection, catalogue, settings, content, administration).

**Also done**
- Platform-wide money is refused to a limited admin outright (`403 ALL_TOWNS_REQUIRED`): `/financial` and `POST /wallet/transfer`.
- A limited admin cannot broadcast to delivery boys or to "All", and cannot message a named seller or customer outside their towns. A seller or customer broadcast reaches only their towns.
- The audit log already records the towns in force (Phase C).
- The "limits are not enforced yet" notice and its flag were deleted from the System User form.

**The coverage test (§5.6)** is in `routeCoverage.test.ts`: every admin route must sit under a `townScoped` or all-towns guard, or under a prefix in `TOWN_GLOBAL_PREFIXES`. A new endpoint cannot ship without that decision, and the list cannot go stale.

**A regression from Phase 0, found and fixed here.** When the migration endpoints were locked to Super Admin the guard was applied to the whole router, which is mounted at `/admin` ahead of the withdrawals router. So every `/admin/...` request that no earlier router handled got a 401 or 403, including `GET /admin/withdrawals` for anyone but Super Admin. The frontend does not call that path, so nobody was affected, but it is now guarded per route instead.

**Tests:** 48 new for scoping (249 backend in total): every query kind on the plugin, every scoped model, every list endpoint with a positive and a negative check, by-id reads and writes, the two-town, no-town and all-towns cases, platform money, delivery, notifications, and an immediate effect when an admin's towns change.

**Found along the way, not changed**
- `PUT /admin/products/bulk-update` is unreachable: `PUT /products/:id` is registered first and swallows it. Its `Inventory` write is now limited to visible products, but nothing can call it until the order is fixed.
- Cancelling or retrying a shipment for an order the admin cannot see answers 200 with no data rather than 404. Nothing is acted on (the service finds no shipment and returns before calling Shiprocket); the message is just misleading.
- Work a request starts in the background (notifications, syncs) inherits that request's scope. For an in-scope order that is what is wanted; a job that should see every town must not be started from a limited admin's request.

**Not checked:** every admin handler's success path as a limited admin (the tests prove nothing leaks and nothing out of town changes, not that every in-town action still works), and performance beyond a few thousand orders (the ids are materialised per request).

---

## 19. Phase E: built

Frontend only. The server already filters everything (Phase D); this makes that visible and fixes what Phase D broke for limited admins.

**A Phase D break, fixed here.** The dashboard is the default landing page and loads its data in one `Promise.all` that includes the platform finance call. Phase D made that call return `403 ALL_TOWNS_REQUIRED` for an admin limited to some towns, so **their whole dashboard failed to load**. The dashboard now treats that one refusal as "no finance numbers" (any other failure still surfaces) and hides the four platform-money cards instead of showing "₹0". Phase D's tests proved nothing leaked, but not that this page still worked; it did not.

**What was added**
- **A strip under the header** (`TownScopeNotice`): "Showing data for: Biaora, Khujner" for an admin limited to towns, and an amber warning for one limited to none ("No towns are assigned to your account..."), because every list is empty for them and that otherwise looks like nothing has happened. Nothing is shown to Super Admin or an admin with every town. It stays hidden until permissions are known, so it cannot flash a false "no towns" warning at someone who has them.
- **Wallet page:** when the platform totals are refused it says so in one line instead of showing zeros; the transactions and withdrawals for the admin's towns still load.
- **Notification form:** for a limited admin, "All Users" and "Delivery" are disabled and the default moves to Seller, with a line saying why, so they are not offered something the server will refuse.

**Not done, deliberately**
- *"Limit town filters to the admin's towns."* There is none to limit. The only town filter in the admin is on Lowest Prices, a global marketing page whose city list drives which customers see a section, not which data an admin may see. Restricting it would be wrong.
- The two transfer pages (fund transfer, seller transactions) are unchanged: they already show the server's message, "This is only available to admins with access to every town."
- No frontend test framework exists in this project, so none was added; the changes were type-checked, built and linted, and **not tried in a browser**.

---

## 20. Towns across India

Built so the system can grow past Madhya Pradesh without a redesign. **Nothing in the live database changed**: a read-only check found all six existing towns by their old slugs (so no duplicate is created on the next start) and all 31 mapped sellers unaffected.

**What changed**
- **A town is its name plus its state.** Aurangabad in Maharashtra and in Bihar are two towns. A state is now required to add a town, and the same name twice in one state is refused (typed differently or not). Names and aliases may repeat across states but not within one.
- **State names are understood however they are typed.** Seller sign-up takes state as free text, so "MP", "M.P." and "madhya pradesh" all mean Madhya Pradesh (all 28 states and 8 territories, with common short forms such as "J&K" and "Orissa"). Towns store the official name.
- **One matching rule, shared** by the sign-up hook and the mapping script. A seller gets the town of that name in *their* state. If two towns share the name and the seller has no state, it is ambiguous and nothing is assigned. If the city exists only in another state, the seller is reported as a **different-state** mismatch instead of being put in the wrong state's town.
- **No cap on the town list** (it was 500).
- **The pickers**: the Towns page has a State column, a required State field with the official names offered, and search. The admin town picker groups by district *and* state, has search, and shows how many are selected; "Select all in …" acts on the towns shown.

**Limits that remain**
- Seller sign-up is still a free-text state box. It works with the short forms above, but a typo ("Madya Pradesh") leaves that seller reported as unassigned. Making it a dropdown of the official names would close this; it is a seller-app change and was not made.
- A seller edit that changes only the city does not know the state, so a name shared by two states stays unassigned until the mapping is run.
- The list still loads whole (fine to a few thousand towns; past that, search and page on the server), and the picker has no state-level "select all".
- Towns made before this change keep their name-only slug. The slug is just an identifier; nothing reads it.

**Tests:** 23 new (178 town tests, 273 backend in total), plus a parity test that fails if the Towns form's state list drifts from the backend's.

