-- 20261102_119_inspection_foundation
--
-- Free company inspection ahead of repair assignment (founder decision, see
-- docs/FOUNDER_FEEDBACK_IMPLEMENTATION.md). DRAFT: not applied to any database. It ships dark:
-- both switches below default to 0, so applying it changes nothing until the owner flips them.
--
--   matching_config.free_inspection_enabled = 1
--       create_booking stores inspection-model services as 'quote_after_inspection' with a NULL amount
--       (the existing "price after inspection" path), so no inspection fee is billed.
--   matching_config.inspection_gate_enabled = 1
--       a visit row is created for every inspection-model booking, and _assign_booking_internal
--       (the one function the customer flow, assign_booking and the cron queue all go through)
--       withholds the repair offer until the visit is completed with outcome 'repair_needed'.
--
-- Historical bookings are never touched: neither switch rewrites existing rows.
-- An admin can still assign a professional by hand (admin_assign_professional); that is the
-- deliberate override and it is not gated.
--
-- 1. switches   2. inspectors   3. inspection_visits (+ admin-only costs)   4. gate in assignment
-- 5. create_booking (free inspection, visit creation, category availability)   6. RPCs   7. metrics
-- Rollback: supabase/rollbacks/20261102_119_rollback.sql

-- ---------------------------------------------------------------------------------------------
-- 1. Switches, and category availability
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.matching_config (key, value, description) VALUES
  ('free_inspection_enabled', 0, '1 = inspection-model services are booked without an inspection fee (quote after inspection). Founder decision; flip with the NEXT_PUBLIC_FREE_INSPECTION copy flag.'),
  ('inspection_gate_enabled', 0, '1 = a company inspection visit must be completed (repair needed) before a repair professional is offered the job.')
ON CONFLICT (key) DO NOTHING;

-- bookable: customers can book now. manual_assignment: bookable, an admin assigns the professional.
-- coming_soon: listed as unavailable; create_booking refuses it. Existing categories stay bookable.
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'bookable';
ALTER TABLE public.service_categories
  DROP CONSTRAINT IF EXISTS service_categories_availability_check;
ALTER TABLE public.service_categories
  ADD CONSTRAINT service_categories_availability_check
  CHECK (availability IN ('bookable', 'manual_assignment', 'coming_soon'));

-- ---------------------------------------------------------------------------------------------
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

-- What a visit cost the company. Recorded by an admin from real figures; never estimated here,
-- and never visible to customers, inspectors or professionals.
CREATE TABLE IF NOT EXISTS public.inspection_visit_costs (
  visit_id    uuid PRIMARY KEY REFERENCES public.inspection_visits(id) ON DELETE CASCADE,
  amount      numeric(10, 2) NOT NULL CHECK (amount >= 0),
  note        text CHECK (char_length(note) <= 300),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_visit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY inspection_visit_costs_admin ON public.inspection_visit_costs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role));

-- A booking cancelled by anyone closes its open visit.
CREATE OR REPLACE FUNCTION public._close_visit_on_booking_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.booking_status = 'cancelled' AND OLD.booking_status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.inspection_visits
       SET status = 'cancelled', updated_at = now()
     WHERE booking_id = NEW.id AND status IN ('requested', 'scheduled', 'missed');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._close_visit_on_booking_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_close_visit ON public.bookings;
CREATE TRIGGER bookings_close_visit
  AFTER UPDATE OF booking_status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public._close_visit_on_booking_cancel();

-- ---------------------------------------------------------------------------------------------
-- 4. The gate. Same body as 20261030_009 plus one early return.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._booking_awaits_inspection(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public._matching_setting('inspection_gate_enabled'), 0) = 1
     AND EXISTS (SELECT 1 FROM public.inspection_visits v
                 WHERE v.booking_id = p_booking_id
                   AND NOT (v.status = 'completed' AND v.outcome = 'repair_needed'));
