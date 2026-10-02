# Online Bar Setup Guide

Use this guide to configure the Supabase database and the external services used by the application.

## Supabase setup

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new).
2. Copy [`supabase/FINAL_ESTABLISHMENT_SQL.sql`](./supabase/FINAL_ESTABLISHMENT_SQL.sql).
3. Paste and run the script to create the application tables and views.

For an existing database, run the `ALTER TABLE public.orders` migration block in the script's **Operations & Logistics** section to add gift-card details to existing orders. Do not re-run the entire setup script on a live database just to apply that migration.

### Paystack Checkout

Set `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` to your Paystack public key in the deployment environment. Online checkout requires the customer to provide a valid email address; the app no longer substitutes a demo email or an embedded payment key. Cash on Delivery does not require an email address.

## Admin integrations

- AI product descriptions require `GOOGLE_GEMINI_API_KEY` or `OPENAI_API_KEY`. If neither provider is configured or generation fails, the app reports that the description is unavailable instead of generating a template.
- Social publishing is not available until platform publishing APIs are configured. Requests currently return an unavailable response and are not recorded as published posts.

## 🛡️ Identity & Access Recovery

If you are experiencing the `AuthRetryableFetchError` or "Identity already exists" issues:

1. **Verify your .env.local**: Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` starts with `eyJ...` (Supabase Key) and **NOT** `sb_publishable_...` (Stripe Key).
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
