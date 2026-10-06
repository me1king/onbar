# Online Bar OS: Product Inventory and Sale Readiness

**Review date:** 6 October 2026
**Scope:** Current repository source, configuration references, SQL scripts, and available local checks. This is not a test of the hosted Supabase project or deployed providers.

## Executive summary

Online Bar is a Next.js storefront and retail-operations platform backed primarily by Supabase, with an Android admin-oriented WebView companion. Its strongest product story is a connected customer storefront plus a large operations console: catalog and checkout, inventory, order operations, analytics, marketing/CRM, suppliers and merchants, and rider dispatch.

The repository contains many real screens and server/database flows, but source code is not the same as a live, production-ready service. Features depending on Supabase SQL, secrets, verified provider accounts, or outside configuration are conditional until those are installed and exercised in the target deployment. This scan did not query production Supabase, test live payment/webhook flows, or verify provider credentials.

**Best truthful positioning today:** a feature-rich, configurable retail and delivery-operations software foundation, with some production-oriented integrations and important end-to-end work still required before selling it as turnkey SaaS.

## What the software contains

### 1. Customer storefront and commerce

- Storefront home, product/catalog browsing, product detail pages, category listings, snack/bite/beverage/souvenir sections, search, wishlist, cart, reviews, related items, pairing suggestions, and product content.
- Product imagery and product-detail experiences, including a 3D viewer component in the web source.
- Customer registration/login and onboarding for profile details, interests, and preferences.
- Checkout captures customer/contact information, delivery region and map pin coordinates, optional delivery details, gifting details, coupon and points choices, and order contents.
- Customer order tracking looks up orders and subscribes to order updates through Supabase Realtime.
- Customer account/profile areas include order history, loyalty/rewards, referrals, profile preferences, support, and privacy/marketing preference surfaces.
- Public content includes blog/knowledge-base pages, Buzz event discovery, venue/event details, newsletter subscription/unsubscribe, contact and policy pages.

Key source examples: [app/page.tsx](./app/page.tsx), [app/shop/page.tsx](./app/shop/page.tsx), [app/product/[productId]/page.tsx](./app/product/[productId]/page.tsx), [app/checkout/page.tsx](./app/checkout/page.tsx), [app/track/page.tsx](./app/track/page.tsx), [app/profile/page.tsx](./app/profile/page.tsx), and [app/buzz/page.tsx](./app/buzz/page.tsx).

### 2. Admin and business operations

The protected admin application has a broad navigation surface, including:

- **Commerce operations:** dashboard, orders, manual orders, tasks, kitchen, hubs, and delivery dispatch.
- **Catalog and inventory:** product upload/cellar, product forge/edit/dossiers, beverage inventory, bites/food, munchies, souvenirs, images, and stock controls.
- **Merchant and supply operations:** merchant applications/reviews, merchant details, vendors, suppliers, sourcing, traceability, inventory lots, fulfilment, and incidents.
- **Customer operations:** customer directory and customer profiles/360, support/messages, reviews/ratings, subscribers, and abandoned carts.
- **Growth and communications:** campaigns, audiences, broadcasts, coupons, referrals/affiliates, newsletter, Buzz, content/blog, social-account status, growth calendar, autopilot rules, experiments, A/B testing, automation, gamification, popups, and mobile widgets.
- **Reporting and governance:** finance/ledger, payouts, analytics, behavioral dashboards, funnels, live activity, demand intelligence, audit logs, security, staff/RBAC, settings, warranty, and vault.

Admin navigation and permissions are organized in [app/admin/(dashboard)/layout-client.tsx](./app/admin/(dashboard)/layout-client.tsx). Available screens do not guarantee every metric is populated or every provider operation is active.

### 3. Merchant, supplier, venue, and affiliate surfaces

- Merchant onboarding and admin review; business/location details and document requirements; merchant inventory batch and order traceability foundations.
- Supplier pages for proposed products and inventory-related workflows.
- Venue manager portal and venue/Buzz pages.
- Affiliate registration/dashboard, referral activity, and payout request capabilities.

These areas have substantial UI/schema/API foundations, but do not constitute a complete marketplace settlement product: merchant approvals are manual, merchant payout account details are not modeled, and supplier purchasing/settlement workflows are incomplete. The venue dashboard presents some performance measures as unavailable, and certain visible controls are not wired to actions.

Key sources: [app/merchant/onboarding/page.tsx](./app/merchant/onboarding/page.tsx), [app/supplier/dashboard/page.tsx](./app/supplier/dashboard/page.tsx), [app/venue/dashboard/page.tsx](./app/venue/dashboard/page.tsx), [app/affiliate/dashboard/page.tsx](./app/affiliate/dashboard/page.tsx), and [supabase/MERCHANT_OPERATIONS_MIGRATION.sql](./supabase/MERCHANT_OPERATIONS_MIGRATION.sql).

