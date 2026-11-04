-- Assessment phase and repair authorisation.
--
-- 1. New job state `assessing`: a repair job that has arrived is assessed before any price is set.
--    arrived -> assessing -> quote_pending -> in_progress -> completed.
--    Only quote_after_inspection bookings may enter assessing.
-- 2. Chargeable repair cannot start without an approved repair quote:
--    arrived -> in_progress is refused for quote_after_inspection, and quote_pending -> in_progress
--    needs an approved repair quote. A declined repair with no approved repair returns to assessing.
-- 3. Every state list that contains in_progress also contains assessing (matching, scheduling,
--    messages, media, cancellation review, no-show, withdrawal, admin recovery, exceptions).
--    Generated from the live definitions so no list is missed.
-- Completion, payment and fixed-price or inspection-only flows are unchanged.

CREATE OR REPLACE FUNCTION public._transition_job_state_core(p_job_id uuid, p_new_state text, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_caller uuid := auth.uid();
  v_status text;
  v_valid boolean := false;
  v_allowed boolean;
  v_booking_id uuid;
  v_pre_pro uuid;
  v_pricing text;
BEGIN
  IF p_new_state = 'accepted' THEN
    PERFORM public._require_read_committed();
    SELECT booking_id, professional_id INTO v_booking_id, v_pre_pro FROM public.jobs WHERE id = p_job_id;
    IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
    IF v_caller IS NOT NULL AND v_pre_pro IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not allowed to change this job';
    END IF;
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;

  IF v_caller IS NOT NULL THEN
    IF p_actor_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Actor does not match the signed-in user';
    END IF;
    v_allowed :=
      -- R1-A: a professional never cancels directly (decline, withdraw or a review request instead).
      (v_job.professional_id IS NOT NULL AND v_caller = v_job.professional_id AND p_new_state <> 'cancelled')
      OR (v_caller = v_job.customer_id
          AND ((p_new_state = 'cancelled'
                AND v_job.current_state IN ('quote_pending', 'assigned', 'accepted', 'on_the_way', 'arrived', 'assessing'))
               OR (p_new_state IN ('in_progress', 'assessing') AND v_job.current_state = 'quote_pending')))
      OR (p_new_state = 'cancelled'
          AND COALESCE(current_setting('app.admin_cancel_job', true), '') = p_job_id::text
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'admin'));
    IF NOT COALESCE(v_allowed, false) THEN RAISE EXCEPTION 'Not allowed to change this job'; END IF;
  END IF;

  IF p_new_state = 'accepted' THEN
    IF v_job.professional_id IS NULL THEN
      RAISE EXCEPTION 'Professional not found';
    END IF;
    SELECT verification_status INTO v_status
    FROM public.professional_profiles WHERE user_id = v_job.professional_id FOR NO KEY UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Professional not found'; END IF;
    IF v_status <> 'verified' THEN
      RAISE EXCEPTION 'Professional must be verified to accept jobs. Current status: %', v_status;
    END IF;
    IF public._professional_conflicts(v_job.professional_id, v_job.booking_id, true) THEN
      RAISE EXCEPTION 'SCHEDULE_CONFLICT: you already have a job within two hours of this visit'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  IF p_new_state = 'quote_pending'
     AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'A job can only wait on a quote that has been sent' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'quote_pending' AND p_new_state IN ('in_progress', 'assessing')
     AND EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'The customer has not answered the quote yet' USING ERRCODE = '22023';
  END IF;

  IF (v_job.current_state = 'assigned' AND p_new_state IN ('accepted', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'accepted' AND p_new_state IN ('on_the_way', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'on_the_way' AND p_new_state IN ('arrived', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'arrived' AND p_new_state IN ('assessing', 'in_progress', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'in_progress' AND p_new_state IN ('quote_pending', 'completed', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'assessing' AND p_new_state IN ('quote_pending', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'quote_pending' AND p_new_state IN ('assessing', 'in_progress', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'completed' AND p_new_state = 'closed') THEN v_valid := true;
  ELSIF (v_job.current_state = 'cancelled' AND p_new_state = 'closed') THEN v_valid := true;
  END IF;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', v_job.current_state, p_new_state;
  END IF;

  -- Assessment and repair authorisation. Assessment is for repair jobs only. Chargeable repair work
  -- starts only after the repair quote is approved, and resumes only with an approved repair quote.
  IF v_job.current_state IN ('arrived', 'quote_pending') AND p_new_state IN ('assessing', 'in_progress') THEN
    SELECT pricing_model INTO v_pricing FROM public.bookings WHERE id = v_job.booking_id;
  END IF;
  IF p_new_state = 'assessing' AND COALESCE(v_pricing, '') <> 'quote_after_inspection' THEN
    RAISE EXCEPTION 'Assessment only applies to repair jobs' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'arrived' AND p_new_state = 'in_progress' AND v_pricing = 'quote_after_inspection' THEN
    RAISE EXCEPTION 'A repair job must be assessed and quoted before any repair work starts' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'quote_pending' AND p_new_state = 'in_progress' AND v_pricing = 'quote_after_inspection'
     AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'approved'
                     AND quote_kind = 'repair' AND total > 0) THEN
    RAISE EXCEPTION 'Repair work cannot resume without a customer-approved repair quote' USING ERRCODE = '22023';
  END IF;

  IF v_caller IS NOT NULL THEN
    IF v_job.current_state = 'arrived' AND p_new_state IN ('in_progress', 'assessing')
       AND NOT EXISTS (SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'start' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the start code from the customer before starting work' USING ERRCODE = '22023';
    END IF;
    IF v_job.current_state = 'in_progress' AND p_new_state = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'finish' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the finish code from the customer before completing the job' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.jobs
  SET current_state = p_new_state, updated_at = now(),
      accepted_at = CASE WHEN p_new_state = 'accepted' THEN now() ELSE accepted_at END,
      on_the_way_at = CASE WHEN p_new_state = 'on_the_way' THEN now() ELSE on_the_way_at END,
      arrived_at = CASE WHEN p_new_state = 'arrived' THEN now() ELSE arrived_at END,
      started_at = CASE WHEN p_new_state = 'in_progress' THEN now() ELSE started_at END,
      completed_at = CASE WHEN p_new_state = 'completed' THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_state = 'cancelled' THEN now() ELSE cancelled_at END,
      closed_at = CASE WHEN p_new_state IN ('completed', 'cancelled') THEN now() ELSE closed_at END
  WHERE id = p_job_id;

  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, p_new_state, p_actor_user_id,
          COALESCE(p_metadata->>'event_type', 'state_transition'), p_metadata);

  IF p_new_state = 'on_the_way' THEN
    PERFORM public._issue_job_code(p_job_id, 'start', p_actor_user_id, false);
  ELSIF p_new_state = 'in_progress' AND NOT EXISTS (
          SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used')) THEN
    PERFORM public._issue_job_code(p_job_id, 'finish', p_actor_user_id, false);
  ELSIF p_new_state = 'quote_pending' THEN
    UPDATE public.job_codes SET status = 'invalidated'
    WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used');
  ELSIF p_new_state IN ('cancelled', 'completed', 'closed') THEN
    UPDATE public.job_codes SET status = 'invalidated' WHERE job_id = p_job_id AND status = 'active';
  END IF;

  RETURN true;
END;
$function$;



CREATE OR REPLACE FUNCTION public.create_quote(p_job_id uuid, p_reason text, p_items jsonb, p_quote_kind text DEFAULT NULL::text)
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

  IF v_job.current_state NOT IN ('in_progress', 'assessing') THEN
    RAISE EXCEPTION 'A quote can only be sent while the job is in progress or being assessed (state: %)', v_job.current_state
      USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'assessing' AND v_kind <> 'repair' THEN
    RAISE EXCEPTION 'An assessment can only lead to a repair quote' USING ERRCODE = '22023';
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


CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_pricing text;
BEGIN
  IF p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_quote.job_id FOR UPDATE;
  IF NOT FOUND OR v_job.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status <> 'pending_customer' THEN
    RAISE EXCEPTION 'This quote has already been answered';
  END IF;

  IF v_job.current_state <> 'quote_pending' THEN
    RAISE EXCEPTION 'Job is not waiting on a quote (state: %)', v_job.current_state;
  END IF;

  IF v_quote.expires_at IS NOT NULL AND v_quote.expires_at < now() THEN
    RAISE EXCEPTION 'This quote has expired';
  END IF;

  UPDATE public.quotes SET status = p_decision, updated_at = now() WHERE id = p_quote_id;

  -- Approving authorises the extra work; declining sends the job back to the
  -- professional to continue (or cancel) the original scope. Both resume work.
  SELECT pricing_model INTO v_pricing FROM public.bookings WHERE id = v_job.booking_id;
  -- A declined repair with no approved repair goes back to assessment, so no repair work resumes unquoted.
  PERFORM public.transition_job_state(
    v_job.id,
    CASE WHEN p_decision = 'declined' AND v_quote.quote_kind = 'repair' AND v_pricing = 'quote_after_inspection'
          AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE job_id = v_job.id AND status = 'approved'
                          AND quote_kind = 'repair' AND total > 0)
         THEN 'assessing' ELSE 'in_progress' END,
    auth.uid(),
    jsonb_build_object(
      'event_type', CASE WHEN p_decision = 'approved' THEN 'quote_approved' ELSE 'quote_declined' END,
      'quote_id', p_quote_id,
      'reason', left(p_reason, 500)
    )
  );

  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.on_job_state_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_customer_id uuid;
  v_notification_type text;
BEGIN
  IF NEW.event_type = 'admin_reconcile' THEN
    RETURN NEW;
  END IF;

  SELECT customer_id INTO v_job_customer_id
  FROM public.jobs
  WHERE id = NEW.job_id;

  v_notification_type := CASE NEW.to_state
    WHEN 'accepted' THEN 'job_assigned'
    WHEN 'on_the_way' THEN 'arrived'
    WHEN 'arrived' THEN 'arrived'
    WHEN 'assessing' THEN 'arrived'
    WHEN 'in_progress' THEN 'arrived'
    WHEN 'completed' THEN 'job_completed'
    WHEN 'cancelled' THEN 'cancellation'
    ELSE NULL
  END;

  IF v_notification_type IS NOT NULL AND v_job_customer_id IS NOT NULL THEN
    INSERT INTO public.notification_logs (
      customer_id, job_id, notification_type, channel_attempted, status
    ) VALUES (
      v_job_customer_id, NEW.job_id, v_notification_type, 'whatsapp', 'pending'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'on_job_state_transition failed for job %: %', NEW.job_id, SQLERRM;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public._rank_professionals(p_booking_id uuid)
 RETURNS TABLE(professional_id uuid, score numeric, geo_basis text, distance_km numeric, inputs jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_id uuid;
  v_category_id uuid;
  v_start timestamptz;
  v_city text;
  v_area text;
  v_lat numeric;
  v_lng numeric;
  v_local timestamp;
  v_dow smallint;
  c_prior numeric := COALESCE(public._matching_setting('metric_prior'), 0.5);
  c_window numeric := COALESCE(public._matching_setting('offer_window_minutes'), 30) * 60;
  c_exp_cap numeric := GREATEST(COALESCE(public._matching_setting('experience_cap_years'), 10), 1);
  c_min_reviews numeric := COALESCE(public._matching_setting('rating_min_reviews'), 3);
  w_proximity numeric := COALESCE(public._matching_setting('w_proximity'), 0);
  w_load numeric := COALESCE(public._matching_setting('w_load'), 0);
  w_specific numeric := COALESCE(public._matching_setting('w_service_specific'), 0);
  w_level numeric := COALESCE(public._matching_setting('w_skill_level'), 0);
  w_experience numeric := COALESCE(public._matching_setting('w_experience'), 0);
  w_acceptance numeric := COALESCE(public._matching_setting('w_acceptance'), 0);
  w_response numeric := COALESCE(public._matching_setting('w_response'), 0);
  w_completion numeric := COALESCE(public._matching_setting('w_completion'), 0);
  w_reliability numeric := COALESCE(public._matching_setting('w_reliability'), 0);
  w_rating numeric := COALESCE(public._matching_setting('w_rating'), 0);
BEGIN
  SELECT b.service_id, s.category_id, b.scheduled_start, a.city, a.area, a.latitude, a.longitude
    INTO v_service_id, v_category_id, v_start, v_city, v_area, v_lat, v_lng
  FROM public.bookings b
  JOIN public.services s ON s.id = b.service_id
  JOIN public.properties p ON p.id = b.property_id
  JOIN public.addresses a ON a.id = p.address_id
  WHERE b.id = p_booking_id;

  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  v_local := v_start AT TIME ZONE 'Asia/Kolkata';
  v_dow := EXTRACT(DOW FROM v_local)::smallint;

  RETURN QUERY
  WITH candidates AS (
    SELECT pp.user_id, pp.years_experience
    FROM public.professional_profiles pp
    WHERE pp.verification_status = 'verified'
      AND COALESCE(pp.is_available, true)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.professional_availability pa
          WHERE pa.professional_id = pp.user_id AND COALESCE(pa.is_active, true)
        )
        OR EXISTS (
          SELECT 1 FROM public.professional_availability pa
          WHERE pa.professional_id = pp.user_id
            AND COALESCE(pa.is_active, true)
            AND pa.day_of_week = v_dow
            AND v_local::time BETWEEN pa.start_time AND pa.end_time
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.bookings jb ON jb.id = j.booking_id
        WHERE j.professional_id = pp.user_id
          AND j.booking_id <> p_booking_id
          AND j.current_state IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending')
          AND jb.scheduled_start BETWEEN v_start - interval '2 hours' AND v_start + interval '2 hours'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_assignment_attempts att
        WHERE att.booking_id = p_booking_id AND att.professional_id = pp.user_id
      )
  ),
  skill AS (
    -- Best matching skill: an exact service beats the category, then the higher level.
    SELECT DISTINCT ON (ps.professional_id)
      ps.professional_id,
      CASE WHEN ps.service_id = v_service_id THEN 1.0 ELSE 0.5 END AS specific,
      CASE lower(ps.skill_level)
        WHEN 'expert' THEN 1.0 WHEN 'advanced' THEN 0.67
        WHEN 'intermediate' THEN 0.33 WHEN 'beginner' THEN 0.0
        ELSE NULL
      END AS level,
      ps.skill_level
    FROM public.professional_skills ps
    WHERE ps.service_id = v_service_id OR ps.service_category_id = v_category_id
    ORDER BY ps.professional_id,
      (ps.service_id = v_service_id) DESC NULLS LAST,
      CASE lower(ps.skill_level)
        WHEN 'expert' THEN 4 WHEN 'advanced' THEN 3 WHEN 'intermediate' THEN 2 WHEN 'beginner' THEN 1 ELSE 0
      END DESC
  ),
  areas AS (
    SELECT
      psa.professional_id,
      d.km,
      CASE WHEN d.km IS NOT NULL AND psa.radius_km IS NOT NULL THEN 'distance' ELSE 'city' END AS basis,
      CASE
        WHEN d.km IS NOT NULL AND psa.radius_km IS NOT NULL THEN GREATEST(0, 1 - d.km / psa.radius_km)
        WHEN v_area IS NOT NULL AND lower(psa.area) = lower(v_area) THEN 1.0
        ELSE 0.0
      END AS proximity,
      CASE
        WHEN d.km IS NOT NULL AND psa.radius_km IS NOT NULL THEN d.km <= psa.radius_km
        ELSE lower(psa.city) = lower(v_city)
      END AS qualifies
    FROM public.professional_service_areas psa
    CROSS JOIN LATERAL (SELECT public._haversine_km(v_lat, v_lng, psa.base_lat, psa.base_lng) AS km) d
    WHERE COALESCE(psa.is_active, true)
  ),
  best_area AS (
    SELECT DISTINCT ON (ar.professional_id) ar.professional_id, ar.km, ar.basis, ar.proximity
    FROM areas ar
    WHERE ar.qualifies
    ORDER BY ar.professional_id, ar.proximity DESC, ar.km ASC NULLS LAST
  ),
  load AS (
    SELECT j.professional_id, count(*) AS open_jobs
    FROM public.jobs j
    WHERE j.current_state IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending')
      AND j.booking_id <> p_booking_id
      AND j.professional_id IS NOT NULL
    GROUP BY j.professional_id
  ),
  parts AS (
    SELECT
      c.user_id,
      ba.basis,
      ba.km,
      COALESCE(l.open_jobs, 0) AS open_jobs,
      sk.skill_level,
      c.years_experience,
      m.acceptance_rate,
      m.median_response_seconds,
      m.completion_rate,
      m.cancel_rate,
      m.rating_average,
      m.rating_count,
      ba.proximity AS s_proximity,
      1.0 / (1 + COALESCE(l.open_jobs, 0)) AS s_load,
      sk.specific AS s_specific,
      COALESCE(sk.level, c_prior) AS s_level,
      LEAST(COALESCE(c.years_experience, 0)::numeric / c_exp_cap, 1) AS s_experience,
      COALESCE(m.acceptance_rate, c_prior) AS s_acceptance,
      CASE WHEN m.median_response_seconds IS NULL THEN c_prior
        ELSE GREATEST(0, 1 - m.median_response_seconds / c_window) END AS s_response,
      COALESCE(m.completion_rate, c_prior) AS s_completion,
      CASE WHEN m.cancel_rate IS NULL THEN c_prior ELSE 1 - m.cancel_rate END AS s_reliability,
      CASE WHEN m.rating_count >= c_min_reviews AND m.rating_average IS NOT NULL
        THEN m.rating_average / 5 ELSE 0 END AS s_rating
    FROM candidates c
    JOIN skill sk ON sk.professional_id = c.user_id
    JOIN best_area ba ON ba.professional_id = c.user_id
    LEFT JOIN load l ON l.professional_id = c.user_id
    LEFT JOIN public.professional_metrics m ON m.professional_id = c.user_id
  )
  SELECT
    p.user_id,
    round(
      w_proximity * p.s_proximity + w_load * p.s_load + w_specific * p.s_specific
      + w_level * p.s_level + w_experience * p.s_experience + w_acceptance * p.s_acceptance
      + w_response * p.s_response + w_completion * p.s_completion
      + w_reliability * p.s_reliability + w_rating * p.s_rating,
      4
    ) AS score,
    p.basis,
    round(p.km, 2),
    jsonb_build_object(
      'raw', jsonb_build_object(
        'distance_km', round(p.km, 2),
        'geo_basis', p.basis,
        'open_jobs', p.open_jobs,
        'skill_level', p.skill_level,
        'years_experience', p.years_experience,
        'acceptance_rate', p.acceptance_rate,
        'median_response_seconds', p.median_response_seconds,
        'completion_rate', p.completion_rate,
        'cancel_rate', p.cancel_rate,
        'rating_average', p.rating_average,
        'rating_count', p.rating_count
      ),
      'components', jsonb_build_object(
        'proximity', round(p.s_proximity, 4),
        'load', round(p.s_load, 4),
        'service_specific', p.s_specific,
        'skill_level', p.s_level,
        'experience', round(p.s_experience, 4),
        'acceptance', p.s_acceptance,
        'response', round(p.s_response, 4),
        'completion', p.s_completion,
        'reliability', p.s_reliability,
        'rating', round(p.s_rating, 4)
      ),
      'weights', jsonb_build_object(
        'proximity', w_proximity, 'load', w_load, 'service_specific', w_specific,
        'skill_level', w_level, 'experience', w_experience, 'acceptance', w_acceptance,
        'response', w_response, 'completion', w_completion, 'reliability', w_reliability,
        'rating', w_rating
      ),
      'rating_min_reviews', c_min_reviews
    )
  FROM parts p
  ORDER BY 2 DESC, p.user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._schedule_active_states(p_committed_only boolean)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN p_committed_only
              THEN ARRAY['accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending']
              ELSE ARRAY['assigned','accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending'] END;
$function$;

CREATE OR REPLACE FUNCTION public.add_job_media(p_job_id uuid, p_kind text, p_storage_path text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_mimetype text;
  v_created_at timestamptz;
  v_expected text;
  v_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.professional_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state NOT IN ('arrived', 'assessing', 'in_progress', 'quote_pending', 'completed') THEN
    RAISE EXCEPTION 'Photos can be added once you arrive and until the job is closed (state: %)',
      v_job.current_state USING ERRCODE = '22023';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('before', 'after', 'part', 'receipt') THEN
    RAISE EXCEPTION 'Unknown photo type' USING ERRCODE = '22023';
  END IF;

  IF p_storage_path IS NULL OR p_storage_path NOT LIKE p_job_id::text || '/%' THEN
    RAISE EXCEPTION 'The uploaded file was not found' USING ERRCODE = '22023';
  END IF;

  SELECT o.metadata->>'mimetype', o.created_at INTO v_mimetype, v_created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'job-media' AND o.name = p_storage_path AND o.owner_id = auth.uid()::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The uploaded file was not found' USING ERRCODE = '22023';
  END IF;

  -- Keeps attaching well clear of the 24-hour sweep (list_orphan_job_media).
  IF v_created_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'This upload has expired. Upload the file again.' USING ERRCODE = '22023';
  END IF;

  -- Same mapping as JOB_MEDIA_TYPES in src/validators/professional.ts.
  v_expected := CASE lower(substring(p_storage_path FROM '\.([^./]+)$'))
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
    WHEN 'webp' THEN 'image/webp'
    WHEN 'pdf' THEN 'application/pdf'
  END;
  IF v_expected IS NULL OR v_mimetype IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Use a JPG, PNG or WebP photo, or a PDF' USING ERRCODE = '22023';
  END IF;

  -- Abuse guard, not a business rule.
  IF (SELECT count(*) FROM public.job_media WHERE job_id = p_job_id) >= 50 THEN
    RAISE EXCEPTION 'This job already has 50 files' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_media (job_id, uploader_id, kind, storage_path)
  VALUES (p_job_id, auth.uid(), p_kind, p_storage_path)
  ON CONFLICT (storage_path) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This file is already attached' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, v_job.current_state, auth.uid(), 'media_added',
          jsonb_build_object('media_id', v_id, 'kind', p_kind));

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_recover_suspended_professional(p_professional_id uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := public._require_admin();
  v_status text;
  r record;
  v_job public.jobs%ROWTYPE;
  v_released int := 0;
  v_flagged int := 0;
  v_start timestamptz;
  v_left_offers int;
  v_left_active int;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 50' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  SELECT verification_status INTO v_status FROM public.professional_profiles WHERE user_id = p_professional_id;  -- no lock
  IF v_status IS NULL THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'STALE_STATE: professional is %, recovery applies to suspended professionals only', v_status
      USING ERRCODE = '40001';
  END IF;

  -- (a) pending offers
  FOR r IN SELECT j.id AS job_id FROM public.jobs j
            WHERE j.professional_id = p_professional_id AND j.current_state = 'assigned'
            ORDER BY j.id LIMIT p_limit
  LOOP
    BEGIN   -- subtransaction: a job that moved on meanwhile is skipped, and its locks are released
      PERFORM public._release_offer(r.job_id, 'withdrawn', 'professional_suspended',
                                    'Professional suspended by administrator', v_admin);
      v_released := v_released + 1;
    EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE 'P0002' THEN
      NULL;   -- no longer a pending offer of this professional; counted by the remaining-work query below
    END;
  END LOOP;

  -- (b) active jobs: exceptions only
  FOR r IN SELECT j.id AS job_id, j.booking_id FROM public.jobs j
            WHERE j.professional_id = p_professional_id
              AND j.current_state IN ('accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending')
              AND NOT EXISTS (SELECT 1 FROM public.job_exceptions e
                               WHERE e.job_id = j.id AND e.kind = 'professional_suspended_active_job')
            ORDER BY j.id LIMIT p_limit
  LOOP
    SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = r.booking_id FOR UPDATE;   -- L1
    SELECT * INTO v_job FROM public.jobs WHERE id = r.job_id FOR UPDATE;                           -- L2
    CONTINUE WHEN v_job.professional_id IS DISTINCT FROM p_professional_id
               OR v_job.current_state NOT IN ('accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending');
    INSERT INTO public.job_exceptions (job_id, kind, preference, reported_by, professional_id, scheduled_start, detail)
    VALUES (r.job_id, 'professional_suspended_active_job', 'admin', v_admin, p_professional_id, v_start,
            'Professional suspended while holding this job; administrator decision required')   -- L4
    ON CONFLICT (job_id, kind) DO NOTHING;
    IF FOUND THEN
      v_flagged := v_flagged + 1;
      INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
      VALUES (r.job_id, v_job.current_state, v_job.current_state, v_admin, 'suspended_active_job_flagged',
              jsonb_build_object('professional_id', p_professional_id));
    END IF;
  END LOOP;

  SELECT count(*) INTO v_left_offers FROM public.jobs
   WHERE professional_id = p_professional_id AND current_state = 'assigned';
  SELECT count(*) INTO v_left_active FROM public.jobs j
   WHERE j.professional_id = p_professional_id
     AND j.current_state IN ('accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending')
     AND NOT EXISTS (SELECT 1 FROM public.job_exceptions e
                      WHERE e.job_id = j.id AND e.kind = 'professional_suspended_active_job');
  RETURN jsonb_build_object('professional_id', p_professional_id, 'offers_released', v_released,
    'active_jobs_flagged', v_flagged, 'offers_remaining', v_left_offers, 'active_unflagged_remaining', v_left_active,
    'done', (v_left_offers = 0 AND v_left_active = 0));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_exception(p_exception_id uuid, p_expected_status text, p_finding text, p_resolution text, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_exception_id, p_expected_status, p_finding, COALESCE(p_resolution, ''), p_note));
  v_replay jsonb;
  v_job_id uuid;
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_ex public.job_exceptions%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
  v_basis text;
  v_allegation_holds boolean;
  v_arrived boolean;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_finding IS NULL OR p_finding NOT IN ('confirmed','not_confirmed','inconclusive') THEN
    RAISE EXCEPTION 'Invalid finding' USING ERRCODE = '22023';
  END IF;
  IF p_finding = 'inconclusive' THEN
    IF p_resolution IS NOT NULL THEN
      RAISE EXCEPTION 'An inconclusive finding is not a resolution; p_resolution must be NULL' USING ERRCODE = '22023';
    END IF;
  ELSIF p_resolution IS NULL OR p_resolution NOT IN ('reassigned','cancelled','customer_declined','no_action') THEN
    RAISE EXCEPTION 'Invalid resolution' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'A note of 10 to 1000 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  v_replay := public._idem_begin(v_admin, 'resolve_exception', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT job_id INTO v_job_id FROM public.job_exceptions WHERE id = p_exception_id;   -- unlocked read, only to find L1/L2
  IF v_job_id IS NULL THEN RAISE EXCEPTION 'Exception not found' USING ERRCODE = 'P0002'; END IF;
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = v_job_id;
  PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;                        -- L1
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id FOR UPDATE;                      -- L2
  SELECT * INTO v_ex FROM public.job_exceptions WHERE id = p_exception_id FOR UPDATE;       -- L4
  IF v_ex.status <> 'open' OR v_ex.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STALE_STATE: exception is %', v_ex.status USING ERRCODE = '40001';
  END IF;

  IF p_finding = 'inconclusive' THEN
    UPDATE public.job_exceptions SET finding = 'inconclusive', detail = left(v_note, 500) WHERE id = p_exception_id;
    PERFORM public._job_code_event(v_job_id, 'exception_reviewed', v_admin, jsonb_build_object(
      'exception_id', p_exception_id, 'kind', v_ex.kind, 'finding', 'inconclusive', 'request_id', p_request_id));
    v_result := jsonb_build_object('exception_id', p_exception_id, 'outcome', 'still_open', 'replayed', false);
    PERFORM public._idem_finish(v_admin, 'resolve_exception', p_request_id, v_result);
    RETURN v_result;
  END IF;

  -- evidence from the database
  SELECT EXISTS (SELECT 1 FROM public.job_events e
                  WHERE e.job_id = v_job_id AND e.to_state IN ('arrived','assessing', 'in_progress','quote_pending','completed'))
    INTO v_arrived;
  v_allegation_holds := (NOT v_arrived)
    AND v_ex.scheduled_start IS NOT NULL AND v_ex.scheduled_start + interval '30 minutes' <= now();

  IF v_ex.kind = 'professional_no_show' THEN
    IF p_finding = 'confirmed' THEN
      IF p_resolution = 'no_action' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: a confirmed no-show needs a recorded outcome' USING ERRCODE = '22023';
      END IF;
      IF NOT v_allegation_holds THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: the database does not support a no-show (arrival recorded or start not yet 30 minutes past)'
          USING ERRCODE = '22023';
      END IF;
      IF p_resolution = 'cancelled' AND v_job.current_state <> 'cancelled' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: job is not cancelled' USING ERRCODE = '22023';
      END IF;
      IF p_resolution = 'reassigned' AND v_job.professional_id IS NOT DISTINCT FROM v_ex.professional_id THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: job still has the same professional' USING ERRCODE = '22023';
      END IF;
      v_basis := CASE WHEN p_resolution = 'customer_declined' THEN 'admin_attested' ELSE 'system_verified' END;
    ELSE  -- not_confirmed
      IF p_resolution <> 'no_action' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: a dismissed report records no_action only' USING ERRCODE = '22023';
      END IF;
      v_basis := CASE WHEN v_arrived THEN 'system_verified' ELSE 'admin_attested' END;
    END IF;
  ELSE  -- professional_suspended_active_job | professional_withdrawal_request
    IF p_finding <> 'confirmed' OR p_resolution = 'customer_declined' THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: invalid finding/resolution for kind %', v_ex.kind USING ERRCODE = '22023';
    END IF;
    IF p_resolution = 'cancelled' AND v_job.current_state <> 'cancelled' THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: job is not cancelled' USING ERRCODE = '22023';
    END IF;
    IF p_resolution = 'reassigned' AND v_job.professional_id IS NOT DISTINCT FROM v_ex.professional_id THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: job still has the same professional' USING ERRCODE = '22023';
    END IF;
    v_basis := CASE WHEN p_resolution IN ('cancelled','reassigned') THEN 'system_verified'
                    WHEN v_job.current_state IN ('completed','closed') THEN 'system_verified'
                    ELSE 'admin_attested' END;
  END IF;
  IF v_basis = 'admin_attested' AND length(v_note) < 20 THEN
    RAISE EXCEPTION 'An attested resolution needs a note of at least 20 characters' USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN p_finding = 'not_confirmed' THEN 'dismissed' ELSE 'resolved' END;
  UPDATE public.job_exceptions
     SET status = v_status, finding = p_finding, resolution = p_resolution, resolution_basis = v_basis,
         resolved_by = v_admin, resolved_at = now(), resolution_note = left(v_note, 1000)
   WHERE id = p_exception_id;
  PERFORM public._job_code_event(v_job_id, 'exception_resolved', v_admin, jsonb_build_object(
    'exception_id', p_exception_id, 'kind', v_ex.kind, 'finding', p_finding, 'resolution', p_resolution,
    'basis', v_basis, 'request_id', p_request_id));

  v_result := jsonb_build_object('exception_id', p_exception_id, 'outcome', v_status, 'basis', v_basis, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'resolve_exception', p_request_id, v_result);
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.customer_cancel_booking(p_booking_id uuid, p_expected_state text, p_reason_category text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_note     text := NULLIF(btrim(p_note), '');
  v_booking  public.bookings%ROWTYPE;
  v_job      public.jobs%ROWTYPE;
  v_has_job  boolean;
  v_actual   text;
  v_ex_status text;
  v_result   jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_booking_id IS NULL OR p_expected_state IS NULL THEN
    RAISE EXCEPTION 'Booking and expected state are required' USING ERRCODE = '22023';
  END IF;
  IF p_reason_category IS NULL OR p_reason_category NOT IN (
       'changed_my_mind', 'booked_by_mistake', 'found_other_help', 'schedule_conflict', 'price_concern', 'other') THEN
    RAISE EXCEPTION 'A valid cancellation reason is required' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'The note must be 300 characters or fewer' USING ERRCODE = '22023';
  END IF;

  -- Booking first, then job: the same order as the assignment queue (_offer_next).
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND customer_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;
  v_has_job := FOUND;
  v_actual := CASE WHEN v_has_job THEN v_job.current_state ELSE 'no_job' END;

  IF v_booking.booking_status = 'cancelled' AND (NOT v_has_job OR v_job.current_state IN ('cancelled', 'closed')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CANCELLED',
      'message', 'This booking is already cancelled.');
  END IF;
  IF v_actual <> p_expected_state THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_STATE',
      'message', 'This booking has changed since you opened it. Refresh and review before cancelling.',
      'actual_state', v_actual);
  END IF;
  IF v_booking.booking_status = 'completed' OR (v_has_job AND v_job.current_state IN ('completed', 'closed')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', 'This booking is already complete and can no longer be cancelled.', 'actual_state', v_actual);
  END IF;

  -- R1-A: once the professional has arrived, a cancellation is reviewed by an admin. Nothing changes
  -- until then; the request is visible to every party as "under review".
  IF v_has_job AND v_job.current_state IN ('arrived', 'quote_pending', 'assessing', 'in_progress') THEN
    SELECT status INTO v_ex_status FROM public.job_exceptions
    WHERE job_id = v_job.id AND kind = 'customer_cancellation_request';
    IF v_ex_status IS NOT NULL AND v_ex_status <> 'open' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'REVIEW_CLOSED',
        'message', 'A cancellation request for this booking has already been reviewed. Please contact Fixify support.',
        'actual_state', v_actual);
    END IF;
    IF v_ex_status IS NULL THEN
      INSERT INTO public.job_exceptions
        (job_id, kind, preference, reported_by, professional_id, scheduled_start, detail)
      VALUES (v_job.id, 'customer_cancellation_request', 'admin', v_user, v_job.professional_id,
              v_booking.scheduled_start, left(p_reason_category || COALESCE(': ' || v_note, ''), 500));
      INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
      VALUES (v_job.id, v_job.current_state, v_job.current_state, v_user, 'customer_cancellation_requested',
              jsonb_build_object('reason_category', p_reason_category, 'note', v_note));
    END IF;
    RETURN jsonb_build_object('ok', true, 'outcome', 'review_requested',
      'booking_id', p_booking_id, 'job_id', v_job.id, 'from_state', v_actual, 'to_state', v_actual);
  END IF;

  v_result := public._cancel_job_and_booking(
    p_booking_id, v_user, 'customer', p_reason_category, v_note, 'customer_cancel');

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'cancelled',
    'booking_id', p_booking_id,
    'job_id', v_result->'job_id',
    'from_state', v_actual,
    'to_state', 'cancelled',
    'offer_withdrawn', v_result->'offer_withdrawn',
    'payment_review_required', v_result->'payment_review_required',
    'paid_payment_count', v_result->'paid_payment_count',
    'pending_payment_count', v_result->'pending_payment_count');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_professional(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pro uuid;
  v_state text;
  v_category uuid;
  v_min_reviews numeric := COALESCE(public._matching_setting('rating_min_reviews'), 3);
  v_result jsonb;
BEGIN
  SELECT j.professional_id, j.current_state::text, s.category_id INTO v_pro, v_state, v_category
  FROM public.bookings b
  JOIN public.jobs j ON j.booking_id = b.id
  JOIN public.services s ON s.id = b.service_id
  WHERE b.id = p_booking_id AND b.customer_id = auth.uid();

  IF v_pro IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'professional_id', pp.user_id,
    'display_name', pp.display_name,
    'verified', pp.verification_status = 'verified',
    'years_experience', pp.years_experience,
    'skills', COALESCE((
      SELECT jsonb_agg(DISTINCT COALESCE(sv.name, sc.name))
      FROM public.professional_skills ps
      JOIN public.service_categories sc ON sc.id = ps.service_category_id
      LEFT JOIN public.services sv ON sv.id = ps.service_id
      WHERE ps.professional_id = pp.user_id AND ps.service_category_id = v_category
    ), '[]'::jsonb),
    'jobs_completed', m.jobs_completed,
    'median_response_seconds', m.median_response_seconds,
    'rating_average', CASE WHEN m.rating_count >= v_min_reviews THEN m.rating_average END,
    'rating_count', CASE WHEN m.rating_count >= v_min_reviews THEN m.rating_count END,
    -- Shared only once the professional has accepted and until the visit's work is done.
    'phone', CASE WHEN v_state IN ('accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending')
                  THEN pr.phone END
  )
  INTO v_result
  FROM public.professional_profiles pp
  JOIN public.professional_metrics m ON m.professional_id = pp.user_id
  LEFT JOIN public.profiles pr ON pr.id = pp.user_id
  WHERE pp.user_id = v_pro;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.professional_withdraw_from_job(p_job_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_start timestamptz;
  v_now timestamptz := now();   -- transaction time; one value for the whole decision
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;                      -- unlocked read, only to find L1
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002'; END IF;
  SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = v_booking_id FOR UPDATE;   -- L1
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                           -- L2
  -- Same answer for "not yours" and "does not exist": no enumeration of other professionals' jobs.
  IF v_job.id IS NULL OR v_job.professional_id IS DISTINCT FROM v_uid OR v_job.booking_id IS DISTINCT FROM v_booking_id THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.current_state NOT IN ('accepted','on_the_way','arrived','assessing', 'in_progress','quote_pending') THEN
    RAISE EXCEPTION 'STALE_STATE: job is %', v_job.current_state USING ERRCODE = '40001';
  END IF;

  IF v_job.current_state = 'accepted' AND v_start IS NOT NULL AND v_now < v_start THEN
    -- ---- controlled withdrawal ----
    PERFORM set_config('app.a4_recovery_edge', p_job_id::text, true);       -- permits accepted -> assigned for THIS job only
    INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
    VALUES (v_job.booking_id, v_uid, 'withdrawn', 'professional_withdrew', btrim(p_reason));
    UPDATE public.jobs
       SET current_state = 'assigned', professional_id = NULL, accepted_at = NULL,
           eta_earliest = NULL, eta_latest = NULL, offer_expires_at = NULL, updated_at = now()
     WHERE id = p_job_id;
    PERFORM set_config('app.a4_recovery_edge', '', true);
    UPDATE public.bookings
       SET professional_id = NULL, unmatched_since = COALESCE(unmatched_since, now()), updated_at = now()
     WHERE id = v_job.booking_id;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (p_job_id, 'accepted', 'assigned', v_uid, 'professional_withdrew',
            jsonb_build_object('from_professional_id', v_uid, 'reason', btrim(p_reason),
                               'previous_accepted_at', v_job.accepted_at,
                               'previous_eta_earliest', v_job.eta_earliest, 'previous_eta_latest', v_job.eta_latest,
                               'scheduled_start', v_start));
    RETURN jsonb_build_object('outcome', 'withdrawn', 'job_id', p_job_id, 'state', 'assigned');
  END IF;

  -- ---- review path: persist, do not raise (a raise would roll the request back) ----
  -- No L3 lock is held here, so the L4 insert respects invariant I1.
  INSERT INTO public.job_exceptions (job_id, kind, preference, reported_by, professional_id, scheduled_start, detail)
  VALUES (p_job_id, 'professional_withdrawal_request', 'admin', v_uid, v_uid, v_start, btrim(p_reason))
  ON CONFLICT (job_id, kind) DO NOTHING;
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, v_job.current_state, v_uid, 'professional_withdrawal_requested',
          jsonb_build_object('professional_id', v_uid, 'reason', btrim(p_reason), 'scheduled_start', v_start,
                             'requested_at', v_now));
  RETURN jsonb_build_object('outcome', 'review_requested', 'job_id', p_job_id, 'state', v_job.current_state);
END; $function$;

CREATE OR REPLACE FUNCTION public.report_professional_no_show(p_job_id uuid, p_preference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_job public.jobs%ROWTYPE;
  v_start timestamptz;
  v_opens timestamptz;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_preference NOT IN ('reassign', 'support') THEN
    RAISE EXCEPTION 'Choose how you would like us to help' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.customer_id <> v_uid THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state IN ('arrived', 'assessing', 'in_progress', 'quote_pending', 'completed', 'closed')
     OR v_job.arrived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The professional has already arrived, so this cannot be reported as a no-show' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'cancelled' THEN
    RAISE EXCEPTION 'This job was cancelled' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'assigned' THEN
    RAISE EXCEPTION 'No professional has accepted this job yet' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.job_exceptions WHERE job_id = p_job_id AND kind = 'professional_no_show') THEN
    RAISE EXCEPTION 'You have already reported this. Our team is reviewing it.' USING ERRCODE = '22023';
  END IF;

  SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = v_job.booking_id;
  v_opens := v_start + interval '30 minutes';
  IF now() < v_opens THEN
    RAISE EXCEPTION 'You can report a no-show 30 minutes after the scheduled start' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_exceptions
    (job_id, kind, preference, reported_by, professional_id, scheduled_start)
  VALUES (p_job_id, 'professional_no_show', p_preference, v_uid, v_job.professional_id, v_start)
  RETURNING id INTO v_id;

  PERFORM public._job_code_event(p_job_id, 'no_show_reported', v_uid, jsonb_build_object(
    'exception_id', v_id,
    'preference', p_preference,
    'scheduled_start', v_start,
    'reported_at', now(),
    'professional_id', v_job.professional_id,
    'note', 'Customer report; an allegation, not a finding'));

  RETURN jsonb_build_object('exception_id', v_id, 'reported_at', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_job_message(p_job_id uuid, p_body text, p_client_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_job public.jobs%ROWTYPE;
  v_body text := btrim(coalesce(p_body, ''));
  v_max integer;
  v_per_minute integer;
  v_id uuid;
  v_existing public.job_messages%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;
  IF p_client_key IS NULL THEN
    RAISE EXCEPTION 'Missing message key' USING ERRCODE = '22023';
  END IF;

  -- Shared lock: a transition to a terminal state waits for this insert, so a message cannot
  -- slip in after the job has ended.
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR SHARE;
  IF NOT FOUND OR (v_job.customer_id IS DISTINCT FROM v_uid AND v_job.professional_id IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  -- A retry of a message already stored returns it rather than posting twice.
  SELECT * INTO v_existing FROM public.job_messages WHERE sender_id = v_uid AND client_key = p_client_key;
  IF FOUND THEN
    IF v_existing.job_id <> p_job_id THEN
      RAISE EXCEPTION 'Message key already used' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_job.current_state NOT IN ('accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending') THEN
    RAISE EXCEPTION 'Messages are open from when the professional accepts until the job ends (state: %)',
      v_job.current_state USING ERRCODE = '22023';
  END IF;

  SELECT value::integer INTO v_max FROM public.messaging_config WHERE key = 'message_max_length';
  SELECT value::integer INTO v_per_minute FROM public.messaging_config WHERE key = 'messages_per_minute';
  IF v_max IS NULL OR v_per_minute IS NULL THEN
    RAISE EXCEPTION 'Messaging is not configured' USING ERRCODE = '55000';
  END IF;

  IF v_body = '' THEN
    RAISE EXCEPTION 'Write a message first' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > v_max THEN
    RAISE EXCEPTION 'Messages can be up to % characters', v_max USING ERRCODE = '22023';
  END IF;

  -- Serialise this sender's sends on this job so concurrent calls cannot overshoot the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::text || v_uid::text, 0));
  IF (SELECT count(*) FROM public.job_messages
      WHERE job_id = p_job_id AND sender_id = v_uid AND created_at > clock_timestamp() - interval '1 minute') >= v_per_minute THEN
    RAISE EXCEPTION 'You are sending messages too fast. Wait a moment and try again.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.job_messages (job_id, professional_id, sender_id, body, client_key, created_at)
  VALUES (p_job_id, v_job.professional_id, v_uid, v_body, p_client_key, clock_timestamp())
  RETURNING id INTO v_id;

  -- clock_timestamp(), not now(): ordering stays right when calls share a transaction.
  -- Sending a message means the sender has read the thread up to now.
  INSERT INTO public.job_message_reads (job_id, user_id, last_read_at)
  VALUES (p_job_id, v_uid, clock_timestamp())
  ON CONFLICT (job_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_inspection(p_job_id uuid, p_findings text, p_recommendation text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_findings text := btrim(COALESCE(p_findings, ''));
  v_recommendation text := NULLIF(btrim(COALESCE(p_recommendation, '')), '');
  v_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.professional_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state NOT IN ('arrived', 'assessing', 'in_progress') THEN
    RAISE EXCEPTION 'An inspection can only be recorded on site (state: %)', v_job.current_state
      USING ERRCODE = '22023';
  END IF;

  IF length(v_findings) < 1 OR length(v_findings) > 5000 THEN
    RAISE EXCEPTION 'Findings must be 1 to 5000 characters' USING ERRCODE = '22023';
  END IF;
  IF v_recommendation IS NOT NULL AND length(v_recommendation) > 5000 THEN
    RAISE EXCEPTION 'Recommendation must be at most 5000 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inspections (job_id, professional_id, findings, recommendation)
  VALUES (p_job_id, v_job.professional_id, v_findings, v_recommendation)
  RETURNING id INTO v_id;

  -- Audit record only; the job state does not change on inspection.
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, v_job.current_state, auth.uid(), 'inspection_submitted',
          jsonb_build_object('inspection_id', v_id));

  RETURN v_id;
END;
$function$;
