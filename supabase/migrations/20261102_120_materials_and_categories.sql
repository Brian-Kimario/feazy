-- 20261102_120_materials_and_categories
--
-- Structured material preferences and draft categories from the founder's services list. DRAFT: not applied to any
-- database. Requires 119 (service_categories.availability, inspection_visits, _require_admin).
--
-- Material model (founder decision): a customer's choice is a PREFERENCE, the inspector CONFIRMS what
-- the job needs, and only the approved quotation fixes materials and prices. Nothing here charges
-- anything, and indicative prices are columns the admin fills in: none are invented by this file.
--
-- 1. indicative prices on materials   2. customer preferences   3. inspector-confirmed materials
-- 4. draft categories from the founder list (coming soon; Bike & Car inactive)
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

CREATE OR REPLACE FUNCTION public.inspector_confirm_materials(p_visit_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_visit public.inspection_visits%ROWTYPE;
  v_service uuid;
  v_count int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Materials must be a list' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count > 20 THEN
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

  CREATE TEMP TABLE _items ON COMMIT DROP AS
    SELECT (i->>'material_id')::uuid AS material_id,
           COALESCE((i->>'quantity')::numeric, 1) AS quantity,
           COALESCE(i->>'sourcing', 'feazy') AS sourcing,
           NULLIF(btrim(i->>'note'), '') AS note
      FROM jsonb_array_elements(p_items) AS i;

  IF (SELECT count(DISTINCT material_id) FROM _items) <> v_count
     OR EXISTS (SELECT 1 FROM _items WHERE quantity <= 0 OR quantity > 100000
                  OR sourcing NOT IN ('customer', 'feazy') OR char_length(COALESCE(note, '')) > 200) THEN
    RAISE EXCEPTION 'Invalid material list' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _items m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.service_materials sm JOIN public.materials mt ON mt.id = sm.material_id
      WHERE sm.service_id = v_service AND sm.material_id = m.material_id AND mt.is_active)) THEN
    RAISE EXCEPTION 'One of the chosen materials is not available for this service' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.inspection_visit_materials WHERE visit_id = p_visit_id;
  INSERT INTO public.inspection_visit_materials (visit_id, material_id, quantity, sourcing, note)
    SELECT p_visit_id, material_id, quantity, sourcing, note FROM _items;
  DROP TABLE _items;
  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$function$;

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

-- ---------------------------------------------------------------------------------------------
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

-- Assigned inspector (or admin): the materials offered for the visit's service plus current state.
CREATE OR REPLACE FUNCTION public.get_visit_materials(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_visit public.inspection_visits%ROWTYPE;
  v_service uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_visit FROM public.inspection_visits WHERE id = p_visit_id;
  IF NOT FOUND OR NOT (v_visit.inspector_id = v_user
       OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.role = 'admin'::public.user_role)) THEN
    RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT service_id INTO v_service FROM public.bookings WHERE id = v_visit.booking_id;
  RETURN public._booking_materials_json(v_visit.booking_id, true) || jsonb_build_object(
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'material_id', m.id, 'name', m.name, 'brand', br.name, 'unit', m.unit,
               'indicative_price', m.indicative_price, 'price_unit', m.price_unit) ORDER BY m.name)
        FROM public.service_materials sm
        JOIN public.materials m ON m.id = sm.material_id AND m.is_active
        LEFT JOIN public.brands br ON br.id = m.brand_id
       WHERE sm.service_id = v_service), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_booking_materials(uuid), public.get_visit_materials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_materials(uuid), public.get_visit_materials(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3d. Admin catalogue controls: category availability, materials and their service links.
--     Deliberately small: no stock, suppliers or purchasing.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_category_availability(p_category_id uuid, p_availability text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._require_admin();
  IF p_availability NOT IN ('bookable', 'manual_assignment', 'coming_soon') THEN
    RAISE EXCEPTION 'Unknown availability' USING ERRCODE = '22023';
  END IF;
  UPDATE public.service_categories SET availability = p_availability, updated_at = now() WHERE id = p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_material(
  p_id uuid, p_name text, p_brand text, p_specification text, p_unit text, p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_id uuid := p_id;
BEGIN
  PERFORM public._require_admin();
  IF btrim(COALESCE(p_name, '')) = '' OR char_length(p_name) > 120 THEN
    RAISE EXCEPTION 'Enter a material name (up to 120 characters)' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_unit, '')) = '' OR char_length(p_unit) > 30 THEN
    RAISE EXCEPTION 'Enter a unit (up to 30 characters)' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_brand), '') IS NOT NULL THEN
    SELECT id INTO v_brand FROM public.brands WHERE lower(name) = lower(btrim(p_brand)) LIMIT 1;
    IF v_brand IS NULL THEN
      INSERT INTO public.brands (name) VALUES (btrim(p_brand)) RETURNING id INTO v_brand;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.materials (name, brand_id, specification, unit, is_active)
      VALUES (btrim(p_name), v_brand, NULLIF(btrim(p_specification), ''), btrim(p_unit), COALESCE(p_is_active, true))
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.materials
       SET name = btrim(p_name), brand_id = v_brand, specification = NULLIF(btrim(p_specification), ''),
           unit = btrim(p_unit), is_active = COALESCE(p_is_active, true), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Material not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

