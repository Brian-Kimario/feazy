-- A4 / 111  SCHEDULING INTEGRITY (P0)   -- REVISION 2 after SQL review    *** APPLIED to azmajqztvcuwajaaldqm on 2026-11-01 via apply_migration (comments and BEGIN/COMMIT stripped). Behaviour and concurrency NOT tested. ***
-- Outside supabase/migrations/ on purpose. Based on live definitions read 2026-11-01.
-- Installed cleanly on a local PostgreSQL 18 scratch cluster, then applied live. No behaviour, RLS or concurrency test has been run.
-- Depends on: nothing in this package.
--
-- Defect (confirmed from live bodies): _rank_professionals filters out professionals with another active job within
-- +/-2h of the booking, but the filter is lock-free, and transition_job_state(...,'accepted') never rechecks.
-- A professional holding two overlapping offers can accept both.
--
-- REVISION 2 design (replaces the advisory-lock design; see docs/A4_DESIGN.md section 4):
--   * ONE serializer per professional: a row lock on professional_profiles taken FOR NO KEY UPDATE.
--     No advisory locks. The previous draft took advisory-then-row in the matcher and row-then-advisory in accept
--     (opposite orders). That whole class is removed.
--   * Canonical order, with no exceptions anywhere in the A4 package:
--         L1 bookings row  ->  L2 jobs row  ->  L3 professional_profiles row  ->  L4 job_exceptions row
--     Accept now takes L1 (it previously skipped it). The matcher takes L3 with SKIP LOCKED (it never waits there).
--   * INVARIANT I1: every transaction that WAITS for an L3 lock already holds the L1 lock of the booking whose job it
--     holds. Nobody holding L3 ever waits for L1/L2 (job_exceptions rows, which need a job KEY SHARE, are created only
--     while no L3 lock is held: see 114).
--   * bookings.scheduled_start becomes immutable while a live job exists (trigger below), enforced in the database.
--   * One IMMUTABLE state-set helper, used by every conflict check, so a new state cannot silently bypass protection.
BEGIN;

-- ---------------------------------------------------------------------------------------------------------------
-- Single source of truth for "which job states occupy a professional's calendar".
-- p_committed_only = true : states a professional has accepted (an unaccepted offer is not a commitment).
-- p_committed_only = false: also 'assigned' (a pending offer reserves the slot so offers do not stack).
-- A new job state MUST be added here; src/__tests__/a4-draft-package.test.ts fails if the state machine in
-- transition_job_state contains a non-terminal state that is missing from this function.
CREATE OR REPLACE FUNCTION public._schedule_active_states(p_committed_only boolean)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN p_committed_only
              THEN ARRAY['accepted','on_the_way','arrived','in_progress','quote_pending']
              ELSE ARRAY['assigned','accepted','on_the_way','arrived','in_progress','quote_pending'] END;
$$;

-- SECURITY INVOKER on purpose: only called from the SECURITY DEFINER functions below, which run as the owner.
-- No end-user role can execute it (REVOKE below), so it adds no privileged entry point.
CREATE OR REPLACE FUNCTION public._professional_conflicts(p_pro uuid, p_booking_id uuid, p_committed_only boolean)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.bookings jb ON jb.id = j.booking_id
    JOIN public.bookings tb ON tb.id = p_booking_id
    WHERE j.professional_id = p_pro
      AND j.booking_id <> p_booking_id
      AND j.current_state = ANY (public._schedule_active_states(p_committed_only))
      AND jb.scheduled_start BETWEEN tb.scheduled_start - interval '2 hours'
                                 AND tb.scheduled_start + interval '2 hours'
  );
$$;

-- The conflict check is only correct if it sees rows committed by the transaction that held the lock before us.
-- Under READ COMMITTED each statement gets a fresh snapshot after the lock wait. Under REPEATABLE READ/SERIALIZABLE
-- the snapshot predates the wait and the check could miss a just-committed accept, so refuse to run there.
CREATE OR REPLACE FUNCTION public._require_read_committed()
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'READ_COMMITTED_REQUIRED: scheduling checks need READ COMMITTED' USING ERRCODE = '25000';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public._schedule_active_states(boolean), public._professional_conflicts(uuid, uuid, boolean),
  public._require_read_committed() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- DATABASE GUARD against rescheduling a booking that already has a live job.
