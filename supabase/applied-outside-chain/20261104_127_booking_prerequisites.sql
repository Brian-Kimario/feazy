-- 20261104_127_booking_prerequisites
--
-- Forward-only. Brings production to the minimum schema the booking path needs, and nothing else.
-- Production has applied migrations through 20261102131241 (r1a_118). Migrations 119, 120 and 126 are
-- NOT applied and must not be replayed on production: several statements (CREATE POLICY, CREATE TABLE
-- without IF NOT EXISTS guards) would fail or duplicate objects. This file is the only way they arrive.
--
-- Extracted verbatim from, in order:
--   119: switches, bookings.client_request_id, service_categories.availability, inspectors,
--        inspection_visits (+ policies), create_booking retired 6-arg overload, get_booking_free_inspection
--   120: materials.indicative_price/price_unit, admin_set_material_price, booking_material_preferences,
--        bookings.budget_preference, set_booking_material_preferences, inspection_visit_materials,
--        _booking_materials_json, get_booking_materials, create_booking_with_materials
--   126: create_booking (9-arg, service-area gate, legacy_booking_path_enabled)
--
-- Deliberately EXCLUDED (see drift_findings.md, remaining gaps): inspection_visit_costs, the
-- _close_visit_on_booking_cancel trigger, _booking_awaits_inspection and _assign_booking_internal (gate off),
-- admin inspector RPCs, inspector_complete_visit, mark_inspection_missed, admin_inspection_metrics,
-- inspector_confirm_materials, get_visit_materials, admin material/category RPCs, draft categories,
-- invoices, notification tables.
--
-- Does NOT change: transition_job_state, _assign_booking_internal, assign_booking, any job/quote/payment
-- function, or any existing RLS policy.

BEGIN;

-- [119] switches, client_request_id, availability
-- 1. Switches, and category availability
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.matching_config (key, value, description) VALUES
  ('free_inspection_enabled', 0, '1 = inspection-model services are booked without an inspection fee (quote after inspection). Founder decision; flip with the NEXT_PUBLIC_FREE_INSPECTION copy flag.'),
  ('inspection_gate_enabled', 0, '1 = a company inspection visit must be completed (repair needed) before a repair professional is offered the job.'),
  ('booking_rate_limit_per_hour', 5, 'Maximum bookings one customer may create in a rolling hour. Applies to every booking, paid or free.')
ON CONFLICT (key) DO NOTHING;

-- Per-submission key from the customer's browser. Unique per customer so a retried request cannot book twice.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_customer_client_request_uidx
  ON public.bookings (customer_id, client_request_id) WHERE client_request_id IS NOT NULL;

-- bookable: customers can book now. manual_assignment: bookable, an admin assigns the professional.
-- coming_soon: listed as unavailable; create_booking refuses it. Existing categories stay bookable.
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'bookable';
ALTER TABLE public.service_categories
  DROP CONSTRAINT IF EXISTS service_categories_availability_check;
ALTER TABLE public.service_categories
  ADD CONSTRAINT service_categories_availability_check
  CHECK (availability IN ('bookable', 'manual_assignment', 'coming_soon'));


-- [119] inspectors and inspection_visits
-- 2. inspectors: company staff who visit. No new user_role value: an inspector signs in with a
--    'professional' account that has no professional profile, and this row grants the workspace.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspectors (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 100),
  phone        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspectors_select_self_or_admin ON public.inspectors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role));

