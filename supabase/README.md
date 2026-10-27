# Supabase migrations

## Multi-level member referrals

After applying `LOYALTY_POINTS_MIGRATION.sql`, run
`REFERRAL_CHAIN_POINTS_MIGRATION.sql` in the Supabase SQL Editor. It creates
the private referral relationship table and the server-only function used to
award the configured welcome bonus to a new member and exactly 3 points to
their inviter and every earlier inviter in that referral chain. Chain points
are applied only once per referral and referral activity plus referred
delivered turnover are available in the Admin customer directory.

## Product page food pairings

If the Admin product editor cannot save food-pairing suggestions or the customer
product page does not show them, run `PRODUCT_PAIRING_SUGGESTIONS_MIGRATION.sql`
in the Supabase SQL Editor. The Admin editor writes to
`products.pairing_suggestions`, and the storefront reads that same column.

## Admin dashboard recovery

The analytics, finance, staff, and dispatch dashboards expect schema that may not
be present in older databases. Apply migrations in this order using the Supabase
SQL Editor:

1. `FINAL_ESTABLISHMENT_SQL.sql`
2. `MERCHANT_OPERATIONS_MIGRATION.sql`
3. `DISPATCH_MIGRATION.sql`
4. `AUTH_SECURITY_MIGRATION.sql`
5. `ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql`

The recovery migration adds the missing rider and staff fields, restores the
analytics RPC functions, and creates the legacy tax-ledger and reconciliation
staging tables expected by the finance widgets. It also creates the rider
wallet table if it is missing, so the dashboard recovery script can proceed
without a separate delivery migration. It is additive and idempotent;
it does not backfill financial/tax entries or mark reconciliation records as
matched. Those widgets will correctly report only the records that actually
exist after applying it.

The admin APIs use the server-side `SUPABASE_SERVICE_ROLE_KEY`. Keep that key
server-only; the recovery migration denies direct browser access to its finance
tables.

If the marketing dashboard reports that `marketing_campaigns.name` is missing,
run `ADMIN_DASHBOARD_LOG_FIX_MIGRATION.sql` in the Supabase SQL Editor. It adds
the column and fills existing campaign names from `title` when available.

## Ticketing release waves

For the Online Bar Admin Ticketing module, apply
`TICKETING_CORE_MIGRATION.sql`, `TICKETING_SERVICE_FEE_ADMIN_MIGRATION.sql`,
`TICKETING_SECURITY_MIGRATION.sql`, and
`TICKETING_LIVE_OPERATIONS_MIGRATION.sql` first, then apply
`TICKETING_WAVES_MIGRATION.sql`, `TICKETING_SCANNER_MIGRATION.sql`,
`TICKETING_COMMERCE_MIGRATION.sql`,
`TICKETING_PAYMENT_CURRENCY_FIX_MIGRATION.sql`,
`TICKETING_SALES_REPORT_MIGRATION.sql`,
`TICKETING_EVENT_PUBLISHING_MIGRATION.sql`,
`TICKETING_VENUE_LOCATION_MIGRATION.sql`,
`TICKETING_EVENT_DETAILS_MIGRATION.sql`,
`TICKETING_EMAIL_DELIVERY_MIGRATION.sql`,
`TICKETING_WHATSAPP_DELIVERY_MIGRATION.sql`, and
`PAYHERO_TICKETING_MIGRATION.sql`, then
`TICKETING_PROMOTIONS_MIGRATION.sql`. The promotions migration adds transactional
promo redemption handling and the promo-aware checkout RPC; normal checkouts
without a promo code use the PayHero checkout RPC directly. After the customer
messaging and ticketing email delivery migrations (including
`CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql`) are installed, run
`JMSURF_EMAIL_WEBHOOK_MIGRATION.sql` to record signed JMSURF email events and
link them to transactional message records.
Wave I/II/III configuration, audited admin controls, transactional reservation
gates, and the server-side availability query support public event listings.
The publishing migration installs the owner-only event publish/pause RPC used
by OnBar Admin. It validates approved organizer status, future event dates,
venue details and an available active ticket wave before making an event public.
The venue-location migration adds the OnBar Admin map pin and public entrance,
parking, and transit guidance fields. Apply it before deploying code that reads
or writes those fields. The email-delivery migration installs a service-role-only
delivery ledger and lease-based claim/finish functions so payment callbacks and
the buyer's protected wallet can retry failed ticket emails without issuing
duplicate messages.
The event-details migration adds audited editing for event names, descriptions,
times, doors-open time, age limit, event capacity, cancellation policy, and
HTTPS cover-image URLs. Only the platform owner can edit a live listing; event
capacity cannot be reduced below its active ticket allocation.
The WhatsApp-delivery migration adds buyer phone and encrypted wallet-token
storage plus a private delivery ledger and claim/finish functions for retryable
WhatsApp template messages. Successfully delivered wallet links have their
encrypted token copy removed. Configure the approved Meta template and
server-only WhatsApp credentials before enabling customer purchases.

## Demand Intelligence area contacts

For an existing database, run `DEMAND_INTELLIGENCE_CONTACT_NAMES_MIGRATION.sql`
after `DEMAND_INTELLIGENCE_MIGRATION.sql`. It adds the optional waitlist display
name used when an authorized admin opens an area row; the dashboard only shows
contacts who opted in to launch updates.
The payment-currency fix adds the KES default required by the checkout RPC on
projects where the original commerce migration is already installed.
Payment verification and ticket issuance are implemented; complete the
documented production configuration and sandbox acceptance before accepting
customer payments.