-- Confirmed read-only 2026-11-01: no function in public, no application path in src/, and no RLS policy (bookings has
-- only a SELECT policy) can change bookings.scheduled_start; only service_role / the table owner could. The FAQ text
-- promises rescheduling, but nothing implements it. So the guard costs nothing today and makes the assumption a
-- database fact instead of a frontend convention.
-- A future reschedule feature must: lock booking (L1) -> job (L2), withdraw any offer via _release_offer-style path,
-- then change the time. It must not edit scheduled_start while a job is assigned/accepted/in flight.
-- The BEFORE UPDATE trigger runs after the UPDATE has row-locked the booking (L1), so it serialises with accept
-- (which also takes L1 first): accept sees either the old time with the job intact, or is blocked until commit.
CREATE OR REPLACE FUNCTION public._guard_booking_schedule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start
     AND EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.booking_id = OLD.id
                    AND j.current_state NOT IN ('cancelled','closed','completed')) THEN
    RAISE EXCEPTION 'RESCHEDULE_BLOCKED: booking % has a live job; withdraw the assignment first', OLD.id
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._guard_booking_schedule_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bookings_guard_schedule_change ON public.bookings;
CREATE TRIGGER bookings_guard_schedule_change
  BEFORE UPDATE OF scheduled_start ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public._guard_booking_schedule_change();

-- ---------------------------------------------------------------------------------------------------------------
-- _offer_next: identical to the live body except the candidate loop (marked CHANGED).
-- Callers (live, read 2026-11-01): _assign_booking_internal (locks booking, then calls), _release_offer (booking -> job,
-- then calls; used by decline_job, process_assignment_queue, admin_transition_professional_verification),
-- process_assignment_queue (booking FOR UPDATE SKIP LOCKED). All hold L1 on entry; this function re-takes L1/L2
-- (re-entrant) and only then touches L3.
-- MATCHER ITERATION: the loop locks candidates one at a time with SKIP LOCKED, so it never waits on L3. A candidate
-- rejected after its lock was taken (conflict) keeps that lock until the transaction ends; this holds L3 locks without
-- waiting, so it cannot take part in a wait cycle. The cost is that an accept for that candidate waits for this short
-- transaction. process_assignment_queue may call this for several bookings in ONE transaction, so L3 locks from earlier
-- iterations can be held while L2 of a later booking is awaited; this is safe by invariant I1 (any holder of that job
-- row that waits for an L3 lock also holds the booking row, which the queue holds via SKIP LOCKED).
CREATE OR REPLACE FUNCTION public._offer_next(p_booking_id uuid, p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_pick record;
  v_cand record;
  v_decision uuid;
  v_found boolean := false;
  v_busy int := 0;
  v_window interval := make_interval(mins => COALESCE(public._matching_setting('offer_window_minutes'), 30)::int);
BEGIN
  PERFORM public._require_read_committed();
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;      -- L1
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;      -- L2
  IF FOUND AND v_job.current_state <> 'assigned' THEN
    RAISE EXCEPTION 'Booking % already has a job in state %', p_booking_id, v_job.current_state;
  END IF;

  IF v_booking.scheduled_start > now() THEN
    -- CHANGED: walk the ranked pool; take the first candidate that (a) we can row-lock without waiting (L3),
    -- (b) is still verified and available under that lock, and (c) has no conflicting job under that lock.
    FOR v_cand IN
      SELECT r.*, count(*) OVER () AS pool_size FROM public._rank_professionals(p_booking_id) r
    LOOP
      PERFORM 1 FROM public.professional_profiles pp                                    -- L3, SKIP LOCKED
       WHERE pp.user_id = v_cand.professional_id AND pp.verification_status = 'verified'
         AND COALESCE(pp.is_available, true)
       FOR NO KEY UPDATE SKIP LOCKED;
      IF NOT FOUND THEN
        v_busy := v_busy + 1;      -- locked by another transaction OR no longer verified/available: skip, never wait
        CONTINUE;
      END IF;
      CONTINUE WHEN public._professional_conflicts(v_cand.professional_id, p_booking_id, false);
      v_pick := v_cand;
      v_found := true;
      EXIT;
    END LOOP;
  END IF;

  IF NOT v_found THEN
    -- A candidate skipped only because its row was momentarily locked is retried by the queue (booking stays unmatched).
    IF v_booking.unmatched_since IS NULL THEN
      INSERT INTO public.matching_decisions (booking_id, job_id, kind, pool_size, inputs)
      VALUES (p_booking_id, v_job.id, 'unmatched', 0,
              jsonb_build_object('reason', CASE WHEN v_booking.scheduled_start > now()
                                                   THEN 'no eligible professional'
                                                   ELSE 'start time passed' END,
                                 'candidates_skipped_busy_or_ineligible', v_busy));
    END IF;
    IF v_job.id IS NOT NULL AND v_job.professional_id IS NOT NULL THEN
      UPDATE public.jobs SET professional_id = NULL, offer_expires_at = NULL, updated_at = now()
      WHERE id = v_job.id;
      INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
      VALUES (v_job.id, 'assigned', 'assigned', p_actor, 'unmatched',
              jsonb_build_object('from_professional_id', v_job.professional_id));
    END IF;
    UPDATE public.bookings
    SET professional_id = NULL, unmatched_since = COALESCE(unmatched_since, now()), updated_at = now()
    WHERE id = p_booking_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.matching_decisions
    (booking_id, job_id, professional_id, kind, pool_size, score, geo_basis, distance_km, inputs)
  VALUES
    (p_booking_id, v_job.id, v_pick.professional_id, 'offered', v_pick.pool_size, v_pick.score,
     v_pick.geo_basis, v_pick.distance_km, v_pick.inputs)
  RETURNING id INTO v_decision;

  IF v_job.id IS NOT NULL THEN
    UPDATE public.jobs
    SET professional_id = v_pick.professional_id,
        offer_expires_at = LEAST(now() + v_window, v_booking.scheduled_start), updated_at = now()
    WHERE id = v_job.id;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (v_job.id, 'assigned', 'assigned', p_actor, 'reassigned',
            jsonb_build_object('from_professional_id', v_job.professional_id,
                               'to_professional_id', v_pick.professional_id));
  ELSE
    INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, offer_expires_at)
    VALUES (p_booking_id, v_booking.customer_id, v_booking.property_id, v_pick.professional_id,
            'assigned', LEAST(now() + v_window, v_booking.scheduled_start))
    RETURNING * INTO v_job;
    UPDATE public.matching_decisions SET job_id = v_job.id WHERE id = v_decision;
    INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
    VALUES (v_job.id, 'none', 'assigned', p_actor, 'assigned',
            jsonb_build_object('professional_id', v_pick.professional_id));
  END IF;

  UPDATE public.bookings
  SET professional_id = v_pick.professional_id, unmatched_since = NULL, updated_at = now()
  WHERE id = p_booking_id;

  RETURN v_pick.professional_id;
