-- Quotation and payment invariants: create_quote, respond_to_quote and _job_payment_amount.
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quote_payment_invariants.sql
-- Runs in one transaction that is rolled back. A failed ASSERT stops the run.
BEGIN;

-- Runs the statement as an authenticated user and returns 'ok:<text>' or 'err:<SQLSTATE>'.
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
  c_user uuid := '00000000-0000-4000-8000-0000000000d1';
  c_other uuid := '00000000-0000-4000-8000-0000000000d2';
  pro uuid := '00000000-0000-4000-8000-0000000000e1';
  pro_other uuid := '00000000-0000-4000-8000-0000000000e2';
  v_addr uuid; v_cat uuid; v_svc uuid; v_prop uuid;
  v_booking uuid; v_job uuid; v_quote1 uuid; v_quote2 uuid; v_quote3 uuid;
  v_res text;
  v_items_1 jsonb := '[{"item_type":"labour","description":"Replace pipe","quantity":1,"unit_price":400},{"item_type":"material","description":"Pipe","quantity":2,"unit_price":250}]';
  v_items_2 jsonb := '[{"item_type":"labour","description":"Extra valve","quantity":1,"unit_price":500}]';
  v_items_3 jsonb := '[{"item_type":"labour","description":"Declined extra","quantity":1,"unit_price":9000}]';
BEGIN
  -- ── Fixtures (as the table owner) ─────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_user, 'quote-test-c1@example.invalid'),
    (c_other, 'quote-test-c2@example.invalid'),
    (pro, 'quote-test-p1@example.invalid'),
    (pro_other, 'quote-test-p2@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES
    (c_user, 'customer'), (c_other, 'customer'), (pro, 'professional'), (pro_other, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  -- The assignment guard only accepts verified professionals; the owner session is a service path.
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro, 'Quote test pro', 'verified', false);

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Quote test home', '3 Test Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Quote test flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Quote test', 'quote-test', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Quote fixed test', 'quote-fixed-test', 'fixed', 1500, true) RETURNING id INTO v_svc;

  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('QT-TEST-0001', c_user, v_prop, v_svc, now() + interval '3 days',
            'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO v_booking;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_booking, c_user, v_prop, pro, 'in_progress') RETURNING id INTO v_job;

  -- ── Quotes: totals are computed on the server ────────────────────────────────────────
  -- Client-side totals are not accepted: create_quote ignores anything but items.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text', v_job, 'Found corroded pipe', v_items_1));
  ASSERT left(v_res, 3) = 'ok:', 'first quote should be created: ' || v_res;
  v_quote1 := substring(v_res from 4)::uuid;
  ASSERT (SELECT total FROM public.quotes WHERE id = v_quote1) = 900, 'server total should be 400 + 2 x 250';

  -- A second quote cannot be sent while the first waits for the customer.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text', v_job, 'Second', v_items_2));
  ASSERT v_res = 'err:22023', 'a second pending quote must be refused, got ' || v_res;

  -- Another professional cannot quote a job they are not assigned to.
  v_res := pg_temp.as_user(pro_other, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text', v_job, 'Intruder', v_items_2));
  ASSERT v_res = 'err:P0002', 'unassigned professional must not quote, got ' || v_res;

  -- Only the job's customer may answer the quote.
  v_res := pg_temp.as_user(c_other, format('SELECT public.respond_to_quote(%L, %L)::text', v_quote1, 'approved'));
  ASSERT left(v_res, 4) = 'err:', 'another customer must not answer the quote, got ' || v_res;

  -- Customer approves quote 1: work resumes.
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_quote1, 'approved'));
  ASSERT v_res = 'ok:true', 'customer should approve, got ' || v_res;
  ASSERT (SELECT current_state FROM public.jobs WHERE id = v_job) = 'in_progress', 'approval should resume work';

  -- An answered quote cannot be answered again.
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_quote1, 'declined'));
  ASSERT left(v_res, 4) = 'err:', 'answered quote must not change, got ' || v_res;

  -- Quote 2 (extra work) is approved separately.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text', v_job, 'Extra valve', v_items_2));
  ASSERT left(v_res, 3) = 'ok:', 'extra work quote should be created: ' || v_res;
  v_quote2 := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_quote2, 'approved'));
  ASSERT v_res = 'ok:true', 'extra work should be approvable, got ' || v_res;

  -- Quote 3 is declined: it must never be billed.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text', v_job, 'Declined', v_items_3));
  ASSERT left(v_res, 3) = 'ok:', 'declinable quote should be created: ' || v_res;
  v_quote3 := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_quote3, 'declined'));
  ASSERT v_res = 'ok:true', 'customer should decline, got ' || v_res;

  -- The professional cannot change an approved quote's total (the update matches no row or is refused).
  v_res := pg_temp.as_user(pro, format('WITH u AS (UPDATE public.quotes SET total = 1 WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u', v_quote1));
  ASSERT (SELECT total FROM public.quotes WHERE id = v_quote1) = 900, 'approved total must be unchanged, call returned ' || v_res;

  -- ── Payment: the amount due is every approved quote summed ───────────────────────────
  -- Force the job to completed as the owner, the way the finish code would.
  UPDATE public.jobs SET current_state = 'completed', completed_at = now() WHERE id = v_job;

  -- Quote 1 (900) + quote 2 (500) = 1400, i.e. 140000 paise. Quote 3 (declined) is excluded.
  -- Open decision: the fixed base (1500) is not added here; see migration 20261104_122.
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job));
  ASSERT v_res = 'ok:140000', 'amount due must be the sum of approved quotes (140000 paise), got ' || v_res;

  -- The payment request must use the same amount: a wrong amount is refused.
  v_res := pg_temp.as_user(c_user, format('SELECT public.create_pending_payment(%L, %L, %s)::text', v_job, 'rzp-test-wrong', 100));
  ASSERT v_res = 'err:22023', 'a payment below the amount due must be refused, got ' || v_res;

  -- The amount that matches is accepted once; a second checkout for the same job is refused.
  v_res := pg_temp.as_user(c_user, format('SELECT public.create_pending_payment(%L, %L, %s)::text', v_job, 'rzp-test-ok', 140000));
  ASSERT left(v_res, 3) = 'ok:', 'the matching amount should create a pending payment, got ' || v_res;
  v_res := pg_temp.as_user(c_user, format('SELECT public.create_pending_payment(%L, %L, %s)::text', v_job, 'rzp-test-dup', 140000));
  ASSERT v_res = 'err:23505', 'a second checkout while one is pending must be refused, got ' || v_res;

  -- ── Fixed-price job with no quotes: base only ────────────────────────────────────────
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('QT-TEST-0002', c_user, v_prop, v_svc, now() + interval '4 days',
            'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO v_booking;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_booking, c_user, v_prop, pro, 'completed') RETURNING id INTO v_job;
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job));
  ASSERT v_res = 'ok:150000', 'base-only job should bill the base price, got ' || v_res;

  -- ── Inspection-quoted job with no approved quote: nothing is payable ─────────────────
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('QT-TEST-0003', c_user, v_prop, v_svc, now() + interval '5 days',
            'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO v_booking;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (v_booking, c_user, v_prop, pro, 'completed') RETURNING id INTO v_job;
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job));
  ASSERT v_res = 'err:22023', 'a job with no approved quote and no price must not be payable, got ' || v_res;

  RAISE NOTICE 'quote_payment_invariants: all checks passed';
END $test$;

ROLLBACK;
