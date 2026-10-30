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

## Merchant order alerts

After applying `FINAL_ESTABLISHMENT_SQL.sql`, `MERCHANT_OPERATIONS_MIGRATION.sql`,
and `DISPATCH_MIGRATION.sql`, apply `MERCHANT_ORDER_ALERTS_MIGRATION.sql`.
The migration creates private merchant contact/device/delivery-log storage and
atomic accept, decline, and timeout functions. Do not apply it before the
merchant and dispatch migrations.

Configure the web application and the separate alert-worker service with
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BASE_URL`
(the deployed OnlineBar origin), `REDIS_URL`, `INTERNAL_API_SECRET`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
`TWILIO_ALERT_TOKEN_SECRET`, `WEB_PUSH_VAPID_PUBLIC_KEY`,
`WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`. Generate VAPID keys with
`npx web-push generate-vapid-keys`; keep private keys server-side. The worker
must run continuously as a separate process with `npm run worker:merchant-alerts`.
The web process schedules 20-second SMS, 60-second voice, and 90-second timeout
jobs in Redis; the worker sends the Twilio messages/calls, records provider
status callbacks, and invokes the authenticated internal dispatch endpoint to
alert newly allocated merchants after a timeout. Configure adequate Redis
persistence and monitor the worker heartbeat in the merchant workspace.

Twilio credentials, an approved sender/number, Redis, VAPID keys, the migration,
and the continuously running worker are required for live delivery. The browser
health check cannot verify phone volume or battery-optimization settings.
Web push uses the phone's normal notification behavior and cannot provide a
reliable looping lock-screen alarm; native Android alert support remains a
separate rollout step. Test on staging with real devices and provider accounts
before launch.

## Rider assignment alerts

After applying `DISPATCH_MIGRATION.sql`, apply
`RIDER_ORDER_ALERTS_MIGRATION.sql`. Riders must enable push notifications in
Rider Command while signed in. On an admin-confirmed assignment, the server
sends a web push immediately and queues a Twilio SMS reminder after 10 seconds.
The existing `worker:merchant-alerts` process handles both merchant escalations
and rider SMS. Redis, Twilio, VAPID keys, and an always-running worker are
required for those channels.

The current dispatch path is an admin-controlled assignment, not a rider offer
queue: the order is assigned before its alert is sent. The 25-second push TTL
only expires stale notifications; it does not automatically reassign an
unanswered mission. Automatic rider acceptance/decline, timeout rerouting, and
native Android full-screen alerts require separate implementation and staging
validation.

## Rider delivery PIN and ID check

After applying `DISPATCH_MIGRATION.sql` and
`DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql`, apply
`RIDER_DELIVERY_SAFETY_MIGRATION.sql`. It creates a six-digit PIN when a rider
is assigned, exposes it only to the customer through phone-verified delivery
tracking, and requires the rider to confirm the customer ID check and enter the
matching PIN before the delivery transition and commission are committed.
Apply this migration after legacy all-in-one or delivery migrations so the older
three-argument delivery RPC cannot bypass the handover checks.

## Delivery merchant scorecard

After the merchant operations and dispatch migrations are installed, apply
`DELIVERY_VENDOR_SCORECARD_MIGRATION.sql`. It adds service-role-only reporting
views that calculate actual merchant accept/reject response times from order
creation, fulfilment totals, and exceptions. It also adds an audited admin RPC
for pausing or resuming new orders without changing a merchant's weekly hours.
The response-time metric is explicitly order-created-to-decision; it is not an
offer-delivery timestamp. No rating, preparation-time, or timeout figures are
invented where the current event ledger does not record them.

## Vendor categories and performance rankings

After applying `FINAL_ESTABLISHMENT_SQL.sql`,
`MERCHANT_OPERATIONS_MIGRATION.sql`, `DISPATCH_MIGRATION.sql`, and
`DELIVERY_VENDOR_SCORECARD_MIGRATION.sql`, apply
`DELIVERY_VENDOR_PERFORMANCE_MIGRATION.sql`. It adds retailer, wholesaler, and
street-food targets; preparation commitments; compliance reporting; and
type-separated town rankings. Existing business types map to categories:
bars to retailers, suppliers to wholesalers, and kitchens, restaurants, and
food vendors to street-food vendors. The onboarding API enforces that mapping
so alcohol-licence requirements continue to match the dispatch eligibility
checks. Alcohol licence expiry dates are required; businesses without a current
licence are paused, and the dispatch eligibility check also excludes expired
licences. Schedule `SELECT
public.pause_alcohol_vendors_without_current_licence();` daily in Supabase to
keep the merchant availability state in sync after a licence expires. The
merchant workspace and delivery scorecard read the same view.

The score uses recorded accept/reject, ready, delivery, rating, and formally
vendor-attributed complaint data. Response time is order-created-to-decision,
not routed-offer latency; the current workflow does not record offer timeouts.
Ratings and complaints are not populated until their customer feedback and
adjudication write paths are deployed. Apply this migration to staging first
and verify the existing document requirements and merchant data before
production.

## Vendor launch pipeline

Apply `VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql` to staging first. It adds the
private, admin-only lead ledger, type-specific field checklists, visit
check-ins, activity history, and launch-gate functions. The Admin page is
`/lord/vendor-onboarding`. It tracks retailer, wholesaler, street-food, and
rider leads, requires a future scheduled visit and GPS check-in plus the
required checklist before visit verification, and requires a recorded passed
test order and second-person review before a lead reaches its internal Live
stage.

This pipeline is an internal onboarding tracker. It does not create vendor or
rider accounts, upload private documents, send SMS/WhatsApp messages, provision
catalog items, or perform a real test order. Use the existing merchant and
dispatch review flows to activate partners; never use this lead status alone
to enable alcohol sales or rider dispatch. The scorecard reports stored lead
counts and recorded launch duration only; it does not invent order volume or
quality scores.

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
`TICKETING_WHATSAPP_DELIVERY_MIGRATION.sql`,
`TICKETING_BUYER_EMAIL_THEME_MIGRATION.sql`, and
`PAYHERO_TICKETING_MIGRATION.sql`, then
`TICKETING_PROMOTIONS_MIGRATION.sql`. The commerce migration creates the
Paystack-backed standard checkout; the promotions migration adds transactional
promo redemption handling and a promo-aware checkout that also uses Paystack.
`PAYHERO_TICKETING_MIGRATION.sql` remains for verifying and completing legacy
PayHero payment attempts; new ticket checkouts do not require PayHero. After the customer
messaging and ticketing email delivery migrations (including
`CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql`) are installed, run
`JMSURF_EMAIL_WEBHOOK_MIGRATION.sql` to record signed JMSURF email events and
link them to transactional message records. The owner/admin-only
`/lord/ticketing/sales` report includes purchaser name and email, selected
ticket types and quantities, chosen ticket-email color, and the email send/provider status. Buyer email-color reporting and storage require
`TICKETING_BUYER_EMAIL_THEME_MIGRATION.sql`. Provider-
confirmed delivery requires this webhook migration and a configured signed
JMSURF webhook; a provider accepting a send is not proof that the message
reached the recipient's mail server or inbox. Point the provider webhook at
`/api/webhooks/jmsurf-mail` and configure the matching server-only
`JMSURF_WEBHOOK_SECRET`.
For databases that already applied the earlier promotions migration, re-run
`TICKETING_PROMOTIONS_MIGRATION.sql` after deploying the Paystack checkout
change so its promo RPC stops converting new attempts to PayHero.
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
server-only WhatsApp credentials before enabling customer purchases. The buyer
email-theme migration stores each checkout's chosen ticket email color on its
order so the automatic ticket email and attached PDF use the buyer's selection.
The email color is optional for payment: if this migration is not installed yet,
checkout continues and ticket email uses the configured default theme. Apply the
migration to enable saving individual buyer theme preferences.

## Demand Intelligence area contacts

For an existing database, run `DEMAND_INTELLIGENCE_CONTACT_NAMES_MIGRATION.sql`
after `DEMAND_INTELLIGENCE_MIGRATION.sql`. It adds the optional waitlist display
name used when an authorized admin opens an area row; the dashboard only shows
contacts who opted in to launch updates.

## Waitlist invitation delivery counts

Apply `WAITLIST_INVITATION_DELIVERIES_MIGRATION.sql` to record each waitlist
invitation delivery (sent or failed) by campaign, member, and opted-in channel.
The admin count reports successfully sent channel messages; it does not count
recipients without channel consent or failed deliveries.
The payment-currency fix adds the KES default required by the checkout RPC on
projects where the original commerce migration is already installed.
Payment verification and ticket issuance are implemented; complete the
documented production configuration and sandbox acceptance before accepting
customer payments.
