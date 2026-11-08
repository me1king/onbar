# Supabase migrations

## Email Command Center

After the core schema plus `OPERATIONAL_FEATURES_MIGRATION.sql`,
`CRM_CONSENT_MESSAGING_MIGRATION.sql`, and
`TICKETING_EMAIL_DELIVERY_MIGRATION.sql` are installed, apply
`CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql`, then
`JMSURF_EMAIL_WEBHOOK_MIGRATION.sql`, then
`EMAIL_COMMAND_CENTER_MIGRATION.sql`. The sequence installs order-notification
history, provider event tracking, direct operational-email audit records, and
the bounce/complaint suppression list used by campaign sends. Configure the
JMSURF sender key/from address and signed webhook secret in Vercel; set the
provider callback URL to `/api/webhooks/jmsurf-mail`. The admin interface is
available under **Patrons → Email Command Center**. Marketing sends stay limited
to consented lists. Inbound email parsing requires a separate inbound provider
and is not included in this outbound setup.

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

## Order history product links

Apply `ORDER_ITEM_PRODUCT_RETENTION_MIGRATION.sql` to prevent catalog product
deletion from erasing the product link on historical order items. Products used
on orders must be hidden or marked unavailable instead of deleted. Existing
order items whose product link is already null are preserved for review; the
migration does not guess or rewrite their original products.

## Admin dashboard recovery

The analytics, finance, staff, and dispatch dashboards expect schema that may not
be present in older databases. Apply migrations in this order using the Supabase
SQL Editor:

1. `FINAL_ESTABLISHMENT_SQL.sql`
2. `MERCHANT_OPERATIONS_MIGRATION.sql`
3. `DISPATCH_MIGRATION.sql`
4. `COD_RIDER_DISPATCH_MIGRATION.sql`
5. `AUTH_SECURITY_MIGRATION.sql`
6. `ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql`

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

## Consent-based live customer journeys

After applying `FINAL_ESTABLISHMENT_SQL.sql` and
`SECURITY_HARDENING_MIGRATION.sql`, apply
`LIVE_CUSTOMER_JOURNEY_MIGRATION.sql`. The Admin and Owner Live Activity pages
then load sessions and page journeys through the authenticated
`/api/admin/behavior/live` endpoint, which requires an admin or owner session and
returns only visitors who opted into analytics. The dashboards refresh every 10
seconds. Private routes and URL query strings are omitted from displayed paths;
customers who decline or revoke analytics consent are not included.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Existing sessions default to no
analytics consent and therefore stay hidden unless the visitor opts in again.

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

## Merchant business accounts and branches

After applying `MERCHANT_OPERATIONS_MIGRATION.sql`,
`MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql`,
`VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql`, and
`ONBOARDING_INVITES_MIGRATION.sql`, apply
`MERCHANT_BUSINESS_BRANCHES_MIGRATION.sql`. A merchant signs in with a verified
account email that exactly matches an already-approved primary merchant
application, then opens `/merchant/business` to create the owner account.
Owners can generate single-use branch onboarding links; every branch completes
the normal goods, hours, location, and compliance flow and remains pending
review until approved. Owners can pause or resume orders for approved branches.
The branch overview counts distinct orders with fulfillment events in the last
seven days; it does not calculate branch revenue or payout allocation.

The branch onboarding link is a bearer credential: share it only with the
intended branch manager and regenerate it if it is exposed. It expires after
seven days and can be used once. Location PINs, manager accounts, KRA data,
payout credentials, and revenue sharing are intentionally not part of this
release; do not treat the owner account as an accounting or settlement system.

## Rider assignment alerts

After applying `DISPATCH_MIGRATION.sql`, apply
`RIDER_ORDER_ALERTS_MIGRATION.sql`. Riders must enable push notifications in
Rider Command while signed in. On an admin-confirmed assignment, the server
sends a web push immediately, queues a Twilio SMS escalation after 20 seconds,
and escalates to voice at 45 seconds. If no approved merchant accepts within
60 seconds, the server redistributes the paid order and the admin dispatch
queue can take control of rider scheduling.
The existing `worker:merchant-alerts` process handles both merchant escalations
and rider SMS. Redis, Twilio, VAPID keys, and an always-running worker are
required for those channels.

