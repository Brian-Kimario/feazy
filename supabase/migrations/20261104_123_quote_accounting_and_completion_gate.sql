-- Quote accounting and the repair completion gate.
--
-- Rules enforced here, in the database, for every caller (app, service role, admin tools):
--   1. fixed:               payable = agreed base price + every approved additional_work quote.
--                           Only additional_work quotes can be created on a fixed-price booking.
--   2. quote_after_inspection: payable = the operative repair quote (latest approved repair revision)
--                           + every approved additional_work quote. Earlier repair revisions are
--                           superseded and never counted.
--   3. inspection (inspection-only visit): payable = the inspection fee (0 when free inspection is on,
--                           which is not payable). No repair quotes can be created for it.
--   4. Completion gate: a quote_after_inspection job cannot move in_progress -> completed unless an
--                           approved repair quote exists. Inspection-only jobs may complete without one.
--   5. Declined, expired, pending and superseded quotes never contribute to the payable amount.
--
-- Open, not changed here: the arrived -> in_progress step for quote_after_inspection still runs the
-- assessment in in_progress, so an assessment can begin before a quote is approved. Only completion
-- is gated. A separate assessing state would be needed to gate the start. See the release package.

-- ---------------------------------------------------------------------------------------------
-- 1. quotes: kind and revision
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_kind text NOT NULL DEFAULT 'repair',
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_quote_kind_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_quote_kind_check
  CHECK (quote_kind IN ('repair', 'additional_work'));

-- Existing quotes on fixed-price bookings were extra work, not repair scope.
UPDATE public.quotes q
SET quote_kind = 'additional_work'
FROM public.jobs j
JOIN public.bookings b ON b.id = j.booking_id
WHERE j.id = q.job_id AND b.pricing_model = 'fixed' AND q.quote_kind = 'repair';

CREATE INDEX IF NOT EXISTS idx_quotes_job_kind_status ON public.quotes (job_id, quote_kind, status);

