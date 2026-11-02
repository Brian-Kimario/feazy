-- 20261102_118 ROLLBACK: restores the live transition_job_state and customer_cancel_booking bodies
-- (as of 2026-11-02 / migration 107) and removes the R1-A additions.
-- Refuses to run while customer_cancellation_request rows exist: resolve or archive them first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.job_exceptions WHERE kind = 'customer_cancellation_request') THEN
    RAISE EXCEPTION 'customer_cancellation_request rows exist; resolve them before rolling back';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.transition_job_state(p_job_id uuid, p_new_state text, p_actor_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public._require_read_committed();
    SELECT booking_id, professional_id INTO v_booking_id, v_pre_pro FROM public.jobs WHERE id = p_job_id;
    IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
    IF v_caller IS NOT NULL AND v_pre_pro IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Not allowed to change this job';
    END IF;
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  END IF;

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

  IF p_new_state = 'accepted' THEN
    IF v_job.professional_id IS NULL THEN
      RAISE EXCEPTION 'Professional not found';
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.customer_cancel_booking(
  p_booking_id      uuid,
  p_expected_state  text,
  p_reason_category text,
  p_note            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user           uuid := auth.uid();
  v_note           text := NULLIF(btrim(p_note), '');
  v_booking        public.bookings%ROWTYPE;
  v_job            public.jobs%ROWTYPE;
  v_has_job        boolean;
  v_actual         text;
  v_decision       uuid;
  v_offer_withdrawn boolean := false;
  v_paid           integer := 0;
  v_pending        integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_booking_id IS NULL OR p_expected_state IS NULL THEN
    RAISE EXCEPTION 'Booking and expected state are required' USING ERRCODE = '22023';
  END IF;
  IF p_reason_category IS NULL OR p_reason_category NOT IN (
       'changed_my_mind', 'booked_by_mistake', 'found_other_help', 'schedule_conflict', 'price_concern', 'other') THEN
    RAISE EXCEPTION 'A valid cancellation reason is required' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'The note must be 300 characters or fewer' USING ERRCODE = '22023';
  END IF;

  -- Booking first, then job: the same order as the assignment queue (_offer_next).
  -- A booking that is not the caller's is reported exactly like one that does not exist.
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND customer_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE booking_id = p_booking_id FOR UPDATE;
  v_has_job := FOUND;
  v_actual := CASE WHEN v_has_job THEN v_job.current_state ELSE 'no_job' END;

  IF v_booking.booking_status = 'cancelled' AND (NOT v_has_job OR v_job.current_state IN ('cancelled', 'closed')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CANCELLED',
      'message', 'This booking is already cancelled.');
  END IF;
  IF v_actual <> p_expected_state THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_STATE',
      'message', 'This booking has changed since you opened it. Refresh and review before cancelling.',
      'actual_state', v_actual);
  END IF;
  IF v_booking.booking_status = 'completed' OR (v_has_job AND v_job.current_state IN ('completed', 'closed')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', 'This booking is already complete and can no longer be cancelled.', 'actual_state', v_actual);
  END IF;
  IF v_has_job AND v_job.current_state = 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', 'Work has already started, so it cannot be cancelled here. Please contact Fixify support.',
      'actual_state', v_actual);
  END IF;

  -- A live job is cancelled through the one job state machine. The caller is the customer, which the
  -- machine itself authorises for these states; a normal state_transition event keeps notifications uniform.
  IF v_has_job AND v_job.current_state <> 'cancelled' THEN
    PERFORM public.transition_job_state(
      v_job.id, 'cancelled', v_user,
      jsonb_build_object('source', 'customer_cancel', 'reason_category', p_reason_category));

    -- An outstanding offer is withdrawn rather than left dangling.
    IF v_job.current_state = 'assigned' AND v_job.professional_id IS NOT NULL THEN
      SELECT id INTO v_decision FROM public.matching_decisions
      WHERE job_id = v_job.id AND professional_id = v_job.professional_id AND kind = 'offered'
      ORDER BY created_at DESC LIMIT 1;
      INSERT INTO public.booking_assignment_attempts
        (booking_id, professional_id, outcome, reason_code, reason, decision_id)
      VALUES (p_booking_id, v_job.professional_id, 'withdrawn', 'job_cancelled', NULL, v_decision);
      UPDATE public.jobs SET offer_expires_at = NULL WHERE id = v_job.id;
      v_offer_withdrawn := true;
    END IF;
  END IF;

  -- Payments are only counted, never changed: a paid one needs an authorised refund decision.
  SELECT count(*) FILTER (WHERE status = 'paid'), count(*) FILTER (WHERE status = 'pending')
    INTO v_paid, v_pending
  FROM public.payments
  WHERE booking_id = p_booking_id OR (v_has_job AND job_id = v_job.id);

  IF v_booking.booking_status IN ('pending', 'confirmed') THEN
    PERFORM public.transition_booking_state(
      p_booking_id, 'cancelled', v_user, 'customer', 'customer_cancel', p_reason_category,
      jsonb_build_object(
        'job_state', v_actual,
        'note', v_note,
        'offer_withdrawn', v_offer_withdrawn,
        'payment_review_required', v_paid > 0,
        'paid_payment_count', v_paid,
        'pending_payment_count', v_pending));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'job_id', CASE WHEN v_has_job THEN v_job.id END,
    'from_state', v_actual,
    'to_state', 'cancelled',
    'offer_withdrawn', v_offer_withdrawn,
    'payment_review_required', v_paid > 0,
    'paid_payment_count', v_paid,
    'pending_payment_count', v_pending);
END;
$function$;

DROP FUNCTION IF EXISTS public._cancel_job_and_booking(uuid, uuid, text, text, text, text);
DROP POLICY IF EXISTS job_exceptions_select_professional ON public.job_exceptions;
ALTER TABLE public.job_exceptions DROP CONSTRAINT IF EXISTS job_exceptions_kind_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_kind_check CHECK (kind = ANY (ARRAY[
  'professional_no_show', 'professional_suspended_active_job', 'professional_withdrawal_request']));
