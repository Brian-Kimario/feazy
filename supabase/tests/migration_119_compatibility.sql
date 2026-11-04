-- Migration 119 compatibility: the legacy booking call the app still makes, and the removed six-argument signature.
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/migration_119_compatibility.sql
-- Runs in one transaction that is rolled back. A failed ASSERT stops the run.
-- The price-guard, retry, rate-limit and inspector-gate behaviour is covered by booking_pricing_guard.sql.
BEGIN;

-- The legacy call: only the five named arguments the form sends when no clientRequestId is present.
-- Returns 'ok:<booking id>' or 'err:<SQLSTATE>'. p_user NULL simulates a signed-out caller.
CREATE FUNCTION pg_temp.book_legacy(p_user uuid, p_property uuid, p_service uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT * INTO r FROM public.create_booking(
      p_service_id => p_service,
      p_property_id => p_property,
      p_scheduled_start => now() + interval '3 days',
      p_problem_summary => 'legacy form',
      p_options => '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || r.booking_id;
END $f$;

-- The pre-119 positional call with six arguments. 119 dropped that signature, but the nine-argument function has defaults,
-- so the call still books. The price guard arguments are NULL here, so no price is checked on this path.
CREATE FUNCTION pg_temp.book_six_args(p_user uuid, p_property uuid, p_service uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT * INTO r FROM public.create_booking(p_service, p_property, now() + interval '3 days', 'old form', 'flexible', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || r.booking_id;
END $f$;

DO $test$
DECLARE
  c_user uuid := '00000000-0000-4000-8000-0000000000b1';
  v_addr uuid; v_cat uuid; v_prop uuid; v_prop2 uuid;
  svc_fixed uuid; svc_insp uuid;
  v_res text; v_booking uuid; v_row record;
  v_n int;
BEGIN
  -- ── Fixtures (as the owner of the tables) ──────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES (c_user, 'compat-119@example.invalid') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (c_user, 'customer') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Compat home', '9 Compat Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Compat flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Compat', 'compat-119', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Compat fixed', 'compat-fixed', 'fixed', 1500, true) RETURNING id INTO svc_fixed;
  INSERT INTO public.services (category_id, name, slug, pricing_model, inspection_fee, is_active)
    VALUES (v_cat, 'Compat inspection', 'compat-inspection', 'inspection', 300, true) RETURNING id INTO svc_insp;

  -- Free inspection off, rate limit out of the way.
  UPDATE public.matching_config SET value = 0 WHERE key IN ('free_inspection_enabled', 'inspection_gate_enabled');
  UPDATE public.matching_config SET value = 100 WHERE key = 'booking_rate_limit_per_hour';

  -- ── 1. The legacy call resolves and books at the stored base price ───────────────────────
  v_res := pg_temp.book_legacy(c_user, v_prop, svc_fixed);
  ASSERT v_res LIKE 'ok:%', 'the five-argument legacy call must still book, got ' || v_res;
  v_booking := substring(v_res from 4)::uuid;
  SELECT b.pricing_model, b.quoted_or_base_amount INTO v_row FROM public.bookings b WHERE b.id = v_booking;
  ASSERT v_row.pricing_model = 'fixed' AND v_row.quoted_or_base_amount = 1500,
    'legacy booking stores the fixed base price, got ' || v_row.pricing_model || ' / ' || coalesce(v_row.quoted_or_base_amount::text, 'null');

  -- ── 2. The pre-119 positional call still books, through the defaults, with no price check ──
  v_res := pg_temp.book_six_args(c_user, v_prop, svc_fixed);
  ASSERT v_res LIKE 'ok:%', 'the six-argument positional call must still book, got ' || v_res;
  v_booking := substring(v_res from 4)::uuid;
  SELECT b.pricing_model, b.quoted_or_base_amount INTO v_row FROM public.bookings b WHERE b.id = v_booking;
  ASSERT v_row.pricing_model = 'fixed' AND v_row.quoted_or_base_amount = 1500,
    'the positional booking stores the current base price, got ' || v_row.pricing_model;

  -- ── 3. Free inspection off: inspection-model service stores the fee ─────────────────────
  v_res := pg_temp.book_legacy(c_user, v_prop, svc_insp);
  ASSERT v_res LIKE 'ok:%', 'an inspection booking with free inspection off must book, got ' || v_res;
  v_booking := substring(v_res from 4)::uuid;
  SELECT b.pricing_model, b.quoted_or_base_amount INTO v_row FROM public.bookings b WHERE b.id = v_booking;
  ASSERT v_row.pricing_model = 'inspection' AND v_row.quoted_or_base_amount = 300,
    'with free inspection off the visit fee is stored, got ' || v_row.pricing_model || ' / ' || coalesce(v_row.quoted_or_base_amount::text, 'null');

  -- ── 4. Free inspection on: the same service is stored as quote after inspection ────────────
  -- A second property: step 3 already holds the one open inspection for this service and property (P0005).
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Compat flat 2', 'apartment', v_addr) RETURNING id INTO v_prop2;
  UPDATE public.matching_config SET value = 1 WHERE key = 'free_inspection_enabled';
  v_res := pg_temp.book_legacy(c_user, v_prop2, svc_insp);
  ASSERT v_res LIKE 'ok:%', 'an inspection booking with free inspection on must book, got ' || v_res;
  v_booking := substring(v_res from 4)::uuid;
  SELECT b.pricing_model, b.quoted_or_base_amount INTO v_row FROM public.bookings b WHERE b.id = v_booking;
  ASSERT v_row.pricing_model = 'quote_after_inspection' AND v_row.quoted_or_base_amount IS NULL,
    'with free inspection on no fee is stored, got ' || v_row.pricing_model;
  UPDATE public.matching_config SET value = 0 WHERE key = 'free_inspection_enabled';

  -- ── 5. Signed-out legacy call is refused, nothing booked ─────────────────────────────────
  SELECT count(*) INTO v_n FROM public.bookings WHERE customer_id = c_user;
  v_res := pg_temp.book_legacy(NULL, v_prop, svc_fixed);
  ASSERT v_res = 'err:42501', 'a signed-out legacy call must be refused with 42501, got ' || v_res;
  ASSERT (SELECT count(*) FROM public.bookings WHERE customer_id = c_user) = v_n, 'a refused call creates no booking row';

  RAISE NOTICE 'migration_119_compatibility: all checks passed';
END $test$;

ROLLBACK;