END;
$$;

-- transition_job_state: identical to the live body except (1) the L1 booking lock taken for 'accepted' only, and
-- (2) block ACCEPT-GUARD replacing the unlocked verification read. Everything else is copied verbatim so the single state
-- machine is unchanged. Internal callers (verified from live bodies): admin_cancel_job ('cancelled'), admin_reconcile_job
-- ('cancelled'), customer_cancel_booking ('cancelled'), create_quote ('quote_pending'), respond_to_quote ('in_progress'),
-- transition_payment_status ('closed'). NONE passes 'accepted', so the extra L1 lock is only ever requested by a direct
-- professional RPC call that holds no other lock yet: no caller can reach it while holding L2.
CREATE OR REPLACE FUNCTION public.transition_job_state(
  p_job_id uuid, p_new_state text, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_caller uuid := auth.uid();
  v_status text;
  v_valid boolean := false;
  v_allowed boolean;
  v_booking_id uuid;
  v_pre_pro uuid;
BEGIN
  IF p_new_state = 'accepted' THEN
    -- CHANGED: L1 before L2. booking_id never changes for a job, so the unlocked read is safe; the job is re-read
    -- under its own lock below and every decision uses that locked copy.
    PERFORM public._require_read_committed();
    SELECT booking_id, professional_id INTO v_booking_id, v_pre_pro FROM public.jobs WHERE id = p_job_id;
    IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
    -- Cheap ownership pre-check so a non-owner cannot make us queue on the booking lock (re-checked under the lock).
    IF v_caller IS NOT NULL AND v_pre_pro IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not allowed to change this job';
    END IF;
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;                  -- L1
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                  -- L2
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;

  IF v_caller IS NOT NULL THEN
    IF p_actor_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Actor does not match the signed-in user';
    END IF;
    v_allowed :=
      (v_job.professional_id IS NOT NULL AND v_caller = v_job.professional_id)
      OR (v_caller = v_job.customer_id
          AND ((p_new_state = 'cancelled'
                AND v_job.current_state IN ('quote_pending', 'assigned', 'accepted', 'on_the_way', 'arrived'))
               OR (p_new_state = 'in_progress' AND v_job.current_state = 'quote_pending')))
      OR (p_new_state = 'cancelled'
          AND COALESCE(current_setting('app.admin_cancel_job', true), '') = p_job_id::text
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'admin'));
    IF NOT COALESCE(v_allowed, false) THEN RAISE EXCEPTION 'Not allowed to change this job'; END IF;
  END IF;

  -- ACCEPT-GUARD (CHANGED) -------------------------------------------------------------------
  IF p_new_state = 'accepted' THEN
    IF v_job.professional_id IS NULL THEN
      RAISE EXCEPTION 'Professional not found';
    END IF;
    -- L3, blocking. Everything that can create or accept an assignment for this professional takes this same lock,
    -- so after the wait the committed-only conflict query below observes every earlier accept (READ COMMITTED).
    SELECT verification_status INTO v_status
    FROM public.professional_profiles WHERE user_id = v_job.professional_id FOR NO KEY UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Professional not found'; END IF;
    IF v_status <> 'verified' THEN
      RAISE EXCEPTION 'Professional must be verified to accept jobs. Current status: %', v_status;
    END IF;
    IF public._professional_conflicts(v_job.professional_id, v_job.booking_id, true) THEN
      RAISE EXCEPTION 'SCHEDULE_CONFLICT: you already have a job within two hours of this visit'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  -- ------------------------------------------------------------------------------------------

  IF p_new_state = 'quote_pending'
     AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'A job can only wait on a quote that has been sent' USING ERRCODE = '22023';
  END IF;
  IF v_job.current_state = 'quote_pending' AND p_new_state = 'in_progress'
     AND EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'The customer has not answered the quote yet' USING ERRCODE = '22023';
  END IF;

  IF (v_job.current_state = 'assigned' AND p_new_state IN ('accepted', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'accepted' AND p_new_state IN ('on_the_way', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'on_the_way' AND p_new_state IN ('arrived', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'arrived' AND p_new_state IN ('in_progress', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'in_progress' AND p_new_state IN ('quote_pending', 'completed', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'quote_pending' AND p_new_state IN ('in_progress', 'cancelled')) THEN v_valid := true;
  ELSIF (v_job.current_state = 'completed' AND p_new_state = 'closed') THEN v_valid := true;
  ELSIF (v_job.current_state = 'cancelled' AND p_new_state = 'closed') THEN v_valid := true;
  END IF;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', v_job.current_state, p_new_state;
  END IF;

  IF v_caller IS NOT NULL THEN
    IF v_job.current_state = 'arrived' AND p_new_state = 'in_progress'
       AND NOT EXISTS (SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'start' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the start code from the customer before starting work' USING ERRCODE = '22023';
    END IF;
    IF v_job.current_state = 'in_progress' AND p_new_state = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'finish' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the finish code from the customer before completing the job' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.jobs
  SET current_state = p_new_state, updated_at = now(),
      accepted_at = CASE WHEN p_new_state = 'accepted' THEN now() ELSE accepted_at END,
      on_the_way_at = CASE WHEN p_new_state = 'on_the_way' THEN now() ELSE on_the_way_at END,
      arrived_at = CASE WHEN p_new_state = 'arrived' THEN now() ELSE arrived_at END,
      started_at = CASE WHEN p_new_state = 'in_progress' THEN now() ELSE started_at END,
      completed_at = CASE WHEN p_new_state = 'completed' THEN now() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_state = 'cancelled' THEN now() ELSE cancelled_at END,
      closed_at = CASE WHEN p_new_state IN ('completed', 'cancelled') THEN now() ELSE closed_at END
  WHERE id = p_job_id;

  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, v_job.current_state, p_new_state, p_actor_user_id,
          COALESCE(p_metadata->>'event_type', 'state_transition'), p_metadata);

  IF p_new_state = 'on_the_way' THEN
    PERFORM public._issue_job_code(p_job_id, 'start', p_actor_user_id, false);
  ELSIF p_new_state = 'in_progress' AND NOT EXISTS (
          SELECT 1 FROM public.job_codes WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used')) THEN
    PERFORM public._issue_job_code(p_job_id, 'finish', p_actor_user_id, false);
  ELSIF p_new_state = 'quote_pending' THEN
    UPDATE public.job_codes SET status = 'invalidated'
    WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used');
  ELSIF p_new_state IN ('cancelled', 'completed', 'closed') THEN
    UPDATE public.job_codes SET status = 'invalidated' WHERE job_id = p_job_id AND status = 'active';
  END IF;

  RETURN true;
END;
$$;

COMMIT;

-- NOT VERIFIED / OPEN (also in docs/A4_DESIGN.md section 13):
--  (a) Nothing here has been parsed or run by PostgreSQL. The lock reasoning is from reading live bodies and the documented
--      PostgreSQL row-lock conflict table, not from a reproduced concurrent run.
--  (b) _rank_professionals still carries its own hard-coded state list in the live body (not re-read this pass). It is a
--      pre-filter only; the authoritative check is _professional_conflicts via _schedule_active_states. A narrower ranker
--      costs a rejected candidate, never a missed conflict. Rewriting the ranker to call the helper is optional follow-up.
--  (c) Any unrelated UPDATE of a professional's own profile row (e.g. toggling availability) takes the same row lock for a
--      moment, so the matcher may skip that professional on that pass and the queue retries. Accept waits for it.
--  (d) SECURITY DEFINER bodies of transition_job_state keep the live search_path ('public' only), not 'public, pg_temp'.
--      Hardening every pre-existing definer function is out of scope; A4-owned functions use 'public, pg_temp'.
