-- DRAFT — NOT APPLIED — NOT EXECUTED AGAINST ANY DATABASE — NOT TESTED
-- Proposed migration 111 for A4 (docs/A4_DESIGN.md). Lives outside supabase/migrations on purpose.
-- Promote (move + rename) only after owner approval and a run on a non-production database.
-- Lock order for everything here: booking -> job -> professional row (NO KEY UPDATE) -> schedule advisory lock.
-- Written from the live function bodies read on 2026-11-01; _offer_next and transition_job_state are
-- PATCH POINTS below (they must be edited from the then-current live definition, not from this file).

BEGIN;

-- 1. Vocabulary ----------------------------------------------------------------------------------
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_outcome_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_outcome_check
  CHECK (outcome = ANY (ARRAY['declined','expired','withdrawn','reassigned']));
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict','too_far','not_my_skill','need_more_detail','other',
    'professional_suspended','job_cancelled','admin_withdrawn','admin_reassigned','professional_cancelled']));

ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_kind_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_kind_check
  CHECK (kind = ANY (ARRAY['professional_no_show','professional_suspended_active_job','professional_withdrew']));
ALTER TABLE public.job_exceptions
  ADD COLUMN IF NOT EXISTS finding text CHECK (finding IS NULL OR finding IN ('confirmed','not_confirmed','inconclusive')),
  ADD COLUMN IF NOT EXISTS resolution text CHECK (resolution IS NULL OR resolution IN
    ('reassigned','customer_rescheduled','cancelled_no_fee','completed_late','no_action'));
-- preference was NOT NULL for customer reports; system-raised kinds have none.
ALTER TABLE public.job_exceptions ALTER COLUMN preference DROP NOT NULL;
ALTER TABLE public.job_exceptions DROP CONSTRAINT IF EXISTS job_exceptions_preference_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_preference_check
  CHECK (preference IS NULL OR preference IN ('reassign','support'));
ALTER TABLE public.job_exceptions ALTER COLUMN reported_by DROP NOT NULL;  -- system-raised rows

