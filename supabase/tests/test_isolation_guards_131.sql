-- Verifies migration 131 (ranker isolation and payment guards).
-- No transaction control here: run through the wrapper that owns BEGIN/ROLLBACK, so no rows persist.
--   (echo 'BEGIN;'; cat supabase/tests/test_isolation_guards_131.sql; echo 'ROLLBACK;') | psql "$DATABASE_URL" -v ON_ERROR_STOP=1

CREATE FUNCTION pg_temp.mk_prop(p_customer uuid, p_label text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_addr uuid; v_prop uuid;
BEGIN
  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (p_customer, p_label, p_label || ' road', 'Mysuru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (p_customer, p_label, 'apartment', v_addr) RETURNING id INTO v_prop;
  RETURN v_prop;
END $f$;

DO $test$
DECLARE
  t_cust uuid := 'd0000000-0000-4000-8000-0000000000a1';  -- test customer (allowlisted)
  r_cust uuid := 'd0000000-0000-4000-8000-0000000000a2';  -- real customer
  t_pro  uuid := 'd0000000-0000-4000-8000-0000000000b1';  -- test professional (allowlisted)
  r_pro  uuid := 'd0000000-0000-4000-8000-0000000000b2';  -- real professional
  v_cat uuid; v_svc uuid; v_tprop uuid; v_rprop uuid;
  v_bt uuid; v_br uuid; v_tjob uuid; v_rjob uuid; v_pay uuid; v_got uuid;
  v_pros uuid[]; v_amt bigint; v_err text; v_status text;
BEGIN
  -- Fixtures (same shape as test_data_isolation.sql).
  INSERT INTO auth.users (id, email) VALUES
    (t_cust, 'g131-test-cust@example.invalid'), (r_cust, 'g131-real-cust@example.invalid'),
    (t_pro, 'g131-test-pro@example.invalid'), (r_pro, 'g131-real-pro@example.invalid')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (t_cust, 'customer'), (r_cust, 'customer'),
    (t_pro, 'professional'), (r_pro, 'professional')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES
    (t_pro, 'g131 test pro', 'verified', true), (r_pro, 'g131 real pro', 'verified', true);
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('G131', 'g131-cat', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'G131 repair', 'g131-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc;
  INSERT INTO public.professional_service_areas (professional_id, city) VALUES (t_pro, 'Mysuru'), (r_pro, 'Mysuru');
  INSERT INTO public.professional_skills (professional_id, service_category_id, service_id, skill_level)
    VALUES (t_pro, v_cat, v_svc, 'expert'), (r_pro, v_cat, v_svc, 'expert');
  v_tprop := pg_temp.mk_prop(t_cust, 'g131 test prop');
  v_rprop := pg_temp.mk_prop(r_cust, 'g131 real prop');

  -- The allowlist is what makes a customer or professional synthetic. Enable it for this transaction.
  INSERT INTO public.test_identities (user_id, label) VALUES (t_cust, 'g131 test customer'), (t_pro, 'g131 test pro');

  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, booking_status, is_test)
    VALUES (t_cust, v_tprop, v_svc, now() + interval '3 days', 'quote_after_inspection', 'pending', false)
    RETURNING id INTO v_bt;
  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, booking_status, is_test)
    VALUES (r_cust, v_rprop, v_svc, now() + interval '3 days', 'quote_after_inspection', 'pending', true)
    RETURNING id INTO v_br;
  ASSERT (SELECT is_test FROM public.bookings WHERE id = v_bt) = true, 'server must flag the test booking';
  ASSERT (SELECT is_test FROM public.bookings WHERE id = v_br) = false, 'server must flag the real booking false';

  -- 1. Ranker: a real booking ranks real professionals only.
  SELECT array_agg(professional_id) INTO v_pros FROM public._rank_professionals(v_br);
  ASSERT v_pros IS NOT NULL AND r_pro = ANY (v_pros), 'real booking should rank the real professional';
  ASSERT NOT (t_pro = ANY (coalesce(v_pros, '{}'))), 'real booking must never rank a test professional';

  -- 2. Ranker: a test booking ranks test professionals only.
  SELECT array_agg(professional_id) INTO v_pros FROM public._rank_professionals(v_bt);
  ASSERT v_pros IS NOT NULL AND t_pro = ANY (v_pros), 'test booking should rank the test professional';
  ASSERT NOT (r_pro = ANY (coalesce(v_pros, '{}'))), 'test booking must never rank a real professional';

  -- 3. _offer_next uses the same ranker, so it cannot bypass the filter. Real and test bookings both stay isolated.
  ASSERT public._offer_next(v_bt, t_cust) = t_pro, '_offer_next must offer a test booking to the test professional';
  ASSERT public._offer_next(v_br, r_cust) = r_pro, '_offer_next must offer a real booking to the real professional';
  SELECT professional_id INTO v_got FROM public.jobs WHERE booking_id = v_bt;
  ASSERT v_got = t_pro, 'test job must hold the test professional';
  SELECT professional_id INTO v_got FROM public.jobs WHERE booking_id = v_br;
  ASSERT v_got = r_pro, 'real job must hold the real professional';

  -- 4. Payment: a completed test job has no payable amount.
  UPDATE public.jobs SET current_state = 'completed' WHERE booking_id = v_bt;
  UPDATE public.jobs SET current_state = 'completed' WHERE booking_id = v_br;
  SELECT id INTO v_tjob FROM public.jobs WHERE booking_id = v_bt;
  SELECT id INTO v_rjob FROM public.jobs WHERE booking_id = v_br;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_cust, 'role', 'authenticated')::text, true);
  ASSERT public.job_payment_amount(v_tjob) IS NULL, 'job_payment_amount must return no amount for a test job';

  BEGIN
    v_pay := public.create_pending_payment(v_tjob, 'order_test_131', 100000);
    RAISE EXCEPTION 'create_pending_payment must refuse a test job';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.payments WHERE provider_reference = 'order_test_131'),
    'a refused test payment must leave no row';

  -- 5. Real job still passes the guard: the failure must be the amount check, not the isolation check.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', r_cust, 'role', 'authenticated')::text, true);
  BEGIN
    v_pay := public.create_pending_payment(v_rjob, 'order_real_131', 1);
    RAISE EXCEPTION 'expected amount mismatch for a real job';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  -- 6. Idempotency and ownership still hold for real jobs: a different customer is refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t_cust, 'role', 'authenticated')::text, true);
  BEGIN
    v_pay := public.create_pending_payment(v_rjob, 'order_real_131_x', 1);
    RAISE EXCEPTION 'expected ownership refusal';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLSTATE IN ('42501', '22023', 'P0002'), 'unexpected error for non-owner: ' || SQLSTATE;
  END;

  -- 7. Webhook / admin status change: refuse a payment on a test booking.
  INSERT INTO public.payments (customer_id, booking_id, job_id, payment_type, amount, currency, provider, provider_reference, status)
    VALUES (t_cust, v_bt, v_tjob, 'service', 1000, 'INR', 'razorpay', 'order_test_pay_131', 'pending')
    RETURNING id INTO v_pay;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  BEGIN
    v_status := public.transition_payment_status('order_test_pay_131', 'paid', 'payment.captured', 'pay_x', 100000, 'INR', '{}'::jsonb);
    RAISE EXCEPTION 'transition_payment_status must refuse a test payment';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  SELECT status INTO v_status FROM public.payments WHERE id = v_pay;
  ASSERT v_status = 'pending', 'a refused test payment must stay pending, got ' || v_status;

  RAISE NOTICE 'test_isolation_guards_131: all checks passed';
END
$test$;
