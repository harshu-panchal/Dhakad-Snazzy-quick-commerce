# Phase 6: Flutter Wrapper Validation

This phase does not change runtime functionality.

Purpose:
- determine whether the remaining slowness is primarily from the web app itself or from the Flutter wrapper / WebView layer
- keep all user-facing behavior unchanged

Current repository status:
- this workspace contains only the web app and backend
- no Flutter wrapper source was found in this repository
- no `pubspec.yaml`, `.dart` files, or Flutter WebView implementation files were found

## What Was Verified In This Repo

Safe verification only:
- no application logic was changed in this phase
- no API contracts were changed
- no frontend or backend behavior was changed

Relevant performance state after earlier phases:
- duplicate per-card wishlist fetching was removed
- aggressive home preloading was removed
- image loading was made more conservative
- push/Firebase startup work was deferred off the initial critical path

## What Still Needs To Be Compared On Device

Run these tests on the same physical phone:
- same account
- same network
- same location permission state
- same app version / same deployed web build

Compare:
1. Mobile browser
   - open the deployed site directly in Chrome
2. Flutter wrapped app
   - open the same flow in the installed app

Record these timings:
- cold start to first visible home content
- time until products are visible on home
- time to open a product detail page
- scroll smoothness on home
- scroll smoothness on category/product listing pages
- response time after tapping add-to-cart
- response time after tapping wishlist

## Decision Rules

If mobile browser is fast and Flutter app is slow:
- the wrapper / WebView is the main remaining bottleneck

If both mobile browser and Flutter app are slow:
- the web app is still the main bottleneck

If both are acceptable but Flutter is only slightly slower:
- the remaining difference is likely normal WebView overhead

If only cold start is slow but in-app navigation is fine:
- startup initialization and WebView bootstrap are the likely cause

If scrolling is specifically much worse in Flutter:
- WebView rendering/compositing is the likely cause

## What To Check In The Flutter Wrapper

Once the Flutter repo is available, inspect:
- which package is used:
  - `webview_flutter`
  - `flutter_inappwebview`
- whether JavaScript is enabled correctly
- whether DOM storage is enabled
- whether hardware acceleration is enabled
- whether the app forces software rendering
- whether there is a heavy splash/loading bridge before showing the WebView
- whether multiple WebViews are being recreated instead of reusing one
- whether cache mode or debugging flags are slowing startup
- whether pull-to-refresh / navigation delegates are doing extra work

Android-specific checks:
- WebView version on the device
- `android:hardwareAccelerated="true"`
- no unnecessary `clearCache` / `clearHistory` on launch
- no repeated `loadUrl` calls on first screen mount

iOS-specific checks:
- `WKWebView` configuration
- content process not being recreated unnecessarily
- no repeated reload on foreground / resume

## Recommended Manual Test Matrix

Test each in browser and wrapper:
- Home cold open
- Home second open
- Category page open
- Product detail open
- Wishlist toggle
- Add to cart
- Scroll through image-heavy sections

For each test, record:
- browser result
- wrapper result
- notes on jank, delay, blank time, or input lag

## Exit Criteria For Phase 6

Phase 6 is considered complete when:
- browser vs wrapper comparison has been run on at least one target device
- we can clearly say one of:
  - remaining issue is mostly web-app-side
  - remaining issue is mostly Flutter-wrapper-side
  - remaining slowdown is within acceptable WebView overhead

## Next Step

If the Flutter wrapper repo is shared, the next safe step is:
- inspect its WebView setup
- recommend only non-functional performance changes
- avoid any navigation or business-logic changes
