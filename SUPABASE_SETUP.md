# Online Bar Setup Guide

Use this guide to configure the Supabase database and the external services used by the application.

## Supabase setup

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new).
2. Copy [`supabase/FINAL_ESTABLISHMENT_SQL.sql`](./supabase/FINAL_ESTABLISHMENT_SQL.sql).
3. Paste and run the script to create the application tables and views.

Configure `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment. Both variables must contain Supabase project values; a Supabase `sb_publishable_...` key is valid and is not a Stripe key. Never put a Supabase `service_role` key in a `NEXT_PUBLIC_` variable or expose it to the browser. Restart the development server after changing local environment variables.

For an existing database, run the `ALTER TABLE public.orders` migration block in the script's **Operations & Logistics** section to add gift-card details to existing orders. Do not re-run the entire setup script on a live database just to apply that migration.

For the current delivery, audience, and analytics features on an already configured database, run [`supabase/OPERATIONAL_FEATURES_MIGRATION.sql`](./supabase/OPERATIONAL_FEATURES_MIGRATION.sql) in the SQL Editor. It adds the souvenir fields and reporting functions used by the admin screens without re-running the full setup script. It also creates the notification templates, private per-customer notification inbox/log, and Realtime publication entries used by the popup manager and in-app alerts. Campaign-channel foreign keys are created to match the existing campaign ID type; if an older channel table has rows with a different ID type, missing campaign links, or references to missing campaigns, the migration stops rather than discarding or guessing at those links.

For the Governance Center on an existing database, also run [`supabase/GOVERNANCE_MIGRATION.sql`](./supabase/GOVERNANCE_MIGRATION.sql). This installs the consent and data-quality tables. Consent rows are protected with row-level security, and integrity alerts are only readable through the authenticated admin server endpoint.

For the admin lockdown switch and Smart Autopilot rule registry on an existing database, run [`supabase/ADMIN_CONTROLS_MIGRATION.sql`](./supabase/ADMIN_CONTROLS_MIGRATION.sql). The lockdown endpoint and autopilot editor require `SUPABASE_SERVICE_ROLE_KEY` configured on the server; it must never use a `NEXT_PUBLIC_` variable. Autopilot slots create content drafts only and do not publish to social platforms.

For accurate admin behavioral metrics on an existing database, run [`supabase/BEHAVIOR_METRICS_MIGRATION.sql`](./supabase/BEHAVIOR_METRICS_MIGRATION.sql). This starts a clean active-time measurement baseline because earlier stored session durations could be reset or missed, and changes add-to-bag rate to distinct visitor sessions that added a product divided by distinct sessions with a page view. Daily metrics use the Africa/Nairobi calendar day. The engagement average uses only visible-session time recorded on that day and sessions with at least one active heartbeat. The admin endpoint uses the server-only Supabase service-role key.

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
