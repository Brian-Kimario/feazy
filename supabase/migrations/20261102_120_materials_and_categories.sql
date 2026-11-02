-- 20261102_120_materials_and_categories
--
-- Structured material preferences and the draft 12-category catalogue. DRAFT: not applied to any
-- database. Requires 119 (service_categories.availability, inspection_visits, _require_admin).
--
-- Material model (founder decision): a customer's choice is a PREFERENCE, the inspector CONFIRMS what
-- the job needs, and only the approved quotation fixes materials and prices. Nothing here charges
-- anything, and indicative prices are columns the admin fills in: none are invented by this file.
--
-- 1. indicative prices on materials   2. customer preferences   3. inspector-confirmed materials
-- 4. four draft categories, listed "coming soon"
-- Rollback: supabase/rollbacks/20261102_120_rollback.sql

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
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, material_id)
);
ALTER TABLE public.booking_material_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_material_preferences_select ON public.booking_material_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.inspection_visits v WHERE v.booking_id = booking_material_preferences.booking_id AND v.inspector_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.booking_id = booking_material_preferences.booking_id AND j.professional_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'::public.user_role)
  );

CREATE OR REPLACE FUNCTION public.set_booking_material_preferences(p_booking_id uuid, p_material_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_ids uuid[] := COALESCE(ARRAY(SELECT DISTINCT unnest(p_material_ids)), '{}');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF cardinality(v_ids) > 10 THEN
    RAISE EXCEPTION 'Choose at most 10 materials' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND customer_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.booking_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_closed', 'message', 'Materials can only be changed while the booking is open.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS m(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.service_materials sm JOIN public.materials mt ON mt.id = sm.material_id
      WHERE sm.service_id = v_booking.service_id AND sm.material_id = m.id
        AND sm.is_customer_selectable AND mt.is_active)) THEN
    RAISE EXCEPTION 'One of the chosen materials is not available for this service' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.booking_material_preferences WHERE booking_id = p_booking_id;
  INSERT INTO public.booking_material_preferences (booking_id, material_id)
    SELECT p_booking_id, unnest(v_ids);
  RETURN jsonb_build_object('ok', true, 'count', cardinality(v_ids));
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 3. What the inspector confirms the job needs. Still not a price: the quotation fixes that.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_visit_materials (
  visit_id    uuid NOT NULL REFERENCES public.inspection_visits(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
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

CREATE OR REPLACE FUNCTION public.inspector_confirm_materials(p_visit_id uuid, p_material_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_visit public.inspection_visits%ROWTYPE;
  v_service uuid;
  v_ids uuid[] := COALESCE(ARRAY(SELECT DISTINCT unnest(p_material_ids)), '{}');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF cardinality(v_ids) > 20 THEN
    RAISE EXCEPTION 'Choose at most 20 materials' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_visit FROM public.inspection_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND OR v_visit.inspector_id IS DISTINCT FROM v_user
     OR NOT EXISTS (SELECT 1 FROM public.inspectors WHERE user_id = v_user AND is_active) THEN
    RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_visit.status <> 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_scheduled', 'message', 'Materials can only be confirmed while the visit is open.');
  END IF;
  SELECT service_id INTO v_service FROM public.bookings WHERE id = v_visit.booking_id;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS m(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.service_materials sm JOIN public.materials mt ON mt.id = sm.material_id
      WHERE sm.service_id = v_service AND sm.material_id = m.id AND mt.is_active)) THEN
    RAISE EXCEPTION 'One of the chosen materials is not available for this service' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.inspection_visit_materials WHERE visit_id = p_visit_id;
  INSERT INTO public.inspection_visit_materials (visit_id, material_id) SELECT p_visit_id, unnest(v_ids);
  RETURN jsonb_build_object('ok', true, 'count', cardinality(v_ids));
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4. Draft categories to reach the 12-category target. Listed as "coming soon" and refused by
--    create_booking until an admin sets availability to 'manual_assignment' or 'bookable' (which is
--    for the owner to do once professionals with the matching skills are verified in the area).
--    The names are a recommendation awaiting founder confirmation.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.service_categories (name, slug, description, icon_key, sort_order, is_active, availability)
SELECT v.name, v.slug, v.description, v.icon_key, v.sort_order, true, 'coming_soon'
FROM (VALUES
  ('Pest Control',        'pest-control',   'Treatment for cockroaches, termites, rodents and other household pests.', 'bug',    80),
  ('Waterproofing',       'waterproofing',  'Leak, seepage and damp-proofing for roofs, walls and bathrooms.',          'droplets', 90),
  ('Tiling & Masonry',    'tiling-masonry', 'Tile fitting and repair, plaster work and small civil repairs.',           'hammer', 100),
  ('CCTV & Security',     'cctv-security',  'CCTV, video door phones and basic home security fittings.',                'shield', 110)
) AS v(name, slug, description, icon_key, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.service_categories c WHERE c.slug = v.slug);

REVOKE ALL ON FUNCTION
  public.admin_set_material_price(uuid, numeric, text),
  public.set_booking_material_preferences(uuid, uuid[]),
  public.inspector_confirm_materials(uuid, uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_set_material_price(uuid, numeric, text),
  public.set_booking_material_preferences(uuid, uuid[]),
  public.inspector_confirm_materials(uuid, uuid[])
TO authenticated;
