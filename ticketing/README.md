# ONLINE BAR Ticketing

The Ticketing control centre is an isolated Online Bar Admin module at `/admin/ticketing`. It uses the existing admin session for platform-owner/admin authorization and stores its records in dedicated `ticketing_*` Supabase tables. It does not read from or write to the drink-order, product inventory, merchant payout, or waitlist tables.

## Current phase

- Admin can create private event drafts and ticket tiers with KES prices, capacity, purchase limits, sale windows, venue, dates, age limit, description, and cancellation policy.
- The Online Bar Admin Ticketing module includes a native Wave I/II/III manager. Configure waves separately for General Admission, VIP, Group Package, or Backstage / Exclusive; set each wave's price, allocation, benefits, theme, sales dates, and scheduled, previous-wave-sold-out/deadline, or owner-controlled manual activation.
- Public event pages display wave labels, benefits, current release state, remaining inventory, and an enabled purchase form for open ticket types. Inventory is reserved transactionally and prices/fees are recalculated in the database, never trusted from the browser.
- Admins can configure a fixed per-ticket service fee from the Online Bar Ticketing dashboard. Fee changes are locked and audited; already-created orders retain their original price snapshot.
- The public `/tickets` and `/tickets/[slug]` pages show approved-organizer events on sale. Hosted Paystack checkout offers configured card and mobile-money channels (including M-Pesa where enabled on the Paystack account). The webhook signature is checked, the transaction is fetched again from Paystack, and only a matching KES amount/reference/email can atomically mark an order paid and issue tickets.
- Every issued ticket has a random credential, stores only its SHA-256 hash plus an AES-GCM encrypted copy needed for the wallet, and is rejected on duplicate check-in. The encryption key is server-only. The guest wallet is accessible with a checkout-generated bearer token held in the payment return and the same browser's session storage; ticket email delivery and cross-device account recovery are not configured.
- Server-side validation prevents invalid dates, price formats, purchase limits, and tier allocations beyond an event's stated capacity.
- The core migration establishes isolated records for organizers, events, ticket tiers, reservations, orders, payment attempts and webhook deduplication, individual tickets, gate check-ins, refunds, promotions, notification jobs, and audit history.
- The reservation and gate-check-in database functions are transactional and use ticket-level locking to prevent overselling and duplicate admission.
- Gate staff use the isolated `/scanner` workspace. Platform admins assign verified Supabase Auth accounts to a specific event and gate in `/admin/ticketing/staff`; assignment and revocation are atomic and recorded in the Ticketing audit log. The scanner requires a network connection, hashes QR credentials in the browser, and the database verifies staff assignment before each atomic check-in.
- The Halloween-themed Trust & Security Centre records manually reported security cases, owner-only case assignment/status changes, and append-only case activity in the dedicated security migration.
- The Halloween Live Operations page reads committed Ticketing database activity and current record counts through admin-only APIs. Its database trigger journal excludes buyer contact information, payment payloads and credential hashes; the page polls every five seconds and recovers from a cursor, but is not a push/WebSocket feed.
- The live operations journal is not a substitute for protected external security logging or automated attack detection. Privileged MFA enforcement, customer accounts, five-minute QR rotation, and backup verification remain unimplemented.
- Checkout and scanner code require all documented Supabase migrations, server-side Paystack configuration, the credential encryption key, verified staff accounts/assignments, HTTPS, and an end-to-end sandbox test before production admissions. Refunds, transfers, ticket-email delivery/recovery, transactional notification retries, distributed rate limiting, and manual admission overrides are not implemented.
- The Android application currently wraps the Online Bar website. The ticket wallet is available in the website browser; there is no native ticket wallet or screenshot protection.

## Complete product scope

The isolated system is intended to grow through release-gated phases into:

