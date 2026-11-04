-- Service-area gate and the legacy booking path switch.
--
-- 1. create_booking refuses a property whose city has no active service area of a verified professional
--    (P0008, "We do not serve this area yet"). No coverage is added here; it is read from professionals' areas.
-- 2. The unguarded booking path (a call without client_request_id, so no retry key and no expected price) is
--    controlled by matching_config 'legacy_booking_path_enabled'. It defaults to 1 so the current app keeps
--    working during the migration. Set it to 0 only after the guarded app is live (P0009 when refused).
-- Both checks run inside the booking transaction, before any row is written.

INSERT INTO public.matching_config (key, value, description)
VALUES ('legacy_booking_path_enabled', 1,
        'Allows bookings without a client request id (the unguarded path). Set to 0 once the guarded app is live.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_booking(p_service_id uuid, p_property_id uuid, p_scheduled_start timestamp with time zone, p_problem_summary text DEFAULT NULL::text, p_urgency text DEFAULT 'flexible'::text, p_options jsonb DEFAULT '{}'::jsonb, p_expected_free_inspection boolean DEFAULT NULL::boolean, p_expected_amount numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(booking_id uuid, booking_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_service  public.services%ROWTYPE;
  v_amount   numeric;
  v_model    text;
  v_summary  text := NULLIF(btrim(p_problem_summary), '');
  v_urgency  text := COALESCE(p_urgency, 'flexible');
  v_options  jsonb := '[]'::jsonb;
  v_given    int;
  v_avail    text;
  v_id       uuid;
  v_ref      text;
  v_free     boolean;
  v_gate     boolean;
  v_recent   int;
  v_limit    int;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_customer AND role = 'customer'::user_role) THEN
    RAISE EXCEPTION 'Only customers can create bookings' USING ERRCODE = '42501';
  END IF;

  -- The unguarded path (no client request id, so no retry key and no expected price) is switched off once the
  -- guarded app is live. Set matching_config 'legacy_booking_path_enabled' to 0 only after that deploy (runbook step).
  IF p_client_request_id IS NULL AND public._matching_setting('legacy_booking_path_enabled') = 0 THEN
    RAISE EXCEPTION 'Please refresh the page and book again' USING ERRCODE = 'P0009';
  END IF;

  -- One booking request at a time per customer, taken before the retry lookup. Without it two parallel submissions
  -- could both pass the rate limit and the open-inspection check, since neither sees the other's uncommitted row.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_booking:' || v_customer::text, 0));

  -- A retried submission returns the booking it already made. Nothing new is inserted or charged.
  IF p_client_request_id IS NOT NULL THEN
    SELECT b.id, b.booking_reference INTO v_id, v_ref
      FROM public.bookings b
     WHERE b.customer_id = v_customer AND b.client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_id, v_ref;
      RETURN;
    END IF;
  END IF;

  -- Lock the switches for this transaction. An admin change to them waits until this booking commits,
  -- so the decision checked below is the one the booking is saved under.
  PERFORM 1 FROM public.matching_config
   WHERE key IN ('free_inspection_enabled', 'inspection_gate_enabled', 'booking_rate_limit_per_hour')
     FOR SHARE;

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id AND is_active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or no longer available' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.availability INTO v_avail FROM public.service_categories c WHERE c.id = v_service.category_id;
  IF v_avail = 'coming_soon' THEN
    RAISE EXCEPTION 'This service is not available yet' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.properties
                 WHERE id = p_property_id AND owner_customer_id = v_customer) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002';
  END IF;

  -- Bookings are taken only where a verified professional has an active service area in the property's city.
  -- That coverage is what professionals have registered, so no area is invented here. Elsewhere the customer is told.
  IF NOT EXISTS (
    SELECT 1
    FROM public.properties pr
    JOIN public.addresses a ON a.id = pr.address_id
    JOIN public.professional_service_areas psa
      ON lower(btrim(psa.city)) = lower(btrim(a.city)) AND psa.is_active IS TRUE
    JOIN public.professional_profiles pp
      ON pp.user_id = psa.professional_id AND pp.verification_status = 'verified'
    WHERE pr.id = p_property_id
  ) THEN
    RAISE EXCEPTION 'We do not serve this area yet' USING ERRCODE = 'P0008';
  END IF;

  IF p_scheduled_start IS NULL OR p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'Scheduled start must be in the future' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_summary) > 1000 THEN
    RAISE EXCEPTION 'Problem description is too long' USING ERRCODE = '22023';
  END IF;

  IF v_urgency NOT IN ('flexible', 'today', 'emergency')
     OR (v_urgency = 'emergency' AND COALESCE(public._matching_setting('emergency_enabled'), 0) <> 1) THEN
    RAISE EXCEPTION 'Urgency % is not available', v_urgency USING ERRCODE = '22023';
  END IF;

  IF p_options IS NOT NULL AND jsonb_typeof(p_options) = 'object' AND p_options <> '{}'::jsonb THEN
    SELECT count(*) INTO v_given FROM jsonb_object_keys(p_options);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'option_id', so.id, 'option', so.name, 'value', sov.value, 'label', sov.label)
             ORDER BY so.sort_order NULLS LAST, so.name), '[]'::jsonb)
      INTO v_options
    FROM jsonb_each_text(p_options) given
    JOIN public.service_options so
      ON so.id::text = given.key AND so.service_id = v_service.id
    JOIN public.service_option_values sov
      ON sov.service_option_id = so.id AND sov.value = given.value AND COALESCE(sov.is_active, true);

    IF jsonb_array_length(v_options) <> v_given THEN
      RAISE EXCEPTION 'One of the chosen options is not available' USING ERRCODE = '22023';
    END IF;
  ELSIF p_options IS NOT NULL AND jsonb_typeof(p_options) <> 'object' THEN
    RAISE EXCEPTION 'Options must be an object' USING ERRCODE = '22023';
  END IF;

  v_model := v_service.pricing_model;
  v_amount := CASE v_model
    WHEN 'fixed' THEN v_service.base_price
    WHEN 'inspection' THEN v_service.inspection_fee
    WHEN 'quote_after_inspection' THEN NULL
  END;

  IF v_model NOT IN ('fixed', 'inspection', 'quote_after_inspection')
     OR (v_model <> 'quote_after_inspection' AND v_amount IS NULL) THEN
    RAISE EXCEPTION 'Service % has no price for pricing model %', v_service.id, v_model
      USING ERRCODE = '22023';
  END IF;

  -- Free inspection: the inspection fee is not billed; the customer pays only an approved quote.
  v_free := COALESCE(public._matching_setting('free_inspection_enabled'), 0) = 1;
  v_gate := COALESCE(public._matching_setting('inspection_gate_enabled'), 0) = 1;
  IF v_model = 'inspection' AND v_free THEN
    v_model := 'quote_after_inspection';
    v_amount := NULL;
  END IF;

  -- The customer's acknowledged price must still be the price. Refuse rather than charge something else.
  IF p_expected_free_inspection IS NOT NULL
     AND (p_expected_free_inspection IS DISTINCT FROM v_free
          OR p_expected_amount IS DISTINCT FROM v_amount) THEN
    RAISE EXCEPTION 'The price for this service has changed' USING ERRCODE = 'P0003';
  END IF;

  -- Abuse limits. Counted from the bookings table itself, so they hold across serverless instances.
  v_limit := COALESCE(public._matching_setting('booking_rate_limit_per_hour'), 5);
  SELECT count(*) INTO v_recent FROM public.bookings
   WHERE customer_id = v_customer AND created_at > now() - interval '1 hour';
  IF v_recent >= v_limit THEN
    -- Not P0004: that code is PostgreSQL's assert_failure, which WHEN OTHERS handlers do not catch.
    RAISE EXCEPTION 'Too many bookings in the last hour' USING ERRCODE = 'P0007';
  END IF;

  IF v_model IN ('inspection', 'quote_after_inspection') THEN
    -- One open inspection per service at a property. A second request would be a second visit for the same issue.
    IF EXISTS (SELECT 1 FROM public.bookings b
                WHERE b.customer_id = v_customer AND b.property_id = p_property_id
                  AND b.service_id = v_service.id
                  AND b.pricing_model IN ('inspection', 'quote_after_inspection')
                  AND b.booking_status NOT IN ('cancelled', 'completed')) THEN
      RAISE EXCEPTION 'You already have an open inspection for this service at this property' USING ERRCODE = 'P0005';
    END IF;
    -- With the gate on, a visit must be carried out by an active inspector. No capacity or calendar is modelled.
    IF v_gate AND NOT EXISTS (SELECT 1 FROM public.inspectors WHERE is_active) THEN
      RAISE EXCEPTION 'No inspector is available yet' USING ERRCODE = 'P0006';
    END IF;
  END IF;

  INSERT INTO public.bookings AS b
    (customer_id, property_id, service_id, scheduled_start, pricing_model,
     quoted_or_base_amount, booking_status, problem_summary, urgency, intake_options, client_request_id)
  VALUES
    (v_customer, p_property_id, v_service.id, p_scheduled_start, v_model,
     v_amount, 'pending', v_summary, v_urgency, v_options, p_client_request_id)
  RETURNING b.id, b.booking_reference INTO v_id, v_ref;

  IF v_gate AND v_service.pricing_model IN ('inspection', 'quote_after_inspection') THEN
    INSERT INTO public.inspection_visits (booking_id, status) VALUES (v_id, 'requested');
  END IF;

  RETURN QUERY SELECT v_id, v_ref;
END;
$function$;

