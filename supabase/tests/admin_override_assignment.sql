-- Admin override: admin_assign_professional. Refusals, optimistic-concurrency checks, idempotent replay and audit rows.
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_override_assignment.sql
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
    RETURN 'err:' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN 'ok:' || coalesce(r, '');
END $f$;

-- Builds the admin_assign_professional call; a NULL expected professional is passed as NULL.
CREATE FUNCTION pg_temp.assign_sql(p_booking uuid, p_pro uuid, p_state text, p_expected_pro uuid, p_reason text, p_request uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT public.admin_assign_professional(%L, %L, %L, %L, %L, %L)::text',
                p_booking, p_pro, p_state, p_expected_pro, p_reason, p_request);
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
  b_open uuid; b_held uuid; b_conflict_held uuid; b_conflict uuid; b_past uuid; b_sus uuid;
  v_res text; v_n int; v_job_id uuid;
  req_1 uuid := '00000000-0000-4000-8000-0000000000c1';
  req_2 uuid := '00000000-0000-4000-8000-0000000000c2';
  req_3 uuid := '00000000-0000-4000-8000-0000000000c3';
  req_4 uuid := '00000000-0000-4000-8000-0000000000c4';
  req_5 uuid := '00000000-0000-4000-8000-0000000000c5';
  req_6 uuid := '00000000-0000-4000-8000-0000000000c6';
