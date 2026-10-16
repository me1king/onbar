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

## Ticketing release waves

For the Online Bar Admin Ticketing module, apply
`TICKETING_CORE_MIGRATION.sql`, `TICKETING_SERVICE_FEE_ADMIN_MIGRATION.sql`,
`TICKETING_SECURITY_MIGRATION.sql`, and
`TICKETING_LIVE_OPERATIONS_MIGRATION.sql` first, then apply
`TICKETING_WAVES_MIGRATION.sql`. The final migration adds admission-specific
Wave I/II/III configuration, audited admin controls, transactional reservation
gates, and the server-side availability query used by public event listings.
Do not enable customer sales: verified checkout and ticket issuance are still
disabled in this release.