### 4. Riders and delivery operations

- Rider onboarding, dashboard, mission UI, online/offline presence, browser GPS sync, status progression, wallet/earnings/performance surfaces.
- Admin-reviewed dispatch recommendations based on payment/merchant checks, rider status, GPS freshness, workload and other ranking inputs.
- Order-status history, delivery milestone timestamps, route estimate schema, and a server-side rider transition function are represented in the current source/migrations.

**Not yet a complete live delivery-intelligence service:** route estimates are not fully wired into the paid-order assignment/customer ETA path, dispatch still relies on straight-line proximity in parts of its ranking, live customer map tracking and delay alerts are not established, and no tested road-traffic ETA should be promised.

Critical rider caveats are listed under **Before selling as turnkey** below.

Key sources: [app/admin/(dashboard)/dispatch/page.tsx](./app/admin/(dashboard)/dispatch/page.tsx), [app/api/admin/dispatch/route.ts](./app/api/admin/dispatch/route.ts), [app/rider/dashboard/page.tsx](./app/rider/dashboard/page.tsx), [lib/engines/routingEngine.ts](./lib/engines/routingEngine.ts), and [supabase/DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql](./supabase/DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql).

### 5. Analytics, CRM, retention, and intelligence

- Customer profile/order history and aggregate behavioral/customer metrics.
- Website analytics events and session/activity views; product/search/cart/checkout activity tracking.
- Consent preference and consent audit schema; in-app campaign delivery records; newsletter unsubscribe support.
- Demand intelligence and waitlist workflows intended to use customer-consented, approximate area-level location.
- Recommendations, concierge and AI-assisted product/content experiences.

The analytics and CRM depend on compatible database schema and real event data. An “AI” screen or metrics widget should not be sold as predictive AI or proven attribution unless its upstream model/provider/data is configured and tested.

### 6. Android companion application

The Android Gradle project contains a Jetpack Compose app shell with:

- An admin WebView and biometric gate.
- Camera barcode scanner and on-device image-labeling “triage.”
- A location foreground-service implementation.
- Firebase messaging service code.
- Home-screen widget configuration/fetch/update components.
- QR-code generation utility.

It is an admin-oriented WebView companion with native utilities, **not** a separate native customer shopping app. Several integrations in its source are not connected end to end; see below.

Key sources: [MainActivity.kt](./app_android/src/main/java/com/example/theapp/MainActivity.kt), [ScannerActivity.kt](./app_android/src/main/java/com/example/theapp/ScannerActivity.kt), [LocationService.kt](./app_android/src/main/java/com/example/theapp/LocationService.kt), and [AndroidManifest.xml](./app_android/src/main/AndroidManifest.xml).

## Architecture and included assets

- Web: Next.js **15.5.25**, React **19**, TypeScript **5.9**, Tailwind CSS 4.
- Data/auth: Supabase JS client; Postgres schema/functions/RLS are supplied as SQL scripts.
- Android: Kotlin, Jetpack Compose, WebView, CameraX/ML Kit, biometric, location, Firebase messaging and WorkManager dependencies.
- Other packages include Leaflet maps, Google Maps SDK, Recharts, Three.js/React Three Fiber, Paystack/Resend-related integrations and PDF tools.
- Release automation in GitHub Actions creates a GitHub Release for `v*` tags; it is not a full CI/test/deployment pipeline.
- The repository includes a large local `supabase/` schema and add-on SQL collection, including the existing-project one-file bundle. SQL scripts are applied manually in Supabase SQL Editor; they do not self-deploy.
- The root README is effectively empty; [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) is the main operational setup document.

## Live-provider boundaries

| Capability | What source supports | What must be configured/verified |
|---|---|---|
| Store data and auth | Supabase browser/server clients and extensive SQL | Correct project URL/keys, deployed schema, RLS, storage, and auth settings |
| Online card checkout | Paystack checkout, server-side reference/amount checks, signed webhook | Public/secret keys, live Paystack account/webhook URL, successful test transactions |
| M-Pesa | Checkout UI labels an option “M-Pesa” | **No direct M-Pesa Daraja STK integration was found**; label/provider status is not proof |
| Email | Resend campaign/newsletter plumbing | API key, verified sender, audience ID where used, consent and deliverability tests |
| WhatsApp | Outbound Meta Cloud API sender | Token and phone-number ID; webhook hardening is still required |
| AI | Gemini concierge and optional AI product/content endpoints | Valid provider keys; concierge has a canned offline response when not configured |
| Maps/routing | Google Maps and Routes client code | Correct Maps/Routes key, API enablement/billing, routing integration and verified ETA outputs |
| Instagram/Facebook publishing | UI and publisher abstraction | **OAuth, token lifecycle, publishing calls, and successful delivery are not implemented end to end** |
| SMS campaigns | Some messaging UI/schema language | **No configured SMS provider or delivery implementation found** |

