-- Test-data isolation (migration 130). Rolled back at the end; no rows persist.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_data_isolation.sql
BEGIN;

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
  t_cust  uuid := 'd0000000-0000-4000-8000-0000000000a1';  -- test customer (allowlisted)
  r_cust  uuid := 'd0000000-0000-4000-8000-0000000000a2';  -- real customer
  t_pro   uuid := 'd0000000-0000-4000-8000-0000000000b1';  -- test professional (allowlisted)
  r_pro   uuid := 'd0000000-0000-4000-8000-0000000000b2';  -- real professional
  v_cat uuid; v_svc uuid; v_pt_prop uuid; v_pr_prop uuid;
  v_bt uuid; v_br uuid; v_flag boolean; v_status text; v_err text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_cust, 'iso-test-cust@example.invalid'), (r_cust, 'iso-real-cust@example.invalid'),
    (t_pro, 'iso-test-pro@example.invalid'), (r_pro, 'iso-real-pro@example.invalid')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (t_cust, 'customer'), (r_cust, 'customer'),
    (t_pro, 'professional'), (r_pro, 'professional')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES
    (t_pro, 'iso test pro', 'verified', true), (r_pro, 'iso real pro', 'verified', true);

  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Isolation', 'iso-cat', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'Iso repair', 'iso-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc;
  v_pt_prop := pg_temp.mk_prop(t_cust, 'iso test prop');
  v_pr_prop := pg_temp.mk_prop(r_cust, 'iso real prop');

  -- 1. Without an allowlist entry, nothing changes: every booking is real.
  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, booking_status, is_test)
    VALUES (r_cust, v_pr_prop, v_svc, now() + interval '3 days', 'quote_after_inspection', 'pending', true)
    RETURNING id INTO v_br;
  SELECT is_test INTO v_flag FROM public.bookings WHERE id = v_br;
  ASSERT v_flag = false, 'a real customer booking must be server-flagged false even when the caller sends true';

  -- Enable the test identity for this transaction only.
  INSERT INTO public.test_identities (user_id, label) VALUES (t_cust, 'iso test customer'), (t_pro, 'iso test pro');

  -- 2. The server sets the flag from the customer. A caller cannot choose it either way.
  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, booking_status, is_test)
    VALUES (t_cust, v_pt_prop, v_svc, now() + interval '3 days', 'quote_after_inspection', 'pending', false)
    RETURNING id INTO v_bt;
  SELECT is_test INTO v_flag FROM public.bookings WHERE id = v_bt;
  ASSERT v_flag = true, 'a test customer booking must be flagged true even when the caller sends false';

  -- 3. The flag cannot be changed after insert.
  BEGIN
    UPDATE public.bookings SET is_test = false WHERE id = v_bt;
    RAISE EXCEPTION 'expected is_test update to be refused';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  -- 4. Real professional cannot be assigned to test work.
  BEGIN
    INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
      VALUES (v_bt, t_cust, v_pt_prop, r_pro, 'assigned');
    RAISE EXCEPTION 'expected refusal';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- 5. Test professional cannot be assigned to real work.
  BEGIN
    INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
      VALUES (v_br, r_cust, v_pr_prop, t_pro, 'assigned');
    RAISE EXCEPTION 'expected refusal';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- 6. Test work with a test professional is allowed.
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_bt, t_cust, v_pt_prop, t_pro, 'assigned');

  -- 7. Matching never offers a test booking to a real professional.
  PERFORM public.process_assignment_queue();
  ASSERT (SELECT professional_id FROM public.jobs WHERE booking_id = v_bt) = t_pro,
    'test job must keep only the test professional';

  -- 8. External notifications: test rows are suppressed, real rows are untouched.
  INSERT INTO public.notification_logs (customer_id, job_id, notification_type, channel_attempted, status)
    VALUES (t_cust, (SELECT id FROM public.jobs WHERE booking_id = v_bt), 'job_assigned', 'whatsapp', 'pending')
    RETURNING status INTO v_status;
  ASSERT v_status = 'expired', 'a test notification must be stored as expired (never sent), got ' || v_status;

  INSERT INTO public.notification_logs (customer_id, notification_type, channel_attempted, status)
    VALUES (r_cust, 'job_assigned', 'whatsapp', 'pending')
    RETURNING status INTO v_status;
  ASSERT v_status = 'pending', 'a real notification must stay pending, got ' || v_status;

  RAISE NOTICE 'test_data_isolation: all checks passed';
END
$test$;

ROLLBACK;
