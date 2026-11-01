-- A4 / 113  MANUAL ASSIGNMENT, OFFER WITHDRAWAL, REASSIGNMENT  (REVISION 2)  *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- NOT parsed or tested by PostgreSQL.
-- Depends on: 111 (conflict helper, read-committed guard, L3 lock model), 112 (_require_admin, vocabulary, idempotency table).
-- No new state machine: an offer is a jobs row in 'assigned'. The only new edge is accepted -> assigned,
-- performed by admin_reassign_job (here) and professional_withdraw_from_job (114) only. Section 0 below installs a trigger that
-- REJECTS accepted -> assigned for every other writer (previously nothing on jobs forbade it).
-- Lock order everywhere: L1 booking -> L2 job -> L3 professional_profiles row (FOR NO KEY UPDATE, blocking) -> L4 job_exceptions.
-- There is no advisory lock any more. See docs/A4_DESIGN.md section 3 (invariant I1).
BEGIN;

-- Idempotency helpers. Returns the stored result for a replayed request, NULL for a new one.
CREATE OR REPLACE FUNCTION public._idem_begin(p_admin uuid, p_op text, p_request uuid, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_n int; v_hash text; v_result jsonb;
BEGIN
  INSERT INTO public.admin_operation_requests (admin_id, operation, request_id, request_hash)
  VALUES (p_admin, p_op, p_request, p_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 1 THEN RETURN NULL; END IF;
  -- A concurrent first call holds the PK until it commits; by here its row is committed.
  SELECT request_hash, result INTO v_hash, v_result FROM public.admin_operation_requests
   WHERE admin_id = p_admin AND operation = p_op AND request_id = p_request;
  IF v_hash <> p_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: request id reused with different inputs' USING ERRCODE = '22023';
  END IF;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS' USING ERRCODE = '55P03';
  END IF;
  RETURN v_result || jsonb_build_object('replayed', true);
END; $$;

CREATE OR REPLACE FUNCTION public._idem_finish(p_admin uuid, p_op text, p_request uuid, p_result jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  UPDATE public.admin_operation_requests SET result = p_result
   WHERE admin_id = p_admin AND operation = p_op AND request_id = p_request;
$$;
REVOKE ALL ON FUNCTION public._idem_begin(uuid,text,uuid,text), public._idem_finish(uuid,text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._idem_begin(uuid,text,uuid,text), public._idem_finish(uuid,text,uuid,jsonb) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 0. EDGE GUARD: accepted -> assigned is a controlled edge.
-- transition_job_state (the generic machine) has no such edge, but any other writer with table access (a definer function
-- added later, service_role, a console typo) could do it. This trigger allows it only inside a definer RPC that has set the
-- transaction-local GUC app.a4_recovery_edge to this job's id (admin_reassign_job here, professional_withdraw_from_job in 114).
-- The GUC is a defence-in-depth marker, NOT an authorization: callers of those RPCs are authorized by the RPCs themselves.
-- A client cannot set it: PostgREST/RPC callers cannot run SET on a custom GUC (they only call exposed functions), and
-- set_config with is_local=true dies at transaction end. (Theoretical risk: a role allowed to run arbitrary SQL can set it.
-- Such a role can also disable the trigger, so the guard is aimed at mistakes and unexpected code paths, not at DB superusers.)
CREATE OR REPLACE FUNCTION public.jobs_guard_recovery_edge() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF OLD.current_state = 'accepted' AND NEW.current_state = 'assigned'
     AND current_setting('app.a4_recovery_edge', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'EDGE_NOT_PERMITTED: accepted -> assigned is only allowed through the recovery RPCs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.jobs_guard_recovery_edge() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER jobs_guard_recovery_edge BEFORE UPDATE OF current_state ON public.jobs
  FOR EACH ROW WHEN (OLD.current_state = 'accepted' AND NEW.current_state = 'assigned')
  EXECUTE FUNCTION public.jobs_guard_recovery_edge();

-- ---------------------------------------------------------------------------------------------
-- 1. MANUAL ASSIGNMENT
-- Actor: admin. Allowed: booking has no job (p_expected_state='none') or a pending-offer job
-- (p_expected_state='assigned'). Never touches accepted or later jobs (use admin_reassign_job).
-- Creates an OFFER, not an acceptance: the professional must still accept (and the accept recheck applies).
-- Failure codes (message prefix): STALE_STATE, STALE_PROFESSIONAL, BOOKING_NOT_ASSIGNABLE,
-- PROFESSIONAL_INELIGIBLE, SCHEDULE_CONFLICT.
CREATE OR REPLACE FUNCTION public.admin_assign_professional(
  p_booking_id uuid, p_professional_id uuid, p_expected_state text,
  p_expected_professional_id uuid, p_reason text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_booking_id, p_professional_id, p_expected_state,
                               COALESCE(p_expected_professional_id::text, '-'), p_reason));
  v_replay jsonb;
  v_booking public.bookings%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_decision uuid;
  v_result jsonb;
  v_window interval := make_interval(mins => COALESCE(public._matching_setting('offer_window_minutes'), 30)::int);
BEGIN
  IF p_expected_state NOT IN ('none', 'assigned') THEN
    RAISE EXCEPTION 'STALE_STATE: expected state must be none or assigned' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  v_replay := public._idem_begin(v_admin, 'assign', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;           -- 1. booking
  IF NOT FOUND OR v_booking.booking_status = 'cancelled' OR v_booking.scheduled_start <= now() THEN
    RAISE EXCEPTION 'BOOKING_NOT_ASSIGNABLE' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;           -- 2. job
  IF FOUND THEN
    IF p_expected_state <> 'assigned' OR v_job.current_state <> 'assigned' THEN
      RAISE EXCEPTION 'STALE_STATE: job is in state %', v_job.current_state USING ERRCODE = '40001';
    END IF;
    IF v_job.professional_id IS DISTINCT FROM p_expected_professional_id THEN
      RAISE EXCEPTION 'STALE_PROFESSIONAL' USING ERRCODE = '40001';
    END IF;
  ELSIF p_expected_state <> 'none' THEN
    RAISE EXCEPTION 'STALE_STATE: job does not exist' USING ERRCODE = '40001';
  END IF;

  -- L3: blocking NO KEY UPDATE on the professional row serializes every schedule decision for this professional (accept in
  -- 111, other assignments). We already hold the booking (L1) and job (L2), so by invariant I1 this wait cannot be part of
  -- a cycle. Eligibility is re-read under the lock; a concurrent suspension commits first or we see 'suspended'.
  PERFORM 1 FROM public.professional_profiles pp
   WHERE pp.user_id = p_professional_id AND pp.verification_status = 'verified'
     AND COALESCE(pp.is_available, true) FOR NO KEY UPDATE;                                  -- 3. L3
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFESSIONAL_INELIGIBLE' USING ERRCODE = '22023'; END IF;
  IF public._professional_conflicts(p_professional_id, p_booking_id, false) THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF v_job.id IS NOT NULL AND v_job.professional_id IS NOT NULL THEN
    INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
    VALUES (p_booking_id, v_job.professional_id, 'withdrawn', 'admin_reassigned', left(p_reason, 500));
  END IF;

  INSERT INTO public.matching_decisions (booking_id, job_id, professional_id, kind, pool_size, inputs)
  VALUES (p_booking_id, v_job.id, p_professional_id, 'offered', 1,
          jsonb_build_object('manual', true, 'admin_id', v_admin, 'reason', left(p_reason, 500)))
  RETURNING id INTO v_decision;

  IF v_job.id IS NOT NULL THEN
    UPDATE public.jobs SET professional_id = p_professional_id,
           offer_expires_at = LEAST(now() + v_window, v_booking.scheduled_start), updated_at = now()
     WHERE id = v_job.id;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (v_job.id, 'assigned', 'assigned', v_admin, 'admin_assign',
            jsonb_build_object('from_professional_id', v_job.professional_id,
                               'to_professional_id', p_professional_id, 'reason', p_reason, 'request_id', p_request_id));
  ELSE
    INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, offer_expires_at)
    VALUES (p_booking_id, v_booking.customer_id, v_booking.property_id, p_professional_id,
            'assigned', LEAST(now() + v_window, v_booking.scheduled_start))
    RETURNING * INTO v_job;
    UPDATE public.matching_decisions SET job_id = v_job.id WHERE id = v_decision;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (v_job.id, 'none', 'assigned', v_admin, 'admin_assign',
            jsonb_build_object('to_professional_id', p_professional_id, 'reason', p_reason, 'request_id', p_request_id));
  END IF;
  UPDATE public.bookings SET professional_id = p_professional_id, unmatched_since = NULL, updated_at = now()
   WHERE id = p_booking_id;

  v_result := jsonb_build_object('job_id', v_job.id, 'professional_id', p_professional_id, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'assign', p_request_id, v_result);
  RETURN v_result;
END; $$;

-- ---------------------------------------------------------------------------------------------
-- 2. OFFER WITHDRAWAL
-- Actor: admin. Allowed: job 'assigned' with professional = expected. Does NOT cancel the job or booking;
-- the booking returns to the unmatched pool. The withdrawn professional is excluded from re-ranking
-- for this booking (the ranker excludes anyone with an attempt row).
CREATE OR REPLACE FUNCTION public.admin_withdraw_offer(
  p_job_id uuid, p_expected_professional_id uuid, p_reason text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_job_id, p_expected_professional_id, p_reason));
  v_replay jsonb;
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  v_replay := public._idem_begin(v_admin, 'withdraw_offer', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;                         -- 1. booking
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                       -- 2. job
  IF v_job.current_state <> 'assigned' OR v_job.professional_id IS DISTINCT FROM p_expected_professional_id THEN
    RAISE EXCEPTION 'STALE_STATE: job is % with a different professional', v_job.current_state USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
  VALUES (v_job.booking_id, v_job.professional_id, 'withdrawn', 'admin_withdrawn', left(p_reason, 500));
  UPDATE public.jobs SET professional_id = NULL, offer_expires_at = NULL, updated_at = now() WHERE id = p_job_id;
  UPDATE public.bookings SET professional_id = NULL, unmatched_since = COALESCE(unmatched_since, now()), updated_at = now()
   WHERE id = v_job.booking_id;
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, 'assigned', 'assigned', v_admin, 'admin_withdraw_offer',
          jsonb_build_object('from_professional_id', v_job.professional_id, 'reason', p_reason, 'request_id', p_request_id));

  v_result := jsonb_build_object('job_id', p_job_id, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'withdraw_offer', p_request_id, v_result);
  RETURN v_result;
END; $$;

-- ---------------------------------------------------------------------------------------------
-- 3. REASSIGNMENT
-- Actor: admin. Allowed: 'assigned' or 'accepted', and now() < scheduled_start. Edges: assigned -> assigned (new offer),
-- accepted -> assigned (the one new edge; the new professional receives an OFFER and must accept).
-- Time check uses the DB clock (now()) against the locked booking row; 111's trigger forbids rescheduling a live job,
-- so scheduled_start cannot change between this check and the commit.
-- Refuses NEEDS_CUSTOMER_CONSENT if the job has a quote that is not closed out (a quote is the professional's
-- price; it does not transfer). Payments are not read or written, so they are preserved by construction.
-- ASSUMPTION (unverified): quotes.status values other than 'pending_customer' are not enumerated by any check
-- constraint; 'declined' and 'expired' are treated as closed here. Confirm the vocabulary before applying.
CREATE OR REPLACE FUNCTION public.admin_reassign_job(
  p_job_id uuid, p_expected_state text, p_expected_professional_id uuid,
  p_new_professional_id uuid, p_reason text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_job_id, p_expected_state, p_expected_professional_id, p_new_professional_id, p_reason));
  v_replay jsonb;
  v_booking public.bookings%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_result jsonb;
  v_window interval := make_interval(mins => COALESCE(public._matching_setting('offer_window_minutes'), 30)::int);
BEGIN
  IF p_expected_state NOT IN ('assigned', 'accepted') THEN
    RAISE EXCEPTION 'STALE_STATE: only assigned or accepted jobs can be reassigned' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_new_professional_id = p_expected_professional_id THEN
    RAISE EXCEPTION 'The new professional is already assigned' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  v_replay := public._idem_begin(v_admin, 'reassign', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT b.* INTO v_booking FROM public.bookings b JOIN public.jobs j ON j.booking_id = b.id
   WHERE j.id = p_job_id FOR UPDATE OF b;                                                    -- 1. booking
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                       -- 2. job
  IF v_job.current_state <> p_expected_state OR v_job.professional_id IS DISTINCT FROM p_expected_professional_id THEN
    RAISE EXCEPTION 'STALE_STATE: job is % ', v_job.current_state USING ERRCODE = '40001';
  END IF;
  IF v_booking.scheduled_start <= now() THEN
    RAISE EXCEPTION 'NEEDS_ADMIN_REVIEW: the visit start has passed' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status NOT IN ('declined', 'expired')) THEN
    RAISE EXCEPTION 'NEEDS_CUSTOMER_CONSENT: a quote exists on this job' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.professional_profiles pp                                             -- 3. L3, new professional
   WHERE pp.user_id = p_new_professional_id AND pp.verification_status = 'verified'
     AND COALESCE(pp.is_available, true) FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFESSIONAL_INELIGIBLE' USING ERRCODE = '22023'; END IF;
  IF public._professional_conflicts(p_new_professional_id, v_job.booking_id, false) THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF v_job.professional_id IS NOT NULL THEN
    INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
    VALUES (v_job.booking_id, v_job.professional_id, 'withdrawn', 'admin_reassigned', left(p_reason, 500));
  END IF;
  INSERT INTO public.matching_decisions (booking_id, job_id, professional_id, kind, pool_size, inputs)
  VALUES (v_job.booking_id, p_job_id, p_new_professional_id, 'offered', 1,
          jsonb_build_object('manual', true, 'reassignment', true, 'admin_id', v_admin, 'reason', left(p_reason, 500)));

  PERFORM set_config('app.a4_recovery_edge', p_job_id::text, true);   -- permits accepted -> assigned for THIS job (section 0)
  UPDATE public.jobs
     SET current_state = 'assigned', professional_id = p_new_professional_id,
         accepted_at = NULL, eta_earliest = NULL, eta_latest = NULL,
         offer_expires_at = LEAST(now() + v_window, v_booking.scheduled_start), updated_at = now()
   WHERE id = p_job_id;
  PERFORM set_config('app.a4_recovery_edge', '', true);
  UPDATE public.bookings SET professional_id = p_new_professional_id, updated_at = now() WHERE id = v_job.booking_id;
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, 'assigned', v_admin, 'admin_reassign',
          jsonb_build_object('from_professional_id', v_job.professional_id,
                             'to_professional_id', p_new_professional_id, 'reason', p_reason, 'request_id', p_request_id));

  v_result := jsonb_build_object('job_id', p_job_id, 'professional_id', p_new_professional_id, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'reassign', p_request_id, v_result);
  RETURN v_result;
END; $$;

-- Privilege: callable by signed-in users, but _require_admin() refuses everyone who is not an admin.
REVOKE ALL ON FUNCTION public.admin_assign_professional(uuid,uuid,text,uuid,text,uuid),
  public.admin_withdraw_offer(uuid,uuid,text,uuid),
  public.admin_reassign_job(uuid,text,uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_professional(uuid,uuid,text,uuid,text,uuid),
  public.admin_withdraw_offer(uuid,uuid,text,uuid),
  public.admin_reassign_job(uuid,text,uuid,uuid,text,uuid) TO authenticated, service_role;
COMMIT;

-- KNOWN INCOMPLETE / UNVERIFIED:
--  * bookings.booking_status values 'cancelled' verified live; 'confirmed'/'pending' semantics for assignability not decided.
--  * eta_earliest / eta_latest column names inferred from jobs_eta_window_check; confirm against information_schema.
--  * A rolled-back idempotency insert is rolled back with the rest of the transaction, so a failed request can be retried
--    with the same request id; a committed one replays its stored result.
--  * Unmatched queue pickup after withdrawal depends on process_assignment_queue behaviour that was not re-read.
--  * Not parsed or run by PostgreSQL. The L3 wait-cycle argument is inferred from lock semantics (docs/A4_DESIGN.md section 3).
--  * jobs_guard_recovery_edge: existing jobs triggers (guard_job_professional_verified, updated_at) were read earlier; trigger
--    firing ORDER among BEFORE UPDATE triggers is alphabetical by name and is irrelevant here (this one only raises).
--  * Idempotency helpers keep their live-style grants (service_role only).
