-- Merchant payable ledger and guarded M-Pesa B2C settlements.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql and DARAJA_CHECKOUT_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NULL
     OR to_regclass('public.merchant_product_batches') IS NULL
     OR to_regclass('public.merchant_order_item_trace') IS NULL
     OR to_regclass('public.merchant_fulfillment_events') IS NULL
     OR to_regclass('public.merchant_inventory_movements') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL THEN
    RAISE EXCEPTION 'Merchant settlement prerequisites are missing.'
      USING HINT = 'Apply MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql first.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_settlement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  merchant_share_bps INTEGER NOT NULL CHECK (merchant_share_bps BETWEEN 1 AND 10000),
  minimum_payout_kes INTEGER NOT NULL CHECK (minimum_payout_kes BETWEEN 1 AND 250000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  created_by TEXT NOT NULL CHECK (char_length(trim(created_by)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (application_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_settlement_policy_one_active_idx
  ON public.merchant_settlement_policies (application_id)
  WHERE is_active AND effective_until IS NULL;

CREATE TABLE IF NOT EXISTS public.merchant_payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method = 'mpesa'),
  encrypted_account TEXT NOT NULL,
  masked_account TEXT NOT NULL CHECK (masked_account ~ '^[*]{4}[0-9]{4}$'),
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  is_current BOOLEAN NOT NULL DEFAULT true,
  submitted_by TEXT NOT NULL CHECK (char_length(trim(submitted_by)) BETWEEN 1 AND 200),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (verification_status = 'verified' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    OR (verification_status <> 'verified' AND verified_by IS NULL AND verified_at IS NULL)
  ),
  CHECK (review_note IS NULL OR char_length(review_note) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_payout_one_current_destination_idx
  ON public.merchant_payout_destinations (application_id)
  WHERE is_current;
CREATE INDEX IF NOT EXISTS merchant_payout_destination_status_idx
  ON public.merchant_payout_destinations (verification_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_payable_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id BIGINT REFERENCES public.order_items(id) ON DELETE RESTRICT,
  policy_id UUID REFERENCES public.merchant_settlement_policies(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale', 'adjustment')),
  gross_amount_kes NUMERIC(14, 2),
  merchant_share_bps INTEGER,
  amount_kes NUMERIC(14, 2) NOT NULL CHECK (amount_kes <> 0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  actor TEXT NOT NULL CHECK (char_length(trim(actor)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  CHECK (
    (entry_type = 'sale' AND order_id IS NOT NULL AND order_item_id IS NOT NULL
      AND policy_id IS NOT NULL AND gross_amount_kes > 0
      AND merchant_share_bps BETWEEN 1 AND 10000 AND amount_kes > 0)
    OR (entry_type = 'adjustment' AND policy_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_payable_sale_once_idx
  ON public.merchant_payable_ledger (application_id, order_id, order_item_id)
  WHERE entry_type = 'sale';
CREATE INDEX IF NOT EXISTS merchant_payable_ledger_application_idx
  ON public.merchant_payable_ledger (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_payable_ledger_order_idx
  ON public.merchant_payable_ledger (order_id, order_item_id);

CREATE TABLE IF NOT EXISTS public.merchant_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  destination_id UUID NOT NULL REFERENCES public.merchant_payout_destinations(id) ON DELETE RESTRICT,
  amount_kes NUMERIC(14, 2) NOT NULL CHECK (amount_kes > 0 AND amount_kes = trunc(amount_kes)),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'processing', 'paid', 'rejected', 'failed')),
  requested_by TEXT NOT NULL CHECK (char_length(trim(requested_by)) BETWEEN 1 AND 200),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  provider_reference TEXT,
  mpesa_receipt TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('approved', 'processing', 'paid') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR status NOT IN ('approved', 'processing', 'paid')
  ),
  CHECK (mpesa_receipt IS NULL OR mpesa_receipt ~ '^[A-Za-z0-9]{6,20}$'),
  CHECK (failure_message IS NULL OR char_length(failure_message) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_settlement_one_open_request_idx
  ON public.merchant_settlements (application_id)
  WHERE status IN ('requested', 'approved', 'processing');
CREATE INDEX IF NOT EXISTS merchant_settlement_status_idx
  ON public.merchant_settlements (status, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_settlement_application_idx
  ON public.merchant_settlements (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL UNIQUE REFERENCES public.merchant_settlements(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'daraja_b2c'),
  callback_token_hash TEXT NOT NULL UNIQUE CHECK (callback_token_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing', 'queued', 'unknown', 'paid', 'failed')),
  originator_conversation_id TEXT,
  conversation_id TEXT,
  provider_receipt TEXT,
  provider_result_code TEXT,
  provider_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (provider_receipt IS NULL OR provider_receipt ~ '^[A-Za-z0-9]{6,20}$'),
  CHECK (provider_message IS NULL OR char_length(provider_message) <= 1000)
);

CREATE TABLE IF NOT EXISTS public.merchant_settlement_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  settlement_id UUID REFERENCES public.merchant_settlements(id) ON DELETE RESTRICT,
  destination_id UUID REFERENCES public.merchant_payout_destinations(id) ON DELETE RESTRICT,
  actor TEXT NOT NULL CHECK (char_length(trim(actor)) BETWEEN 1 AND 200),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'policy_updated', 'destination_submitted', 'destination_verified',
    'destination_rejected', 'payables_generated', 'adjustment_created',
    'payout_requested', 'payout_approved', 'payout_rejected',
    'payout_submitted', 'payout_paid', 'payout_failed'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_settlement_events_application_idx
  ON public.merchant_settlement_events (application_id, created_at DESC);

ALTER TABLE public.merchant_settlement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payout_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payable_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_settlement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
  public.merchant_settlement_policies,
  public.merchant_payout_destinations,
  public.merchant_payable_ledger,
  public.merchant_settlements,
  public.merchant_payout_attempts,
  public.merchant_settlement_events
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.merchant_settlement_policies,
  public.merchant_payout_destinations,
  public.merchant_settlements,
  public.merchant_payout_attempts
TO service_role;
GRANT SELECT, INSERT ON TABLE
  public.merchant_payable_ledger,
  public.merchant_settlement_events
TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
  public.merchant_payable_ledger_id_seq,
  public.merchant_settlement_events_id_seq
TO service_role;

CREATE OR REPLACE FUNCTION public.reject_merchant_settlement_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Merchant settlement ledger and event history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS merchant_payable_ledger_append_only ON public.merchant_payable_ledger;
CREATE TRIGGER merchant_payable_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.merchant_payable_ledger
  FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_settlement_history_mutation();
DROP TRIGGER IF EXISTS merchant_settlement_events_append_only ON public.merchant_settlement_events;
CREATE TRIGGER merchant_settlement_events_append_only
  BEFORE UPDATE OR DELETE ON public.merchant_settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_settlement_history_mutation();

CREATE OR REPLACE FUNCTION public.set_merchant_settlement_policy(
  p_application_id UUID,
  p_merchant_share_bps INTEGER,
  p_minimum_payout_kes INTEGER,
  p_enabled BOOLEAN,
  p_actor TEXT
)
RETURNS public.merchant_settlement_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_policy public.merchant_settlement_policies%ROWTYPE;
  next_policy public.merchant_settlement_policies%ROWTYPE;
  next_version INTEGER;
BEGIN
  IF p_application_id IS NULL OR p_enabled IS NULL
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1
     OR p_merchant_share_bps IS NULL OR p_merchant_share_bps NOT BETWEEN 1 AND 10000
     OR p_minimum_payout_kes IS NULL OR p_minimum_payout_kes NOT BETWEEN 1 AND 250000 THEN
    RAISE EXCEPTION 'Valid seller share, minimum payout and operator are required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved merchant business is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_application_id::TEXT, 0));
  SELECT * INTO current_policy
  FROM public.merchant_settlement_policies
  WHERE application_id = p_application_id AND is_active AND effective_until IS NULL
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.merchant_settlement_policies
    SET is_active = false, effective_until = now()
    WHERE id = current_policy.id;
  END IF;

  IF NOT p_enabled THEN
    IF current_policy.id IS NULL THEN
      RAISE EXCEPTION 'No active merchant settlement policy exists to disable.';
    END IF;
    INSERT INTO public.merchant_settlement_events (
      application_id, actor, event_type, details
    ) VALUES (
      p_application_id, trim(p_actor), 'policy_updated',
      jsonb_build_object('policy_id', current_policy.id, 'version', current_policy.version, 'enabled', false)
    );
    SELECT * INTO current_policy
    FROM public.merchant_settlement_policies
    WHERE id = current_policy.id;
    RETURN current_policy;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM public.merchant_settlement_policies
  WHERE application_id = p_application_id;

  INSERT INTO public.merchant_settlement_policies (
    application_id, version, merchant_share_bps, minimum_payout_kes, is_active, created_by
  ) VALUES (
    p_application_id, next_version, p_merchant_share_bps, p_minimum_payout_kes, p_enabled, trim(p_actor)
  )
  RETURNING * INTO next_policy;

  INSERT INTO public.merchant_settlement_events (
    application_id, actor, event_type, details
  ) VALUES (
    p_application_id, trim(p_actor), 'policy_updated',
    jsonb_build_object(
      'policy_id', next_policy.id,
      'version', next_version,
      'merchant_share_bps', p_merchant_share_bps,
      'minimum_payout_kes', p_minimum_payout_kes,
      'enabled', p_enabled
    )
  );
  RETURN next_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_merchant_payout_destination(
  p_application_id UUID,
  p_encrypted_account TEXT,
  p_masked_account TEXT,
  p_actor TEXT
)
RETURNS public.merchant_payout_destinations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  created_destination public.merchant_payout_destinations%ROWTYPE;
BEGIN
  IF p_application_id IS NULL
     OR p_encrypted_account IS NULL OR char_length(p_encrypted_account) NOT BETWEEN 1 AND 2048
     OR p_masked_account !~ '^[*]{4}[0-9]{4}$'
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
    RAISE EXCEPTION 'A valid encrypted M-Pesa destination and merchant are required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved merchant business is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_application_id::TEXT, 0));
  UPDATE public.merchant_payout_destinations
  SET is_current = false, updated_at = now()
  WHERE application_id = p_application_id AND is_current;

  INSERT INTO public.merchant_payout_destinations (
    application_id, method, encrypted_account, masked_account,
    verification_status, submitted_by
  ) VALUES (
    p_application_id, 'mpesa', p_encrypted_account, p_masked_account,
    'pending', trim(p_actor)
  )
  RETURNING * INTO created_destination;

  INSERT INTO public.merchant_settlement_events (
    application_id, destination_id, actor, event_type, details
  ) VALUES (
    p_application_id, created_destination.id, trim(p_actor), 'destination_submitted',
    jsonb_build_object('method', 'mpesa', 'masked_account', p_masked_account)
  );
  RETURN created_destination;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_merchant_payout_destination(
  p_destination_id UUID,
  p_action TEXT,
  p_actor TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.merchant_payout_destinations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  destination public.merchant_payout_destinations%ROWTYPE;
  next_status TEXT;
BEGIN
  IF p_destination_id IS NULL OR p_action IS NULL OR p_action NOT IN ('verify', 'reject')
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1
     OR p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'A valid payout destination review is required.';
  END IF;
  SELECT * INTO destination
  FROM public.merchant_payout_destinations
  WHERE id = p_destination_id
  FOR UPDATE;
  IF NOT FOUND OR NOT destination.is_current OR destination.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending current payout destination can be reviewed.';
  END IF;
  IF p_action = 'reject' AND char_length(trim(COALESCE(p_note, ''))) < 5 THEN
    RAISE EXCEPTION 'A reason is required when rejecting a payout destination.';
  END IF;
  next_status := CASE WHEN p_action = 'verify' THEN 'verified' ELSE 'rejected' END;

  UPDATE public.merchant_payout_destinations
  SET verification_status = next_status,
      verified_by = CASE WHEN next_status = 'verified' THEN trim(p_actor) ELSE NULL END,
      verified_at = CASE WHEN next_status = 'verified' THEN now() ELSE NULL END,
      review_note = NULLIF(trim(COALESCE(p_note, '')), ''),
      updated_at = now()
  WHERE id = destination.id
  RETURNING * INTO destination;

  INSERT INTO public.merchant_settlement_events (
    application_id, destination_id, actor, event_type, details
  ) VALUES (
    destination.application_id, destination.id, trim(p_actor),
    CASE WHEN next_status = 'verified' THEN 'destination_verified' ELSE 'destination_rejected' END,
    jsonb_build_object('masked_account', destination.masked_account, 'note', destination.review_note)
  );
  RETURN destination;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_merchant_settlement_adjustment(
  p_application_id UUID,
  p_amount_kes NUMERIC,
  p_idempotency_key TEXT,
  p_reason TEXT,
  p_actor TEXT
)
RETURNS public.merchant_payable_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  adjustment public.merchant_payable_ledger%ROWTYPE;
BEGIN
  IF p_application_id IS NULL OR p_amount_kes IS NULL
     OR p_amount_kes = 0 OR abs(p_amount_kes) > 10000000
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,180}$'
     OR p_reason IS NULL OR char_length(trim(p_reason)) NOT BETWEEN 5 AND 500
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
    RAISE EXCEPTION 'A bounded adjustment amount, unique reference, reason and operator are required.';
  END IF;
  INSERT INTO public.merchant_payable_ledger (
    application_id, entry_type, amount_kes, idempotency_key, description, actor, metadata
  ) VALUES (
    p_application_id, 'adjustment', p_amount_kes, p_idempotency_key,
    trim(p_reason), trim(p_actor), jsonb_build_object('reason', trim(p_reason))
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO adjustment;
  IF adjustment.id IS NULL THEN
    SELECT * INTO adjustment FROM public.merchant_payable_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF adjustment.application_id <> p_application_id
       OR adjustment.amount_kes <> p_amount_kes
       OR adjustment.description <> trim(p_reason) THEN
      RAISE EXCEPTION 'The adjustment reference has already been used for different data.';
    END IF;
    RETURN adjustment;
  END IF;

  INSERT INTO public.merchant_settlement_events (
    application_id, actor, event_type, details
  ) VALUES (
    p_application_id, trim(p_actor), 'adjustment_created',
    jsonb_build_object('entry_id', adjustment.id, 'amount_kes', p_amount_kes, 'reason', trim(p_reason))
  );
  RETURN adjustment;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_merchant_payables(
  p_application_id UUID,
  p_actor TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF p_application_id IS NULL OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
    RAISE EXCEPTION 'A merchant and operator are required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved merchant business is required.';
  END IF;

  WITH item_quantities AS (
    SELECT
      batch.application_id,
      item.order_id,
      item.id AS order_item_id,
      item.unit_price::NUMERIC(14, 2) AS unit_price,
      order_row.created_at AS order_created_at,
      SUM(trace.quantity)::INTEGER AS traced_quantity,
      COALESCE(returned.quantity, 0)::INTEGER AS returned_quantity
    FROM public.merchant_product_batches AS batch
    JOIN public.merchant_order_item_trace AS trace ON trace.batch_id = batch.id
    JOIN public.order_items AS item ON item.id = trace.order_item_id
    JOIN public.orders AS order_row ON order_row.id = item.order_id
    LEFT JOIN LATERAL (
      SELECT SUM(GREATEST(movement.quantity_delta, 0)) AS quantity
      FROM public.merchant_inventory_movements AS movement
      WHERE movement.order_item_id = item.id
        AND movement.batch_id = batch.id
        AND movement.movement_type = 'returned'
    ) AS returned ON true
    WHERE batch.application_id = p_application_id
      AND order_row.status = 'Delivered'
      AND order_row.payment_verified_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.merchant_fulfillment_events AS event
        WHERE event.application_id = batch.application_id
          AND event.order_id = order_row.id
          AND event.event_type = 'delivered'
      )
    GROUP BY batch.application_id, item.order_id, item.id, item.unit_price,
      order_row.created_at, returned.quantity
  ),
  merchant_items AS (
    SELECT
      quantity.application_id,
      quantity.order_id,
      quantity.order_item_id,
      quantity.unit_price,
      quantity.order_created_at,
      GREATEST(quantity.traced_quantity - quantity.returned_quantity, 0) AS quantity,
      policy.id AS policy_id,
      policy.merchant_share_bps
    FROM item_quantities AS quantity
    JOIN LATERAL (
      SELECT candidate.id, candidate.merchant_share_bps
      FROM public.merchant_settlement_policies AS candidate
      WHERE candidate.application_id = quantity.application_id
        AND candidate.effective_from <= quantity.order_created_at
        AND (candidate.effective_until IS NULL OR quantity.order_created_at < candidate.effective_until)
      ORDER BY candidate.version DESC
      LIMIT 1
    ) AS policy ON true
    WHERE quantity.traced_quantity > quantity.returned_quantity
  )
  INSERT INTO public.merchant_payable_ledger (
    application_id, order_id, order_item_id, policy_id, entry_type,
    gross_amount_kes, merchant_share_bps, amount_kes, idempotency_key,
    description, actor, metadata
  )
  SELECT
    item.application_id,
    item.order_id,
    item.order_item_id,
    item.policy_id,
    'sale',
    ROUND(item.unit_price * item.quantity, 2),
    item.merchant_share_bps,
    ROUND(item.unit_price * item.quantity * item.merchant_share_bps / 10000, 2),
    format('merchant-sale:%s:%s', item.application_id, item.order_item_id),
    format('Merchant share for delivered order #%s item #%s', item.order_id, item.order_item_id),
    trim(p_actor),
    jsonb_build_object('quantity', item.quantity)
  FROM merchant_items AS item
  WHERE item.quantity > 0
    AND item.unit_price > 0
    AND ROUND(item.unit_price * item.quantity * item.merchant_share_bps / 10000, 2) > 0
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  INSERT INTO public.merchant_settlement_events (
    application_id, actor, event_type, details
  ) VALUES (
    p_application_id, trim(p_actor), 'payables_generated',
    jsonb_build_object('inserted_count', inserted_count)
  );
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_merchant_settlement(
  p_application_id UUID,
  p_destination_id UUID,
  p_actor TEXT
)
RETURNS public.merchant_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  active_policy public.merchant_settlement_policies%ROWTYPE;
  payout_destination public.merchant_payout_destinations%ROWTYPE;
  available_kes NUMERIC(14, 2);
  payout_amount NUMERIC(14, 2);
  created_settlement public.merchant_settlements%ROWTYPE;
BEGIN
  IF p_application_id IS NULL OR p_destination_id IS NULL
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
    RAISE EXCEPTION 'A merchant, verified payout destination and operator are required.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_application_id::TEXT, 0));

  SELECT * INTO active_policy
  FROM public.merchant_settlement_policies
  WHERE application_id = p_application_id AND is_active AND effective_until IS NULL
  ORDER BY version DESC LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant settlement terms are not configured.';
  END IF;

  SELECT * INTO payout_destination
  FROM public.merchant_payout_destinations
  WHERE id = p_destination_id
    AND application_id = p_application_id
    AND is_current
    AND verification_status = 'verified'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A verified current M-Pesa payout destination is required.';
  END IF;

  SELECT COALESCE(SUM(entry.amount_kes), 0)
    - COALESCE((
      SELECT SUM(settlement.amount_kes)
      FROM public.merchant_settlements AS settlement
      WHERE settlement.application_id = p_application_id
        AND settlement.status IN ('requested', 'approved', 'processing', 'paid')
    ), 0)
  INTO available_kes
  FROM public.merchant_payable_ledger AS entry
  WHERE entry.application_id = p_application_id;

  payout_amount := floor(available_kes);
  IF payout_amount < active_policy.minimum_payout_kes THEN
    RAISE EXCEPTION 'Available payout balance is below the configured minimum.';
  END IF;

  INSERT INTO public.merchant_settlements (
    application_id, destination_id, amount_kes, status, requested_by
  ) VALUES (
    p_application_id, p_destination_id, payout_amount, 'requested', trim(p_actor)
  )
  RETURNING * INTO created_settlement;

  INSERT INTO public.merchant_settlement_events (
    application_id, settlement_id, destination_id, actor, event_type, details
  ) VALUES (
    p_application_id, created_settlement.id, p_destination_id, trim(p_actor),
    'payout_requested',
    jsonb_build_object('amount_kes', payout_amount, 'policy_id', active_policy.id)
  );
  RETURN created_settlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_merchant_settlement_summary(
  p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ledger_total NUMERIC(14, 2);
  reserved_total NUMERIC(14, 2);
  pending_total NUMERIC(14, 2);
  paid_total NUMERIC(14, 2);
  summary JSONB;
BEGIN
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'A merchant business is required.';
  END IF;
  SELECT COALESCE(SUM(amount_kes), 0) INTO ledger_total
  FROM public.merchant_payable_ledger
  WHERE application_id = p_application_id;

  SELECT
    COALESCE(SUM(amount_kes) FILTER (WHERE status IN ('requested', 'approved', 'processing', 'paid')), 0),
    COALESCE(SUM(amount_kes) FILTER (WHERE status IN ('requested', 'approved', 'processing')), 0),
    COALESCE(SUM(amount_kes) FILTER (WHERE status = 'paid'), 0)
  INTO reserved_total, pending_total, paid_total
  FROM public.merchant_settlements
  WHERE application_id = p_application_id;

  SELECT jsonb_build_object(
    'policy', (
      SELECT jsonb_build_object(
        'version', version,
        'merchant_share_bps', merchant_share_bps,
        'minimum_payout_kes', minimum_payout_kes,
        'enabled', is_active
      )
      FROM public.merchant_settlement_policies
      WHERE application_id = p_application_id AND is_active AND effective_until IS NULL
      ORDER BY version DESC LIMIT 1
    ),
    'destination', (
      SELECT jsonb_build_object(
        'id', id,
        'method', method,
        'masked_account', masked_account,
        'verification_status', verification_status,
        'review_note', review_note
      )
      FROM public.merchant_payout_destinations
      WHERE application_id = p_application_id AND is_current
      ORDER BY created_at DESC LIMIT 1
    ),
    'balances', jsonb_build_object(
      'ledger_total_kes', ledger_total,
      'available_kes', ledger_total - reserved_total,
      'pending_kes', pending_total,
      'paid_kes', paid_total
    ),
    'entries', COALESCE((
      SELECT jsonb_agg(entry_row)
      FROM (
        SELECT id, entry_type, order_id, order_item_id, amount_kes, description, created_at
        FROM public.merchant_payable_ledger
        WHERE application_id = p_application_id
        ORDER BY created_at DESC, id DESC
        LIMIT 25
      ) AS entry_row
    ), '[]'::JSONB),
    'settlements', COALESCE((
      SELECT jsonb_agg(settlement_row)
      FROM (
        SELECT id, amount_kes, status, provider_reference, mpesa_receipt,
          failure_message, created_at, updated_at
        FROM public.merchant_settlements
        WHERE application_id = p_application_id
        ORDER BY created_at DESC, id DESC
        LIMIT 25
      ) AS settlement_row
    ), '[]'::JSONB)
  ) INTO summary;
  RETURN summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_merchant_settlement(
  p_settlement_id UUID,
  p_action TEXT,
  p_actor TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.merchant_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payout public.merchant_settlements%ROWTYPE;
  destination public.merchant_payout_destinations%ROWTYPE;
  next_status TEXT;
BEGIN
  IF p_settlement_id IS NULL OR p_action NOT IN ('approve', 'reject')
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1
     OR p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'A valid settlement review action is required.';
  END IF;
  SELECT * INTO payout
  FROM public.merchant_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;
  IF NOT FOUND OR payout.status <> 'requested' THEN
    RAISE EXCEPTION 'Only a requested settlement can be reviewed.';
  END IF;
  IF p_action = 'approve' THEN
    SELECT * INTO destination
    FROM public.merchant_payout_destinations
    WHERE id = payout.destination_id
      AND application_id = payout.application_id
      AND is_current
      AND verification_status = 'verified'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The settlement payout destination is not verified.';
    END IF;
    next_status := 'approved';
  ELSE
    IF char_length(trim(COALESCE(p_note, ''))) < 5 THEN
      RAISE EXCEPTION 'A reason is required when rejecting a settlement.';
    END IF;
    next_status := 'rejected';
  END IF;

  UPDATE public.merchant_settlements
  SET status = next_status,
      approved_by = CASE WHEN next_status = 'approved' THEN trim(p_actor) ELSE NULL END,
      approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END,
      failure_message = CASE WHEN next_status = 'rejected' THEN trim(p_note) ELSE NULL END,
      updated_at = now()
  WHERE id = payout.id
  RETURNING * INTO payout;

  INSERT INTO public.merchant_settlement_events (
    application_id, settlement_id, actor, event_type, details
  ) VALUES (
    payout.application_id, payout.id, trim(p_actor),
    CASE WHEN next_status = 'approved' THEN 'payout_approved' ELSE 'payout_rejected' END,
    jsonb_build_object('note', NULLIF(trim(COALESCE(p_note, '')), ''))
  );
  RETURN payout;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_merchant_payout_attempt(
  p_settlement_id UUID,
  p_callback_token_hash TEXT,
  p_actor TEXT
)
RETURNS public.merchant_payout_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payout public.merchant_settlements%ROWTYPE;
  attempt public.merchant_payout_attempts%ROWTYPE;
BEGIN
  IF p_settlement_id IS NULL
     OR p_callback_token_hash !~ '^[0-9a-f]{64}$'
     OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
    RAISE EXCEPTION 'A valid payout and callback token are required.';
  END IF;
  SELECT * INTO payout FROM public.merchant_settlements
    WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND OR payout.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved settlement can be sent to the payout provider.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.merchant_payout_destinations
    WHERE id = payout.destination_id AND application_id = payout.application_id
      AND is_current AND verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'A verified current payout destination is required.';
  END IF;

  INSERT INTO public.merchant_payout_attempts (
    settlement_id, provider, callback_token_hash, status
  ) VALUES (
    payout.id, 'daraja_b2c', p_callback_token_hash, 'initializing'
  )
  RETURNING * INTO attempt;

  UPDATE public.merchant_settlements
  SET status = 'processing', updated_at = now()
  WHERE id = payout.id;

  INSERT INTO public.merchant_settlement_events (
    application_id, settlement_id, actor, event_type, details
  ) VALUES (
    payout.application_id, payout.id, trim(p_actor), 'payout_submitted',
    jsonb_build_object('provider', 'daraja_b2c')
  );
  RETURN attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_merchant_payout_submission(
  p_attempt_id UUID,
  p_conversation_id TEXT,
  p_originator_conversation_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_attempt_id IS NULL OR NULLIF(trim(p_conversation_id), '') IS NULL
     OR NULLIF(trim(p_originator_conversation_id), '') IS NULL THEN
    RAISE EXCEPTION 'Payout provider references are required.';
  END IF;
  UPDATE public.merchant_payout_attempts
  SET status = 'queued',
      conversation_id = trim(p_conversation_id),
      originator_conversation_id = trim(p_originator_conversation_id),
      updated_at = now()
  WHERE id = p_attempt_id AND status = 'initializing';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_merchant_payout_unknown(
  p_attempt_id UUID,
  p_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_attempt_id IS NULL OR NULLIF(trim(p_message), '') IS NULL
     OR char_length(p_message) > 1000 THEN
    RAISE EXCEPTION 'A payout attempt and provider outcome are required.';
  END IF;
  UPDATE public.merchant_payout_attempts
  SET status = 'unknown', provider_message = trim(p_message), updated_at = now()
  WHERE id = p_attempt_id AND status = 'initializing';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_merchant_payout_result(
  p_callback_token_hash TEXT,
  p_success BOOLEAN,
  p_result_code TEXT,
  p_result_message TEXT,
  p_receipt TEXT,
  p_conversation_id TEXT,
  p_originator_conversation_id TEXT,
  p_amount_kes NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  attempt public.merchant_payout_attempts%ROWTYPE;
  payout public.merchant_settlements%ROWTYPE;
  next_status TEXT;
BEGIN
  IF p_callback_token_hash !~ '^[0-9a-f]{64}$'
     OR p_success IS NULL
     OR p_result_message IS NULL OR char_length(p_result_message) > 1000
     OR p_result_code IS NULL OR char_length(p_result_code) > 32
     OR p_success AND (
       p_receipt IS NULL OR p_receipt !~ '^[A-Za-z0-9]{6,20}$'
       OR p_amount_kes IS NULL OR p_amount_kes <= 0
     ) THEN
    RAISE EXCEPTION 'Invalid payout callback data.';
  END IF;
  SELECT * INTO attempt
  FROM public.merchant_payout_attempts
  WHERE callback_token_hash = p_callback_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF attempt.status IN ('paid', 'failed') THEN
    RETURN attempt.status;
  END IF;
  IF p_conversation_id IS NOT NULL AND attempt.conversation_id IS NOT NULL
     AND p_conversation_id <> attempt.conversation_id THEN
    RETURN 'mismatch';
  END IF;
  IF p_originator_conversation_id IS NOT NULL
     AND attempt.originator_conversation_id IS NOT NULL
     AND p_originator_conversation_id <> attempt.originator_conversation_id THEN
    RETURN 'mismatch';
  END IF;
  SELECT * INTO payout FROM public.merchant_settlements
    WHERE id = attempt.settlement_id FOR UPDATE;
  IF NOT FOUND OR payout.status <> 'processing' THEN
    RETURN 'inactive';
  END IF;
  IF p_success AND p_amount_kes <> payout.amount_kes THEN
    RETURN 'mismatch';
  END IF;

  next_status := CASE WHEN p_success THEN 'paid' ELSE 'failed' END;
  UPDATE public.merchant_payout_attempts
  SET status = next_status,
      provider_result_code = p_result_code,
      provider_message = left(p_result_message, 1000),
      provider_receipt = CASE WHEN p_success THEN p_receipt ELSE NULL END,
      updated_at = now()
  WHERE id = attempt.id;

  UPDATE public.merchant_settlements
  SET status = next_status,
      provider_reference = COALESCE(NULLIF(trim(p_conversation_id), ''), provider_reference),
      mpesa_receipt = CASE WHEN p_success THEN p_receipt ELSE NULL END,
      failure_message = CASE WHEN p_success THEN NULL ELSE left(p_result_message, 1000) END,
      updated_at = now()
  WHERE id = payout.id;

  INSERT INTO public.merchant_settlement_events (
    application_id, settlement_id, actor, event_type, details
  ) VALUES (
    payout.application_id, payout.id, 'safaricom_b2c',
    CASE WHEN p_success THEN 'payout_paid' ELSE 'payout_failed' END,
    jsonb_build_object(
      'provider', 'daraja_b2c',
      'result_code', p_result_code,
      'message', left(p_result_message, 1000),
      'receipt', CASE WHEN p_success THEN p_receipt ELSE NULL END
    )
  );
  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_merchant_settlement_policy(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_merchant_payout_destination(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_merchant_payout_destination(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_merchant_settlement_adjustment(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_merchant_payables(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_merchant_settlement(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_merchant_settlement_summary(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_merchant_settlement(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_merchant_payout_attempt(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_merchant_payout_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_merchant_payout_unknown(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_merchant_payout_result(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_merchant_settlement_policy(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_merchant_payout_destination(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_merchant_payout_destination(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_merchant_settlement_adjustment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_merchant_payables(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_merchant_settlement(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_merchant_settlement_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_merchant_settlement(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_merchant_payout_attempt(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_merchant_payout_submission(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_merchant_payout_unknown(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_merchant_payout_result(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

COMMIT;
