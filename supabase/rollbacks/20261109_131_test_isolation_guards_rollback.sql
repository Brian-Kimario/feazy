-- Rollback for migration 131. Restores the four functions to their pre-131 definitions.
-- The bodies below were taken from production pg_get_functiondef on 2026-11-07.
-- Before applying 131 to production, re-capture the live definitions and compare them with this file.
BEGIN;

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
          AND j.current_state IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending')
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
    WHERE j.current_state IN ('assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending')
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

CREATE OR REPLACE FUNCTION public.create_pending_payment(p_job_id uuid, p_provider_reference text, p_amount_paise bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_amount   record;
  v_existing text;
  v_id       uuid;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_provider_reference IS NULL OR btrim(p_provider_reference) = '' THEN
    RAISE EXCEPTION 'Provider reference is required' USING ERRCODE = '22023';
  END IF;

  -- Serialise checkouts for the same job so two tabs cannot both insert a pending payment.
  PERFORM 1 FROM public.jobs WHERE id = p_job_id AND customer_id = v_customer FOR UPDATE;

  SELECT * INTO v_amount FROM public._job_payment_amount(p_job_id, v_customer);

  IF p_amount_paise IS DISTINCT FROM round(v_amount.amount * 100)::bigint THEN
    RAISE EXCEPTION 'Amount % paise does not match the amount due (% paise)',
      p_amount_paise, round(v_amount.amount * 100)::bigint USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_existing
  FROM public.payments
  WHERE job_id = p_job_id AND status IN ('pending', 'paid')
  ORDER BY (status = 'paid') DESC
  LIMIT 1;

  IF v_existing = 'paid' THEN
    RAISE EXCEPTION 'This job has already been paid' USING ERRCODE = '23505';
  ELSIF v_existing = 'pending' THEN
    RAISE EXCEPTION 'A payment is already in progress for this job' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.payments
    (customer_id, booking_id, job_id, quote_id, payment_type, amount, currency,
     provider, provider_reference, status)
  VALUES
    (v_customer, v_amount.booking_id, p_job_id, v_amount.quote_id, 'service', v_amount.amount, 'INR',
     'razorpay', p_provider_reference, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.job_payment_amount(p_job_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (round(a.amount * 100))::bigint
  FROM public._job_payment_amount(p_job_id, auth.uid()) a;
$function$;

CREATE OR REPLACE FUNCTION public.transition_payment_status(p_provider_reference text, p_new_status text, p_provider_event text, p_provider_payment_id text, p_amount_paise bigint, p_currency text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_job_state text;
BEGIN
  IF NOT (
    COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles actor
               WHERE actor.id = auth.uid() AND actor.role = 'admin'::user_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed to change payment status' USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'Unsupported payment status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE provider_reference = p_provider_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for reference %', p_provider_reference
      USING ERRCODE = 'P0002';
  END IF;

  -- Retries, and a late failure event after a successful capture, change nothing.
  IF v_payment.status = 'paid' OR v_payment.status = p_new_status THEN
    RETURN 'already_processed';
  END IF;

  IF NOT (
    (v_payment.status = 'pending' AND p_new_status IN ('paid', 'failed'))
    OR (v_payment.status = 'failed' AND p_new_status = 'paid')
  ) THEN
    RAISE EXCEPTION 'Invalid payment transition from % to %', v_payment.status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  IF p_new_status = 'paid' AND (
    p_currency IS DISTINCT FROM v_payment.currency
    OR p_amount_paise IS DISTINCT FROM round(v_payment.amount * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'Captured % % does not match payment % (% %)',
      p_amount_paise, p_currency, v_payment.id, round(v_payment.amount * 100)::bigint, v_payment.currency
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments
  SET status     = p_new_status,
      paid_at    = CASE WHEN p_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = v_payment.id;

  INSERT INTO public.payment_events
    (payment_id, from_status, to_status, provider_event, provider_payment_id, metadata)
  VALUES
    (v_payment.id, v_payment.status, p_new_status, p_provider_event, p_provider_payment_id,
     COALESCE(p_metadata, '{}'::jsonb));

  IF p_new_status = 'paid' AND v_payment.job_id IS NOT NULL THEN
    SELECT current_state INTO v_job_state FROM public.jobs WHERE id = v_payment.job_id;
    IF v_job_state = 'completed' THEN
      PERFORM public.transition_job_state(
        v_payment.job_id,
        'closed',
        v_payment.customer_id,
        jsonb_build_object(
          'event_type', 'payment_captured',
          'payment_id', v_payment.id,
          'provider_payment_id', p_provider_payment_id
        )
      );
    END IF;
  END IF;

  RETURN 'applied';
END;
$function$;

COMMIT;
