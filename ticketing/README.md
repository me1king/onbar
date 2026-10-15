# ONLINE BAR Ticketing

The Ticketing control centre is an isolated Online Bar Admin module at `/admin/ticketing`. It uses the existing admin session for platform-owner/admin authorization and stores its records in dedicated `ticketing_*` Supabase tables. It does not read from or write to the drink-order, product inventory, merchant payout, or waitlist tables.

## Current phase

- Admin can create private event drafts and ticket tiers with KES prices, capacity, purchase limits, sale windows, venue, dates, age limit, description, and cancellation policy.
- Server-side validation prevents invalid dates, price formats, purchase limits, and tier allocations beyond an event's stated capacity.
- The core migration establishes isolated records for organizers, events, ticket tiers, reservations, orders, payment attempts and webhook deduplication, individual tickets, gate check-ins, refunds, promotions, notification jobs, and audit history.
- The reservation and gate-check-in database functions are transactional and use ticket-level locking to prevent overselling and duplicate admission.
- Public event discovery, customer checkout, Daraja/Paystack payment verification, ticket issuance, transfer/refund operations, notifications, and staff scanner access are not enabled in this initial phase. No event can be published or sold from this module.

## Complete product scope

The isolated system is intended to grow through release-gated phases into:

1. **Event discovery and customer wallet:** mobile event pages, organizer/event details, posters and lineups, policies/accessibility, searchable published events, verified customer accounts or secure guest retrieval, orders, digital tickets and communication preferences.
2. **Ticket commerce:** early-bird/regular/VIP/group/table/complementary allocations, server-priced checkout, promotion and referral attribution, temporary inventory reservations, sale windows, buyer limits and safe expiry/recovery.
3. **Verified payments and finance:** Daraja M-Pesa STK Push first, other approved providers through adapters, authenticated/idempotent callbacks, late-payment handling, receipts, refund requests/outcomes, dispute evidence, ledger reconciliation, fees and organizer settlements.
4. **Admission operations:** random per-ticket credentials with stored hashes, event/gate/staff-scoped online QR check-in, atomic duplicate rejection, refunded/revoked-ticket rejection, audited overrides, and a documented, limited offline-contingency policy.
5. **Organizer and platform administration:** organizer onboarding/approval, event moderation, event-scoped staff, role/permission controls, ticket/order/support tools, sensitive-action approvals, cancellation/postponement workflows and audit history.
6. **Communications and growth:** transactional email/in-app/SMS/WhatsApp queues with templates, consent, retries and receipts; waitlist invitations kept separate from purchases; promo codes; affiliate attribution and refund-adjusted commission records.
7. **Reporting and operations:** tickets sold versus attendance, gross versus net proceeds, fees/refunds, conversion and sales pace, payment/reconciliation exceptions, failed notifications, monitoring, backup restore and privacy/retention operations.

These are product targets, not features that the current draft-only phase claims to have shipped. Each phase requires its own permission checks, failure/recovery behavior and tests before it is enabled.

## Database setup

Apply `supabase/TICKETING_CORE_MIGRATION.sql` once to the same Supabase project used by Online Bar Admin. The migration uses only the `ticketing_*` namespace, enables RLS, revokes direct browser access, and grants server-side access to `service_role`. Review the SQL and confirm the target project before applying it.

The platform must keep its service-role key server-side. API access to the Admin control centre requires an authenticated Online Bar owner or admin session. Do not put payment credentials in client-side environment variables.

## Release gates before ticket sales

1. Add public event discovery and safe customer identity/order access.
2. Implement atomic reservation creation, expiry/recovery, and order snapshots in server-verified checkout.
3. Configure Daraja sandbox credentials and callback URL; validate signatures/transaction references, amount, currency, idempotency, duplicate callbacks, delayed callbacks, and reconciliation before production onboarding.
4. Issue one unpredictable credential per paid admission only after verified payment; store a credential hash and deliver tickets idempotently.
5. Add event-scoped staff roles and online gate scanning with atomic duplicate prevention, revoked/refunded-ticket rejection, and audited manual overrides.
6. Complete refunds, transfer rules, transactional notifications and retries, financial reconciliation, monitoring, accessibility, privacy/retention policy, backup recovery and concurrency/authorization tests.
7. Run the Midnight Society KE pilot in sandbox with a controlled event and staff. Do not enable production sales until every release-blocking test in the ticketing blueprint passes.

Money is stored as integer minor units with an explicit ISO currency. A checkout redirect, screenshot, or client-side status must never be treated as proof of payment.
