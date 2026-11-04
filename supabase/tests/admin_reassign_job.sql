-- Admin override: admin_reassign_job. Refusals, optimistic-concurrency checks, customer-consent and schedule guards,
-- idempotent replay, and the audit rows written by a successful reassignment.
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_reassign_job.sql
-- Runs in one transaction that is rolled back. A failed ASSERT stops the run.
BEGIN;

-- Runs the statement as an authenticated user and returns 'ok:<text>' or 'err:<SQLSTATE> <message>'.
CREATE FUNCTION pg_temp.as_user(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO r;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN 'ok:' || coalesce(r, '');
END $f$;

-- Builds the admin_reassign_job call; NULL arguments are passed as SQL NULL.
CREATE FUNCTION pg_temp.reassign_sql(p_job uuid, p_state text, p_expected_pro uuid, p_new_pro uuid, p_reason text, p_request uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT public.admin_reassign_job(%L, %L, %L, %L, %L, %L)::text',
                p_job, p_state, p_expected_pro, p_new_pro, p_reason, p_request);
$f$;

DO $test$
DECLARE
  c_admin uuid := '00000000-0000-4000-8000-0000000000a1';
  c_customer uuid := '00000000-0000-4000-8000-0000000000a2';
  pro_a uuid := '00000000-0000-4000-8000-0000000000a3';
  pro_b uuid := '00000000-0000-4000-8000-0000000000a4';
  pro_sus uuid := '00000000-0000-4000-8000-0000000000a5';
  v_addr uuid; v_cat uuid; v_svc uuid; v_prop uuid;
  v_t timestamptz := date_trunc('hour', now()) + interval '5 days';
  b_main uuid; b_acc uuid; b_busy uuid; b_conflict uuid; b_quoted uuid; b_past uuid;
  j_main uuid; j_acc uuid; j_busy uuid; j_conflict uuid; j_quoted uuid; j_past uuid;
  v_res text; v_n int; v_before int;
  req_1 uuid := '00000000-0000-4000-8000-0000000000c1';
  req_2 uuid := '00000000-0000-4000-8000-0000000000c2';
  req_3 uuid := '00000000-0000-4000-8000-0000000000c3';
  req_4 uuid := '00000000-0000-4000-8000-0000000000c4';
BEGIN
  -- ── Fixtures (as the table owner) ──────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_admin, 'admin-reassign-1@example.invalid'),
    (c_customer, 'admin-reassign-2@example.invalid'),
    (pro_a, 'admin-reassign-p1@example.invalid'),
    (pro_b, 'admin-reassign-p2@example.invalid'),
    (pro_sus, 'admin-reassign-p3@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES
    (c_admin, 'admin'), (c_customer, 'customer'), (pro_a, 'professional'), (pro_b, 'professional'), (pro_sus, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES
    (pro_a, 'Reassign pro A', 'verified', true),
    (pro_b, 'Reassign pro B', 'verified', true),
    (pro_sus, 'Reassign pro suspended', 'suspended', false);

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_customer, 'Reassign home', '6 Reassign Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_customer, 'Reassign flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Reassign', 'reassign-job', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Reassign fixed', 'reassign-fixed', 'fixed', 1500, true) RETURNING id INTO v_svc;

  -- Main offer: assigned to pro_a at v_t. The reassignment target is pro_b, which is free then.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0001', c_customer, v_prop, v_svc, v_t, 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_a)
    RETURNING id INTO b_main;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (b_main, c_customer, v_prop, pro_a, 'assigned') RETURNING id INTO j_main;

  -- Accepted job: pro_a has accepted it one day later; a reassignment to pro_b must clear the acceptance.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0002', c_customer, v_prop, v_svc, v_t + interval '1 day', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_a)
    RETURNING id INTO b_acc;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, accepted_at)
    VALUES (b_acc, c_customer, v_prop, pro_a, 'accepted', now()) RETURNING id INTO j_acc;

  -- pro_b already has an accepted job at v_t + 2 days, so an offer to pro_b for that slot conflicts.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0003', c_customer, v_prop, v_svc, v_t + interval '2 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_b)
    RETURNING id INTO b_busy;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, accepted_at)
    VALUES (b_busy, c_customer, v_prop, pro_b, 'accepted', now()) RETURNING id INTO j_busy;
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0004', c_customer, v_prop, v_svc, v_t + interval '2 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_a)
    RETURNING id INTO b_conflict;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (b_conflict, c_customer, v_prop, pro_a, 'assigned') RETURNING id INTO j_conflict;

  -- Job with a customer-facing quote still pending.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0005', c_customer, v_prop, v_svc, v_t + interval '3 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_a)
    RETURNING id INTO b_quoted;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (b_quoted, c_customer, v_prop, pro_a, 'assigned') RETURNING id INTO j_quoted;
  INSERT INTO public.quotes (job_id, professional_id, subtotal, total, reason, status)
    VALUES (j_quoted, pro_a, 400, 400, 'Extra washer needed', 'pending_customer');

  -- Booking whose start has already passed.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options, professional_id)
    VALUES ('RSG-0006', c_customer, v_prop, v_svc, now() - interval '1 day', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb, pro_a)
    RETURNING id INTO b_past;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (b_past, c_customer, v_prop, pro_a, 'assigned') RETURNING id INTO j_past;

  -- ── 1. Authorization: only an admin can reassign ──────────────────────────────────────
  v_res := pg_temp.as_user(c_customer, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, 'Customer tries a reassignment', req_1));
  ASSERT left(v_res, 9) = 'err:42501', 'a customer must not call the admin reassignment, got ' || v_res;
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = j_main) = pro_a, 'a refused call must not move the job';

  -- ── 2. Input refusals: rejected before any row is locked or written ───────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'in_progress', pro_a, pro_b, 'Job is not reassignable', req_1));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%STALE_STATE%', 'only assigned or accepted jobs may be reassigned, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, 'short', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'a reason under 10 characters must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, '          ', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'a blank reason must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_a, 'Same professional as before', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'reassigning to the current professional must be refused, got ' || v_res;
  ASSERT NOT EXISTS (SELECT 1 FROM public.booking_assignment_attempts WHERE booking_id = b_main),
    'refused input must not record any withdrawal';

  -- ── 3. Optimistic concurrency: a stale view is refused, nothing changes ───────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql('00000000-0000-4000-8000-00000000dead', 'assigned', pro_a, pro_b, 'Unknown job id', req_4));
  ASSERT left(v_res, 9) = 'err:P0002', 'an unknown job must be refused as not found, got ' || v_res;
  -- The admin believes the job is accepted, but it is assigned.
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'accepted', pro_a, pro_b, 'Stale state view', req_4));
  ASSERT left(v_res, 9) = 'err:40001' AND v_res LIKE '%STALE_STATE%', 'a stale state must be refused, got ' || v_res;
  -- The admin expects pro_b to hold the job, but it is pro_a.
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_b, pro_b, 'New and expected professional match', req_4));
  ASSERT left(v_res, 9) = 'err:22023', 'the new professional equal to the expected one must be refused first, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_b, pro_sus, 'Stale professional view', req_4));
  ASSERT left(v_res, 9) = 'err:40001' AND v_res LIKE '%STALE_STATE%', 'a stale professional must be refused, got ' || v_res;
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = j_main) = pro_a, 'a refused reassignment must not move the job';

  -- ── 4. Customer consent, schedule and eligibility guards ──────────────────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_quoted, 'assigned', pro_a, pro_b, 'Quote is pending the customer', req_2));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%NEEDS_CUSTOMER_CONSENT%', 'a job with a pending quote must need customer consent, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_past, 'assigned', pro_a, pro_b, 'Visit start has passed', req_2));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%NEEDS_ADMIN_REVIEW%', 'a job whose visit has started must need admin review, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_sus, 'Suspended professional', req_2));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%PROFESSIONAL_INELIGIBLE%', 'a suspended professional must not receive the job, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_conflict, 'assigned', pro_a, pro_b, 'Overlaps an accepted job', req_2));
  ASSERT left(v_res, 9) = 'err:23P01' AND v_res LIKE '%SCHEDULE_CONFLICT%', 'an overlapping schedule must be refused, got ' || v_res;
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = j_quoted) = pro_a
     AND (SELECT professional_id FROM public.jobs WHERE id = j_past) = pro_a
     AND (SELECT professional_id FROM public.jobs WHERE id = j_conflict) = pro_a,
    'refused reassignments must leave every job with its professional';
  ASSERT NOT EXISTS (SELECT 1 FROM public.booking_assignment_attempts WHERE booking_id IN (b_quoted, b_past, b_conflict, b_main)),
    'refused reassignments must record no withdrawals';

  -- ── 5. A valid reassignment moves the offer and writes its audit rows ─────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, 'Pro A is unreachable', req_1));
  ASSERT left(v_res, 3) = 'ok:', 'a current assigned offer must reassign, got ' || v_res;
  ASSERT (SELECT current_state FROM public.jobs WHERE id = j_main) = 'assigned', 'the reassigned job must stay in assigned';
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = j_main) = pro_b, 'the offer moves to the new professional';
  ASSERT (SELECT professional_id FROM public.bookings WHERE id = b_main) = pro_b, 'the booking follows the new professional';
  ASSERT (SELECT offer_expires_at FROM public.jobs WHERE id = j_main) <= v_t,
    'the new offer must expire no later than the visit start';
  ASSERT (SELECT count(*) FROM public.booking_assignment_attempts
           WHERE booking_id = b_main AND professional_id = pro_a AND outcome = 'withdrawn'
             AND reason_code = 'admin_reassigned') = 1, 'the previous professional must be recorded as withdrawn';
  ASSERT (SELECT count(*) FROM public.matching_decisions
           WHERE booking_id = b_main AND job_id = j_main AND kind = 'offered' AND professional_id = pro_b
             AND inputs->>'manual' = 'true' AND inputs->>'reassignment' = 'true'
             AND inputs->>'admin_id' = c_admin::text) = 1, 'exactly one manual reassignment decision must record the admin';
  ASSERT (SELECT count(*) FROM public.job_events
           WHERE job_id = j_main AND event_type = 'admin_reassign' AND actor_user_id = c_admin
             AND metadata->>'from_professional_id' = pro_a::text
             AND metadata->>'to_professional_id' = pro_b::text
             AND metadata->>'request_id' = req_1::text) = 1, 'exactly one reassignment event must name both professionals';

  -- ── 6. Idempotent replay: same request id and inputs return the stored result ─────────
  SELECT count(*) INTO v_before FROM public.job_events WHERE job_id = j_main;
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, 'Pro A is unreachable', req_1));
  ASSERT v_res LIKE 'ok:%"replayed": true%', 'a replay must return the stored result flagged as replayed, got ' || v_res;
  ASSERT (SELECT count(*) FROM public.job_events WHERE job_id = j_main) = v_before, 'a replay must write no new audit rows';
  ASSERT (SELECT count(*) FROM public.matching_decisions WHERE booking_id = b_main AND kind = 'offered') = 1,
    'a replay must write no new decision rows';
  ASSERT (SELECT count(*) FROM public.booking_assignment_attempts WHERE booking_id = b_main) = 1,
    'a replay must write no new withdrawal rows';
  -- The same request id with different inputs is a client bug, refused.
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_b, pro_a, 'Different target, same key', req_1));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%IDEMPOTENCY_KEY_REUSED%', 'a reused request id with new inputs must be refused, got ' || v_res;

  -- The job now belongs to pro_b, so an expectation of pro_a is stale.
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_main, 'assigned', pro_a, pro_b, 'Expects the old professional', req_3));
  ASSERT left(v_res, 9) = 'err:40001', 'a reassignment expecting the previous professional must be stale, got ' || v_res;

  -- ── 7. An accepted job reassigns too, and the acceptance is cleared ───────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.reassign_sql(j_acc, 'accepted', pro_a, pro_b, 'Pro A cannot attend', req_2));
  ASSERT left(v_res, 3) = 'ok:', 'an accepted job must reassign, got ' || v_res;
  ASSERT (SELECT current_state FROM public.jobs WHERE id = j_acc) = 'assigned', 'a reassigned accepted job must return to assigned';
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = j_acc) = pro_b, 'the accepted job moves to the new professional';
  ASSERT (SELECT accepted_at FROM public.jobs WHERE id = j_acc) IS NULL, 'the previous acceptance must be cleared';
  ASSERT (SELECT count(*) FROM public.booking_assignment_attempts
           WHERE booking_id = b_acc AND professional_id = pro_a AND outcome = 'withdrawn') = 1,
    'the previous professional on an accepted job must be recorded as withdrawn';

  RAISE NOTICE 'admin_reassign_job: all checks passed';
END $test$;

ROLLBACK;