-- ---------------------------------------------------------------------------------------------
-- 3. inspection_visits: one per booking. Written only by the RPCs below (no write policies).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  inspector_id    uuid REFERENCES public.inspectors(user_id),
  status          text NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'scheduled', 'completed', 'missed', 'cancelled')),
  scheduled_start timestamptz,
  completed_at    timestamptz,
  outcome         text CHECK (outcome IN ('repair_needed', 'no_repair_needed')),
  findings        text CHECK (char_length(findings) <= 2000),
  recommendation  text CHECK (char_length(recommendation) <= 1000),
  missed_reason   text CHECK (char_length(missed_reason) <= 300),
  missed_count    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_visits_completed_has_outcome
    CHECK (status <> 'completed' OR (outcome IS NOT NULL AND findings IS NOT NULL AND completed_at IS NOT NULL)),
  CONSTRAINT inspection_visits_scheduled_has_inspector
    CHECK (status NOT IN ('scheduled', 'completed') OR inspector_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS inspection_visits_status_idx ON public.inspection_visits (status, scheduled_start);
CREATE INDEX IF NOT EXISTS inspection_visits_inspector_idx ON public.inspection_visits (inspector_id, status);
ALTER TABLE public.inspection_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspection_visits_select ON public.inspection_visits
  FOR SELECT TO authenticated
  USING (
    inspector_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role)
  );

-- The professional who later holds the job reads the findings, and nothing else about the visit.
CREATE POLICY inspection_visits_select_job_professional ON public.inspection_visits
  FOR SELECT TO authenticated
  USING (status = 'completed'
         AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.booking_id = inspection_visits.booking_id
                       AND j.professional_id = auth.uid()));

-- [120] material prices, booking preferences, budget
-- ---------------------------------------------------------------------------------------------
-- 1. Indicative price, set by an admin. NULL means "price confirmed in the quotation".
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS indicative_price numeric(10, 2) CHECK (indicative_price IS NULL OR indicative_price >= 0),
  ADD COLUMN IF NOT EXISTS price_unit text CHECK (price_unit IS NULL OR char_length(price_unit) <= 30);

CREATE OR REPLACE FUNCTION public.admin_set_material_price(p_material_id uuid, p_price numeric, p_unit text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._require_admin();
  IF p_price IS NOT NULL AND (p_price < 0 OR p_price > 10000000) THEN
    RAISE EXCEPTION 'The price must be between 0 and 1,00,00,000' USING ERRCODE = '22023';
  END IF;
  UPDATE public.materials
     SET indicative_price = p_price, price_unit = NULLIF(btrim(p_unit), ''), updated_at = now()
   WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 2. What the customer asked for on a booking. Written only by set_booking_material_preferences.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_material_preferences (
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  -- How many the customer would like. A preference: the inspector confirms the real quantity.
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, material_id)
);

-- Rough budget the customer gave, in rupees. A preference the professional reads; it never sets a price.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS budget_preference numeric(10, 2)
  CHECK (budget_preference IS NULL OR budget_preference BETWEEN 500 AND 20000);
ALTER TABLE public.booking_material_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_material_preferences_select ON public.booking_material_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.inspection_visits v WHERE v.booking_id = booking_material_preferences.booking_id AND v.inspector_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.booking_id = booking_material_preferences.booking_id AND j.professional_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role)
  );

-- p_items: [{"material_id": uuid, "quantity": 1..10}]. Replaces the booking's earlier preferences.

-- [120] set_booking_material_preferences
DROP FUNCTION IF EXISTS public.set_booking_material_preferences(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.set_booking_material_preferences(p_booking_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_count int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Materials must be a list' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count > 10 THEN
    RAISE EXCEPTION 'Choose at most 10 materials' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND customer_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.booking_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_closed', 'message', 'Materials can only be changed while the booking is open.');
  END IF;

  CREATE TEMP TABLE _prefs ON COMMIT DROP AS
    SELECT (i->>'material_id')::uuid AS material_id,
           COALESCE((i->>'quantity')::int, 1) AS quantity
      FROM jsonb_array_elements(p_items) AS i;
  IF (SELECT count(DISTINCT material_id) FROM _prefs) <> v_count
     OR EXISTS (SELECT 1 FROM _prefs WHERE quantity NOT BETWEEN 1 AND 10) THEN
    RAISE EXCEPTION 'Invalid material list' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _prefs p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.service_materials sm JOIN public.materials mt ON mt.id = sm.material_id
      WHERE sm.service_id = v_booking.service_id AND sm.material_id = p.material_id
        AND sm.is_customer_selectable AND mt.is_active)) THEN
    RAISE EXCEPTION 'One of the chosen materials is not available for this service' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.booking_material_preferences WHERE booking_id = p_booking_id;
  INSERT INTO public.booking_material_preferences (booking_id, material_id, quantity)
    SELECT p_booking_id, material_id, quantity FROM _prefs;
  DROP TABLE _prefs;
  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$function$;

