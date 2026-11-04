-- Service-area gate and legacy booking path switch (migration 20261104_126).
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/service_area_gate.sql
-- Runs in one transaction that is rolled back. A failed ASSERT stops the run.
BEGIN;

CREATE FUNCTION pg_temp.as_user(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO r;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || coalesce(r, '');
END $f$;

DO $test$
DECLARE
  c_user uuid := 'b0000000-0000-4000-8000-0000000000c1';
  pro uuid := 'b0000000-0000-4000-8000-0000000000e1';
  pro_pending uuid := 'b0000000-0000-4000-8000-0000000000e2';
  v_cat uuid; v_svc uuid; v_addr_in uuid; v_addr_out uuid; v_addr_pune uuid; v_addr_pad uuid; v_prop_pad uuid;
  v_prop_in uuid; v_prop_out uuid; v_prop_pune uuid;
  v_res text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (c_user, 'area-test-c1@example.invalid'), (pro, 'area-test-p1@example.invalid')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (c_user, 'customer'), (pro, 'professional')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro, 'Area test pro', 'verified', false);
  -- The professional covers Mysuru only, as an active area.
  INSERT INTO public.professional_service_areas (professional_id, city, area, is_active)
    VALUES (pro, 'Mysuru', NULL, true);
  -- A second professional, not yet verified, covers Pune. The gate must ignore that coverage.
  INSERT INTO auth.users (id, email) VALUES (pro_pending, 'area-test-p2@example.invalid') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (pro_pending, 'professional') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro_pending, 'Pending pro', 'pending', false);
  INSERT INTO public.professional_service_areas (professional_id, city, area, is_active)
    VALUES (pro_pending, 'Pune', NULL, true);

  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Area test', 'area-test', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'Area repair', 'area-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc;

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Covered', '1 Covered Road', 'Mysuru') RETURNING id INTO v_addr_in;
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Uncovered', '2 Far Road', 'Atlantis') RETURNING id INTO v_addr_out;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Covered flat', 'apartment', v_addr_in) RETURNING id INTO v_prop_in;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Uncovered flat', 'apartment', v_addr_out) RETURNING id INTO v_prop_out;
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Pune', '3 Pune Road', 'Pune') RETURNING id INTO v_addr_pune;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Pune flat', 'apartment', v_addr_pune) RETURNING id INTO v_prop_pune;

  -- A. Outside the covered city: refused with P0008 and nothing is written.
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_out, now() + interval '3 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT v_res = 'err:P0008', 'a property outside any covered city must be refused, got ' || v_res;
  ASSERT NOT EXISTS (SELECT 1 FROM public.bookings WHERE property_id = v_prop_out),
    'a refused out-of-area booking must not leave a row';

  -- B. Inside the covered city: accepted.
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_in, now() + interval '3 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT left(v_res, 3) = 'ok:', 'a property in a covered city should be bookable, got ' || v_res;

  -- B2. Stray whitespace in the address city must not refuse a covered property (case and spaces are ignored).
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Padded', '4 Padded Road', '  mysuru ') RETURNING id INTO v_addr_pad;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Padded flat', 'apartment', v_addr_pad) RETURNING id INTO v_prop_pad;
  UPDATE public.bookings SET booking_status = 'cancelled' WHERE customer_id = c_user;
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_pad, now() + interval '3 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT left(v_res, 3) = 'ok:', 'padded or differently cased city of a covered area should be bookable, got ' || v_res;

  -- C. An inactive area does not count as coverage.
  UPDATE public.professional_service_areas SET is_active = false WHERE professional_id = pro;
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_in, now() + interval '4 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT v_res = 'err:P0008', 'an inactive area must not count as coverage, got ' || v_res;
  UPDATE public.professional_service_areas SET is_active = true WHERE professional_id = pro;

  -- D. An unverified professional does not count as coverage: Pune is served only by a pending professional.
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_pune, now() + interval '5 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT v_res = 'err:P0008', 'a coverage area of an unverified professional must not count, got ' || v_res;

  -- E. Legacy path (no client request id) is refused once the switch is off; guarded calls still work.
  UPDATE public.matching_config SET value = 0 WHERE key = 'legacy_booking_path_enabled';
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb)',
    v_svc, v_prop_in, now() + interval '6 days', 'Leak', 'flexible', '{}'));
  ASSERT v_res = 'err:P0009', 'the unguarded path must be refused when switched off, got ' || v_res;
  -- Section B left an open inspection for this property; cancel it so the duplicate guard (P0005) does not mask the check.
  UPDATE public.bookings SET booking_status = 'cancelled' WHERE customer_id = c_user;
  v_res := pg_temp.as_user(c_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    v_svc, v_prop_in, now() + interval '6 days', 'Leak', 'flexible', '{}', gen_random_uuid()));
  ASSERT left(v_res, 3) = 'ok:', 'a guarded booking must still work with the switch off, got ' || v_res;

  RAISE NOTICE 'service_area_gate: all checks passed';
END
$test$;

ROLLBACK;
