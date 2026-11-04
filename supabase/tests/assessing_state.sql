-- Assessment phase and repair authorisation (migration 20261104_125).
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/assessing_state.sql
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

-- Runs a statement with no JWT (auth.uid() is NULL), as a service path would, and returns 'ok' or 'err:<SQLSTATE>'.
-- The actor is passed explicitly in the calls because job_events requires one.
CREATE FUNCTION pg_temp.as_owner(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END $f$;

-- One labour line at the given unit price, as the items jsonb that create_quote expects.
CREATE FUNCTION pg_temp.items(p_price numeric) RETURNS text LANGUAGE sql AS $f$
  SELECT json_build_array(json_build_object('item_type', 'labour', 'description', 'Work', 'quantity', 1, 'unit_price', p_price))::text
$f$;

DO $test$
DECLARE
  c_user uuid := 'a0000000-0000-4000-8000-0000000000c1';
  c_other uuid := 'a0000000-0000-4000-8000-0000000000c2';
  pro uuid := 'a0000000-0000-4000-8000-0000000000e1';
  pro_other uuid := 'a0000000-0000-4000-8000-0000000000e2';
  v_addr uuid; v_prop uuid; v_cat uuid;
  v_svc_fixed uuid; v_svc_qai uuid; v_svc_insp uuid;
  v_job_repair uuid; v_job_fixed uuid; v_job_insp uuid; v_job_repair2 uuid; v_job_repair3 uuid;
  v_res text;
  v_q uuid;
  v_state text;
BEGIN
  -- ── Fixtures (as the table owner) ─────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_user, 'assess-test-c1@example.invalid'), (c_other, 'assess-test-c2@example.invalid'),
    (pro, 'assess-test-p1@example.invalid'), (pro_other, 'assess-test-p2@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES
    (c_user, 'customer'), (c_other, 'customer'), (pro, 'professional'), (pro_other, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
    VALUES (pro, 'Assess test pro', 'verified', false), (pro_other, 'Assess test pro 2', 'verified', false);

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_user, 'Assess test home', '9 Test Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_user, 'Assess test flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Assess test', 'assess-test', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Assess fixed', 'assess-fixed', 'fixed', 1500, true) RETURNING id INTO v_svc_fixed;
  INSERT INTO public.services (category_id, name, slug, pricing_model, is_active)
    VALUES (v_cat, 'Assess repair', 'assess-repair', 'quote_after_inspection', true) RETURNING id INTO v_svc_qai;
  INSERT INTO public.services (category_id, name, slug, pricing_model, inspection_fee, is_active)
    VALUES (v_cat, 'Assess inspection', 'assess-inspection', 'inspection', 75, true) RETURNING id INTO v_svc_insp;

  -- Repair job R, arrived at the property and waiting to be assessed.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ASS-R', c_user, v_prop, v_svc_qai, now() + interval '3 days', 'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'arrived' FROM b RETURNING id INTO v_job_repair;

  -- Fixed-price job F, arrived. It must never be assessed.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ASS-F', c_user, v_prop, v_svc_fixed, now() + interval '4 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'arrived' FROM b RETURNING id INTO v_job_fixed;

  -- Inspection-only job I, arrived. It must never be assessed either.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ASS-I', c_user, v_prop, v_svc_insp, now() + interval '5 days', 'inspection', 75, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'arrived' FROM b RETURNING id INTO v_job_insp;

  -- Repair job R2, already in progress with an approved repair, so a later declined revision returns to work.
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ASS-R2', c_user, v_prop, v_svc_qai, now() + interval '6 days', 'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'in_progress' FROM b RETURNING id INTO v_job_repair2;
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair2, 'Original repair', pg_temp.items(800), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  ASSERT pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved')) = 'ok:true',
    'approving the original repair should work';

  -- ── A. A fixed-price or inspection-only job cannot be assessed ──────────────────────────
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_fixed, 'assessing')) = 'err:22023',
    'a fixed-price job must not enter assessment';
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_insp, 'assessing')) = 'err:22023',
    'an inspection-only job must not enter assessment';

  -- ── B. Repair job: arrived may enter assessment, but never start chargeable work directly ─
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair, 'in_progress')) = 'err:22023',
    'a repair job must not go straight from arrived to in_progress';
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair, 'assessing')) = 'ok',
    'a repair job should enter assessment from arrived';
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair;
  ASSERT v_state = 'assessing', 'job should be assessing, got ' || v_state;

  -- Assessment cannot resume work or complete without a quote.
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair, 'in_progress')) LIKE 'err:%',
    'assessing must not move straight to in_progress';
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair, 'completed')) LIKE 'err:%',
    'assessing must not move straight to completed';

  -- ── C. Only a repair quote can come out of assessment ───────────────────────────────────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Extra pipe', pg_temp.items(300), 'additional_work'));
  ASSERT v_res = 'err:22023', 'additional work must not be quoted from assessment, got ' || v_res;
  v_res := pg_temp.as_user(c_other, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Other pro', pg_temp.items(300), 'repair'));
  ASSERT v_res LIKE 'err:%', 'a stranger must not quote the job, got ' || v_res;

  -- ── D. Repair quote sent from assessment; work stays blocked until the customer approves ─
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Pipe and valve', pg_temp.items(1200), 'repair'));
  ASSERT left(v_res, 3) = 'ok:', 'repair quote from assessment should succeed, got ' || v_res;
  v_q := substring(v_res from 4)::uuid;
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair;
  ASSERT v_state = 'quote_pending', 'sending the quote should move the job to quote_pending, got ' || v_state;

  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair, 'in_progress')) LIKE 'err:%',
    'work must not resume while the repair quote is pending';

  -- ── E. Customer declines the repair: the job returns to assessment, not to work ─────────
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'declined'));
  ASSERT v_res = 'ok:true', 'declining the repair should be answerable, got ' || v_res;
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair;
  ASSERT v_state = 'assessing', 'declined repair with nothing approved should return to assessing, got ' || v_state;

  -- ── F. Approved repair: the job resumes work ──────────────────────────────────────────────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair, 'Revised repair', pg_temp.items(1000), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'approved'));
  ASSERT v_res = 'ok:true', 'approving the revised repair should work, got ' || v_res;
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair;
  ASSERT v_state = 'in_progress', 'approved repair should resume work, got ' || v_state;

  -- ── G. Declined revision on a job that already has an approved repair resumes work ────────
  v_res := pg_temp.as_user(pro, format('SELECT public.create_quote(%L, %L, %L::jsonb, %L)::text',
                                       v_job_repair2, 'Revision that is declined', pg_temp.items(5000), 'repair'));
  v_q := substring(v_res from 4)::uuid;
  v_res := pg_temp.as_user(c_user, format('SELECT public.respond_to_quote(%L, %L)::text', v_q, 'declined'));
  ASSERT v_res = 'ok:true', 'declining a revision should be answerable, got ' || v_res;
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair2;
  ASSERT v_state = 'in_progress', 'declined revision with an approved repair should resume work, got ' || v_state;

  -- ── H. Who may cancel from assessment ─────────────────────────────────────────────────────
  WITH b AS (
    INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                                 pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ASS-R3', c_user, v_prop, v_svc_qai, now() + interval '7 days', 'quote_after_inspection', NULL, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id)
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    SELECT id, c_user, v_prop, pro, 'arrived' FROM b RETURNING id INTO v_job_repair3;
  ASSERT pg_temp.as_owner(format('SELECT public.transition_job_state(%L, %L, ''a0000000-0000-4000-8000-0000000000e1'', ''{}''::jsonb)', v_job_repair3, 'assessing')) = 'ok',
    'fixture: repair job should enter assessment';
  v_res := pg_temp.as_user(pro, format('SELECT public.transition_job_state(%L, %L, %L, ''{}''::jsonb)::text', v_job_repair3, 'cancelled', pro));
  ASSERT v_res LIKE 'err:%', 'a professional must not cancel from assessment, got ' || v_res;
  v_res := pg_temp.as_user(c_other, format('SELECT public.transition_job_state(%L, %L, %L, ''{}''::jsonb)::text', v_job_repair3, 'cancelled', c_other));
  ASSERT v_res LIKE 'err:%', 'a stranger must not cancel from assessment, got ' || v_res;
  v_res := pg_temp.as_user(c_user, format('SELECT public.transition_job_state(%L, %L, %L, ''{}''::jsonb)::text', v_job_repair3, 'cancelled', c_user));
  ASSERT v_res = 'ok:true', 'the customer should be able to cancel from assessment, got ' || v_res;
  SELECT current_state INTO v_state FROM public.jobs WHERE id = v_job_repair3;
  ASSERT v_state = 'cancelled', 'job should be cancelled, got ' || v_state;

  RAISE NOTICE 'assessing_state: all checks passed';
END
$test$;

ROLLBACK;