-- ---------------------------------------------------------------------------------------------

-- [120] inspection_visit_materials (table only)

-- ---------------------------------------------------------------------------------------------
-- 3. What the inspector confirms the job needs. Still not a price: the quotation fixes that.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_visit_materials (
  visit_id    uuid NOT NULL REFERENCES public.inspection_visits(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity    numeric(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 100000),
  -- Who arranges the material. Final cost and sourcing are fixed in the approved quotation.
  sourcing    text NOT NULL DEFAULT 'feazy' CHECK (sourcing IN ('customer', 'feazy')),
  note        text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_id, material_id)
);
ALTER TABLE public.inspection_visit_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspection_visit_materials_select ON public.inspection_visit_materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.inspection_visits v
              WHERE v.id = visit_id
                AND (v.inspector_id = auth.uid()
                     OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = v.booking_id AND b.customer_id = auth.uid())
                     OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.booking_id = v.booking_id AND j.professional_id = auth.uid())))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role)
  );


-- [120] read model for the booking (get_visit_materials excluded)
-- 3c. Read models. One place decides who sees preferences versus confirmed requirements.
--     Preferences = what the customer asked for. Confirmed = what the inspector says the job needs
--     (quantity, who arranges it). Neither is a price: the approved quotation fixes that.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._booking_materials_json(p_booking_id uuid, p_include_open boolean)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'budget', (SELECT b.budget_preference FROM public.bookings b WHERE b.id = p_booking_id),
    'preferences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'material_id', m.id, 'name', m.name, 'brand', br.name, 'unit', m.unit,
               'quantity', p.quantity,
               'indicative_price', m.indicative_price, 'price_unit', m.price_unit) ORDER BY m.name)
        FROM public.booking_material_preferences p
        JOIN public.materials m ON m.id = p.material_id
        LEFT JOIN public.brands br ON br.id = m.brand_id
       WHERE p.booking_id = p_booking_id), '[]'::jsonb),
    'confirmed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'material_id', m.id, 'name', m.name, 'brand', br.name, 'unit', m.unit,
               'quantity', vm.quantity, 'sourcing', vm.sourcing, 'note', vm.note,
               'indicative_price', m.indicative_price, 'price_unit', m.price_unit) ORDER BY m.name)
        FROM public.inspection_visits v
        JOIN public.inspection_visit_materials vm ON vm.visit_id = v.id
        JOIN public.materials m ON m.id = vm.material_id
        LEFT JOIN public.brands br ON br.id = m.brand_id
       WHERE v.id = (SELECT id FROM public.inspection_visits
                      WHERE booking_id = p_booking_id ORDER BY created_at DESC LIMIT 1)
         AND (p_include_open OR v.status = 'completed')), '[]'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public._booking_materials_json(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Customer, assigned professional, assigned inspector or admin.
CREATE OR REPLACE FUNCTION public.get_booking_materials(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_inspector boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  v_admin := EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.role = 'admin'::public.user_role);
  v_inspector := EXISTS (SELECT 1 FROM public.inspection_visits v WHERE v.booking_id = p_booking_id AND v.inspector_id = v_user);
  IF NOT (v_admin OR v_inspector
          OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p_booking_id AND b.customer_id = v_user)
          OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.booking_id = p_booking_id AND j.professional_id = v_user)) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public._booking_materials_json(p_booking_id, v_admin OR v_inspector);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_booking_materials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_materials(uuid) TO authenticated;

