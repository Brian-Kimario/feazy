-- 20261031_108 rollback: restores the pre-108 function bodies (captured from the live database 2026-10-31).
-- Re-introduces the job->booking lock order (the 40P01 deadlock). No data is changed.

CREATE OR REPLACE FUNCTION public.admin_cancel_job(p_job_id uuid, p_expected_state text, p_reason text, p_customer_reason_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_reason text := btrim(p_reason);
  v_job public.jobs%ROWTYPE;
  v_booking_status text;
  v_decision uuid;
  v_paid integer;
  v_pending integer;
  v_offer_withdrawn boolean := false;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can cancel jobs' USING ERRCODE = '42501';
  END IF;
  IF p_job_id IS NULL OR p_expected_state IS NULL THEN
    RAISE EXCEPTION 'Job and expected state are required' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'A cancellation reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_customer_reason_category IS NULL OR p_customer_reason_category NOT IN (
       'professional_unavailable', 'scheduling_issue', 'service_not_fulfillable',
       'customer_request', 'safety_or_operational', 'other') THEN
    RAISE EXCEPTION 'A valid customer reason category is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.current_state <> p_expected_state THEN
    RAISE EXCEPTION 'The job is now %, not %. Refresh and review before cancelling.',
      v_job.current_state, p_expected_state USING ERRCODE = '55000';
  END IF;
  IF v_job.current_state IN ('completed', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'A % job cannot be cancelled', v_job.current_state USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.admin_cancel_job', p_job_id::text, true);
  PERFORM public.transition_job_state(
    p_job_id, 'cancelled', v_admin,
    jsonb_build_object('event_type', 'admin_cancel', 'customer_reason_category', p_customer_reason_category));
  PERFORM set_config('app.admin_cancel_job', '', true);

  -- An outstanding offer is withdrawn rather than left dangling.
  IF v_job.current_state = 'assigned' AND v_job.professional_id IS NOT NULL THEN
    SELECT id INTO v_decision FROM public.matching_decisions
    WHERE job_id = p_job_id AND professional_id = v_job.professional_id AND kind = 'offered'
    ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.booking_assignment_attempts
      (booking_id, professional_id, outcome, reason_code, reason, decision_id)
    VALUES (v_job.booking_id, v_job.professional_id, 'withdrawn', 'job_cancelled', NULL, v_decision);
    UPDATE public.jobs SET offer_expires_at = NULL WHERE id = p_job_id;
    v_offer_withdrawn := true;
  END IF;

  -- The booking follows the job. (public.booking_events does not exist in this database, so the
  -- cancellation record in admin_job_cancellations and the job_events row are the audit trail.)
  SELECT booking_status INTO v_booking_status FROM public.bookings WHERE id = v_job.booking_id FOR UPDATE;
  IF v_booking_status IS NOT NULL AND v_booking_status NOT IN ('cancelled', 'completed') THEN
    UPDATE public.bookings SET booking_status = 'cancelled', unmatched_since = NULL
    WHERE id = v_job.booking_id;
  END IF;

  -- Payments are only counted, never changed: a paid one needs an authorised refund decision.
  SELECT count(*) FILTER (WHERE status = 'paid'), count(*) FILTER (WHERE status = 'pending')
    INTO v_paid, v_pending
  FROM public.payments WHERE job_id = p_job_id OR booking_id = v_job.booking_id;

  INSERT INTO public.admin_job_cancellations
    (job_id, booking_id, cancelled_by, from_state, internal_reason, customer_reason_category,
     payment_review_required, paid_payment_count, pending_payment_count)
  VALUES (p_job_id, v_job.booking_id, v_admin, v_job.current_state, v_reason, p_customer_reason_category,
          v_paid > 0, v_paid, v_pending);

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'booking_id', v_job.booking_id,
    'from_state', v_job.current_state,
    'to_state', 'cancelled',
    'offer_withdrawn', v_offer_withdrawn,
    'payment_review_required', v_paid > 0,
    'paid_payment_count', v_paid,
    'pending_payment_count', v_pending);
END;
$function$

;

CREATE OR REPLACE FUNCTION public._release_offer(p_job_id uuid, p_outcome text, p_reason_code text, p_note text, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_decision uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs
  WHERE id = p_job_id AND current_state = 'assigned' AND professional_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job is no longer awaiting a response';
  END IF;

  SELECT id INTO v_decision FROM public.matching_decisions
  WHERE job_id = p_job_id AND professional_id = v_job.professional_id AND kind = 'offered'
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.booking_assignment_attempts
    (booking_id, professional_id, outcome, reason_code, reason, decision_id)
  VALUES
    (v_job.booking_id, v_job.professional_id, p_outcome, p_reason_code, left(p_note, 500), v_decision);

  RETURN public._offer_next(v_job.booking_id, p_actor) IS NOT NULL;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.process_assignment_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_booking record;
  v_expired int := 0;
  v_matched int := 0;
  v_failed int := 0;
  v_unmatched int;
BEGIN
  -- One run at a time; a run that overlaps the previous one does nothing.
  IF NOT pg_try_advisory_xact_lock(hashtext('public.process_assignment_queue')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  FOR v_job IN
    SELECT id, professional_id FROM public.jobs
    WHERE current_state = 'assigned'
      AND professional_id IS NOT NULL
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public._release_offer(v_job.id, 'expired', NULL, NULL, v_job.professional_id);
      v_expired := v_expired + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'process_assignment_queue: releasing job % failed: %', v_job.id, SQLERRM;
    END;
  END LOOP;

  FOR v_booking IN
    SELECT b.id, b.customer_id FROM public.bookings b
    LEFT JOIN public.jobs j ON j.booking_id = b.id
    WHERE b.booking_status = 'pending'
      AND b.scheduled_start > now()
      AND (j.id IS NULL OR (j.current_state = 'assigned' AND j.professional_id IS NULL))
  LOOP
    BEGIN
      IF public._assign_booking_internal(v_booking.id, v_booking.customer_id) IS NOT NULL THEN
        v_matched := v_matched + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'process_assignment_queue: offering booking % failed: %', v_booking.id, SQLERRM;
    END;
  END LOOP;

  SELECT count(*) INTO v_unmatched FROM public.bookings
  WHERE booking_status = 'pending' AND unmatched_since IS NOT NULL;

  RETURN jsonb_build_object('expired_offers', v_expired, 'newly_matched', v_matched,
                            'failed', v_failed, 'still_unmatched', v_unmatched);
END;
$function$

;

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
  FOR UPDATE;
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
      ORDER BY created_at
      FOR UPDATE
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

