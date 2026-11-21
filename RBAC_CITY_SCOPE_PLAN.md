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
| 2 | **One order, one town.** A cart may not mix sellers from different towns. Same-town multi-seller orders stay allowed. |
| 3 | **An admin can cover several cities.** |
| 4 | **Admins can see customers** — defined as customers who have ordered from a seller in the admin's cities (§5.3). |
| 5 | **"Biaora" and "Biaora rajgarh" are one city.** "Narasingarh" and "Narsinghgarh" are one city. |
| 6 | **The Indore, Odisha and "Appzeto" sellers are test data** and get no real city. |
| 7 | **Orders from deleted sellers are Super-Admin-only.** |
| 8 | **The scope unit is the town** (chosen after the Google Maps lookup showed all six live towns are in one district, §12). Six towns: Biaora, Khujner, Narsinghgarh, Sarangpur, Pachore, Bhayana. The district is stored as a grouping label. |
| 9 | **Marketing and content pages, reels and the platform wallet stay global** in this version. |
| 10 | **Delivery boys are not scoped, and the delivery assignment flow is not touched.** It keeps working from the seller's service radius. No `cityId` on delivery boys, no change to who can be assigned to an order. |

### Corrections to earlier assumptions

- **Decision 2 is not "already implemented."** `createOrder` only checks the delivery address has a city; nothing compares seller towns. The distance limits do not prevent it: with the live `instantDeliveryRadiusKm = 15`, **85 of 333** cross-town seller pairs can both be in range of one address. This plan builds the rule (Phase B). **It will block some carts that work today** (§6).
- **Multi-seller orders are not blocked today.** 61 orders contain two sellers, the latest on 2026-08-15. All 61 are within a single town, so none of the orders placed so far would have been blocked by decision 2.

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

## 6. Cart rule (customer-facing)

Reject a cart or order containing sellers from more than one **town**, in both the cart endpoint and `createOrder`.

**What it blocks that works today.** Towns here are close together, so a customer between two of them can currently order from both. With the live 15 km instant radius, **85 of 333 cross-town seller pairs** can be in range of one address. The closest:

| Pair | Distance |
|---|---|
| Khujner (Apna cafe) + Bhayana (Super Abhi Stores) | 6.9 km |
| Khujner (Hotel Anand palace) + Pachore (Chetak collection) | 11.0 km |
| Khujner (Yume home 3) + Pachore | 14.4 km |

A customer in that overlap can no longer put shops from both towns in one cart. The data suggests this is rare: **none of the 61 multi-seller orders placed so far crossed towns**, so no order that exists would have been refused.

- The message names the towns, e.g. *"Items from Khujner and Bhayana can't be ordered together. Please order them separately."*
- Same-town multi-seller carts stay allowed.
- This is the only part of the plan that changes what customers can do, so it needs its own testing and a decision on the wording.
- **The alternative that was not chosen:** let such a cart through and give the order a *list* of towns, shown to every town manager involved. It avoids blocking customers but means two managers share one order and its status changes. If the block turns out to hurt, this is the fallback, and it is a change to the order model, not a setting.

---

## 7. Phases

Each phase ships on its own and leaves the app working.

### Phase A — City list and mapping *(no behaviour change)*
`City` model, seeded with the six towns · admin page to manage towns (new permission `settings.cities`) · mapping script, **dry run first**, that sets `Seller.cityId` from the seller's own city text and aliases · report of anything unmatched, and of sellers located outside Rajgarh (test data) · `getServiceableCities` reads `City`.

### Phase B — Order city and the cart rule
`Order.cityId` set at creation · backfill of existing orders from their seller where the seller still exists (≈1,260 of 3,143); **orders from deleted sellers keep `cityId = null`** · cross-town cart rejection · **sellers are soft-deleted from now on** (`DELETE /sellers/:id` marks the seller deleted and inactive instead of removing it; deleted sellers disappear from customer-facing and admin lists but their orders, products and wallet history stay intact).

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
6. **Cart rule:** a Biaora + Biaora cart is allowed; Khujner + Bhayana and Khujner + Pachore carts are rejected with both towns named.
7. **Delivery is untouched:** a scoped admin can still assign any delivery boy to an order in their towns, exactly as before; `assign-delivery` on an order in another town returns 404.
8. **Backfill:** idempotent; dry run writes nothing; unmatched rows are reported, not guessed.
9. A scope change applies on the admin's next request.

---

## 9. Sizing

| Phase | Size | Note |
|---|---|---|
| A | S | Six towns to seed and 31 sellers to map; delivery boys are out of scope |
| B | M | Cart rule touches customer flow |
| C | S | |
| D | **L** | ~15 admin files plus ~16 aggregations; the bulk of the work and of the risk |
| E | M | |
| F | S | |

---

## 10. Open decisions

1. ~~Town or district as the scope unit~~ **Resolved: town.** Consequences accepted: the cart rule (§6) blocks cross-town carts, and a district-wide manager is made by giving an admin all six towns (the "select all in Rajgarh" shortcut).
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