-- ---------------------------------------------------------------------------------------------
-- 2. create_quote: kind is chosen by the rule for the booking, and validated
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_quote(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_quote(
  p_job_id uuid,
  p_reason text,
  p_items jsonb,
  p_quote_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pricing text;
  v_kind text;
  v_revision integer;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_item jsonb;
  v_type text;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_total numeric := 0;
  v_quote_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.professional_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT pricing_model INTO v_pricing FROM public.bookings WHERE id = v_job.booking_id;

  IF v_pricing = 'inspection' THEN
    RAISE EXCEPTION 'An inspection-only visit does not take repair quotes' USING ERRCODE = '22023';
  END IF;

  v_kind := COALESCE(p_quote_kind,
                     CASE WHEN v_pricing = 'fixed' THEN 'additional_work' ELSE 'repair' END);
  IF v_kind NOT IN ('repair', 'additional_work') THEN
    RAISE EXCEPTION 'Quote kind must be repair or additional_work' USING ERRCODE = '22023';
  END IF;
  IF v_pricing = 'fixed' AND v_kind <> 'additional_work' THEN
    RAISE EXCEPTION 'A fixed-price booking can only take additional-work quotes' USING ERRCODE = '22023';
  END IF;

  IF v_job.current_state <> 'in_progress' THEN
    RAISE EXCEPTION 'A quote can only be sent while the job is in progress (state: %)', v_job.current_state
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'This job already has a quote waiting for the customer' USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) < 1 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1 to 1000 characters' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'A quote needs 1 to 50 line items' USING ERRCODE = '22023';
  END IF;

  -- Validate every item before writing anything.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_type := v_item->>'item_type';
    v_description := btrim(COALESCE(v_item->>'description', ''));
    BEGIN
      v_quantity := (v_item->>'quantity')::numeric;
      v_unit_price := (v_item->>'unit_price')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Quantity and unit price must be numbers' USING ERRCODE = '22023';
    END;
    IF v_type IS NULL OR v_type NOT IN ('labour', 'material', 'fee') THEN
      RAISE EXCEPTION 'Invalid line item type' USING ERRCODE = '22023';
    END IF;
    IF length(v_description) < 1 OR length(v_description) > 300 THEN
      RAISE EXCEPTION 'Line item description must be 1 to 300 characters' USING ERRCODE = '22023';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 10000 THEN
      RAISE EXCEPTION 'Line item quantity must be above 0 and at most 10000' USING ERRCODE = '22023';
    END IF;
    IF v_unit_price IS NULL OR v_unit_price <= 0 OR v_unit_price > 1000000 THEN
      RAISE EXCEPTION 'Line item unit price must be above 0 and at most 1000000' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + round(v_quantity * v_unit_price, 2);
  END LOOP;

  -- Revisions count within a kind: a repair revision is not bumped by an additional-work quote.
  SELECT COALESCE(max(revision), 0) + 1 INTO v_revision
  FROM public.quotes WHERE job_id = p_job_id AND quote_kind = v_kind;

  INSERT INTO public.quotes (job_id, professional_id, subtotal, taxes_or_fees, discount, total, reason,
                             status, quote_kind, revision)
  VALUES (p_job_id, v_job.professional_id, v_total, 0, 0, v_total, v_reason,
          'pending_customer', v_kind, v_revision)
  RETURNING id INTO v_quote_id;

  INSERT INTO public.quote_items (quote_id, item_type, description, quantity, unit_price, line_total)
  SELECT v_quote_id, e->>'item_type', btrim(e->>'description'), (e->>'quantity')::numeric,
         (e->>'unit_price')::numeric, round((e->>'quantity')::numeric * (e->>'unit_price')::numeric, 2)
  FROM jsonb_array_elements(p_items) AS e;

  PERFORM public.transition_job_state(
    p_job_id, 'quote_pending', auth.uid(),
    jsonb_build_object('event_type', 'quote_submitted', 'quote_id', v_quote_id,
                       'quote_kind', v_kind, 'revision', v_revision, 'total', v_total)
  );

  RETURN v_quote_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_quote(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote(uuid, text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Payment amount: explicit components, no double counting
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._job_payment_amount(
  p_job_id   uuid,
  p_customer uuid,
  OUT amount   numeric,
  OUT quote_id uuid,
  OUT booking_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pricing text;
  v_base numeric;
  v_additional numeric;
  v_repair_id uuid;
  v_repair_total numeric;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND OR p_customer IS NULL OR v_job.customer_id IS DISTINCT FROM p_customer THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state <> 'completed' THEN
    RAISE EXCEPTION 'Payment is only available once the job is complete (current state: %)',
      v_job.current_state USING ERRCODE = '22023';
  END IF;

  booking_id := v_job.booking_id;
  SELECT b.pricing_model, b.quoted_or_base_amount INTO v_pricing, v_base
  FROM public.bookings b WHERE b.id = v_job.booking_id;

  -- Approved extra work always adds on top, whatever the pricing model.
  SELECT COALESCE(sum(q.total), 0) INTO v_additional
  FROM public.quotes q
  WHERE q.job_id = p_job_id AND q.status = 'approved' AND q.quote_kind = 'additional_work' AND q.total > 0;

  IF v_pricing = 'quote_after_inspection' THEN
    -- Only the operative repair revision counts: the latest approved one. Earlier ones are superseded.
    SELECT q.id, q.total INTO v_repair_id, v_repair_total
    FROM public.quotes q
    WHERE q.job_id = p_job_id AND q.status = 'approved' AND q.quote_kind = 'repair' AND q.total > 0
    ORDER BY q.revision DESC, q.created_at DESC, q.id DESC
    LIMIT 1;
    IF v_repair_id IS NULL THEN
      RAISE EXCEPTION 'No payable amount: the repair has no customer-approved quote' USING ERRCODE = '22023';
    END IF;
    amount := v_repair_total + v_additional;
    quote_id := v_repair_id;
  ELSIF v_pricing = 'fixed' THEN
    IF v_base IS NULL OR v_base <= 0 THEN
      RAISE EXCEPTION 'No payable amount: the fixed-price booking has no base price' USING ERRCODE = '22023';
    END IF;
    amount := v_base + v_additional;
    SELECT q.id INTO quote_id FROM public.quotes q
    WHERE q.job_id = p_job_id AND q.status = 'approved' AND q.quote_kind = 'additional_work' AND q.total > 0
    ORDER BY q.created_at DESC, q.id DESC LIMIT 1;
  ELSE
    -- Inspection-only visit: the inspection fee, which is 0 (not payable) when free inspection is on.
    IF v_base IS NULL OR v_base <= 0 THEN
      RAISE EXCEPTION 'No payable amount: the inspection visit is free or has no fee' USING ERRCODE = '22023';
    END IF;
    amount := v_base;
    quote_id := NULL;
  END IF;

  amount := round(amount, 2);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._job_payment_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Completion gate, enforced in front of transition_job_state for every caller
-- ---------------------------------------------------------------------------------------------
-- The existing transition function is kept as _transition_job_state_core and is no longer callable
-- directly, so the gate below cannot be bypassed by calling the core function.
DO $rename$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = '_transition_job_state_core') THEN
    ALTER FUNCTION public.transition_job_state(uuid, text, uuid, jsonb) RENAME TO _transition_job_state_core;
  END IF;
END
$rename$;

REVOKE ALL ON FUNCTION public._transition_job_state_core(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transition_job_state(
  p_job_id uuid,
  p_new_state text,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_pricing text;
BEGIN
  IF p_new_state = 'completed' THEN
    SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
    IF FOUND AND v_job.current_state = 'in_progress' THEN
      SELECT pricing_model INTO v_pricing FROM public.bookings WHERE id = v_job.booking_id;
      IF v_pricing = 'quote_after_inspection' AND NOT EXISTS (
        SELECT 1 FROM public.quotes
        WHERE job_id = p_job_id AND status = 'approved' AND quote_kind = 'repair' AND total > 0
      ) THEN
        RAISE EXCEPTION 'A repair job cannot be completed without a customer-approved repair quote'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN public._transition_job_state_core(p_job_id, p_new_state, p_actor_user_id, p_metadata);
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_job_state(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_job_state(uuid, text, uuid, jsonb) TO authenticated, service_role;