-- Replaces the set of services a material is offered for. Existing link flags are kept.
CREATE OR REPLACE FUNCTION public.admin_set_material_services(p_material_id uuid, p_service_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[] := COALESCE(ARRAY(SELECT DISTINCT unnest(p_service_ids)), '{}');
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE id = p_material_id) THEN
    RAISE EXCEPTION 'Material not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) s(id) WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE id = s.id)) THEN
    RAISE EXCEPTION 'Unknown service' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.service_materials WHERE material_id = p_material_id AND service_id <> ALL (v_ids);
  INSERT INTO public.service_materials (service_id, material_id, is_customer_selectable, is_professional_selectable)
    SELECT s.id, p_material_id, true, true FROM unnest(v_ids) AS s(id)
    ON CONFLICT (service_id, material_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'count', cardinality(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_category_availability(uuid, text),
  public.admin_upsert_material(uuid, text, text, text, text, boolean),
  public.admin_set_material_services(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_category_availability(uuid, text),
  public.admin_upsert_material(uuid, text, text, text, text, boolean),
  public.admin_set_material_services(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Categories from the founder's services list (Feazy website HTML) that have no row yet.
--    Listed as "coming soon": create_booking refuses them until an admin sets availability to
--    'manual_assignment' or 'bookable', which is for the owner to do once verified professionals
--    cover the category. Bike & Car Service is a draft: inactive and hidden until approved.
--    Descriptions are taken from the founder's list; no other categories are added.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public.service_categories (name, slug, description, icon_key, sort_order, is_active, availability)
SELECT v.name, v.slug, v.description, v.icon_key, v.sort_order, v.is_active, 'coming_soon'
FROM (VALUES
  ('Home Maintenance', 'home-maintenance', 'Scheduled upkeep for the whole property.',                        'home',     80, true),
  ('Installation',     'installation',     'Fixtures, fittings and smart home devices.',                       'drill',    90, true),
  ('Cleaning',         'cleaning',         'Deep cleaning for homes and workspaces.',                          'sparkles', 100, true),
  ('General Repairs',  'general-repairs',  'Everything else your space needs fixed.',                          'wrench',   110, true),
  ('Bike & Car Service', 'bike-car-service', 'Draft category. Not visible to customers until coverage is approved.', 'bike', 120, false)
) AS v(name, slug, description, icon_key, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.service_categories c WHERE c.slug = v.slug);

REVOKE ALL ON FUNCTION
  public.admin_set_material_price(uuid, numeric, text),
  public.set_booking_material_preferences(uuid, jsonb),
  public.inspector_confirm_materials(uuid, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_set_material_price(uuid, numeric, text),
  public.set_booking_material_preferences(uuid, jsonb),
  public.inspector_confirm_materials(uuid, jsonb)
TO authenticated;
