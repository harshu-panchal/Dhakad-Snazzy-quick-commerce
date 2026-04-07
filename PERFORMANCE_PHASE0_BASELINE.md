# Phase 0 Performance Baseline

This document captures the current baseline before any further performance work.

Rule for all next phases:
- Do not change functionality.
- Do not change business logic.
- Do not change location-based availability behavior.
- Do not break cart, wishlist, checkout, auth, or notification flows.

## Workspace State

Current workspace is not clean. Existing modified files:
- `backend/package-lock.json`
- `backend/package.json`
- `backend/src/modules/customer/controllers/customerHomeController.ts`
- `backend/src/server.ts`
- `backend/src/utils/locationHelper.ts`
- `frontend/src/App.tsx`
- `frontend/src/context/CartContext.tsx`
- `frontend/src/modules/user/Home.tsx`
- `frontend/src/modules/user/components/CategoryTileSection.tsx`
- `frontend/src/modules/user/components/FeaturedThisWeek.tsx`
- `frontend/src/modules/user/components/LowestPricesEver.tsx`
- `frontend/src/modules/user/components/ProductCard.tsx`
- `frontend/src/modules/user/components/SimilarProducts.tsx`

## Build Baseline

Verified on current workspace:
- Frontend build: passes
- Backend build: passes

Observed frontend production build time:
- Approx. 57.30s on current machine

## Frontend Bundle Baseline

`frontend/dist/assets` summary:
- Asset file count: `204`
- Total shipped asset size: `14.59 MB`
- Total JS size: `4.10 MB`
- Total CSS size: `109.8 KB`
- Total media size: `10.39 MB`

Largest shipped assets:
- `deliveryIcon-CwMYUwjD.png`: `2135.9 KB`
- `dhakadsnazzy1-C20mRyCG.png`: `1617.9 KB`
- `dhakadsnazzy1.png`: `1617.9 KB`
- `dhakadsnazzy2.png`: `1557.0 KB`
- `index-CrNEcJ24.js`: `765.9 KB`
- `chart-vendor-C0MM8FCz.js`: `570.6 KB`
- `SellerOrderDetail-D0-s4bzB.js`: `397.2 KB`
- `map-vendor-DyZOjEVd.js`: `300.9 KB`

Key route chunks:
- `Checkout-DB3E4Sy4.js`: `67.50 KB`
- `CheckoutAddress-CRdw12f5.js`: `13.97 KB`
- `ProductDetail-C1TRtTyG.js`: `26.02 KB`

## Source Asset Baseline

`frontend/assets` summary:
- Source asset file count: `3187`
- Total source asset size: `257.36 MB`

Implication:
- The shipped build is much smaller than the source asset tree, but the source media library is still large enough to create maintenance and accidental-bloat risk.

## Request-Heavy Frontend Paths

### 1. Wishlist duplication risk

Per-card wishlist fetch still exists here:
- `frontend/src/modules/user/components/ProductCard.tsx:55`

Other wishlist fetch paths:
- `frontend/src/hooks/useWishlist.ts:20`
- `frontend/src/modules/user/Wishlist.tsx:45`

Risk:
- On product-listing screens with many `ProductCard` instances, this can trigger many duplicate `/customer/wishlist` requests.

### 2. Home page background preload

Main home fetch:
- `frontend/src/modules/user/Home.tsx:64`

Background preload logic:
- `frontend/src/modules/user/Home.tsx:107`
- `frontend/src/modules/user/Home.tsx:117`
- `frontend/src/modules/user/Home.tsx:119`
- `frontend/src/modules/user/Home.tsx:132`
- `frontend/src/modules/user/Home.tsx:140`

Risk:
- After initial home load, more `getHomeContent(...)` calls are fired for additional header categories.
- This adds background CPU, JSON parsing, and network pressure.

### 3. App startup work

Push notification startup work:
- `frontend/src/App.tsx:298`
- `frontend/src/App.tsx:299`
- `frontend/src/App.tsx:302`

Serviceability check on layout:
- `frontend/src/components/AppLayout.tsx:32`
- `frontend/src/components/AppLayout.tsx:36`

Risk:
- Startup does more than render visible UI.
- WebView environments may magnify this cost.

### 4. Product detail fetch

Product detail load:
- `frontend/src/modules/user/ProductDetail.tsx:58`

Risk:
- Product detail is now lazy-loaded, which helps startup, but product fetch plus image-heavy rendering still matters for perceived speed.

## Current Safety Constraints For Phase 1+

These behaviors must remain unchanged:
- Same products visible for same location
- Same seller availability and serviceability logic
- Same cart totals and cart sync behavior
- Same wishlist behavior and auth redirect behavior
- Same checkout and order creation behavior
- Same route access and role-based flow behavior

## Comparison Checklist For Future Phases

Before and after each phase, compare:
- Frontend build passes
- Backend build passes
- Home page still shows same sections
- Category and product listing still show same products
- Product detail still opens correctly
- Cart add/update/remove still works
- Wishlist add/remove and heart state still works
- Checkout still works
- Location-based availability still matches previous behavior

## Recommended Baseline Test Flows

Use the same account, same location, same network whenever possible.

User flows:
- Open home page
- Open one category page
- Open one product detail page
- Add product to cart
- Increase and decrease quantity
- Open wishlist
- Open checkout

Measure if possible:
- Home load time
- Product detail open time
- Number of wishlist requests on listing pages
- Number of `getHomeContent` requests after home page load

## Phase 0 Conclusion

Phase 0 is complete when this file is used as the reference for all next changes.

Primary no-functionality-change focus for next phase:
- Remove unsafe or misleading optimizations
- Keep safe optimizations
- Avoid touching business behavior while reducing duplicate work