BEGIN
  -- ── Fixtures (as the table owner) ──────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES
    (c_admin, 'admin-override-1@example.invalid'),
    (c_customer, 'admin-override-2@example.invalid'),
    (pro_a, 'admin-override-p1@example.invalid'),
    (pro_b, 'admin-override-p2@example.invalid'),
    (pro_sus, 'admin-override-p3@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES
    (c_admin, 'admin'), (c_customer, 'customer'), (pro_a, 'professional'), (pro_b, 'professional'), (pro_sus, 'professional')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES
    (pro_a, 'Override pro A', 'verified', true),
    (pro_b, 'Override pro B', 'verified', true),
    (pro_sus, 'Override pro suspended', 'suspended', false);

  INSERT INTO public.addresses (customer_id, label, address_line_1, city)
    VALUES (c_customer, 'Override home', '5 Override Road', 'Bengaluru') RETURNING id INTO v_addr;
  INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
    VALUES (c_customer, 'Override flat', 'apartment', v_addr) RETURNING id INTO v_prop;
  INSERT INTO public.service_categories (name, slug, availability, is_active)
    VALUES ('Override', 'override-assign', 'bookable', true) RETURNING id INTO v_cat;
  INSERT INTO public.services (category_id, name, slug, pricing_model, base_price, is_active)
    VALUES (v_cat, 'Override fixed', 'override-fixed', 'fixed', 1500, true) RETURNING id INTO v_svc;

  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0001', c_customer, v_prop, v_svc, v_t, 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_open;
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0002', c_customer, v_prop, v_svc, v_t + interval '1 day', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_held;
  -- pro_a already has an accepted job at v_t, so a second booking at v_t conflicts for pro_a.
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0003', c_customer, v_prop, v_svc, v_t + interval '2 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_conflict_held;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state)
    VALUES (b_conflict_held, c_customer, v_prop, pro_a, 'accepted');
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0004', c_customer, v_prop, v_svc, v_t + interval '2 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_conflict;
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0005', c_customer, v_prop, v_svc, now() - interval '1 day', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_past;
  INSERT INTO public.bookings (booking_reference, customer_id, property_id, service_id, scheduled_start,
                               pricing_model, quoted_or_base_amount, booking_status, urgency, intake_options)
    VALUES ('ADM-OVR-0006', c_customer, v_prop, v_svc, v_t + interval '3 days', 'fixed', 1500, 'accepted', 'flexible', '[]'::jsonb)
    RETURNING id INTO b_sus;

  -- ── 1. Authorization: only an admin can assign ────────────────────────────────────────
  v_res := pg_temp.as_user(c_customer, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, 'Customer tries an override', req_1));
  ASSERT left(v_res, 9) = 'err:42501', 'a customer must not call the admin override, got ' || v_res;
  ASSERT NOT EXISTS (SELECT 1 FROM public.jobs WHERE booking_id = b_open), 'a refused call must not create a job';

  -- ── 2. Input refusals: rejected before any row is locked or written ───────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'accepted', NULL, 'Wrong expected state', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'expected state must be none or assigned, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, 'short', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'a reason under 10 characters must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, '          ', req_1));
  ASSERT left(v_res, 9) = 'err:22023', 'a blank reason must be refused, got ' || v_res;

  -- ── 3. Booking and professional eligibility ───────────────────────────────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql('00000000-0000-4000-8000-00000000dead', pro_a, 'none', NULL, 'Unknown booking id', req_4));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%BOOKING_NOT_ASSIGNABLE%', 'an unknown booking must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_past, pro_a, 'none', NULL, 'Booking already started', req_4));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%BOOKING_NOT_ASSIGNABLE%', 'a booking whose start has passed must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_sus, pro_sus, 'none', NULL, 'Suspended professional', req_4));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%PROFESSIONAL_INELIGIBLE%', 'a suspended professional must not be assigned, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_conflict, pro_a, 'none', NULL, 'Overlaps an accepted job', req_4));
  ASSERT left(v_res, 9) = 'err:23P01' AND v_res LIKE '%SCHEDULE_CONFLICT%', 'an overlapping schedule must be refused, got ' || v_res;
  ASSERT NOT EXISTS (SELECT 1 FROM public.jobs WHERE booking_id IN (b_past, b_sus, b_conflict)),
    'refused assignments must not create jobs';

  -- ── 4. A valid manual assignment creates an offer with its audit rows ─────────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, 'Customer asked for pro A', req_1));
  ASSERT left(v_res, 3) = 'ok:', 'a valid override must succeed, got ' || v_res;
  SELECT id INTO v_job_id FROM public.jobs WHERE booking_id = b_open;
  ASSERT v_job_id IS NOT NULL, 'the override must create the job';
  ASSERT (SELECT current_state FROM public.jobs WHERE id = v_job_id) = 'assigned', 'an override creates an offer in state assigned';
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = v_job_id) = pro_a, 'the offer goes to the chosen professional';
  ASSERT (SELECT professional_id FROM public.bookings WHERE id = b_open) = pro_a, 'the booking records the chosen professional';
  ASSERT (SELECT count(*) FROM public.matching_decisions
           WHERE booking_id = b_open AND kind = 'offered' AND inputs->>'admin_id' = c_admin::text
             AND inputs->>'manual' = 'true') = 1, 'exactly one manual offer decision must record the admin';
  ASSERT (SELECT count(*) FROM public.job_events
           WHERE job_id = v_job_id AND event_type = 'admin_assign' AND actor_user_id = c_admin) = 1,
    'exactly one admin_assign event must record the admin';

  -- ── 5. Idempotent replay: same request id and inputs return the stored result ─────────
  SELECT count(*) INTO v_n FROM public.job_events WHERE job_id = v_job_id;
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, 'Customer asked for pro A', req_1));
  ASSERT v_res LIKE 'ok:%"replayed": true%', 'a replay must return the stored result flagged as replayed, got ' || v_res;
  ASSERT (SELECT count(*) FROM public.job_events WHERE job_id = v_job_id) = v_n, 'a replay must write no new audit rows';
  ASSERT (SELECT count(*) FROM public.matching_decisions WHERE booking_id = b_open AND kind = 'offered') = 1,
    'a replay must write no new decision rows';

  -- The same request id with different inputs is a client bug, refused.
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_b, 'assigned', pro_a, 'Different target, same key', req_1));
  ASSERT left(v_res, 9) = 'err:22023' AND v_res LIKE '%IDEMPOTENCY_KEY_REUSED%', 'a reused request id with new inputs must be refused, got ' || v_res;

  -- ── 6. Optimistic concurrency: a stale view is refused, nothing changes ───────────────
  -- The admin still believes the booking is unassigned.
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_b, 'none', NULL, 'Stale unassigned view', req_2));
  ASSERT left(v_res, 9) = 'err:40001' AND v_res LIKE '%STALE_STATE%', 'an unassigned view of an offered job must be stale, got ' || v_res;
  -- The admin expects pro_b to hold the offer, but it is pro_a.
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_b, 'assigned', pro_b, 'Stale professional view', req_2));
  ASSERT left(v_res, 9) = 'err:40001' AND v_res LIKE '%STALE_PROFESSIONAL%', 'a stale professional must be refused, got ' || v_res;
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = v_job_id) = pro_a, 'a refused reassignment must not move the offer';

  -- ── 7. A correct, current expectation reassigns and records the withdrawal ─────────────
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_b, 'assigned', pro_a, 'Pro A is unreachable', req_3));
  ASSERT left(v_res, 3) = 'ok:', 'a current expectation must reassign, got ' || v_res;
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = v_job_id) = pro_b, 'the offer moves to the new professional';
  ASSERT (SELECT professional_id FROM public.bookings WHERE id = b_open) = pro_b, 'the booking follows the new professional';
  ASSERT (SELECT count(*) FROM public.booking_assignment_attempts
           WHERE booking_id = b_open AND professional_id = pro_a AND outcome = 'withdrawn'
             AND reason_code = 'admin_reassigned') = 1, 'the previous professional must be recorded as withdrawn';
  ASSERT (SELECT metadata->>'from_professional_id' FROM public.job_events
           WHERE job_id = v_job_id AND metadata->>'request_id' = req_3::text) = pro_a::text,
    'the reassignment event must name the previous professional';

  -- Once a job exists, the 'none' expectation is stale again.
  v_res := pg_temp.as_user(c_admin, pg_temp.assign_sql(b_open, pro_a, 'none', NULL, 'Unassigned after the fact', req_5));
  ASSERT left(v_res, 9) = 'err:40001', 'a job that now exists must refuse the none expectation, got ' || v_res;

  -- ── 8. Offer withdrawal: the job stays, the professional is cleared, the booking returns to the pool ──
  v_res := pg_temp.as_user(c_customer, format('SELECT public.admin_withdraw_offer(%L, %L, %L, %L)::text',
                                              v_job_id, pro_b, 'Customer tries to withdraw', req_6));
  ASSERT left(v_res, 9) = 'err:42501', 'a customer must not withdraw an offer, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, format('SELECT public.admin_withdraw_offer(%L, %L, %L, %L)::text',
                                           v_job_id, pro_b, 'short', req_6));
  ASSERT left(v_res, 9) = 'err:22023', 'a withdrawal reason under 10 characters must be refused, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, format('SELECT public.admin_withdraw_offer(%L, %L, %L, %L)::text',
                                           v_job_id, pro_a, 'Stale professional on withdrawal', req_6));
  ASSERT left(v_res, 9) = 'err:40001', 'a withdrawal naming the wrong professional must be stale, got ' || v_res;
  v_res := pg_temp.as_user(c_admin, format('SELECT public.admin_withdraw_offer(%L, %L, %L, %L)::text',
                                           v_job_id, pro_b, 'Pro B did not respond in time', req_6));
  ASSERT left(v_res, 3) = 'ok:', 'a current withdrawal must succeed, got ' || v_res;
  ASSERT (SELECT current_state FROM public.jobs WHERE id = v_job_id) = 'assigned', 'withdrawal must not cancel the job';
  ASSERT (SELECT professional_id FROM public.jobs WHERE id = v_job_id) IS NULL, 'withdrawal must clear the offer';
  ASSERT (SELECT professional_id FROM public.bookings WHERE id = b_open) IS NULL, 'withdrawal must clear the booking professional';
  ASSERT (SELECT unmatched_since FROM public.bookings WHERE id = b_open) IS NOT NULL, 'the booking must return to the unmatched pool';
  ASSERT (SELECT count(*) FROM public.booking_assignment_attempts
           WHERE booking_id = b_open AND professional_id = pro_b AND reason_code = 'admin_withdrawn') = 1,
    'the withdrawn professional must be recorded for this booking';
  ASSERT (SELECT count(*) FROM public.job_events
           WHERE job_id = v_job_id AND event_type = 'admin_withdraw_offer' AND actor_user_id = c_admin) = 1,
    'exactly one withdrawal event must record the admin';

  RAISE NOTICE 'admin_override_assignment: all checks passed';
END $test$;

ROLLBACK;
