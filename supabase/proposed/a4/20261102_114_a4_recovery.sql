-- A4 / 114  PROFESSIONAL WITHDRAWAL, SUSPENSION RECOVERY, EXCEPTION RESOLUTION  (REVISION 2)
--                                                   *** APPLIED to azmajqztvcuwajaaldqm on 2026-11-01 via apply_migration (comments and BEGIN/COMMIT stripped). Behaviour and concurrency NOT tested. ***
-- Installed cleanly on a local PostgreSQL 18 scratch cluster, then applied live. No behaviour, RLS or concurrency test has been run.
-- Depends on: 111 (lock model, _require_read_committed), 112 (columns/kinds), 113 (_idem_begin/_idem_finish, edge guard).
--
-- Lock order (see docs/A4_DESIGN.md section 3):  L1 bookings row -> L2 jobs row -> L3 professional_profiles row -> L4 job_exceptions row.
-- INVARIANT I1: nothing that holds L3 ever waits for L1/L2/L4, and job_exceptions rows are created only while NO L3 lock is held
-- (the insert takes KEY SHARE on the job; accept holds the job row and waits for L3; an L3 holder inserting an exception was a
-- confirmed deadlock in revision 1).
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. PROFESSIONAL WITHDRAWAL  -- ONE mechanism: this dedicated RPC (NOT an extension of transition_job_state).
-- Why a dedicated RPC: transition_job_state is a generic, client-callable machine. Adding accepted->assigned there would
-- expose the edge to every caller without the cutoff, ownership and exception logic below. The edge is instead enforced by
-- the jobs_guard_recovery_edge trigger (113), which permits it only while app.a4_recovery_edge = this job's id, a value only
-- the definer RPCs in 113/114 set (transaction-local).
--
-- Contract (DB clock only; no client-supplied time):
--   state 'accepted' AND now() < bookings.scheduled_start  -> CONTROLLED WITHDRAWAL: job returns to 'assigned' without a
--        professional, booking returns to the unmatched pool, withdrawing professional excluded from re-ranking (attempt row),
--        customer informed (115). accepted_at / eta values are preserved in the event metadata, not lost.
--   state 'accepted' AND now() >= scheduled_start, OR state on_the_way / arrived / in_progress / quote_pending
--        -> NO STATE CHANGE. An open job_exceptions row (kind professional_withdrawal_request, preference 'admin') is
--        persisted and {outcome:'review_requested'} returned. Administrative review decides (reassign / cancel / refuse).
--   state assigned / cancelled / closed / completed -> STALE_STATE (40001). This is the cancellation race: whichever of
--        {withdrawal, customer cancel} takes the booking lock first wins; the loser sees the new state.
-- Payments and quotes are never read or written. (A quote can exist only from in_progress onward, which is the review path.)
CREATE OR REPLACE FUNCTION public.professional_withdraw_from_job(p_job_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_start timestamptz;
  v_now timestamptz := now();   -- transaction time; one value for the whole decision
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;                      -- unlocked read, only to find L1
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002'; END IF;
  SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = v_booking_id FOR UPDATE;   -- L1
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                           -- L2
  -- Same answer for "not yours" and "does not exist": no enumeration of other professionals' jobs.
  IF v_job.id IS NULL OR v_job.professional_id IS DISTINCT FROM v_uid OR v_job.booking_id IS DISTINCT FROM v_booking_id THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.current_state NOT IN ('accepted','on_the_way','arrived','in_progress','quote_pending') THEN
    RAISE EXCEPTION 'STALE_STATE: job is %', v_job.current_state USING ERRCODE = '40001';
  END IF;

  IF v_job.current_state = 'accepted' AND v_start IS NOT NULL AND v_now < v_start THEN
    -- ---- controlled withdrawal ----
    PERFORM set_config('app.a4_recovery_edge', p_job_id::text, true);       -- permits accepted -> assigned for THIS job only
    INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
    VALUES (v_job.booking_id, v_uid, 'withdrawn', 'professional_withdrew', btrim(p_reason));
    UPDATE public.jobs
       SET current_state = 'assigned', professional_id = NULL, accepted_at = NULL,
           eta_earliest = NULL, eta_latest = NULL, offer_expires_at = NULL, updated_at = now()
     WHERE id = p_job_id;
    PERFORM set_config('app.a4_recovery_edge', '', true);
    UPDATE public.bookings
       SET professional_id = NULL, unmatched_since = COALESCE(unmatched_since, now()), updated_at = now()
     WHERE id = v_job.booking_id;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (p_job_id, 'accepted', 'assigned', v_uid, 'professional_withdrew',
            jsonb_build_object('from_professional_id', v_uid, 'reason', btrim(p_reason),
                               'previous_accepted_at', v_job.accepted_at,
                               'previous_eta_earliest', v_job.eta_earliest, 'previous_eta_latest', v_job.eta_latest,
                               'scheduled_start', v_start));
    RETURN jsonb_build_object('outcome', 'withdrawn', 'job_id', p_job_id, 'state', 'assigned');
  END IF;

  -- ---- review path: persist, do not raise (a raise would roll the request back) ----
  -- No L3 lock is held here, so the L4 insert respects invariant I1.
  INSERT INTO public.job_exceptions (job_id, kind, preference, reported_by, professional_id, scheduled_start, detail)
  VALUES (p_job_id, 'professional_withdrawal_request', 'admin', v_uid, v_uid, v_start, btrim(p_reason))
  ON CONFLICT (job_id, kind) DO NOTHING;
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, v_job.current_state, v_uid, 'professional_withdrawal_requested',
          jsonb_build_object('professional_id', v_uid, 'reason', btrim(p_reason), 'scheduled_start', v_start,
                             'requested_at', v_now));
  RETURN jsonb_build_object('outcome', 'review_requested', 'job_id', p_job_id, 'state', v_job.current_state);