1. **Event discovery and customer wallet:** the public event listing, event detail pages, guest order wallet, and digital QR tickets are implemented. Organizer onboarding, full media/lineup management, customer accounts, and email-based wallet recovery remain outstanding.
2. **Ticket commerce:** basic server-priced checkout, KES fee snapshots, wave-aware inventory reservations, purchase limits, Paystack-hosted card/mobile-money payment, complimentary tickets, and atomic issuance are implemented. Promotions, referral attribution, and a scheduled reservation-expiry worker remain outstanding.
3. **Verified payments and finance:** Paystack checkout callbacks are signature-checked and transaction-verified server-side, with amount/reference/email matching and idempotent ticket issuance. Direct Daraja STK Push, refunds, dispute evidence, settlement, and reconciliation tooling remain outstanding.
4. **Admission operations:** random per-ticket credentials with stored hashes, event/gate/staff-scoped online QR check-in, atomic duplicate rejection, refunded/revoked-ticket rejection, audited overrides, and a documented, limited offline-contingency policy.
5. **Organizer and platform administration:** organizer onboarding/approval, event moderation, event-scoped staff, role/permission controls, ticket/order/support tools, sensitive-action approvals, cancellation/postponement workflows and audit history.
6. **Communications and growth:** transactional email/in-app/SMS/WhatsApp queues with templates, consent, retries and receipts; waitlist invitations kept separate from purchases; promo codes; affiliate attribution and refund-adjusted commission records.
7. **Reporting and operations:** tickets sold versus attendance, gross versus net proceeds, fees/refunds, conversion and sales pace, payment/reconciliation exceptions, failed notifications, monitoring, backup restore and privacy/retention operations.

These are product targets, not features that the current draft-only phase claims to have shipped. Each phase requires its own permission checks, failure/recovery behavior and tests before it is enabled.

## Database setup

Apply these migrations in order to the same Supabase project used by Online Bar Admin: `TICKETING_CORE_MIGRATION.sql`, `TICKETING_SERVICE_FEE_ADMIN_MIGRATION.sql`, `TICKETING_SECURITY_MIGRATION.sql`, `TICKETING_LIVE_OPERATIONS_MIGRATION.sql`, `TICKETING_WAVES_MIGRATION.sql`, `TICKETING_SCANNER_MIGRATION.sql`, and `TICKETING_COMMERCE_MIGRATION.sql`. The commerce migration enables atomic KES checkout, wallet access, verified payment recording, and ticket issuance. It depends on the core service-fee and wave schema. The scanner migration audits staff assignment changes and verifies event-scoped access at each scan. All ticketing tables are private to the server-side `service_role`; the browser never receives database credentials or raw stored ticket credentials.

Keep `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and `TICKETING_CREDENTIAL_ENCRYPTION_KEY` server-only. Generate the last value with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and store it as an environment variable in both local development and the production host. Do not change or lose this key after tickets have been issued; existing wallet credentials cannot be decrypted with a different key. Configure `NEXT_PUBLIC_BASE_URL` to the public HTTPS site origin and point the Paystack webhook to `/api/paystack/webhook`. The return link is a bearer credential and must not be shared.

## Remaining release gates

1. Apply and verify every migration in the listed order; set Paystack live/sandbox keys and the encryption key in the hosting environment; configure the HTTPS callback/webhook and verify Paystack dashboard delivery.
2. Run a controlled sandbox purchase and test valid payment, failed/duplicate/delayed webhook, amount mismatch, reservation expiry, complimentary ticket, and credential decryption.
3. Provision verified staff accounts, assign event-scoped gate roles in `/admin/ticketing/staff`, and scan a paid ticket at the event; verify the second scan is rejected. Test unpaid, wrong-event, refunded/revoked, and closed-event results.
4. Set up ticket email delivery and cross-device recovery before relying on tickets that might be lost with the payment browser session. Complete refunds, settlements, payment reconciliation, distributed rate limiting, monitoring, accessibility/privacy review, backup recovery, and concurrency/authorization testing.
5. Run a controlled pilot with staff and support available. Do not treat the feature as production-ready until these external setup and end-to-end checks pass.

Money is stored as integer minor units with an explicit ISO currency. A checkout redirect, screenshot, or client-side status must never be treated as proof of payment.