Environment-variable **names referenced by code** (names only; no secret values): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `RIDER_SESSION_SECRET`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_AUDIENCE_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_BASE_URL`, and `OB_IMMUTABILITY_SECRET`.

Public keys and server secrets have different exposure rules. Keep `SUPABASE_SERVICE_ROLE_KEY`, payment/provider secrets, and signing secrets in private server environment configuration—never in `NEXT_PUBLIC_*` variables or the sale package.

## Before selling as turnkey software

These are material release blockers or due-diligence items, not cosmetic polish:

1. **Unify and test rider authentication.** The rider login page uses a legacy OTP flow that does not send real SMS and returns a development OTP only in development. The mission, GPS and delivery APIs require a separate HMAC-signed phone/PIN session. The login UI is not wired to that signed-session endpoint, so the rider dashboard’s server APIs cannot be assumed to work for a real rider.
2. **Fix Android GPS integration.** Native [LocationService.kt](./app_android/src/main/java/com/example/theapp/LocationService.kt) posts to `onlinebar.co.ke` and sends the rider token in JSON; the current server endpoint expects a Bearer authorization header and uses `lat`, `lng`, `battery`. The app’s WebView origin is separately set to `onlinebar.onrender.com`. Confirm domains and align the Android client/server contract.
3. **Verify every Supabase migration on a clean test project and on an existing-schema clone.** The repository has SQL scripts, not a checked-in ordered Supabase migration history. The all-in-one script is only for an already-installed core schema and is not evidence that the customer’s hosted database has been migrated.
4. **Complete payment-provider acceptance testing.** Test Paystack success, cancellation, duplicate/out-of-order webhooks, refunds/failures and production amount/reference reconciliation. Do not market the existing checkout label as direct M-Pesa support.
5. **Harden WhatsApp inbound webhook.** The webhook has a predictable default verification token and does not verify Meta request signatures for inbound POST callbacks.
6. **Correct health/readiness claims.** `/api/ready` returns `READY` without checking dependencies. The broader health endpoint checks only a subset of critical services.
7. **Make marketing consent and sending policy explicit.** Newsletter subscription format validation alone is not proof of opt-in; no double opt-in/rate limiting was found. Separate implemented Resend email and consent-aware in-app messages from unsupported SMS, scheduled automation, and social publishing claims.
8. **Qualify analytics/AI claims.** Verify actual data quality, permissions, time windows and formulas. Avoid promising campaign attribution, traffic-aware delivery ETAs, autonomous operations, or predictive models without evidence.
9. **Set deployment and ownership terms.** The web app, Android app, backend credentials, Supabase project, provider accounts, domain, data, and ongoing operating costs must be assigned/transferable in the sale. No root `LICENSE` file was found; have counsel review source ownership, third-party dependency licenses, brand/media rights and the transaction agreement.
10. **Add release engineering.** The package has build/dev/start/lint scripts but no web test script; no meaningful web test suite was found in the product source. Android test sources are template smoke tests. Establish repeatable CI, migration backup/rollback procedure, monitoring, staging, support, and restore drills.

## Checks and confidence

- `npx tsc --noEmit`: passed in this checkout.
- `git diff --check`: passed.
- A production Next.js build had previously completed successfully in this checkout; it emitted a multiple-lockfile workspace-root warning. The current scan did not contact production services.
- No web application test script or meaningful web test suite was found. The only Android unit test inspected is the generated `2 + 2` example.
- The worktree contains many uncommitted changes. None of this report establishes that those edits are committed, deployed, or applied to the hosted Supabase database.

## Sale summary

**What you can sell honestly:** the software source/IP (subject to ownership and dependency review), an extensible retail storefront and operations console, and substantial Supabase-backed foundations for inventory, ordering, customers, merchant workflows, analytics, marketing, and dispatch.

**Do not sell as already proven:** turnkey multi-tenant SaaS, live M-Pesa Daraja, fully automated merchant payouts, fully connected rider mobile operations, traffic-aware delivery ETA, SMS/social campaign delivery, or audited enterprise production security. First close the integration, database deployment, security, testing, licensing, and operations items above.
