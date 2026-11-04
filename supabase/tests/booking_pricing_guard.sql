-- Booking price guard and safeguards: create_booking (migration 119) and create_booking_with_materials (120).
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_pricing_guard.sql
-- Everything runs in one transaction that is rolled back, so nothing persists. A failed ASSERT stops the run.
-- Calls go through the authenticated role with JWT claims, the same way the app calls them.
BEGIN;

-- Returns 'ok:<booking id>' or 'err:<SQLSTATE>'. p_user NULL simulates a signed-out caller.
CREATE FUNCTION pg_temp.book(
  p_user uuid, p_property uuid, p_service uuid,
  p_expected_free boolean, p_expected_amount numeric, p_key uuid
) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT * INTO r FROM public.create_booking(
      p_service, p_property, now() + interval '3 days', 'test booking', 'flexible', '{}'::jsonb,
      p_expected_free, p_expected_amount, p_key);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || r.booking_id;
END $f$;

-- Same as pg_temp.book, through the structured wrapper: materials, budget and retry key.
CREATE FUNCTION pg_temp.book_materials(
  p_user uuid, p_property uuid, p_service uuid, p_materials jsonb, p_budget numeric,
  p_expected_free boolean, p_expected_amount numeric, p_key uuid
) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT * INTO r FROM public.create_booking_with_materials(
      p_service, p_property, now() + interval '3 days', 'test booking', '{}'::jsonb, p_materials,
      p_budget, p_expected_free, p_expected_amount, p_key);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || r.booking_id;
END $f$;

DO $test$
DECLARE
  c_user  uuid := '00000000-0000-4000-8000-0000000000c1';
  c_user2 uuid := '00000000-0000-4000-8000-0000000000c2';
  pro     uuid := '00000000-0000-4000-8000-0000000000a1';
  v_addr  uuid;
  v_cat   uuid;
  svc_fixed uuid;
  svc_insp  uuid;
  prop1 uuid; prop2 uuid; prop3 uuid; prop4 uuid; prop5 uuid;
  m1 uuid; m2 uuid;
  k_fixed uuid := '00000000-0000-4000-9000-000000000001';
  k_free  uuid := '00000000-0000-4000-9000-000000000002';
  k_mat   uuid := '00000000-0000-4000-9000-000000000003';
  k_bad_budget uuid := '00000000-0000-4000-9000-000000000004';
  k_bad_qty    uuid := '00000000-0000-4000-9000-000000000005';
  k_bad_mat    uuid := '00000000-0000-4000-9000-000000000006';
  v_res text; v_res2 text; v_id uuid; v_n int; v_row record;
