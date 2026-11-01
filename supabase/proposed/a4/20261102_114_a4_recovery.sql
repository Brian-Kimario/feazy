-- A4 / 114  PROFESSIONAL WITHDRAWAL, SUSPENSION RECOVERY, NO-SHOW RESOLUTION
--                                                   *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- Depends on: 111, 112, 113 (_idem_begin/_idem_finish). Live definitions read 2026-11-01.
-- Canonical lock order everywhere: booking -> job -> professional_profiles row -> job_exceptions row -> schedule advisory lock.
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 4. PROFESSIONAL WITHDRAWAL (recovery of a professional-side cancel)
-- Actor: the assigned professional (auth.uid() = jobs.professional_id), NOT an admin.
-- Allowed: state 'accepted' only (before on_the_way). Later states raise NEEDS_ADMIN_REVIEW: a professional on the
-- way or on site must go through support / no-show handling, never silently drop the job.
-- Effect: accepted -> assigned with no professional; booking returns to the unmatched pool; the queue re-offers.
-- The withdrawing professional is excluded from re-ranking (attempt row). Customer is notified (115).
-- Payment/quote: quotes exist only after start, so none can exist in 'accepted'; payments untouched.
CREATE OR REPLACE FUNCTION public.professional_withdraw_from_job(p_job_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_start timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002'; END IF;
  SELECT scheduled_start INTO v_start FROM public.bookings WHERE id = v_booking_id FOR UPDATE;   -- 1. booking
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;                            -- 2. job
  -- Same answer for "not yours" and "does not exist": no enumeration of other professionals' jobs.
  IF v_job.professional_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.current_state <> 'accepted' THEN
    RAISE EXCEPTION 'NEEDS_ADMIN_REVIEW: job is %; contact support', v_job.current_state USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_assignment_attempts (booking_id, professional_id, outcome, reason_code, reason)
  VALUES (v_job.booking_id, v_uid, 'withdrawn', 'professional_withdrew', left(p_reason, 500));
  UPDATE public.jobs
     SET current_state = 'assigned', professional_id = NULL, accepted_at = NULL,
         eta_earliest = NULL, eta_latest = NULL, offer_expires_at = NULL, updated_at = now()
   WHERE id = p_job_id;
  UPDATE public.bookings
     SET professional_id = NULL, unmatched_since = COALESCE(unmatched_since, now()), updated_at = now()
   WHERE id = v_job.booking_id;
  INSERT INTO public.job_events (job_id, from_state, to_state, actor_user_id, event_type, metadata)
  VALUES (p_job_id, 'accepted', 'assigned', v_uid, 'professional_withdrew',
          jsonb_build_object('from_professional_id', v_uid, 'reason', left(p_reason, 500)));
  RETURN jsonb_build_object('job_id', p_job_id, 'state', 'assigned');
END; $$;
REVOKE ALL ON FUNCTION public.professional_withdraw_from_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professional_withdraw_from_job(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. SUSPENSION AND ACTIVE-JOB RECOVERY
-- Replaces admin_transition_professional_verification. Identical to the live body except:
--  (a) the lock order for 'suspend' (live: pro row FOR UPDATE first, then jobs FOR UPDATE, then _release_offer takes the
--      booking lock while the job lock is held = two inversions of booking -> job -> pro);
--  (b) the pro row lock is FOR NO KEY UPDATE (does not block KEY SHARE taken by FK inserts);
--  (c) active jobs of the suspended professional now create an open job_exceptions row (no silent drop).
-- Suspension does NOT cancel or reassign accepted/in-flight work; it surfaces it to administrators.
CREATE OR REPLACE FUNCTION public.admin_transition_professional_verification(
  p_professional_id uuid, p_action text, p_expected_status text, p_reason text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_role       text;
  v_current    text;
  v_new        text;
  v_reason     text := btrim(COALESCE(p_reason, ''));
  v_missing    text[];
  v_vid        uuid;
  v_job        record;
  v_released   int := 0;
  v_active_ids uuid[] := ARRAY[]::uuid[];
  v_tries      int := 0;
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

  IF p_action = 'suspend' THEN
    -- CHANGED: release pending offers BEFORE taking the professional row, so each release follows booking -> job.
    SELECT verification_status INTO v_current FROM public.professional_profiles WHERE user_id = p_professional_id;
    IF v_current IS DISTINCT FROM p_expected_status THEN
      RAISE EXCEPTION 'Stale request: status is now %, expected %', v_current, COALESCE(p_expected_status, 'none')
        USING ERRCODE = '55000';
    END IF;
    LOOP
      SELECT id INTO v_job FROM public.jobs
       WHERE professional_id = p_professional_id AND current_state = 'assigned' ORDER BY created_at LIMIT 1;
      EXIT WHEN NOT FOUND;
      v_tries := v_tries + 1;
      IF v_tries > 50 THEN RAISE EXCEPTION 'Too many pending offers; retry' USING ERRCODE = '40001'; END IF;
      PERFORM public._release_offer(v_job.id, 'withdrawn', 'professional_suspended',
                                    'Professional suspended by administrator', v_actor);
      v_released := v_released + 1;
    END LOOP;
  END IF;

  SELECT verification_status INTO v_current FROM public.professional_profiles
   WHERE user_id = p_professional_id FOR NO KEY UPDATE;                                          -- pro row
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
    -- Offers created in the window before the pro row lock would have committed before our lock was granted
    -- (jobs inserts take KEY SHARE on the professional); any left is a retry, never a silent leftover.
    IF EXISTS (SELECT 1 FROM public.jobs WHERE professional_id = p_professional_id AND current_state = 'assigned') THEN
      RAISE EXCEPTION 'Offer appeared during suspension; retry' USING ERRCODE = '40001';
    END IF;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_active_ids FROM public.jobs
     WHERE professional_id = p_professional_id AND current_state NOT IN ('assigned','completed','closed','cancelled');
    -- CHANGED: one open exception per active job. Not an allegation: preference 'admin', system-raised.
    INSERT INTO public.job_exceptions (job_id, kind, preference, reported_by, professional_id, scheduled_start)
    SELECT j.id, 'professional_suspended_active_job', 'admin', v_actor, p_professional_id, b.scheduled_start
      FROM public.jobs j JOIN public.bookings b ON b.id = j.booking_id
     WHERE j.id = ANY (v_active_ids)
    ON CONFLICT (job_id, kind) DO NOTHING;
  END IF;

  INSERT INTO public.professional_verification_events
    (professional_id, from_status, to_status, action, actor_id, actor_role, reason, metadata)
  VALUES (p_professional_id, v_current, v_new, p_action, v_actor, 'admin', v_reason,
     COALESCE(p_metadata, '{}'::jsonb)
       || CASE WHEN p_action = 'suspend'
               THEN jsonb_build_object('offers_withdrawn', v_released, 'active_job_ids', to_jsonb(v_active_ids))
               ELSE '{}'::jsonb END);

  RETURN jsonb_build_object('professional_id', p_professional_id, 'from_status', v_current, 'to_status', v_new,
    'offers_withdrawn', v_released, 'active_jobs', COALESCE(array_length(v_active_ids, 1), 0));
END; $$;

-- ---------------------------------------------------------------------------------------------
-- 6. NO-SHOW INVESTIGATION AND RESOLUTION
-- Customer report (live: report_professional_no_show) creates an ALLEGATION: accepted/on_the_way, no arrived_at,
-- >= 30 min past start. This function records the administrator's FINDING and the outcome. It changes no job state and
-- sends no notification itself: a cancellation or reassignment is performed by its own audited operation first
-- (admin_cancel_job / admin_reassign_job), and this call then records and verifies it:
--   resolution 'cancelled'  -> job must already be cancelled
--   resolution 'reassigned' -> job.professional_id must differ from the exception's professional_id
--   'customer_declined' / 'no_action' -> no state requirement
-- Applies to kind 'professional_no_show' and 'professional_suspended_active_job'.
CREATE OR REPLACE FUNCTION public.admin_resolve_exception(
  p_exception_id uuid, p_expected_status text, p_finding text, p_resolution text, p_note text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin uuid := public._require_admin();
  v_hash text := md5(concat_ws('|', p_exception_id, p_expected_status, p_finding, p_resolution, p_note));
  v_replay jsonb;
  v_job_id uuid;
  v_booking_id uuid;
  v_job public.jobs%ROWTYPE;
  v_ex public.job_exceptions%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_finding NOT IN ('confirmed','not_confirmed','inconclusive')
     OR p_resolution NOT IN ('reassigned','cancelled','customer_declined','no_action') THEN
    RAISE EXCEPTION 'Invalid finding or resolution' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 10 THEN
    RAISE EXCEPTION 'A resolution note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  v_replay := public._idem_begin(v_admin, 'resolve_exception', p_request_id, v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT job_id INTO v_job_id FROM public.job_exceptions WHERE id = p_exception_id;   -- unlocked read for lock order
  IF v_job_id IS NULL THEN RAISE EXCEPTION 'Exception not found' USING ERRCODE = 'P0002'; END IF;
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = v_job_id;
  PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;                        -- 1. booking
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id FOR UPDATE;                      -- 2. job
  SELECT * INTO v_ex FROM public.job_exceptions WHERE id = p_exception_id FOR UPDATE;       -- 3. exception
  IF v_ex.status <> p_expected_status OR v_ex.status <> 'open' THEN
    RAISE EXCEPTION 'STALE_STATE: exception is %', v_ex.status USING ERRCODE = '40001';
  END IF;
  IF p_resolution = 'cancelled' AND v_job.current_state <> 'cancelled' THEN
    RAISE EXCEPTION 'RESOLUTION_MISMATCH: job is not cancelled' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'reassigned' AND v_job.professional_id IS NOT DISTINCT FROM v_ex.professional_id THEN
    RAISE EXCEPTION 'RESOLUTION_MISMATCH: job still has the same professional' USING ERRCODE = '22023';
  END IF;

  UPDATE public.job_exceptions
     SET status = CASE WHEN p_finding = 'not_confirmed' THEN 'dismissed' ELSE 'resolved' END,
         finding = p_finding, resolution = p_resolution, resolved_by = v_admin, resolved_at = now(),
         resolution_note = left(p_note, 1000)
   WHERE id = p_exception_id;
  PERFORM public._job_code_event(v_job_id, 'exception_resolved', v_admin, jsonb_build_object(
    'exception_id', p_exception_id, 'kind', v_ex.kind, 'finding', p_finding, 'resolution', p_resolution,
    'request_id', p_request_id));

  v_result := jsonb_build_object('exception_id', p_exception_id, 'replayed', false);
  PERFORM public._idem_finish(v_admin, 'resolve_exception', p_request_id, v_result);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.admin_resolve_exception(uuid,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_exception(uuid,text,text,text,text,uuid) TO authenticated, service_role;
COMMIT;

-- KNOWN INCOMPLETE / UNVERIFIED:
--  * Grants on admin_transition_professional_verification are unchanged by CREATE OR REPLACE; confirm after any apply.
--  * RLS on job_exceptions was not re-read this pass; admin reads rely on service-role/definer paths.
--  * _job_code_event(job, type, actor, metadata) signature verified; its INSERT target (job_events) was not re-read.
--  * No-show: no penalty/strike on the professional is modelled (owner decision D-A4-9).
