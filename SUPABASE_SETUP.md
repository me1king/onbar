# Online Bar Setup Guide

Use this guide to configure the Supabase database and the external services used by the application.

## Supabase setup

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new).
2. Copy [`supabase/FINAL_ESTABLISHMENT_SQL.sql`](./supabase/FINAL_ESTABLISHMENT_SQL.sql).
3. Paste and run the script to create the application tables and views.

Configure `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment. Both variables must contain Supabase project values; a Supabase `sb_publishable_...` key is valid and is not a Stripe key. Never put a Supabase `service_role` key in a `NEXT_PUBLIC_` variable or expose it to the browser. Restart the development server after changing local environment variables.

For an existing database, run the `ALTER TABLE public.orders` migration block in the script's **Operations & Logistics** section to add gift-card details to existing orders. Do not re-run the entire setup script on a live database just to apply that migration.

For the current delivery, audience, and analytics features on an already configured database, run [`supabase/OPERATIONAL_FEATURES_MIGRATION.sql`](./supabase/OPERATIONAL_FEATURES_MIGRATION.sql) in the SQL Editor. It adds the souvenir fields and reporting functions used by the admin screens without re-running the full setup script. It also creates the notification templates, private per-customer notification inbox/log, and Realtime publication entries used by the popup manager and in-app alerts. Campaign-channel foreign keys are created to match the existing campaign ID type; if an older channel table has rows with a different ID type, missing campaign links, or references to missing campaigns, the migration stops rather than discarding or guessing at those links.

For the Governance Center on an existing database, also run [`supabase/GOVERNANCE_MIGRATION.sql`](./supabase/GOVERNANCE_MIGRATION.sql). This installs the consent and data-quality tables and repairs the consent record ID on older schemas. Consent rows are protected with row-level security, and integrity alerts are only readable through the authenticated admin server endpoint.

For the admin lockdown switch and Smart Autopilot rule registry on an existing database, run [`supabase/ADMIN_CONTROLS_MIGRATION.sql`](./supabase/ADMIN_CONTROLS_MIGRATION.sql). The lockdown endpoint and autopilot editor require `SUPABASE_SERVICE_ROLE_KEY` configured on the server; it must never use a `NEXT_PUBLIC_` variable. Autopilot slots create content drafts only and do not publish to social platforms.

After the core schema is installed by [`supabase/FINAL_ESTABLISHMENT_SQL.sql`](./supabase/FINAL_ESTABLISHMENT_SQL.sql), run [`supabase/AUTH_SECURITY_MIGRATION.sql`](./supabase/AUTH_SECURITY_MIGRATION.sql) for server-side authentication attempts, brute-force alerts, blocked origins, and protected audit records. The migration checks that the required `staff` and `audit_logs` tables exist before changing anything, and adds missing columns to an existing `ip_blacklist` table. Set `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and preferably a separate high-entropy `ADMIN_SESSION_SECRET` only in the server environment. The key must not be prefixed with `NEXT_PUBLIC_`. Authentication and audit APIs return an explicit setup error until the migration and server key are in place.

For production admin login on Render, open the `onlinebar` web service, go to **Environment**, and set `ADMIN_PASSWORD` to the owner PIN and `ADMIN_SESSION_SECRET` to a separate high-entropy random secret. Also configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for server-side authentication checks. Save the environment changes and redeploy the service. Keep all secret values in Render's private environment settings; do not commit them or add a `NEXT_PUBLIC_` prefix to secrets.

For customer-visible storefront announcements and private replies to support messages, run [`supabase/CUSTOMER_MESSAGING_MIGRATION.sql`](./supabase/CUSTOMER_MESSAGING_MIGRATION.sql). This adds the announcement table and a hashed access token for guest support threads. Admin broadcasts published in the In-App channel appear on customer storefronts; support replies are available in the customer support bubble on the submitting device, and on other devices when the customer is signed in.

For affiliate applications, approval, referral performance, and payout requests on an existing database, run [`supabase/AFFILIATE_PROGRAM_MIGRATION.sql`](./supabase/AFFILIATE_PROGRAM_MIGRATION.sql). Affiliate dashboards and application decisions use authenticated server APIs; the migration installs the affiliate records, private read policies, and an atomic payout request function. The existing program defaults are 5% commission and a KSh 1,000 minimum payout. Payout requests are reviewed and paid manually by an authorized admin.

For accurate admin behavioral metrics on an existing database, run [`supabase/BEHAVIOR_METRICS_MIGRATION.sql`](./supabase/BEHAVIOR_METRICS_MIGRATION.sql). Until it is applied, the behavior dashboard can show legacy traffic and cart metrics, but active engagement time remains unavailable. The migration starts a clean active-time measurement baseline because earlier stored session durations could be reset or missed, and changes add-to-bag rate to distinct visitor sessions that added a product divided by distinct sessions with a page view. Daily metrics use the Africa/Nairobi calendar day. The engagement average uses only visible-session time recorded on that day and sessions with at least one active heartbeat. The admin endpoint uses the server-only Supabase service-role key.