$$;
REVOKE ALL ON FUNCTION public._booking_awaits_inspection(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._assign_booking_internal(p_booking_id uuid, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_job public.jobs%ROWTYPE;
  v_job_id uuid;
BEGIN
  SELECT booking_status INTO v_status FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- Free inspection first: no repair offer until the company visit says a repair is needed.
  IF public._booking_awaits_inspection(p_booking_id) THEN
    RETURN NULL;
  END IF;

  -- Only a booking with no job, or one kept unmatched, can be offered again here.
  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id;
  IF FOUND AND (v_job.current_state <> 'assigned' OR v_job.professional_id IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  IF public._offer_next(p_booking_id, p_actor) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_job_id FROM public.jobs WHERE booking_id = p_booking_id;
  RETURN v_job_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._assign_booking_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. create_booking: the 20261030_009 body plus free inspection, visit creation, availability.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_service_id      uuid,
  p_property_id     uuid,
  p_scheduled_start timestamptz,
  p_problem_summary text DEFAULT NULL,
  p_urgency         text DEFAULT 'flexible',
  p_options         jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (booking_id uuid, booking_reference text)
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
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_customer AND role = 'customer'::user_role) THEN
    RAISE EXCEPTION 'Only customers can create bookings' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id AND is_active IS TRUE;
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
  IF v_model = 'inspection' AND COALESCE(public._matching_setting('free_inspection_enabled'), 0) = 1 THEN
    v_model := 'quote_after_inspection';
    v_amount := NULL;
  END IF;

  INSERT INTO public.bookings AS b
    (customer_id, property_id, service_id, scheduled_start, pricing_model,
     quoted_or_base_amount, booking_status, problem_summary, urgency, intake_options)
  VALUES
    (v_customer, p_property_id, v_service.id, p_scheduled_start, v_model,
     v_amount, 'pending', v_summary, v_urgency, v_options)
  RETURNING b.id, b.booking_reference INTO v_id, v_ref;

  IF COALESCE(public._matching_setting('inspection_gate_enabled'), 0) = 1
     AND v_service.pricing_model IN ('inspection', 'quote_after_inspection') THEN
    INSERT INTO public.inspection_visits (booking_id, status) VALUES (v_id, 'requested');
  END IF;

  RETURN QUERY SELECT v_id, v_ref;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, uuid, timestamptz, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, timestamptz, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. RPCs. Every one re-derives the caller from auth.uid(); nothing trusts a role argument.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND role = 'admin'::public.user_role) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  RETURN v_user;
END;
$function$;
REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC, anon, authenticated;

-- Register an existing 'professional' account as an inspector, or switch one off or on.
CREATE OR REPLACE FUNCTION public.admin_set_inspector(
  p_user_id uuid, p_display_name text, p_phone text DEFAULT NULL, p_active boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public._require_admin();
  v_name text := NULLIF(btrim(p_display_name), '');
BEGIN
  IF v_name IS NULL OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'A display name of 1 to 100 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'professional'::public.user_role) THEN
    RAISE EXCEPTION 'The account must be a professional-role account' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.professional_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'This account is already a marketplace professional' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inspectors (user_id, display_name, phone, is_active, created_by)
  VALUES (p_user_id, v_name, NULLIF(btrim(p_phone), ''), COALESCE(p_active, true), v_admin)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name, phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$function$;

-- Assign or reassign the inspector and set the visit time. Allowed while the booking is open.
CREATE OR REPLACE FUNCTION public.admin_assign_inspector(
  p_visit_id uuid, p_inspector_id uuid, p_scheduled_start timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visit public.inspection_visits%ROWTYPE;
BEGIN
  PERFORM public._require_admin();
  IF p_scheduled_start IS NULL OR p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'The visit time must be in the future' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inspectors WHERE user_id = p_inspector_id AND is_active) THEN
    RAISE EXCEPTION 'Inspector not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_visit FROM public.inspection_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002'; END IF;
  IF v_visit.status NOT IN ('requested', 'scheduled', 'missed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'visit_closed', 'message', 'This visit can no longer be scheduled.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = v_visit.booking_id AND booking_status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_closed', 'message', 'The booking is no longer open.');
  END IF;

  UPDATE public.inspection_visits
     SET inspector_id = p_inspector_id, scheduled_start = p_scheduled_start,
         status = 'scheduled', missed_reason = NULL, updated_at = now()
   WHERE id = p_visit_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- What the assigned inspector may see about the site. Same contact fields as get_job_customer_contact.
CREATE OR REPLACE FUNCTION public.get_inspection_visit_site(p_visit_id uuid)
RETURNS TABLE (
  service_name text, problem_summary text, customer_name text, customer_phone text,
  address_line_1 text, address_line_2 text, area text, city text, postal_code text, access_notes text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.name, b.problem_summary, pr.full_name, pr.phone,
         a.address_line_1, a.address_line_2, a.area, a.city, a.postal_code, a.access_notes
  FROM public.inspection_visits v
  JOIN public.bookings b ON b.id = v.booking_id
  JOIN public.services s ON s.id = b.service_id
  JOIN public.profiles pr ON pr.id = b.customer_id
  JOIN public.properties p ON p.id = b.property_id
  JOIN public.addresses a ON a.id = p.address_id
  WHERE v.id = p_visit_id
    AND v.inspector_id = auth.uid()
    AND v.status IN ('scheduled', 'missed', 'completed')
    AND EXISTS (SELECT 1 FROM public.inspectors i WHERE i.user_id = auth.uid() AND i.is_active);
$$;

CREATE OR REPLACE FUNCTION public.inspector_complete_visit(
  p_visit_id uuid, p_outcome text, p_findings text, p_recommendation text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_visit public.inspection_visits%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_findings text := NULLIF(btrim(p_findings), '');
  v_rec text := NULLIF(btrim(p_recommendation), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('repair_needed', 'no_repair_needed') THEN
    RAISE EXCEPTION 'A valid outcome is required' USING ERRCODE = '22023';
  END IF;
  IF v_findings IS NULL OR char_length(v_findings) < 10 OR char_length(v_findings) > 2000 THEN
    RAISE EXCEPTION 'Findings of 10 to 2000 characters are required' USING ERRCODE = '22023';
  END IF;
  IF v_rec IS NOT NULL AND char_length(v_rec) > 1000 THEN
    RAISE EXCEPTION 'The recommendation must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_visit FROM public.inspection_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND OR v_visit.inspector_id IS DISTINCT FROM v_user
     OR NOT EXISTS (SELECT 1 FROM public.inspectors WHERE user_id = v_user AND is_active) THEN
    RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_visit.status <> 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_scheduled', 'message', 'This visit is not open for a report.');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_visit.booking_id FOR UPDATE;
  IF v_booking.booking_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_closed', 'message', 'The booking is no longer open.');
  END IF;

  UPDATE public.inspection_visits
     SET status = 'completed', outcome = p_outcome, findings = v_findings, recommendation = v_rec,
         completed_at = now(), updated_at = now()
   WHERE id = p_visit_id;

  IF p_outcome = 'no_repair_needed' THEN
    PERFORM public.transition_booking_state(
      v_booking.id, 'cancelled', v_user, 'inspector', 'inspection_no_repair', 'no_repair_needed',
      jsonb_build_object('visit_id', p_visit_id));
    RETURN jsonb_build_object('ok', true, 'outcome', p_outcome, 'job_id', NULL);
  END IF;

  -- Offer the repair to professionals now; if nobody matches the queue retries, as for any booking.
  RETURN jsonb_build_object('ok', true, 'outcome', p_outcome,
    'job_id', public._assign_booking_internal(v_booking.id, v_booking.customer_id));
END;
$function$;

-- Inspector or admin: the visit did not happen (no access, customer absent, ...).
CREATE OR REPLACE FUNCTION public.mark_inspection_missed(p_visit_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_visit public.inspection_visits%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'A reason of up to 300 characters is required' USING ERRCODE = '22023';
  END IF;
  v_is_admin := EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND role = 'admin'::public.user_role);

  SELECT * INTO v_visit FROM public.inspection_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_is_admin OR (v_visit.inspector_id = v_user
        AND EXISTS (SELECT 1 FROM public.inspectors WHERE user_id = v_user AND is_active))) THEN
    RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_visit.status <> 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_scheduled', 'message', 'Only a scheduled visit can be marked missed.');
  END IF;

  UPDATE public.inspection_visits
     SET status = 'missed', missed_reason = v_reason, missed_count = missed_count + 1, updated_at = now()
   WHERE id = p_visit_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Admin records the real cost of a visit. Overwrites the earlier figure so a correction is possible.
CREATE OR REPLACE FUNCTION public.admin_record_inspection_cost(p_visit_id uuid, p_amount numeric, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_admin uuid := public._require_admin();
BEGIN
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'The cost must be between 0 and 100000' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inspection_visits WHERE id = p_visit_id) THEN
    RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.inspection_visit_costs (visit_id, amount, note, recorded_by)
  VALUES (p_visit_id, round(p_amount, 2), NULLIF(btrim(p_note), ''), v_admin)
  ON CONFLICT (visit_id) DO UPDATE
    SET amount = EXCLUDED.amount, note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by, recorded_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 7. Economics. Counts what happened; the cost figures are only what an admin recorded.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_inspection_metrics(p_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM public._require_admin();
  WITH v AS (
    SELECT iv.*, j.id AS job_id, j.current_state AS job_state, c.amount AS cost
    FROM public.inspection_visits iv
    LEFT JOIN public.jobs j ON j.booking_id = iv.booking_id
    LEFT JOIN public.inspection_visit_costs c ON c.visit_id = iv.id
    WHERE p_since IS NULL OR iv.created_at >= p_since
  )
  SELECT jsonb_build_object(
    'requested',        count(*),
    'open',             count(*) FILTER (WHERE status IN ('requested', 'scheduled', 'missed')),
    'unassigned',       count(*) FILTER (WHERE status = 'requested'),
    'completed',        count(*) FILTER (WHERE status = 'completed'),
    'missed_visits',    COALESCE(sum(missed_count), 0),
    'currently_missed', count(*) FILTER (WHERE status = 'missed'),
    'cancelled',        count(*) FILTER (WHERE status = 'cancelled'),
    'repair_needed',    count(*) FILTER (WHERE outcome = 'repair_needed'),
    'no_repair_needed', count(*) FILTER (WHERE outcome = 'no_repair_needed'),
    'repair_offered',   count(*) FILTER (WHERE outcome = 'repair_needed' AND job_id IS NOT NULL),
    'repair_completed', count(*) FILTER (WHERE outcome = 'repair_needed' AND job_state IN ('completed', 'closed')),
    'cost_recorded_visits', count(*) FILTER (WHERE cost IS NOT NULL),
    'cost_total',       COALESCE(sum(cost), 0),
    'completed_without_cost', count(*) FILTER (WHERE status = 'completed' AND cost IS NULL),
    'by_inspector', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'inspector_id', t.user_id, 'name', t.display_name, 'active', t.is_active,
               'assigned', t.assigned, 'completed', t.completed, 'missed', t.missed, 'open', t.open)
             ORDER BY t.display_name)
      FROM (
        SELECT i.user_id, i.display_name, i.is_active,
               count(v2.id) AS assigned,
               count(v2.id) FILTER (WHERE v2.status = 'completed') AS completed,
               COALESCE(sum(v2.missed_count), 0) AS missed,
               count(v2.id) FILTER (WHERE v2.status = 'scheduled') AS open
        FROM public.inspectors i LEFT JOIN v v2 ON v2.inspector_id = i.user_id
        GROUP BY i.user_id, i.display_name, i.is_active) t), '[]'::jsonb)
  ) INTO v_result FROM v;
  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.admin_set_inspector(uuid, text, text, boolean),
  public.admin_assign_inspector(uuid, uuid, timestamptz),
  public.get_inspection_visit_site(uuid),
  public.inspector_complete_visit(uuid, text, text, text),
  public.mark_inspection_missed(uuid, text),
  public.admin_record_inspection_cost(uuid, numeric, text),
  public.admin_inspection_metrics(timestamptz)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_set_inspector(uuid, text, text, boolean),
  public.admin_assign_inspector(uuid, uuid, timestamptz),
  public.get_inspection_visit_site(uuid),
  public.inspector_complete_visit(uuid, text, text, text),
  public.mark_inspection_missed(uuid, text),
  public.admin_record_inspection_cost(uuid, numeric, text),
  public.admin_inspection_metrics(timestamptz)
TO authenticated;