The current dispatch path is an admin-controlled assignment, not a rider offer
queue: the order is assigned before its alert is sent. The 25-second push TTL
only expires stale notifications; it does not automatically reassign an
unanswered mission. Automatic rider acceptance/decline, timeout rerouting, and
native Android full-screen alerts require separate implementation and staging
validation.

## Rider verification onboarding

After applying `DISPATCH_MIGRATION.sql` and
`ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql`, apply
`RIDER_ONBOARDING_SECURITY_MIGRATION.sql`. The public rider onboarding form
uploads verification photos and submits rider details through
`/api/rider/onboarding/verification`; it must not query or write
`rider_status` directly from the browser. The migration keeps that table and
the `rider-verifications` bucket private to the server service role.

## Rider battery telemetry and screen preview

Apply `RIDER_BATTERY_TELEMETRY_MIGRATION.sql` after `DISPATCH_MIGRATION.sql`.
It removes the misleading default battery reading and adds a timestamp for
device-reported battery samples. The rider web app reports battery only where
the browser exposes the Battery Status API; unsupported devices remain
“Not recorded.” Admin and Owner views show the reading age and only treat
samples up to five minutes old as current.

The rider device preview on an authorized rider profile renders the
read-only rider dashboard using the latest rider and active-order data. It is
available when the rider has no active order as well. This is not a remote
screen capture and cannot expose device-only state such as notifications,
browser permissions, or the physical phone display.

## Rider self-service sign-in PIN

After applying `SECURITY_HARDENING_MIGRATION.sql` and
`RIDER_ACCOUNT_PIN_RESET_MIGRATION.sql`, apply
`RIDER_SELF_SERVICE_PIN_MIGRATION.sql`. Riders can then change their four-digit
sign-in PIN from the Security section of the rider terminal. The API requires
the current rider session and current PIN, rate-limits attempts, and records
successful changes in `rider_account_security_events`. Temporary PINs set by
administrators cannot be used as a new PIN.

## Rider delivery PIN and ID check

After applying `DISPATCH_MIGRATION.sql` and
`DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql`, apply
`RIDER_DELIVERY_SAFETY_MIGRATION.sql`. It creates a six-digit PIN when a rider
is assigned, exposes it only to the customer through phone-verified delivery
tracking, and requires the rider to confirm the customer ID check and enter the
matching PIN before the delivery transition and commission are committed.
Apply this migration after legacy all-in-one or delivery migrations so the older
three-argument delivery RPC cannot bypass the handover checks.

## Rider doorstep handover and payments

After applying `RIDER_DELIVERY_SAFETY_MIGRATION.sql` and
`RIDER_TERMINAL_WORKFLOW_MIGRATION.sql`, apply
`RIDER_DOORSTEP_PAYMENT_MIGRATION.sql`. It adds a hashed, single-use four-digit
handover code that expires after ten minutes, attempt lockout, and audited
cash/M-Pesa/scan-to-pay records. Rider completion is atomic: the code, in-person
ID confirmation, payment, delivery status, and existing rider commission must
all pass server-side checks. The old assignment PIN is no longer returned by
customer tracking or delivery notifications.

Configure `RIDER_HANDOVER_CODE_SECRET` with a stable, private random secret and
create an approved Meta WhatsApp template named by
`WHATSAPP_DELIVERY_CODE_TEMPLATE_NAME`. The template must include four body
parameters in this order: customer name, order number, one-time code, and
tracking URL. The customer must have WhatsApp delivery notifications enabled.
Do not include the code in ordinary status notifications.

M-Pesa prompts use Safaricom Daraja STK Push and require
`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`,
`MPESA_SHORTCODE`, and `MPESA_ENVIRONMENT` (`sandbox` or `production`), plus
the public HTTPS origin in `NEXT_PUBLIC_BASE_URL`. A successful callback is
checked against the saved order, amount, phone, checkout request, and a
Safaricom STK query before it is recorded as paid. Scan-to-pay displays a QR
for a Paystack-hosted checkout link; Paystack must have its webhook configured
for `/api/paystack/webhook`. The checkout requires a customer email and offers
the payment channels enabled for the Paystack account. Cash is recorded as a
rider-confirmed physical collection; it is not provider-verified.

