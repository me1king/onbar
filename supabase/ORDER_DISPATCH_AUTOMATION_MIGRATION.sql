-- Durable automatic rider dispatch retries.
-- Run after MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.merchant_fulfillment_events') IS NULL
       OR to_regclass('public.dispatch_decisions') IS NULL THEN
        RAISE EXCEPTION 'Order dispatch automation requires the order, merchant fulfillment, and dispatch schemas.'
            USING HINT = 'Run MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_dispatch_automation_jobs (
    order_id BIGINT PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'retry', 'assigned', 'completed', 'manual_review')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 21),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS order_dispatch_automation_jobs_ready_idx
    ON public.order_dispatch_automation_jobs (available_at, created_at)
    WHERE status IN ('queued', 'retry', 'processing');

ALTER TABLE public.order_dispatch_automation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_dispatch_automation_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_dispatch_automation_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_ready_order_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.event_type = 'ready' THEN
        INSERT INTO public.order_dispatch_automation_jobs (order_id)
        VALUES (NEW.order_id)
        ON CONFLICT (order_id) DO UPDATE
        SET status = 'queued',
            attempt_count = 0,
            available_at = now(),
            locked_until = NULL,
            last_error = NULL,
            updated_at = now()
        WHERE public.order_dispatch_automation_jobs.status NOT IN ('assigned', 'completed');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_ready_enqueues_order_dispatch
    ON public.merchant_fulfillment_events;
CREATE TRIGGER merchant_ready_enqueues_order_dispatch
    AFTER INSERT ON public.merchant_fulfillment_events
    FOR EACH ROW EXECUTE FUNCTION public.enqueue_ready_order_dispatch();

INSERT INTO public.order_dispatch_automation_jobs (order_id)
SELECT DISTINCT event.order_id
FROM public.merchant_fulfillment_events AS event
WHERE event.event_type = 'ready'
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_ready_order_dispatch()
RETURNS TABLE (order_id BIGINT, attempt_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    candidate_order_id BIGINT;
BEGIN
    SELECT job.order_id
    INTO candidate_order_id
    FROM public.order_dispatch_automation_jobs AS job
    WHERE (
        job.status IN ('queued', 'retry') AND job.available_at <= now()
    ) OR (
        job.status = 'processing' AND job.locked_until < now()
    )
    ORDER BY job.available_at, job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF candidate_order_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.order_dispatch_automation_jobs AS job
    SET status = 'processing',
        attempt_count = least(job.attempt_count + 1, 21),
        locked_until = now() + INTERVAL '2 minutes',
        updated_at = now()
    WHERE job.order_id = candidate_order_id
    RETURNING job.order_id, job.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ready_order_dispatch(
    p_order_id BIGINT,
    p_outcome TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    current_attempt INTEGER;
    next_status TEXT;
BEGIN
    IF p_outcome NOT IN ('assigned', 'completed', 'retry') THEN
        RAISE EXCEPTION 'Dispatch outcome must be assigned, completed, or retry.';
    END IF;

    SELECT job.attempt_count
    INTO current_attempt
    FROM public.order_dispatch_automation_jobs AS job
    WHERE job.order_id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispatch automation job was not found.';
    END IF;

    IF p_outcome IN ('assigned', 'completed') THEN
        next_status := p_outcome;
        UPDATE public.order_dispatch_automation_jobs
        SET status = next_status,
            locked_until = NULL,
            last_error = NULL,
            assigned_at = CASE WHEN p_outcome = 'assigned' THEN now() ELSE NULL END,
            updated_at = now()
        WHERE order_id = p_order_id;
    ELSIF current_attempt >= 20 THEN
        next_status := 'manual_review';
        UPDATE public.order_dispatch_automation_jobs
        SET status = next_status,
            locked_until = NULL,
            last_error = left(coalesce(p_error, 'Automatic dispatch needs manual review.'), 1000),
            updated_at = now()
        WHERE order_id = p_order_id;
    ELSE
        next_status := 'retry';
        UPDATE public.order_dispatch_automation_jobs
        SET status = next_status,
            available_at = now() + INTERVAL '1 minute',
            locked_until = NULL,
            last_error = left(coalesce(p_error, 'No eligible rider is currently available.'), 1000),
            updated_at = now()
        WHERE order_id = p_order_id;
    END IF;

    RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ready_order_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ready_order_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_ready_order_dispatch(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ready_order_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ready_order_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ready_order_dispatch(BIGINT, TEXT, TEXT) TO service_role;

COMMIT;
