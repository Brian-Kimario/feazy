-- A4 / 111  SCHEDULING INTEGRITY (P0)            *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- Outside supabase/migrations/ on purpose. Based on live definitions read 2026-11-01.
-- Depends on: nothing in this package. Safe to approve and apply on its own.
--
-- Defect: _rank_professionals filters out professionals with another active job within +/-2h of the
-- booking, but the filter is lock-free and STABLE, and transition_job_state(...,'accepted') never
-- rechecks. A professional holding two overlapping offers can accept both.
--
-- Fix: (1) per-professional advisory lock, always the LAST lock taken (leaf);
--      (2) overlap + verification recheck inside the same transaction at offer creation and at accept.
-- Lock order: booking -> job -> professional_profiles row (FOR SHARE/NO KEY UPDATE) -> schedule advisory lock.

BEGIN;

-- Blocking lock: single-professional paths (accept, manual assign, reassign).
CREATE OR REPLACE FUNCTION public._lock_professional_schedule(p_pro uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('feasy:pro_schedule:' || p_pro::text, 0));
$$;

-- Non-blocking lock: the matcher walks several candidates in rank order, so it must never wait
-- (waiting in rank order on locks other sessions take in a different order could deadlock).
CREATE OR REPLACE FUNCTION public._try_lock_professional_schedule(p_pro uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pg_try_advisory_xact_lock(hashtextextended('feasy:pro_schedule:' || p_pro::text, 0));
$$;

-- Same +/-2h window and state set as _rank_professionals. p_committed_only = true ignores other
-- pending offers (state 'assigned'): used at accept, because an unaccepted offer is not a commitment.
CREATE OR REPLACE FUNCTION public._professional_conflicts(p_pro uuid, p_booking_id uuid, p_committed_only boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.bookings jb ON jb.id = j.booking_id
    JOIN public.bookings tb ON tb.id = p_booking_id
    WHERE j.professional_id = p_pro
      AND j.booking_id <> p_booking_id
      AND j.current_state = ANY (CASE WHEN p_committed_only
            THEN ARRAY['accepted','on_the_way','arrived','in_progress','quote_pending']
            ELSE ARRAY['assigned','accepted','on_the_way','arrived','in_progress','quote_pending'] END)
      AND jb.scheduled_start BETWEEN tb.scheduled_start - interval '2 hours'
                                 AND tb.scheduled_start + interval '2 hours'
  );
$$;

REVOKE ALL ON FUNCTION public._lock_professional_schedule(uuid), public._try_lock_professional_schedule(uuid),
  public._professional_conflicts(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lock_professional_schedule(uuid), public._try_lock_professional_schedule(uuid),
  public._professional_conflicts(uuid, uuid, boolean) TO service_role;

-- _offer_next: identical to the live body except the candidate loop (marked CHANGED).
CREATE OR REPLACE FUNCTION public._offer_next(p_booking_id uuid, p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_pick record;
  v_cand record;
  v_decision uuid;
  v_found boolean := false;
  v_window interval := make_interval(mins => COALESCE(public._matching_setting('offer_window_minutes'), 30)::int);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;
  IF FOUND AND v_job.current_state <> 'assigned' THEN
    RAISE EXCEPTION 'Booking % already has a job in state %', p_booking_id, v_job.current_state;
  END IF;

  IF v_booking.scheduled_start > now() THEN
    -- CHANGED: walk the ranked pool; take the first candidate that (a) we can lock without waiting,
    -- (b) is still verified and available, and (c) has no conflicting job, all under the lock.
    FOR v_cand IN
      SELECT r.*, count(*) OVER () AS pool_size FROM public._rank_professionals(p_booking_id) r
    LOOP
      CONTINUE WHEN NOT public._try_lock_professional_schedule(v_cand.professional_id);
      PERFORM 1 FROM public.professional_profiles pp
       WHERE pp.user_id = v_cand.professional_id AND pp.verification_status = 'verified'
         AND COALESCE(pp.is_available, true)
       FOR SHARE;
      CONTINUE WHEN NOT FOUND;
      CONTINUE WHEN public._professional_conflicts(v_cand.professional_id, p_booking_id, false);
      v_pick := v_cand;
      v_found := true;
      EXIT;
    END LOOP;
  END IF;

  IF NOT v_found THEN
    IF v_booking.unmatched_since IS NULL THEN
      INSERT INTO public.matching_decisions (booking_id, job_id, kind, pool_size, inputs)
      VALUES (p_booking_id, v_job.id, 'unmatched', 0,
              jsonb_build_object('reason', CASE WHEN v_booking.scheduled_start > now()
                                                   THEN 'no eligible professional'
                                                   ELSE 'start time passed' END));
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

-- transition_job_state: identical to the live body except block ACCEPT-GUARD, which replaces the
-- unlocked verification read. Everything else (allow-list, quote guards, edges, code gates, code
-- lifecycle) is copied verbatim so the single state machine is unchanged.
CREATE OR REPLACE FUNCTION public.transition_job_state(
  p_job_id uuid, p_new_state text, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_caller uuid := auth.uid();
  v_status text;
  v_valid boolean := false;
  v_allowed boolean;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
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
    -- leaf lock: after booking? NOTE accept never took the booking lock; job lock is held, then
    -- the professional row, then the schedule lock. Offer paths take booking -> job -> pro -> lock.
    SELECT verification_status INTO v_status
    FROM public.professional_profiles WHERE user_id = v_job.professional_id FOR SHARE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Professional not found'; END IF;
    IF v_status <> 'verified' THEN
      RAISE EXCEPTION 'Professional must be verified to accept jobs. Current status: %', v_status;
    END IF;
    PERFORM public._lock_professional_schedule(v_job.professional_id);
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

-- Not verified: (a) whether bookings can be rescheduled after a job exists (the recheck reads the
-- booking start at call time, so a reschedule between offer and accept is covered; a reschedule
-- WHILE accept holds the lock is not serialised against by this migration). (b) The ranker still
-- applies its own unlocked filter first; this migration only adds the authoritative recheck.