END; $$;
REVOKE ALL ON FUNCTION public.professional_withdraw_from_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professional_withdraw_from_job(uuid, text) TO authenticated, service_role;
-- service_role has auth.uid() NULL, so it can never pass the authentication check above; the grant is kept only for parity
-- with the live RPC conventions and may be dropped.

-- ---------------------------------------------------------------------------------------------
-- 2. SUSPENSION, PHASE 1: verification transition. Replaces the live admin_transition_professional_verification.
-- Phase 1 holds ONLY L3 and takes no booking/job/exception lock. After it commits the professional can receive no new offer
-- and cannot accept an existing one: _rank_professionals / _offer_next / admin_assign (113) require verification_status =
-- 'verified', the guard_job_professional_verified trigger blocks job writes naming an unverified professional, and the accept
-- guard in transition_job_state (111) re-checks 'verified' under the L3 lock.
-- Phase 1 DOES NOT release offers or create exceptions. That is phase 2 (admin_recover_suspended_professional), which is
-- retryable and runs with no L3 lock. The result reports how much recovery work is pending.
CREATE OR REPLACE FUNCTION public.admin_transition_professional_verification(
  p_professional_id uuid, p_action text, p_expected_status text, p_reason text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_role    text;
  v_current text;
  v_new     text;
  v_reason  text := btrim(COALESCE(p_reason, ''));
  v_missing text[];
  v_vid     uuid;
  v_pending_offers int := 0;
  v_active_jobs    int := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('approve','reject','suspend','reactivate') THEN
    RAISE EXCEPTION 'Unknown verification action' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT verification_status INTO v_current FROM public.professional_profiles
   WHERE user_id = p_professional_id FOR NO KEY UPDATE;                                          -- L3 (the only lock taken)
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  IF v_current IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Stale request: status is now %, expected %', v_current, COALESCE(p_expected_status, 'none')
      USING ERRCODE = '55000';
  END IF;

  IF p_action IN ('approve','reject') AND v_current IN ('pending','documents_submitted','under_review') THEN
    v_new := CASE p_action WHEN 'approve' THEN 'verified' ELSE 'rejected' END;
  ELSIF p_action = 'suspend' AND v_current = 'verified' THEN v_new := 'suspended';
  ELSIF p_action = 'reactivate' AND v_current = 'suspended' THEN v_new := 'verified';
  ELSE RAISE EXCEPTION 'Cannot % a professional whose status is %', p_action, v_current USING ERRCODE = '55000';
  END IF;

  IF v_new = 'verified' THEN
    v_missing := public._verification_missing_documents(p_professional_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Required documents missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_action = 'approve' THEN
    v_missing := public._verification_unaccepted_documents(p_professional_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Documents not accepted or file missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.verification_transition', p_professional_id::text || ':' || v_new, true);
  UPDATE public.professional_profiles
     SET verification_status = v_new,
         is_available = CASE WHEN v_new = 'verified' THEN is_available ELSE false END,
         updated_at = now()
   WHERE user_id = p_professional_id;
  PERFORM set_config('app.verification_transition', '', true);

  SELECT id INTO v_vid FROM public.professional_verifications
   WHERE professional_id = p_professional_id ORDER BY created_at DESC LIMIT 1;
  IF p_action = 'reject' THEN
    IF v_vid IS NULL THEN
      INSERT INTO public.professional_verifications (professional_id, status, reviewed_at, reviewed_by, rejection_reason)
      VALUES (p_professional_id, 'rejected', now(), v_actor, v_reason);
    ELSE
      UPDATE public.professional_verifications
         SET status = 'rejected', reviewed_at = now(), reviewed_by = v_actor, rejection_reason = v_reason, updated_at = now()
       WHERE id = v_vid;
    END IF;
  ELSIF p_action = 'approve' AND v_vid IS NOT NULL THEN
    UPDATE public.professional_verifications
       SET status = 'verified', reviewed_at = now(), reviewed_by = v_actor, updated_at = now() WHERE id = v_vid;
  END IF;

  IF p_action = 'suspend' THEN
    -- Plain reads (no row locks). Counts are informational: they tell the console whether phase 2 is needed.
    SELECT count(*) FILTER (WHERE current_state = 'assigned'),
           count(*) FILTER (WHERE current_state NOT IN ('assigned','completed','closed','cancelled'))
      INTO v_pending_offers, v_active_jobs
      FROM public.jobs WHERE professional_id = p_professional_id;
  END IF;

  INSERT INTO public.professional_verification_events
    (professional_id, from_status, to_status, action, actor_id, actor_role, reason, metadata)
  VALUES (p_professional_id, v_current, v_new, p_action, v_actor, 'admin', v_reason,
     COALESCE(p_metadata, '{}'::jsonb)
       || CASE WHEN p_action = 'suspend'
               THEN jsonb_build_object('pending_offers_at_suspension', v_pending_offers,
                                       'active_jobs_at_suspension', v_active_jobs)
               ELSE '{}'::jsonb END);

  RETURN jsonb_build_object('professional_id', p_professional_id, 'from_status', v_current, 'to_status', v_new,
    'recovery_required', (p_action = 'suspend' AND (v_pending_offers > 0 OR v_active_jobs > 0)),
    'pending_offers', v_pending_offers, 'active_jobs', v_active_jobs);
END; $$;
-- CREATE OR REPLACE keeps the live EXECUTE grants; re-verify them after any apply (they are NOT altered here).

-- ---------------------------------------------------------------------------------------------
-- 3. SUSPENSION, PHASE 2: recovery of a suspended professional's work.  Admin only. Holds NO L3 lock.
-- Effects, per call, bounded by p_limit (1..50) so no single transaction holds an unbounded set of row locks:
--   (a) pending offers (jobs.state 'assigned') are released through the live _release_offer (booking L1 -> job L2), which
--       records the attempt and returns the booking to the queue;
--   (b) every active job (accepted / on_the_way / arrived / in_progress / quote_pending) gets ONE open job_exceptions row
--       (kind professional_suspended_active_job, preference 'admin'), created in order booking L1 -> job L2 -> exception L4.
-- Active jobs are NEVER cancelled, reassigned or touched here: that is a separate audited admin decision (113 / admin_cancel_job).
-- Retry/determinism: the function is idempotent (offers already released are gone; exceptions are ON CONFLICT DO NOTHING).
-- It returns {done:false} while work remains and the caller repeats it. It raises only for authorization / wrong status.
-- Convergence: a suspended professional can receive no new offer (see phase 1), so the pending-offer set only shrinks.
-- Deadlock freedom: the batch is processed in job-id order, so two concurrent calls for the same professional acquire
-- booking/job locks in the same order; no L3 lock is taken; I1 is trivially satisfied.
-- No request_id/idempotency table: results are a progress report, not a one-shot effect, and replaying a stale report would hide work.
CREATE OR REPLACE FUNCTION public.admin_recover_suspended_professional(p_professional_id uuid, p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_status text;
  r record;
  v_job public.jobs%ROWTYPE;
  v_released int := 0;
  v_flagged int := 0;
  v_start timestamptz;
  v_left_offers int;
  v_left_active int;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 50' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  SELECT verification_status INTO v_status FROM public.professional_profiles WHERE user_id = p_professional_id;  -- no lock
  IF v_status IS NULL THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'STALE_STATE: professional is %, recovery applies to suspended professionals only', v_status
      USING ERRCODE = '40001';
  END IF;

  -- (a) pending offers
  FOR r IN SELECT j.id AS job_id FROM public.jobs j
            WHERE j.professional_id = p_professional_id AND j.current_state = 'assigned'
            ORDER BY j.id LIMIT p_limit
  LOOP
    BEGIN   -- subtransaction: a job that moved on meanwhile is skipped, and its locks are released
      PERFORM public._release_offer(r.job_id, 'withdrawn', 'professional_suspended',
                                    'Professional suspended by administrator', v_admin);
      v_released := v_released + 1;
    EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE 'P0002' THEN
      NULL;   -- no longer a pending offer of this professional; counted by the remaining-work query below
    END;
  END LOOP;

  -- (b) active jobs: exceptions only
  FOR r IN SELECT j.id AS job_id, j.booking_id FROM public.jobs j
            WHERE j.professional_id = p_professional_id
              AND j.current_state IN ('accepted','on_the_way','arrived','in_progress','quote_pending')
              AND NOT EXISTS (SELECT 1 FROM public.job_exceptions e
                               WHERE e.job_id = j.id AND e.kind = 'professional_suspended_active_job')
            ORDER BY j.id LIMIT p_limit
  LOOP
    SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = r.booking_id FOR UPDATE;   -- L1
    SELECT * INTO v_job FROM public.jobs WHERE id = r.job_id FOR UPDATE;                           -- L2
    CONTINUE WHEN v_job.professional_id IS DISTINCT FROM p_professional_id
               OR v_job.current_state NOT IN ('accepted','on_the_way','arrived','in_progress','quote_pending');
    INSERT INTO public.job_exceptions (job_id, kind, preference, reported_by, professional_id, scheduled_start, detail)
    VALUES (r.job_id, 'professional_suspended_active_job', 'admin', v_admin, p_professional_id, v_start,
            'Professional suspended while holding this job; administrator decision required')   -- L4
    ON CONFLICT (job_id, kind) DO NOTHING;
    IF FOUND THEN
      v_flagged := v_flagged + 1;
      INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
      VALUES (r.job_id, v_job.current_state, v_job.current_state, v_admin, 'suspended_active_job_flagged',
              jsonb_build_object('professional_id', p_professional_id));
    END IF;
  END LOOP;

  SELECT count(*) INTO v_left_offers FROM public.jobs
   WHERE professional_id = p_professional_id AND current_state = 'assigned';
  SELECT count(*) INTO v_left_active FROM public.jobs j
   WHERE j.professional_id = p_professional_id
     AND j.current_state IN ('accepted','on_the_way','arrived','in_progress','quote_pending')
     AND NOT EXISTS (SELECT 1 FROM public.job_exceptions e
                      WHERE e.job_id = j.id AND e.kind = 'professional_suspended_active_job');
  RETURN jsonb_build_object('professional_id', p_professional_id, 'offers_released', v_released,
    'active_jobs_flagged', v_flagged, 'offers_remaining', v_left_offers, 'active_unflagged_remaining', v_left_active,
    'done', (v_left_offers = 0 AND v_left_active = 0));
END; $$;
REVOKE ALL ON FUNCTION public.admin_recover_suspended_professional(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recover_suspended_professional(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. EXCEPTION RESOLUTION CONTRACT.  admin_resolve_exception(...).
-- Findings: confirmed | not_confirmed | inconclusive.  Resolutions: reassigned | cancelled | customer_declined | no_action.
-- This function changes NO job state and sends NO notification: reassign/cancel are performed first by their own audited
-- operations (113 / admin_cancel_job) and this call records and VERIFIES the outcome. Basis records how it was evidenced:
--   system_verified : the database itself proves the claim (checked below, mismatch raises RESOLUTION_MISMATCH)
--   admin_attested  : the claim rests on information outside the database (a phone call, the customer's refusal);
--                     requires a note of >= 20 characters and is stored as such so it can be audited later.
--
-- kind professional_no_show (customer ALLEGATION):
--   confirmed + cancelled          job.current_state = 'cancelled'; and the allegation holds (no job_events row reaching
--                                  arrived / in_progress / quote_pending / completed AND scheduled_start + 30 min <= now())
--                                  -> system_verified
--   confirmed + reassigned         job.professional_id differs from the exception's professional; same allegation check
--                                  -> system_verified
--   confirmed + customer_declined  the customer was offered recovery and refused; same allegation check -> admin_attested
--   not_confirmed + no_action      the professional did attend or the report is mistaken. Basis system_verified when an
--                                  arrival event exists, otherwise admin_attested (note >= 20). status becomes 'dismissed'.
--   inconclusive (resolution NULL) NOT A CLOSURE. Finding and note are recorded, the case STAYS OPEN, an audit event is written.
-- kind professional_suspended_active_job / professional_withdrawal_request (system- or professional-raised; the underlying
-- fact is not in dispute, so finding must be 'confirmed' or 'inconclusive'):
--   confirmed + cancelled     job is cancelled                                  -> system_verified
--   confirmed + reassigned    job.professional_id differs from the exception's  -> system_verified
--   confirmed + no_action     job is completed/closed (nothing left to act on)  -> system_verified;
--                             otherwise the administrator is letting the work continue as is -> admin_attested (note >= 20)
--   customer_declined and not_confirmed are INVALID for these kinds.
-- INCONCLUSIVE CLOSURE POLICY: there is none in this draft, deliberately. An inconclusive case remains open and visible until an
-- administrator reaches a real finding. Whether a time-boxed closure is acceptable is an owner decision (D-A4-11), not made here.
-- Duplicates: two admins racing serialize on the booking lock; the second sees status <> 'open' and gets STALE_STATE. The
-- same request_id replays the stored result (idempotency). A different request_id for a closed case also gets STALE_STATE.
CREATE OR REPLACE FUNCTION public.admin_resolve_exception(
  p_exception_id uuid, p_expected_status text, p_finding text, p_resolution text, p_note text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_exception_id, p_expected_status, p_finding, COALESCE(p_resolution, ''), p_note));
  v_replay jsonb;
  v_job_id uuid;
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_ex public.job_exceptions%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
  v_basis text;
  v_allegation_holds boolean;
  v_arrived boolean;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_finding IS NULL OR p_finding NOT IN ('confirmed','not_confirmed','inconclusive') THEN
    RAISE EXCEPTION 'Invalid finding' USING ERRCODE = '22023';
  END IF;
  IF p_finding = 'inconclusive' THEN
    IF p_resolution IS NOT NULL THEN
      RAISE EXCEPTION 'An inconclusive finding is not a resolution; p_resolution must be NULL' USING ERRCODE = '22023';
    END IF;
  ELSIF p_resolution IS NULL OR p_resolution NOT IN ('reassigned','cancelled','customer_declined','no_action') THEN
    RAISE EXCEPTION 'Invalid resolution' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'A note of 10 to 1000 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public._require_read_committed();
  v_replay := public._idem_begin(v_admin, 'resolve_exception', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT job_id INTO v_job_id FROM public.job_exceptions WHERE id = p_exception_id;   -- unlocked read, only to find L1/L2
  IF v_job_id IS NULL THEN RAISE EXCEPTION 'Exception not found' USING ERRCODE = 'P0002'; END IF;
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = v_job_id;
  PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;                        -- L1
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id FOR UPDATE;                      -- L2
  SELECT * INTO v_ex FROM public.job_exceptions WHERE id = p_exception_id FOR UPDATE;       -- L4
  IF v_ex.status <> 'open' OR v_ex.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STALE_STATE: exception is %', v_ex.status USING ERRCODE = '40001';
  END IF;

  IF p_finding = 'inconclusive' THEN
    UPDATE public.job_exceptions SET finding = 'inconclusive', detail = left(v_note, 500) WHERE id = p_exception_id;
    PERFORM public._job_code_event(v_job_id, 'exception_reviewed', v_admin, jsonb_build_object(
      'exception_id', p_exception_id, 'kind', v_ex.kind, 'finding', 'inconclusive', 'request_id', p_request_id));
    v_result := jsonb_build_object('exception_id', p_exception_id, 'outcome', 'still_open', 'replayed', false);
    PERFORM public._idem_finish(v_admin, 'resolve_exception', p_request_id, v_result);
    RETURN v_result;
  END IF;

  -- evidence from the database
  SELECT EXISTS (SELECT 1 FROM public.job_events e
                  WHERE e.job_id = v_job_id AND e.to_state IN ('arrived','in_progress','quote_pending','completed'))
    INTO v_arrived;
  v_allegation_holds := (NOT v_arrived)
    AND v_ex.scheduled_start IS NOT NULL AND v_ex.scheduled_start + interval '30 minutes' <= now();

  IF v_ex.kind = 'professional_no_show' THEN
    IF p_finding = 'confirmed' THEN
      IF p_resolution = 'no_action' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: a confirmed no-show needs a recorded outcome' USING ERRCODE = '22023';
      END IF;
      IF NOT v_allegation_holds THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: the database does not support a no-show (arrival recorded or start not yet 30 minutes past)'
          USING ERRCODE = '22023';
      END IF;
      IF p_resolution = 'cancelled' AND v_job.current_state <> 'cancelled' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: job is not cancelled' USING ERRCODE = '22023';
      END IF;
      IF p_resolution = 'reassigned' AND v_job.professional_id IS NOT DISTINCT FROM v_ex.professional_id THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: job still has the same professional' USING ERRCODE = '22023';
      END IF;
      v_basis := CASE WHEN p_resolution = 'customer_declined' THEN 'admin_attested' ELSE 'system_verified' END;
    ELSE  -- not_confirmed
      IF p_resolution <> 'no_action' THEN
        RAISE EXCEPTION 'RESOLUTION_MISMATCH: a dismissed report records no_action only' USING ERRCODE = '22023';
      END IF;
      v_basis := CASE WHEN v_arrived THEN 'system_verified' ELSE 'admin_attested' END;
    END IF;
  ELSE  -- professional_suspended_active_job | professional_withdrawal_request
    IF p_finding <> 'confirmed' OR p_resolution = 'customer_declined' THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: invalid finding/resolution for kind %', v_ex.kind USING ERRCODE = '22023';
    END IF;
    IF p_resolution = 'cancelled' AND v_job.current_state <> 'cancelled' THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: job is not cancelled' USING ERRCODE = '22023';
    END IF;
    IF p_resolution = 'reassigned' AND v_job.professional_id IS NOT DISTINCT FROM v_ex.professional_id THEN
      RAISE EXCEPTION 'RESOLUTION_MISMATCH: job still has the same professional' USING ERRCODE = '22023';
    END IF;
    v_basis := CASE WHEN p_resolution IN ('cancelled','reassigned') THEN 'system_verified'
                    WHEN v_job.current_state IN ('completed','closed') THEN 'system_verified'
                    ELSE 'admin_attested' END;
  END IF;
  IF v_basis = 'admin_attested' AND length(v_note) < 20 THEN
    RAISE EXCEPTION 'An attested resolution needs a note of at least 20 characters' USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN p_finding = 'not_confirmed' THEN 'dismissed' ELSE 'resolved' END;
  UPDATE public.job_exceptions
     SET status = v_status, finding = p_finding, resolution = p_resolution, resolution_basis = v_basis,
         resolved_by = v_admin, resolved_at = now(), resolution_note = left(v_note, 1000)
   WHERE id = p_exception_id;
  PERFORM public._job_code_event(v_job_id, 'exception_resolved', v_admin, jsonb_build_object(
    'exception_id', p_exception_id, 'kind', v_ex.kind, 'finding', p_finding, 'resolution', p_resolution,
    'basis', v_basis, 'request_id', p_request_id));

  v_result := jsonb_build_object('exception_id', p_exception_id, 'outcome', v_status, 'basis', v_basis, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'resolve_exception', p_request_id, v_result);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_resolve_exception(uuid,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_exception(uuid,text,text,text,text,uuid) TO authenticated, service_role;
COMMIT;

-- KNOWN INCOMPLETE / UNVERIFIED:
--  * Not parsed or run by PostgreSQL. All races/deadlocks here are INFERRED from documented lock semantics, not reproduced.
--  * _release_offer's behaviour on a job that is no longer 'assigned' was not re-read; the subtransaction catches 40001/P0002 only.
--  * _job_code_event's INSERT target (job_events) and whether it accepts the new event names were not re-read.
--  * job_events.event_type / job_exceptions.detail / jobs.eta_* / accepted_at column names follow the live bodies read earlier.
--  * Existing grants on admin_transition_professional_verification are unchanged by CREATE OR REPLACE.
--  * RLS on job_exceptions writes was not re-read; all A4 writes go through SECURITY DEFINER functions.
--  * Withdrawal notification to the professional on a REFUSED review request is not modelled (no kind exists).
--  * Inconclusive closure policy (D-A4-11) and no-show strikes (D-A4-9) are owner decisions, not made here.
