-- P0005: one open inspection per customer, service and property (create_booking).
-- A booking is open only while its work is open. A booking whose linked job is completed, closed or cancelled
-- must not block a new inspection, and a job that is still open must.
-- Run against a database where every migration is applied (rolled back at the end):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/p0005_open_inspection_guard.sql
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

CREATE FUNCTION pg_temp.mk_prop(p_customer uuid, p_label text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_addr uuid; v_prop uuid;
BEGIN
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (p_customer, p_label, p_label || ' road', 'Mysuru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (p_customer, p_label, 'apartment', v_addr) RETURNING id INTO v_prop;
  RETURN v_prop;
END $f$;

CREATE FUNCTION pg_temp.book(p_user uuid, p_service uuid, p_property uuid, p_days int) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  RETURN pg_temp.as_user(p_user, format(
    'SELECT booking_id::text FROM public.create_booking(%L, %L, %L, %L, %L, %L::jsonb, NULL, NULL, %L)',
    p_service, p_property, now() + make_interval(days => p_days), 'Guard test', 'flexible', '{}', gen_random_uuid()));
END $f$;

CREATE FUNCTION pg_temp.booking_of(p_res text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT CASE WHEN left(p_res, 3) = 'ok:' THEN substring(p_res from 4)::uuid END
$f$;

DO $test$
DECLARE
  c_user  uuid := 'c0000000-0000-4000-8000-0000000000c1';
  c_other uuid := 'c0000000-0000-4000-8000-0000000000c2';
  pro     uuid := 'c0000000-0000-4000-8000-0000000000e1';
  v_cat uuid; v_svc uuid; v_svc2 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p_other uuid;
  v_b1 uuid; v_b3 uuid; v_res text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (c_user, 'p0005-c1@example.invalid'), (c_other, 'p0005-c2@example.invalid'), (pro, 'p0005-pro@example.invalid')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (c_user, 'customer'), (c_other, 'customer'), (pro, 'professional')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro, 'P0005 pro', 'verified', false);
  INSERT INTO public.professional_service_areas (professional_id, city, area, is_active)
    VALUES (pro, 'Mysuru', NULL, true);
  INSERT INTO public.matching_config (key, value, description)
    VALUES ('booking_rate_limit_per_hour', 100, 'test override (rolled back)')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('P0005 guard', 'p0005-guard', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'P0005 repair', 'p0005-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'P0005 repair two', 'p0005-repair-two', 'quote_after_inspection', true) RETURNING id INTO v_svc2;

  v_p1 := pg_temp.mk_prop(c_user, 'P0005 prop 1');
  v_p2 := pg_temp.mk_prop(c_user, 'P0005 prop 2');
  v_p3 := pg_temp.mk_prop(c_user, 'P0005 prop 3');
  v_p4 := pg_temp.mk_prop(c_user, 'P0005 prop 4');
  v_p5 := pg_temp.mk_prop(c_user, 'P0005 prop 5');
  v_p_other := pg_temp.mk_prop(c_other, 'P0005 other customer prop');

  -- 1. First inspection at a property: accepted.
  v_res := pg_temp.book(c_user, v_svc, v_p1, 3);
  ASSERT left(v_res, 3) = 'ok:', 'first inspection must be accepted, got ' || v_res;
  v_b1 := pg_temp.booking_of(v_res);

  -- 2. Duplicate while the first is still open (pending, no job): refused with P0005.
  v_res := pg_temp.book(c_user, v_svc, v_p1, 4);
  ASSERT v_res = 'err:P0005', 'duplicate active inspection must be refused with P0005, got ' || v_res;

  -- 3. The first inspection's job is completed. A new inspection for the same issue is a new visit: accepted.
  --    Before the fix this is refused with P0005, because bookings.booking_status is never set to completed.
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_b1, c_user, v_p1, pro, 'completed');
  v_res := pg_temp.book(c_user, v_svc, v_p1, 4);
  ASSERT left(v_res, 3) = 'ok:', 'after the previous inspection job is completed, a new inspection must be accepted, got ' || v_res;

  -- 4. Previous inspection job cancelled (booking still pending): accepted.
  v_res := pg_temp.book(c_user, v_svc, v_p3, 3);
  ASSERT left(v_res, 3) = 'ok:', 'setup: first inspection at property 3 must be accepted, got ' || v_res;
  v_b3 := pg_temp.booking_of(v_res);
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_b3, c_user, v_p3, pro, 'cancelled');
  v_res := pg_temp.book(c_user, v_svc, v_p3, 4);
  ASSERT left(v_res, 3) = 'ok:', 'after the previous inspection job is cancelled, a new inspection must be accepted, got ' || v_res;

  -- 5. Open job still blocks: a booking whose job is in quote_pending (work not finished) refuses a duplicate.
  v_res := pg_temp.book(c_user, v_svc, v_p5, 3);
  ASSERT left(v_res, 3) = 'ok:', 'setup: first inspection at property 5 must be accepted, got ' || v_res;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (pg_temp.booking_of(v_res), c_user, v_p5, pro, 'quote_pending');
  v_res := pg_temp.book(c_user, v_svc, v_p5, 4);
  ASSERT v_res = 'err:P0005', 'a duplicate while the previous job is still open must be refused, got ' || v_res;

  -- 6. Completed booking_status with no job (legacy rows): accepted.
  v_res := pg_temp.book(c_user, v_svc, v_p4, 3);
  ASSERT left(v_res, 3) = 'ok:', 'setup: inspection at property 4 must be accepted, got ' || v_res;
  UPDATE public.bookings SET booking_status = 'completed' WHERE id = pg_temp.booking_of(v_res);
  v_res := pg_temp.book(c_user, v_svc, v_p4, 4);
  ASSERT left(v_res, 3) = 'ok:', 'after the previous booking is completed, a new inspection must be accepted, got ' || v_res;

  -- 7. Different service at the same property: accepted while an inspection for svc 1 is open.
  v_res := pg_temp.book(c_user, v_svc2, v_p1, 5);
  ASSERT left(v_res, 3) = 'ok:', 'a different service at the same property must be accepted, got ' || v_res;

  -- 8. Different customer, same service and property city: accepted.
  v_res := pg_temp.book(c_other, v_svc, v_p_other, 3);
  ASSERT left(v_res, 3) = 'ok:', 'a different customer must not be blocked, got ' || v_res;

  -- 9. Different property of the same customer and service: accepted while property 1 has an open inspection.
  v_res := pg_temp.book(c_user, v_svc, v_p2, 3);
  ASSERT left(v_res, 3) = 'ok:', 'a different property must not be blocked, got ' || v_res;

  RAISE NOTICE 'p0005_open_inspection_guard: all checks passed';
END
$test$;

ROLLBACK;