-- Idempotency: one row per (actor, key). Admin-only table; RLS on, no policies for anon/authenticated.
CREATE TABLE IF NOT EXISTS public.admin_action_keys (
  actor_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  action text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE public.admin_action_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_keys FROM PUBLIC, anon, authenticated;

-- 2. Scheduling-integrity helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._lock_professional_schedule(p_professional uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ SELECT pg_advisory_xact_lock(hashtextextended('schedule:' || p_professional::text, 0)) $$;

-- The existing +/-2h rule from _rank_professionals, as a reusable predicate. Read-only leaf.
CREATE OR REPLACE FUNCTION public._professional_conflicts(p_professional uuid, p_booking uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.bookings jb ON jb.id = j.booking_id
    JOIN public.bookings tb ON tb.id = p_booking
    WHERE j.professional_id = p_professional
      AND j.booking_id <> p_booking
      AND j.current_state IN ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')
      AND jb.scheduled_start BETWEEN tb.scheduled_start - interval '2 hours' AND tb.scheduled_start + interval '2 hours'
  )
$$;
REVOKE ALL ON FUNCTION public._lock_professional_schedule(uuid), public._professional_conflicts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lock_professional_schedule(uuid), public._professional_conflicts(uuid, uuid) TO service_role;

-- PATCH POINT A (_offer_next): after v_pick is chosen and before writing matching_decisions:
--   PERFORM public._lock_professional_schedule(v_pick.professional_id);
--   IF public._professional_conflicts(v_pick.professional_id, p_booking_id) THEN
--     -- take the next ranked candidate (loop over _rank_professionals instead of LIMIT 1)
--   END IF;
-- PATCH POINT B (transition_job_state), in the p_new_state = 'accepted' block, after the verification check:
--   PERFORM public._lock_professional_schedule(v_job.professional_id);
--   IF public._professional_conflicts(v_job.professional_id, v_job.booking_id) THEN
--     RAISE EXCEPTION 'You already have a job at an overlapping time' USING ERRCODE = '22023';
--   END IF;
-- PATCH POINT C (transition_job_state): one new valid edge, only under a session flag:
--   ELSIF (v_job.current_state = 'accepted' AND p_new_state = 'assigned'
--          AND COALESCE(current_setting('app.reassign_job', true), '') = p_job_id::text) THEN v_valid := true;
--   and in the allow-list: OR (p_new_state = 'assigned' AND COALESCE(current_setting('app.reassign_job', true),'') = p_job_id::text
--                              AND (EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND role = 'admin')
--                                   OR v_caller = v_job.professional_id))
--   plus: accepted_at must be cleared and professional_id set NULL by the calling function, not by this edge.

-- 3. Admin functions (skeletons with the full precondition logic) ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_professional(
  p_booking_id uuid, p_professional_id uuid, p_expected_job_state text, p_expected_professional_id uuid,
  p_reason text, p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_admin uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_prev uuid;
  v_decision uuid;
  v_window interval := make_interval(mins => COALESCE(public._matching_setting('offer_window_minutes'), 30)::int);
  v_result jsonb;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT result INTO v_result FROM public.admin_action_keys WHERE actor_id = v_admin AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_result; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;           -- B
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;           -- J

  IF v_booking.booking_status <> 'pending' OR v_booking.scheduled_start <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_ASSIGNABLE');
  END IF;
  IF FOUND AND v_job.current_state <> 'assigned' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'JOB_STATE_CHANGED', 'state', v_job.current_state);
  END IF;
  IF COALESCE(v_job.current_state, 'none') IS DISTINCT FROM p_expected_job_state
     OR v_job.professional_id IS DISTINCT FROM p_expected_professional_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE');
  END IF;

  PERFORM 1 FROM public.professional_profiles WHERE user_id = p_professional_id FOR NO KEY UPDATE;  -- P
  IF NOT EXISTS (SELECT 1 FROM public.professional_profiles
                 WHERE user_id = p_professional_id AND verification_status = 'verified' AND COALESCE(is_available, true)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFESSIONAL_INELIGIBLE');
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_assignment_attempts WHERE booking_id = p_booking_id AND professional_id = p_professional_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_ATTEMPTED');
  END IF;

  PERFORM public._lock_professional_schedule(p_professional_id);                              -- S
  IF public._professional_conflicts(p_professional_id, p_booking_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SCHEDULE_CONFLICT');
  END IF;
  -- TODO(design): skills / service-area eligibility; reuse the candidate filters of _rank_professionals.

  v_prev := v_job.professional_id;
  IF v_prev IS NOT NULL THEN
    INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
    VALUES (p_booking_id, v_prev, 'withdrawn', 'admin_reassigned', left(p_reason, 500));
  END IF;

  INSERT INTO public.matching_decisions (booking_id, job_id, professional_id, kind, pool_size, inputs)
  VALUES (p_booking_id, v_job.id, p_professional_id, 'manual', 1,
          jsonb_build_object('admin', v_admin, 'reason', p_reason)) RETURNING id INTO v_decision;
  -- NOTE: matching_decisions.kind has a check constraint not yet inspected; 'manual' may need adding.

  IF v_job.id IS NULL THEN
    INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, offer_expires_at)
    VALUES (p_booking_id, v_booking.customer_id, v_booking.property_id, p_professional_id, 'assigned',
            LEAST(now() + v_window, v_booking.scheduled_start)) RETURNING * INTO v_job;
    UPDATE public.matching_decisions SET job_id = v_job.id WHERE id = v_decision;
  ELSE
    UPDATE public.jobs SET professional_id = p_professional_id, offer_expires_at = LEAST(now() + v_window, v_booking.scheduled_start),
           updated_at = now() WHERE id = v_job.id;
  END IF;
  UPDATE public.bookings SET professional_id = p_professional_id, unmatched_since = NULL, updated_at = now() WHERE id = p_booking_id;

  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (v_job.id, 'assigned', 'assigned', v_admin, 'admin_assigned',
          jsonb_build_object('from_professional_id', v_prev, 'to_professional_id', p_professional_id, 'reason', p_reason));

  v_result := jsonb_build_object('ok', true, 'job_id', v_job.id, 'professional_id', p_professional_id);
  INSERT INTO public.admin_action_keys (actor_id, idempotency_key, action, result)
  VALUES (v_admin, p_idempotency_key, 'admin_assign_professional', v_result);
  RETURN v_result;
END;
$$;

-- admin_withdraw_offer, admin_reassign_job, professional_withdraw_from_job and admin_resolve_no_show follow
-- the same skeleton (admin check, reason, idempotency, B -> J -> P -> S, typed refusals, attempt row,
-- job_events row). They are specified in docs/A4_DESIGN.md section 3 and are intentionally not written out
-- here until the owner approves the contracts, so unreviewed privileged code does not accumulate.

REVOKE ALL ON FUNCTION public.admin_assign_professional(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_professional(uuid, uuid, text, uuid, text, uuid) TO authenticated;

-- 4. Read-only drift report (safe to run any time) -----------------------------------------------
CREATE OR REPLACE VIEW public.a4_assignment_drift AS
SELECT 'booking_job_professional_mismatch' AS check_name, b.id AS booking_id, j.id AS job_id
FROM public.bookings b JOIN public.jobs j ON j.booking_id = b.id
WHERE b.professional_id IS DISTINCT FROM j.professional_id AND j.current_state NOT IN ('cancelled','closed');
REVOKE ALL ON public.a4_assignment_drift FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.a4_assignment_drift TO service_role;

COMMIT;