For consented area-level location, market waitlists, and Admin → Demand Intelligence on an existing database, run [`supabase/DEMAND_INTELLIGENCE_MIGRATION.sql`](./supabase/DEMAND_INTELLIGENCE_MIGRATION.sql). The storefront asks customers to share an approximate area or enter one manually; declining does not block shopping. Browser coordinates are rounded before area matching and are not stored in the new location tables. Joining an uncovered area's waitlist requires a separate contact-consent checkbox. The migration creates private, service-role-only location and waitlist tables and the aggregate RPC used by the authorized admin endpoint. Set `SUPABASE_SERVICE_ROLE_KEY` only in the server environment. Apply this migration after the core setup script, then refresh Admin → Demand Intelligence.

For the merchant application and verification pipeline, run [`supabase/MERCHANT_OPERATIONS_MIGRATION.sql`](./supabase/MERCHANT_OPERATIONS_MIGRATION.sql) after the core setup script. It creates the merchant application and append-only review history, assigns permanent merchant IDs on approval, provisions a private document bucket, and installs the initial batch, inventory-movement, order trace, fulfilment, incident, and batch-hold tables. Merchant applicants use `/merchant/onboarding`; authorized admins review applications and configure the document checklist by business type and county in Admin → Merchant Onboarding. Admin → Traceability & Incidents can receive lots, link batches to order items, record fulfilment/incident events, and hold inventory. When a product has merchant-tracked batches, checkout automatically allocates available, unexpired stock from approved merchants; held, expired, suspended-merchant, or insufficient tracked stock fails closed, while products without tracked batches retain the existing checkout behavior. Uploaded documents are private and are delivered to reviewers only through short-lived signed URLs. Applications do not collect payout account details or become active automatically. The new operational tables are service-role-only; do not add anonymous or general authenticated access policies.

For mobile widget management on an existing database, run [`supabase/MOBILE_WIDGETS_MIGRATION.sql`](./supabase/MOBILE_WIDGETS_MIGRATION.sql). Admin widget changes require `SUPABASE_SERVICE_ROLE_KEY` on the server; published widget configuration is read by the server API and only currently active published widgets are exposed.

For meal extras on an existing database, run [`supabase/FOOD_ADDONS_MIGRATION.sql`](./supabase/FOOD_ADDONS_MIGRATION.sql). Admins can manage names and prices in Admin → Bites; customers can select active extras before adding a meal, and selected extras are stored on the order item. The migration creates/configures the public-read `onlinebar-assets` Storage bucket with an 8 MB image limit. Food photo uploads are performed by an authenticated admin API using the server-only service-role key; no browser upload permission is needed.

### Delivery coverage and customer location

- In **Admin → Settings → Operations**, draw and save named free-delivery areas. Each boundary needs at least three points.
- Checkout asks for device location only after the customer chooses to use it. Customers can set the pin manually instead; coverage is determined from the saved area boundaries.
- Customer-demand clusters in Admin use approximate, rounded pins from paid and delivered orders; they are not live visitor tracking.

### Souvenir image uploads

Run [`supabase/FOOD_ADDONS_MIGRATION.sql`](./supabase/FOOD_ADDONS_MIGRATION.sql) to create the public `onlinebar-assets` image bucket with an 8 MB upload limit. Allow public image reads and restrict uploads/deletes to authenticated admins using your existing admin storage policies. Do not enable unrestricted anonymous uploads. Keep any pre-existing image bucket in place so product records that still reference its public URLs continue to load.

### Campaigns and marketing data

Campaigns are stored as drafts and are not sent to external platforms. Delivery, open-rate, attribution, and A/B experiment figures remain unavailable until a publishing provider and the corresponding tracking are connected. Audience reach is calculated from customer profiles and paid/delivered orders.

### Paystack Checkout

Set `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` to your Paystack public key in the deployment environment. Online checkout requires the customer to provide a valid email address; the app no longer substitutes a demo email or an embedded payment key. Cash on Delivery does not require an email address.

## Admin integrations

- AI product descriptions require `GOOGLE_GEMINI_API_KEY` or `OPENAI_API_KEY`. If neither provider is configured or generation fails, the app reports that the description is unavailable instead of generating a template.
- Social publishing is not available until platform publishing APIs are configured. Requests currently return an unavailable response and are not recorded as published posts.

## 🛡️ Identity & Access Recovery

If you are experiencing the `AuthRetryableFetchError` or "Identity already exists" issues:

1. **Verify your environment**: Confirm the Supabase project URL and either the publishable key (`sb_publishable_...`) or legacy anon JWT are set correctly. A Supabase publishable key is not a Stripe key.
2. **Reset Auth Cache**: If you see "Identity already exists", use the **Switch to Vault Login** button I've integrated into the Auth Form.
3. **Identity Stitching**: The system now automatically links your anonymous browsing session to your profile upon login.

## 🏗️ Technical Integrity Audit

After running the SQL, verify these core connections:

| Node | Frontend Page | Backend Table |
| :--- | :--- | :--- |
| **Concierge** | `/` (Hero) | `system_widgets` |
| **Stock Cellar** | `/admin/forge` | `products` |
| **City Pulse** | `/buzz` | `pulse_posts` |
| **Audit Logs** | `/admin/audit` | `audit_logs` |
| **Treasury** | `/admin/finance` | `financial_ledger` |

## Troubleshooting

If the webapp feels slow:
1. Delete your `.next` folder to clear the corrupted build cache.
2. Restart your development server (`npm run dev`).