The customer checkout offers online payment or Cash on Delivery. Apply
`COD_RIDER_DISPATCH_MIGRATION.sql` after `DISPATCH_MIGRATION.sql` to make
confirmed COD orders available for assignment once merchant fulfillment is
verified. The order remains unpaid until its assigned verified rider presents
the available doorstep options after ID and one-time handover-code checks
(cash, M-Pesa prompt, or scan-to-pay). This keeps the customer order record
consistent while preserving an auditable payment method at the door.

Test all provider callbacks and receipt notifications in staging before
production. Do not mark an M-Pesa or QR attempt paid manually in the database.

## Owner order-flow timeline

After applying `FINAL_ESTABLISHMENT_SQL.sql` and `DISPATCH_MIGRATION.sql`, apply
`ORDER_FLOW_VISIBILITY_MIGRATION.sql`. The owner order workspace at
`/lord/orders` then shows a per-order status timeline and refreshes it every 15
seconds. New orders, payment updates, rider progress, and admin transitions are
recorded with timestamps and the actor where available. History begins at
migration time; earlier order steps cannot be reconstructed.

The migration also provides locked, atomic status-transition functions for
single and bulk admin updates and verified-rider assignment. The API does not
fall back to direct status writes if those functions are missing: apply the
migration rather than bypassing the state machine. Payment callbacks remain
the authority for online payment confirmation.

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
required checklist before visit verification, and requires one authorized
operator to record a passed test order before moving a lead to its internal
Live stage. A second-person review is not required.

On an existing project, run `VENDOR_ONBOARDING_SINGLE_REVIEW_MIGRATION.sql`
after `VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql` to remove the second-person
launch gate.

This pipeline is an internal onboarding tracker. It does not create vendor or
rider accounts, upload private documents, send SMS/WhatsApp messages, provision
catalog items, or perform a real test order. Use the existing merchant and
dispatch review flows to activate partners; never use this lead status alone
to enable alcohol sales or rider dispatch. The scorecard reports stored lead
counts and recorded launch duration only; it does not invent order volume or
quality scores.

## Company-specific onboarding links

After applying `VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql` and
`MERCHANT_OPERATIONS_MIGRATION.sql`, apply
`ONBOARDING_INVITES_MIGRATION.sql`. An authorized operator can issue a private
seven-day, single-use link for an individual retailer, wholesaler, or food
vendor from `/lord/vendor-onboarding`. The recipient sees only that company's
application flow; the invited business name and partner category are locked,
and submitting the application associates it with that exact lead. The raw
token is shown only when the link is issued; the database stores its SHA-256
hash. Reissuing a link invalidates the previous one.

The public onboarding route and its application APIs are allowed through the
public launch gate so invited companies can complete the form while the
storefront remains closed. The link does not grant access to the admin
pipeline, other companies, or uploaded documents. Rider leads do not receive
merchant-application links. Apply the migration to staging and test an
invitation through expiry, single-use submission, and admin review before
issuing production links.

## Seller application alerts and approvals

The two seller application forms use separate review queues:

- OnBar partners submit at `/merchant/onboarding`, appear in
  `merchant_applications`, and are reviewed at `/lord/merchants`. Approval
  emails the account-protected `/vendor` entry link.
- Market boutiques submit at `/merchant/register`, appear in
  `mm_merchant_applications`, and are reviewed at `/lord/market`. Approval
  creates the merchant and owner membership in the review transaction, then
  emails the seller dashboard link at `/merchant/dashboard`.

Both submissions send an admin email alert. Configure `ADMIN_EMAIL` or publish
the admin contact email in site settings, and configure a transactional sender
with `JMSURF_MAIL_KEY`/`JMSURF_FROM_EMAIL` or `RESEND_API_KEY`/
`RESEND_FROM_EMAIL`. If email delivery is unavailable, the application remains
saved, the applicant is told not to resubmit, and the admin sidebar continues
to show pending counts; it refreshes every minute and when a review page regains
focus. The queues order newest submissions first.

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