-- [126] create_booking 9-arg. The retired 6-arg overload is dropped first (it is what production has).
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, timestamptz, text, text, jsonb);
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


-- [119] grants for the 9-arg create_booking (CREATE OR REPLACE on a new signature defaults to PUBLIC EXECUTE)
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, uuid, timestamptz, text, text, jsonb, boolean, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, timestamptz, text, text, jsonb, boolean, numeric, uuid) TO authenticated, service_role;

-- [119] free-inspection display switch
-- 5b. The free-inspection switch as the booking wizard should display it. Read-only. The wizard
--     shows this value rather than NEXT_PUBLIC_FREE_INSPECTION, and create_booking charges by the
--     same switch. A booking submit sends the value that was shown, and createBookingAction refuses
--     if this has changed, so the customer is never charged a price they did not see.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_free_inspection()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public._matching_setting('free_inspection_enabled'), 0) = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_booking_free_inspection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_free_inspection() TO authenticated, service_role;

-- [120] create_booking_with_materials (depends on the 9-arg create_booking above)
-- ---------------------------------------------------------------------------------------------
-- 3b. Booking and material preferences in ONE transaction: if the preferences are rejected the
--     booking is not created either, so a preference can never be silently lost.
-- ---------------------------------------------------------------------------------------------
-- p_materials: [{"material_id": uuid, "quantity": 1..10}]. p_budget: rupees, 500..20000, or NULL.
-- The price guard (p_expected_free_inspection / p_expected_amount) and the replay key
-- (p_client_request_id) are passed straight to create_booking, so the whole request commits or fails together.
DROP FUNCTION IF EXISTS public.create_booking_with_materials(uuid, uuid, timestamptz, text, jsonb, uuid[]);
CREATE OR REPLACE FUNCTION public.create_booking_with_materials(
  p_service_id               uuid,
  p_property_id              uuid,
  p_scheduled_start          timestamptz,
  p_problem_summary          text,
  p_options                  jsonb,
  p_materials                jsonb,
  p_budget                   numeric,
  p_expected_free_inspection boolean,
  p_expected_amount          numeric,
  p_client_request_id        uuid
)
RETURNS TABLE (booking_id uuid, booking_reference text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_ref text;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_budget IS NOT NULL AND (p_budget < 500 OR p_budget > 20000) THEN
    RAISE EXCEPTION 'The budget must be between 500 and 20000' USING ERRCODE = '22023';
  END IF;

  -- A retried submission returns the booking it already made, with no second set of preferences.
  IF p_client_request_id IS NOT NULL THEN
    SELECT b.id, b.booking_reference INTO v_id, v_ref
      FROM public.bookings b
     WHERE b.customer_id = v_user AND b.client_request_id = p_client_request_id;
    IF FOUND THEN
      booking_id := v_id;
      booking_reference := v_ref;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT b.booking_id, b.booking_reference INTO v_id, v_ref
    FROM public.create_booking(
      p_service_id, p_property_id, p_scheduled_start, NULLIF(p_problem_summary, ''), 'flexible',
      COALESCE(p_options, '{}'::jsonb), p_expected_free_inspection, p_expected_amount, p_client_request_id) b;

  v_result := public.set_booking_material_preferences(v_id, COALESCE(p_materials, '[]'::jsonb));
  IF NOT COALESCE((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Could not save material preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bookings SET budget_preference = p_budget WHERE id = v_id;

  booking_id := v_id;
  booking_reference := v_ref;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_booking_with_materials(uuid, uuid, timestamptz, text, jsonb, jsonb, numeric, boolean, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_with_materials(uuid, uuid, timestamptz, text, jsonb, jsonb, numeric, boolean, numeric, uuid)
  TO authenticated;

COMMIT;
