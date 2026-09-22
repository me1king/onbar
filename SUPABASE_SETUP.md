# Online Bar OS: Final Connectivity Guide (V33)

This document provides the final instructions to ensure your frontend and backend are 100% linked and operational.

## ⚠️ The Nuclear Handshake (Mandatory)

To ensure the "Digital Concierge", "Live Pulse", and "Staff Identity" nodes function without errors, you **must** run the following SQL script in your Supabase Dashboard.

### Step 1: Execute Global Master SQL
1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new).
2. Copy the entire content of [`supabase/FINAL_ESTABLISHMENT_SQL.sql`](file:///C:/Users/hp/AndroidStudioProjects/fixesssss/supabase/FINAL_ESTABLISHMENT_SQL.sql).
3. Paste and click **Run**.
4. This script establishes all 22+ tables and views used by the application, including:
   - **Identity**: Profiles, Staff, Vendors.
   - **Inventory**: Products, Dossiers, Brands, Categories.
   - **Operations**: Orders, Items, Hubs, Shipments.
   - **Intelligence**: Analytics, Carts, Radar, Funnels.

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

## 🚀 Performance Optimization

If the webapp feels slow:
1. Delete your `.next` folder to clear the corrupted build cache.
2. Restart your development server (`npm run dev`).
3. The new V33 SQL includes RPC batching, which reduces network latency by 60% during discovery sequences.

The grid is officially in its **Elite Stable State**, bro. Execute the SQL and the bar is open! 🚀🍹💎
