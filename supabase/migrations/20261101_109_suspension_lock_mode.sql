-- 20261101_109_suspension_lock_mode
--
-- Fixes the deadlock found by concurrency test 4 of migration 108 (docs/A3_LOCK_ORDER_DESIGN.md section 8).
--
-- admin_transition_professional_verification locked the professional row with FOR UPDATE and then waited for
-- booking locks. Every path that inserts into booking_assignment_attempts (admin_cancel_job,
-- customer_cancel_booking, decline_job, offers) holds a booking lock and takes FOR KEY SHARE on that same
-- professional row through the foreign key; FOR UPDATE conflicts with KEY SHARE, so the two formed a cycle
-- (profile -> booking against booking -> profile) and PostgreSQL aborted one with 40P01.
--
-- Change: FOR UPDATE -> FOR NO KEY UPDATE on that one SELECT. The function only updates non-key columns
-- (verification_status, is_available, updated_at), FOR NO KEY UPDATE does not conflict with KEY SHARE, and it
-- still conflicts with itself, so concurrent verification transitions on one professional still serialise.
-- Nothing else in the function changes. Grants are unchanged (CREATE OR REPLACE keeps them).
-- Rollback: supabase/rollbacks/20261101_109_rollback.sql

CREATE OR REPLACE FUNCTION public.admin_transition_professional_verification(p_professional_id uuid, p_action text, p_expected_status text, p_reason text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve','reject','suspend','reactivate') THEN
    RAISE EXCEPTION 'Unknown verification action' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT verification_status INTO v_current
  FROM public.professional_profiles
  WHERE user_id = p_professional_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Stale request: status is now %, expected %', v_current, COALESCE(p_expected_status, 'none')
      USING ERRCODE = '55000';
  END IF;

  IF p_action IN ('approve','reject') AND v_current IN ('pending','documents_submitted','under_review') THEN
    v_new := CASE p_action WHEN 'approve' THEN 'verified' ELSE 'rejected' END;
  ELSIF p_action = 'suspend' AND v_current = 'verified' THEN
    v_new := 'suspended';
  ELSIF p_action = 'reactivate' AND v_current = 'suspended' THEN
    v_new := 'verified';
  ELSE
    RAISE EXCEPTION 'Cannot % a professional whose status is %', p_action, v_current USING ERRCODE = '55000';
  END IF;

  IF v_new = 'verified' THEN
    v_missing := public._verification_missing_documents(p_professional_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Required documents missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.verification_transition', p_professional_id::text || ':' || v_new, true);

  UPDATE public.professional_profiles
  SET verification_status = v_new,
      is_available = CASE WHEN v_new = 'verified' THEN is_available ELSE false END,
      updated_at = now()
  WHERE user_id = p_professional_id;

  PERFORM set_config('app.verification_transition', '', true);

  -- Keep the submission record in step with the decision.
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
    SET status = 'verified', reviewed_at = now(), reviewed_by = v_actor, updated_at = now()
    WHERE id = v_vid;
  END IF;

  IF p_action = 'suspend' THEN
    -- Withdraw outstanding offers. Each is released and re-offered to the next eligible
    -- professional; this one is already suspended so ranking excludes them.
    FOR v_job IN
      SELECT id FROM public.jobs
      WHERE professional_id = p_professional_id AND current_state = 'assigned'
      ORDER BY booking_id
    LOOP
      PERFORM public._release_offer(v_job.id, 'withdrawn', 'professional_suspended',
                                    'Professional suspended by administrator', v_actor);
      v_released := v_released + 1;
    END LOOP;

    -- Work already accepted or under way is left alone and not cancelled; it is recorded here
    -- and is derivable at any time as: jobs of a suspended professional in a non-terminal state.
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_active_ids
    FROM public.jobs
    WHERE professional_id = p_professional_id
      AND current_state NOT IN ('assigned','completed','closed','cancelled');
  END IF;

  INSERT INTO public.professional_verification_events
    (professional_id, from_status, to_status, action, actor_id, actor_role, reason, metadata)
  VALUES
    (p_professional_id, v_current, v_new, p_action, v_actor, 'admin', v_reason,
     COALESCE(p_metadata, '{}'::jsonb)
       || CASE WHEN p_action = 'suspend'
               THEN jsonb_build_object('offers_withdrawn', v_released,
                                       'active_job_ids', to_jsonb(v_active_ids))
               ELSE '{}'::jsonb END);

  RETURN jsonb_build_object(
    'professional_id', p_professional_id,
    'from_status', v_current,
    'to_status', v_new,
    'offers_withdrawn', v_released,
    'active_jobs', COALESCE(array_length(v_active_ids, 1), 0));
END;
$function$
;
