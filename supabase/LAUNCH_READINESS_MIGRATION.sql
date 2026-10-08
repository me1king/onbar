-- Launch checklist state and privacy-conscious storefront search demand aggregates.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.analytics_events') IS NULL THEN
        RAISE EXCEPTION 'Launch readiness requires public.analytics_events.'
            USING HINT = 'Install the core schema with supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.launch_readiness_items (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'blocked', 'verified', 'not_applicable')),
    is_critical BOOLEAN NOT NULL DEFAULT true,
    status_note TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS launch_readiness_category_idx
    ON public.launch_readiness_items (category, id);
CREATE INDEX IF NOT EXISTS launch_readiness_status_idx
    ON public.launch_readiness_items (status, is_critical);

ALTER TABLE public.launch_readiness_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_readiness_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.launch_readiness_items TO service_role;
REVOKE DELETE, TRUNCATE ON public.launch_readiness_items FROM service_role;

INSERT INTO public.launch_readiness_items
    (id, category, title, description, status, is_critical, status_note)
VALUES
    ('domain-canonical', 'Domain & hosting', 'Production domain, DNS, HTTPS and canonical redirects', 'Verify ownership, DNS records, www redirect, valid TLS, canonical host, favicon and social previews. Resolve the inconsistent onlinebar.co.ke and Render origins before public launch.', 'blocked', true, 'Repository review found more than one production origin; verify DNS and deployed redirects.'),
    ('hosting-environment', 'Domain & hosting', 'Production hosting and private environment configuration', 'Confirm the deployed production service, environment values, deploy process and rollback access. Never expose server secrets in public variables.', 'in_progress', true, 'Deployment configuration is external to this repository and must be checked in the hosting account.'),
    ('email-domain', 'Email & messaging', 'Professional transactional email and authenticated sender domain', 'Verify provider account, sender identity, SPF/DKIM/DMARC, deliverability, bounce handling and the support/orders addresses.', 'in_progress', true, 'Resend integration exists in source; sender account and domain authentication need live verification.'),
    ('sms-provider', 'Email & messaging', 'SMS provider, sender ID, delivery callbacks and opt-out', 'Choose and configure an SMS provider; send production test messages and verify delivery callbacks and promotional opt-out. No complete SMS delivery integration was found.', 'blocked', true, 'Provider delivery is not implemented/configured in the reviewed source.'),
    ('whatsapp-outbound', 'Email & messaging', 'WhatsApp transactional delivery and support', 'Verify Meta account, phone number, templates, credentials, delivery failures and support workflow using production-like tests.', 'in_progress', true, 'Outbound Cloud API plumbing exists; account configuration and delivery acceptance are unverified.'),
    ('whatsapp-webhook', 'Email & messaging', 'Secure inbound WhatsApp webhook', 'Remove predictable defaults, verify provider signatures, validate callbacks and replay protection, and test inbound support messages.', 'blocked', true, 'Prior source review found a predictable verification-token default and missing request-signature verification.'),
    ('paystack-live', 'Payments & tax', 'Paystack live account, keys, webhook and settlement', 'Verify live account and settlement details; test successful and failed transactions, amount/reference validation and webhook delivery.', 'in_progress', true, 'Checkout and server-side reference checks exist; live-provider acceptance is not verified.'),
    ('payment-reconciliation', 'Payments & tax', 'Payment-to-order reconciliation, retries and refunds', 'Test duplicate/out-of-order webhooks, delayed confirmation, abandoned checkout, refund/partial refund and payment received when order creation fails.', 'in_progress', true, 'Automated source checks do not prove reconciliation or refund completion.'),
    ('mpesa-channel', 'Payments & tax', 'Accurately disclose and verify the M-Pesa payment route', 'Confirm whether M-Pesa is processed through Paystack or a separately integrated Safaricom Daraja flow. Do not claim direct Daraja support without a tested integration.', 'blocked', true, 'The checkout label is not evidence of a direct Daraja integration.'),
    ('etims-invoicing', 'Payments & tax', 'KRA/eTIMS invoicing and refund credit-note process', 'Confirm the applicable business obligations with a qualified adviser; choose the KRA workflow and test invoice/credit-note reconciliation.', 'not_started', true, 'No verified eTIMS integration or live compliance evidence is available in the repository.'),
    ('supabase-production', 'Supabase & data', 'Production Supabase project, schema, RLS, storage and auth', 'Verify the production project, database roles, storage buckets, auth settings, row-level security and server-only service key.', 'in_progress', true, 'SQL scripts exist; their application to the target hosted project is not verified.'),
    ('migration-verification', 'Supabase & data', 'Run migrations on clean staging and a production-schema clone', 'Apply migrations in order, verify indexes/functions/triggers/RLS, record the deployed schema version and document safe rollback steps.', 'blocked', true, 'Repository migrations are manually applied SQL, not a verified deployed migration history.'),
    ('backup-restore', 'Supabase & data', 'Database and storage backups with a successful restore drill', 'Confirm backup retention, storage recovery, ownership and recovery procedure; record the date and result of a restore test.', 'not_started', true, 'A configured backup is not verified until a restore has been exercised.'),
    ('customer-admin-auth', 'Authentication & access', 'Customer and admin authentication recovery and access review', 'Test sign-up, login, password reset, account recovery, admin role boundaries, session expiry and optional MFA policy.', 'in_progress', true, 'Authentication and RBAC are present in source; production configuration and acceptance testing remain required.'),
    ('rider-auth', 'Authentication & access', 'Connect rider sign-in to the signed rider session APIs', 'Unify rider login with the HMAC session used by mission, GPS and delivery endpoints; test verified, expired and unauthorized riders.', 'blocked', true, 'Prior source review found the rider login flow is not connected to the server-side signed-session endpoints.'),
    ('android-gps-contract', 'Riders & delivery', 'Align Android GPS URL, authorization and payload contract', 'Verify app origin, endpoint URL, authentication header and latitude/longitude/battery payload with a real signed-in rider.', 'blocked', true, 'Prior source review found Android and server GPS contracts do not match.'),
    ('maps-routing-eta', 'Riders & delivery', 'Validate Maps configuration, routing, delivery zones and customer ETA', 'Verify geocoding, road routing, service zones, pricing and tested ETA behavior. Do not present straight-line distance as traffic-aware routing.', 'in_progress', true, 'Maps code exists but the end-to-end live road-route/ETA path is not verified.'),
    ('delivery-proof', 'Riders & delivery', 'Test dispatch, pickup, delivery, failed delivery and proof of handoff', 'Walk through rider assignment, pickup, customer unavailable, wrong address, cancellation, cash handling where applicable and proof of delivery.', 'in_progress', true, 'Delivery screens and status progression exist; a complete live dispatch journey is unverified.'),
    ('health-monitoring', 'Security & monitoring', 'Real readiness, dependency health, alerting and error tracking', 'Confirm the readiness endpoint fails when its required database dependency is unavailable; configure external uptime and application-error alerts.', 'in_progress', true, 'The code check can validate a database connection; external monitoring and alert delivery still need setup.'),
    ('security-review', 'Security & monitoring', 'Production security review and incident response access', 'Review exposed routes, secrets, RLS, webhook verification, least privilege, session policy, incident contacts and remediation ownership.', 'not_started', true, 'Record the review date, reviewer and remediation evidence before changing this to verified.'),
    ('audit-forensics', 'Security & monitoring', 'Install and verify append-only audit/order forensics', 'Apply the auth, delivery and forensics migrations; test order/kitchen/delivery timeline capture and run the audit hash-chain verification.', 'in_progress', true, 'Application support and migration are in source, but production migration and live verification are pending.'),
    ('legal-policies', 'Legal & privacy', 'Review privacy, terms, delivery, cancellation and refund policies', 'Confirm published policies match actual data processing, support channels, cancellation/refund rules and delivery coverage.', 'in_progress', true, 'Policy routes exist; legal accuracy and publication approval require human review.'),
    ('data-rights', 'Legal & privacy', 'Document customer data access, correction, deletion and retention', 'Set a response owner and procedure for data-subject requests, retention, access controls and incident notification with qualified advice.', 'not_started', true, 'Operational handling and legal review are not established by the available source checks.'),
    ('alcohol-compliance', 'Legal & privacy', 'Verify county alcohol licensing, sale restrictions and delivery obligations', 'Obtain qualified advice for the operating county and online-sale model; record required permits, restrictions and responsible-delivery procedure.', 'not_started', true, 'This is an external business/compliance check, not something source code can establish.'),
    ('age-eligibility', 'Legal & privacy', 'Validate customer age/eligibility checks for regulated products', 'Agree the required eligibility verification and delivery handoff process with a qualified compliance adviser; test it end to end.', 'not_started', true, 'A simple age popup alone is not evidence that applicable obligations are satisfied.'),
    ('marketing-consent', 'Legal & privacy', 'Verify separate transactional and promotional consent and opt-out', 'Test consent defaults, preference changes, opt-out propagation and audience exclusions across email, SMS and WhatsApp.', 'in_progress', true, 'Consent and preference surfaces exist; every channel and send path still needs acceptance testing.'),
    ('business-registration', 'Business operations', 'Confirm company, tax, banking, permits and contract ownership', 'Verify business registration, KRA PIN, accounting, bank/payment settlement ownership, county permits and supplier/rider/merchant agreements.', 'not_started', true, 'These are business-owner and legal/accounting checks.'),
    ('unit-economics', 'Business operations', 'Record recurring launch costs and validate true contribution reporting', 'Budget hosting, Supabase, email/SMS/WhatsApp, payments, maps, monitoring, backups, delivery and tax/accounting costs; validate margin inputs.', 'not_started', true, 'Customer economics surfaces do not prove all costs or contribution formulas are populated and accurate.'),
    ('catalog-inventory', 'Catalog & inventory', 'Reconcile product data, prices, stock, SKU, categories and availability', 'Review every launch product against physical stock, sale price, cost, category, image, description, tax treatment and availability.', 'in_progress', true, 'Catalog and inventory tools exist; actual warehouse reconciliation is external.'),
    ('checkout-stock-validation', 'Catalog & inventory', 'Exercise checkout inventory reservation and oversell protection', 'Test concurrent checkout, low stock, cancellation, payment failure and stock restoration against actual inventory rules.', 'in_progress', true, 'Source flows exist; live race and recovery behavior is unverified.'),
    ('delivery-coverage', 'Catalog & inventory', 'Confirm delivery zones, fees, minimum order and operating hours', 'Publish zones, delivery pricing, order thresholds and hours; verify unavailable addresses are rejected or clearly handled.', 'in_progress', true, 'Settings and dispatch surfaces exist; business configuration needs review.'),
    ('customer-support', 'Customer support', 'Test support contact channels and connected case handling', 'Verify support phone, email, WhatsApp and contact form; ensure tickets can be tied to customer, order, payment and delivery.', 'in_progress', true, 'Support surfaces exist; channel delivery and full case linkage require live testing.'),
    ('release-testing', 'Testing & launch', 'Run full customer-to-order-to-invoice-to-delivery acceptance tests', 'Simulate sign-up, search, cart, payment, order operations, food kitchen where relevant, dispatch, customer update, invoice and audit timeline.', 'not_started', true, 'A passing build is not an end-to-end business acceptance test.'),
    ('payment-failure-tests', 'Testing & launch', 'Record payment success, failure, duplicate, delay and refund test evidence', 'Store safe test references and outcomes; never store card credentials, tokens or other payment secrets as evidence.', 'not_started', true, 'Must be exercised against a test/live-like provider account.'),
    ('production-smoke', 'Testing & launch', 'Run production smoke checks after a controlled deployment', 'Check storefront, search, checkout, admin queues, customer communication, operational status changes, monitoring and rollback.', 'not_started', true, 'Record deployment, timestamp and smoke-test evidence.'),
    ('controlled-beta', 'Testing & launch', 'Complete a small controlled customer beta and close critical findings', 'Run a limited pilot, collect issues, resolve critical operational failures and explicitly approve a wider public launch.', 'not_started', true, 'Do not treat source/build verification as customer beta evidence.'),
    ('search-demand', 'Customer demand', 'Review consented storefront searches and zero-result demand gaps', 'Verify analytics consent gating and migration, then review popular queries and queries with no catalog results before buying new stock.', 'in_progress', false, 'Search events are tracked in source; run the launch-readiness migration and collect consented traffic.'),
    ('staff-performance', 'Business forensics', 'Capture attributed staff actions without equating open time with active work', 'Review employee actor identity, meaningful status changes, session boundaries and honest active/queue/processing time definitions.', 'not_started', false, 'Page-open time is not employee work time; implement/validate appropriate operational instrumentation.'),
    ('rider-forensics', 'Business forensics', 'Instrument rider milestones and GPS with freshness and privacy controls', 'Distinguish unavailable GPS, stationary signals and no operational activity; verify access, retention and rider consent/notice.', 'in_progress', false, 'Delivery milestones exist; GPS freshness, full journey instrumentation and privacy behavior need validation.'),
    ('bottleneck-risk', 'Business forensics', 'Validate stage timing, bottleneck thresholds and exception alerts', 'Set evidence-based targets; test delayed/stalled orders, large inventory adjustments, repeated cancellations/refunds and manual overrides.', 'not_started', false, 'Do not infer misconduct or idle time solely from GPS or a screen being open.'),
    ('investigation-search', 'Business forensics', 'Validate forensic search and order “who touched this?” timelines', 'Search an order, staff member, rider, product and date range; verify actors, before/after state, timestamps and chain verification.', 'in_progress', false, 'Order timeline and search controls are present; production data and permission checks require verification.')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_launch_search_insights(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    search_term TEXT,
    search_count BIGINT,
    unique_sessions BIGINT,
    zero_result_count BIGINT,
    average_results NUMERIC,
    last_searched_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH bounds AS (
        SELECT now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 90)) AS since_at
    ),
    search_events AS (
        SELECT
            lower(btrim(ae.payload ->> 'query')) AS term,
            COALESCE(ae.session_id, ae.anonymous_id, ae.id::TEXT) AS session_id,
            CASE
                WHEN ae.payload ->> 'results_count' ~ '^[0-9]+$'
                THEN (ae.payload ->> 'results_count')::INTEGER
                ELSE NULL
            END AS results_count,
            ae.created_at
        FROM public.analytics_events ae
        CROSS JOIN bounds
        WHERE ae.event_name IN ('SEARCH_SUBMITTED', 'SEARCH')
          AND ae.created_at >= bounds.since_at
          AND ae.payload ->> 'analytics_consent' = 'true'
          AND char_length(btrim(COALESCE(ae.payload ->> 'query', ''))) BETWEEN 2 AND 80
          AND position('@' IN (ae.payload ->> 'query')) = 0
          AND (ae.payload ->> 'query') !~ '^[+0-9() .-]{7,}$'
    ),
    zero_events AS (
        SELECT
            lower(btrim(ae.payload ->> 'query')) AS term,
            count(*)::BIGINT AS zero_count
        FROM public.analytics_events ae
        CROSS JOIN bounds
        WHERE ae.event_name = 'ZERO_RESULTS'
          AND ae.created_at >= bounds.since_at
          AND ae.payload ->> 'analytics_consent' = 'true'
          AND char_length(btrim(COALESCE(ae.payload ->> 'query', ''))) BETWEEN 2 AND 80
          AND position('@' IN (ae.payload ->> 'query')) = 0
          AND (ae.payload ->> 'query') !~ '^[+0-9() .-]{7,}$'
        GROUP BY lower(btrim(ae.payload ->> 'query'))
    )
    SELECT
        searches.term,
        count(*)::BIGINT,
        count(DISTINCT searches.session_id)::BIGINT,
        COALESCE(max(zero_events.zero_count), 0)::BIGINT,
        round(avg(searches.results_count)::NUMERIC, 1),
        max(searches.created_at)
    FROM search_events searches
    LEFT JOIN zero_events ON zero_events.term = searches.term
    GROUP BY searches.term, zero_events.zero_count
    ORDER BY count(*) DESC, max(searches.created_at) DESC
    LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_launch_search_insights(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_launch_search_insights(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