BEGIN
  -- ── Fixtures (as the owner of the tables) ──────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_user,  'pricing-test-1@example.invalid'),
    (c_user2, 'pricing-test-2@example.invalid'),
    (pro,     'pricing-test-pro@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (c_user, 'customer'), (c_user2, 'customer'), (pro, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Test home', '1 Test Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Test flat 1', 'apartment', v_addr) RETURNING id INTO prop1;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Test flat 2', 'apartment', v_addr) RETURNING id INTO prop2;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Test flat 3', 'apartment', v_addr) RETURNING id INTO prop3;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Test flat 5', 'apartment', v_addr) RETURNING id INTO prop5;
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user2, 'Second home', '2 Test Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user2, 'Second flat', 'apartment', v_addr) RETURNING id INTO prop4;

  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Pricing test', 'pricing-test', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Fixed test', 'fixed-test', 'fixed', 1500, true) RETURNING id INTO svc_fixed;
  INSERT INTO public.services (category_id, name, slug, pricing_model, inspection_fee, is_active)
    VALUES (v_cat, 'Inspection test', 'inspection-test', 'inspection', 300, true) RETURNING id INTO svc_insp;

  INSERT INTO public.materials (name, unit, is_active) VALUES ('Test pipe', 'metre', true) RETURNING id INTO m1;
  INSERT INTO public.materials (name, unit, is_active) VALUES ('Unlinked fitting', 'piece', true) RETURNING id INTO m2;
  INSERT INTO public.service_materials (service_id, material_id, is_customer_selectable, is_professional_selectable)
    VALUES (svc_fixed, m1, true, true);

  -- Switches start off, the rate limit is out of the way, and no inspector is active.
  -- Inspectors are deactivated, not deleted: inspection visits from other data may reference them.
  UPDATE public.matching_config SET value = 0 WHERE key IN ('free_inspection_enabled', 'inspection_gate_enabled');
  UPDATE public.matching_config SET value = 100 WHERE key = 'booking_rate_limit_per_hour';
  UPDATE public.inspectors SET is_active = false;

  -- ── 1. Changed policy: refused, nothing booked ───────────────────────────────────────────
  v_res := pg_temp.book(c_user, prop1, svc_fixed, false, 999, null);
  ASSERT v_res = 'err:P0003', 'fixed price changed (999 vs 1500) is refused with P0003, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.bookings WHERE customer_id = c_user;
  ASSERT v_n = 0, 'a refused price creates no booking row';

  UPDATE public.matching_config SET value = 1 WHERE key = 'free_inspection_enabled';
  v_res := pg_temp.book(c_user, prop1, svc_insp, false, 300, null);
  ASSERT v_res = 'err:P0003', 'free-inspection switch flipped on after the customer saw a fee is refused, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.bookings WHERE customer_id = c_user;
  ASSERT v_n = 0, 'a switch change between view and submit creates no booking row';

  -- ── 2. Correct policy: booked at the price the customer confirmed ────────────────────────
  v_res := pg_temp.book(c_user, prop1, svc_insp, true, null, k_free);
  ASSERT v_res LIKE 'ok:%', 'free inspection at the confirmed price books, got ' || v_res;
  SELECT * INTO v_row FROM public.bookings WHERE id = substring(v_res FROM 4)::uuid;
  ASSERT v_row.pricing_model = 'quote_after_inspection' AND v_row.quoted_or_base_amount IS NULL,
    'free inspection is stored as quote-after-inspection with no amount';

  UPDATE public.matching_config SET value = 0 WHERE key = 'free_inspection_enabled';
  v_res := pg_temp.book(c_user, prop2, svc_fixed, false, 1500, k_fixed);
  ASSERT v_res LIKE 'ok:%', 'fixed price at the confirmed amount books, got ' || v_res;
  SELECT * INTO v_row FROM public.bookings WHERE id = substring(v_res FROM 4)::uuid;
  ASSERT v_row.quoted_or_base_amount = 1500, 'fixed booking stores the confirmed amount';

  -- ── 3. Duplicate submission: same key returns the same booking, no second row ───────────
  v_res2 := pg_temp.book(c_user, prop2, svc_fixed, false, 1500, k_fixed);
  ASSERT v_res2 = v_res, 'a retry with the same key returns the same booking, got ' || v_res2;
  SELECT count(*) INTO v_n FROM public.bookings WHERE client_request_id = k_fixed;
  ASSERT v_n = 1, 'a retry creates no second booking row';

  -- ── 4. Unauthorized callers ─────────────────────────────────────────────────────────────
  v_res := pg_temp.book(NULL, prop1, svc_fixed, false, 1500, null);
  ASSERT v_res = 'err:42501', 'signed-out caller is refused with 42501, got ' || v_res;
  v_res := pg_temp.book(pro, prop1, svc_fixed, false, 1500, null);
  ASSERT v_res = 'err:42501', 'a professional cannot create a booking, got ' || v_res;
  v_res := pg_temp.book(c_user2, prop1, svc_fixed, false, 1500, null);
  ASSERT v_res = 'err:P0002', 'another customer cannot book on a property they do not own, got ' || v_res;

  -- ── 5. Open-inspection duplicate (P0005) ────────────────────────────────────────────────
  -- prop1 already has an open free inspection for this service from check 2.
  v_res := pg_temp.book(c_user, prop1, svc_insp, false, 300, null);
  ASSERT v_res = 'err:P0005', 'a second open inspection for the same service and property is refused, got ' || v_res;

  -- ── 6. Rate limit (P0007): c_user has two bookings in the last hour ──────────────────────
  UPDATE public.matching_config SET value = 2 WHERE key = 'booking_rate_limit_per_hour';
  v_res := pg_temp.book(c_user, prop5, svc_fixed, false, 1500, null);
  ASSERT v_res = 'err:P0007', 'the third booking in an hour is refused with P0007, got ' || v_res;
  UPDATE public.matching_config SET value = 100 WHERE key = 'booking_rate_limit_per_hour';

  -- ── 7. No inspector (P0006) and the gate once one is active ─────────────────────────────
  UPDATE public.matching_config SET value = 1 WHERE key = 'inspection_gate_enabled';
  v_res := pg_temp.book(c_user2, prop4, svc_insp, false, 300, null);
  ASSERT v_res = 'err:P0006', 'no active inspector refuses an inspection with P0006, got ' || v_res;

  INSERT INTO public.inspectors (user_id, display_name, is_active) VALUES (pro, 'Test inspector', true);
  v_res := pg_temp.book(c_user2, prop4, svc_insp, false, 300, null);
  ASSERT v_res LIKE 'ok:%', 'with an active inspector the inspection books, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.inspection_visits WHERE booking_id = substring(v_res FROM 4)::uuid AND status = 'requested';
  ASSERT v_n = 1, 'the gated booking opens one requested inspection visit';
  UPDATE public.matching_config SET value = 0 WHERE key = 'inspection_gate_enabled';

  -- ── 8. Structured wrapper: materials, budget and retry ──────────────────────────────────
  v_res := pg_temp.book_materials(c_user, prop5, svc_fixed,
    jsonb_build_array(jsonb_build_object('material_id', m1, 'quantity', 3)), 2500, false, 1500, k_mat);
  ASSERT v_res LIKE 'ok:%', 'a material preference with budget books, got ' || v_res;
  v_id := substring(v_res FROM 4)::uuid;
  SELECT quantity INTO v_n FROM public.booking_material_preferences WHERE booking_id = v_id AND material_id = m1;
  ASSERT v_n = 3, 'the preferred quantity is stored as structured data';
  SELECT budget_preference INTO v_row FROM public.bookings WHERE id = v_id;
  ASSERT v_row.budget_preference = 2500, 'the budget is stored as a preference';

  v_res2 := pg_temp.book_materials(c_user, prop5, svc_fixed,
    jsonb_build_array(jsonb_build_object('material_id', m1, 'quantity', 3)), 2500, false, 1500, k_mat);
  ASSERT v_res2 = v_res, 'a retried wrapper call returns the same booking, got ' || v_res2;
  SELECT count(*) INTO v_n FROM public.booking_material_preferences WHERE booking_id = v_id;
  ASSERT v_n = 1, 'a retried wrapper call adds no preference rows';

  v_res := pg_temp.book_materials(c_user, prop3, svc_fixed,
    jsonb_build_array(jsonb_build_object('material_id', m1, 'quantity', 1)), 100, false, 1500, k_bad_budget);
  ASSERT v_res = 'err:22023', 'a budget below 500 is refused, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.bookings WHERE client_request_id = k_bad_budget;
  ASSERT v_n = 0, 'a refused budget creates no booking row';

  v_res := pg_temp.book_materials(c_user, prop3, svc_fixed,
    jsonb_build_array(jsonb_build_object('material_id', m1, 'quantity', 11)), null, false, 1500, k_bad_qty);
  ASSERT v_res = 'err:22023', 'a quantity above 10 is refused, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.bookings WHERE client_request_id = k_bad_qty;
  ASSERT v_n = 0, 'a refused quantity creates no booking row';

  v_res := pg_temp.book_materials(c_user, prop3, svc_fixed,
    jsonb_build_array(jsonb_build_object('material_id', m2, 'quantity', 1)), null, false, 1500, k_bad_mat);
  ASSERT v_res = 'err:22023', 'a material not offered for this service is refused, got ' || v_res;
  SELECT count(*) INTO v_n FROM public.bookings WHERE client_request_id = k_bad_mat;
  ASSERT v_n = 0, 'a refused material creates no booking row';

  RAISE NOTICE 'booking_pricing_guard: all checks passed';
END
$test$;

ROLLBACK;
