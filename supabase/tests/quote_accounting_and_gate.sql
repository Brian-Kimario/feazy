-- Quote accounting and the repair completion gate (migration 20261104_123).
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quote_accounting_and_gate.sql
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

-- Runs a statement as the database owner (no JWT, as a service path would) and returns 'ok' or 'err:<SQLSTATE>'.
CREATE FUNCTION pg_temp.as_owner(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  -- Clear any claims left by as_user, so auth.uid() is NULL on this path.
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'as_owner failed: % %', SQLSTATE, SQLERRM;
  RETURN 'err:' || SQLSTATE;
END $f$;

-- One labour line at the given unit price, as the items jsonb that create_quote expects.
CREATE FUNCTION pg_temp.items(p_price numeric) RETURNS text LANGUAGE sql AS $f$
  SELECT json_build_array(json_build_object('item_type', 'labour', 'description', 'Work', 'quantity', 1, 'unit_price', p_price))::text
$f$;

DO $test$
DECLARE
  c_user uuid := '00000000-0000-4000-8000-0000000000f1';
  pro uuid := '00000000-0000-4000-8000-0000000000f2';
  pro_other uuid := '00000000-0000-4000-8000-0000000000f3';
  c_other uuid := '00000000-0000-4000-8000-0000000000f4';
  v_addr uuid; v_prop uuid; v_cat uuid;
  v_svc_fixed uuid; v_svc_qai uuid; v_svc_insp uuid;
  v_job_fixed uuid; v_job_repair uuid; v_job_gate uuid; v_job_insp uuid;
  v_res text;
  v_q uuid;
BEGIN
  -- ── Fixtures (as the table owner) ─────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_user, 'acct-test-c1@example.invalid'), (c_other, 'acct-test-c2@example.invalid'),
    (pro, 'acct-test-p1@example.invalid'), (pro_other, 'acct-test-p2@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES
    (c_user, 'customer'), (c_other, 'customer'), (pro, 'professional'), (pro_other, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro, 'Acct test pro', 'verified', false);

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Acct test home', '4 Test Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Acct test flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Acct test', 'acct-test', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Acct fixed', 'acct-fixed', 'fixed', 1500, true) RETURNING id INTO v_svc_fixed;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'Acct repair', 'acct-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc_qai;
  INSERT INTO public.services (category_id, name, slug, pricing_model, inspection_fee, is_active)
    VALUES (v_cat, 'Acct inspection', 'acct-inspection', 'inspection', 75, true) RETURNING id INTO v_svc_insp;

  -- Job F: fixed-price booking, base 1500.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ACCT-F', c_user, v_prop, v_svc_fixed, now() + interval '3 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'in_progress' FROM b RETURNING id INTO v_job_fixed;

  -- Job R: inspection-based repair, no base price.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ACCT-R', c_user, v_prop, v_svc_qai, now() + interval '4 days', 'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'in_progress' FROM b RETURNING id INTO v_job_repair;

  -- Job G: inspection-based repair where the only quote is declined.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ACCT-G', c_user, v_prop, v_svc_qai, now() + interval '5 days', 'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'in_progress' FROM b RETURNING id INTO v_job_gate;

  -- Job I: inspection-only visit, fee 75.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ACCT-I', c_user, v_prop, v_svc_insp, now() + interval '6 days', 'inspection', 75, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'in_progress' FROM b RETURNING id INTO v_job_insp;

  -- ── A. Fixed price: base plus approved additional work, never the base twice ─────────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_fixed, 'Repair kind on fixed', pg_temp.items(1), 'repair'));
  ASSERT v_res = 'err:22023', 'a fixed-price booking must refuse repair-kind quotes, got ' || v_res;

  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text',
                                       v_job_fixed, 'Extra pipe', pg_temp.items(400)));
  ASSERT left(v_res, 3) = 'ok:', 'additional work should be quotable on fixed price, got ' || v_res;
  v_q := substring(v_res from 4)::uuid;
  ASSERT (SELECT quote_kind FROM public.quotes WHERE id = v_q) = 'additional_work', 'fixed-price default kind must be additional_work';
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'customer should approve additional work, got ' || v_res;

  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text',
                                       v_job_fixed, 'More valve', pg_temp.items(200)));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'second additional work should be approvable, got ' || v_res;

  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text',
                                       v_job_fixed, 'Declined extra', pg_temp.items(9000)));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'declined'));
  ASSERT v_res = 'ok:true', 'declined extra work should be answerable, got ' || v_res;

  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_fixed, 'completed')) = 'ok',
    'a fixed-price job with no gate should complete';
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job_fixed));
  ASSERT v_res = 'ok:210000', 'fixed: base 1500 + approved 400 + 200 = 210000 paise, declined excluded, got ' || v_res;

  -- ── B. Inspection-based repair: gate, revisions, additional work, payment ──────────────
  -- Completion without any approved repair quote is blocked, for the database and for a service path.
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_repair, 'completed')) = 'err:22023',
    'a repair job must not complete without an approved repair quote';

  -- An authenticated professional cannot complete it either.
  v_res := pg_temp.as_user(pro, format('SELECT public.transition_job_state(%L, %L, auth.uid(), ''{}''::jsonb)::text', v_job_repair, 'completed'));
  ASSERT v_res = 'err:22023', 'professional completion must also hit the gate, got ' || v_res;

  -- Repair revision 1 (900), approved.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Repair scope v1', pg_temp.items(900), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'repair revision 1 should be approvable, got ' || v_res;

  -- Additional work (300) on top of the repair.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Extra wiring', pg_temp.items(300), 'additional_work'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'additional work should be approvable, got ' || v_res;

  -- Revision 2 of the repair replaces revision 1 (1000). Revision 1 must not be counted again.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Repair scope v2', pg_temp.items(1000), 'repair'));
  ASSERT left(v_res, 3) = 'ok:', 'revision 2 should be quotable, got ' || v_res;
  ASSERT (SELECT revision FROM public.quotes WHERE id = substring(v_res from 4)::uuid) = 2, 'revision must increase per job';
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'repair revision 2 should be approvable, got ' || v_res;

  -- A declined third revision must not contribute.
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Repair scope v3', pg_temp.items(5000), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'declined'));
  ASSERT v_res = 'ok:true', 'revision 3 should be declinable, got ' || v_res;

  -- A repair quote cannot be sent for a job that is not in progress (here: while quote_pending).
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Pending check', pg_temp.items(100), 'repair'));
  ASSERT left(v_res, 3) = 'ok:', 'a new repair quote should be quotable while in progress, got ' || v_res;
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_repair, 'completed')) = 'err:P0001',
    'completion must stay blocked while a quote is pending (the state machine refuses quote_pending -> completed)';
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', substring(v_res from 4)::uuid, 'declined'));
  ASSERT v_res = 'ok:true', 'pending check quote should be declinable, got ' || v_res;

  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_repair, 'completed')) = 'ok',
    'a repair with an approved repair quote should complete';
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job_repair));
  ASSERT v_res = 'ok:130000', 'repair: operative revision 1000 + additional 300 = 130000 paise, got ' || v_res;

  -- ── C. A declined-only repair cannot complete ─────────────────────────────────────────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_gate, 'Only quote', pg_temp.items(500), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'declined'));
  ASSERT v_res = 'ok:true', 'the only repair quote should be declinable, got ' || v_res;
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_gate, 'completed')) = 'err:22023',
    'a declined-only repair must not complete';
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job_gate));
  ASSERT v_res = 'err:22023', 'a declined-only repair has nothing payable, got ' || v_res;

  -- ── D. Inspection-only visit: distinct lifecycle, no repair quotes, fee payable ───────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb)::text',
                                       v_job_insp, 'Repair on inspection', pg_temp.items(200)));
  ASSERT v_res = 'err:22023', 'an inspection-only visit must refuse repair quotes, got ' || v_res;
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''00000000-0000-4000-8000-0000000000f2'', ''{}''::jsonb)', v_job_insp, 'completed')) = 'ok',
    'an inspection-only visit must complete without a repair quote';
  v_res := pg_temp.as_user(c_user, format('SELECT public.job_payment_amount(%L)::text', v_job_insp));
  ASSERT v_res = 'ok:7500', 'the inspection fee should be payable (7500 paise), got ' || v_res;

  -- ── E. Unauthorized transitions ───────────────────────────────────────────────────────
  -- A customer cannot complete a job.
  v_res := pg_temp.as_user(c_user, format('SELECT public.transition_job_state(%L, %L, auth.uid(), ''{}''::jsonb)::text', v_job_gate, 'completed'));
  ASSERT left(v_res, 4) = 'err:', 'a customer must not complete a job, got ' || v_res;
  -- An unassigned professional cannot complete a job either.
  v_res := pg_temp.as_user(pro_other, format('SELECT public.transition_job_state(%L, %L, auth.uid(), ''{}''::jsonb)::text', v_job_repair, 'closed'));
  ASSERT left(v_res, 4) = 'err:', 'an unassigned professional must not change the job, got ' || v_res;
  -- The core function is not callable by users, so the gate cannot be bypassed through it.
  v_res := pg_temp.as_user(pro, format('SELECT public._transition_job_state_core(%L, %L, auth.uid(), ''{}''::jsonb)::text', v_job_gate, 'completed'));
  ASSERT v_res = 'err:42501', 'the core transition must not be callable by authenticated users, got ' || v_res;

  RAISE NOTICE 'quote_accounting_and_gate: all checks passed';
END $test$;

ROLLBACK;
