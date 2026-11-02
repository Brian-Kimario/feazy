-- A2: administrative job cancellation on the canonical state machine.
--
-- 1. transition_job_state: the party check was NULL-unsafe. For a job with no professional,
--    `v_caller <> v_job.professional_id` evaluates to NULL, so the raise was skipped and any signed-in
--    user passed the ownership check (only the jobs_professional_required CHECK stopped it, by accident).
--    The authorization is now an explicit allow-list: assigned professional (never NULL-equal), the
--    customer for the customer's own transitions, or an administrator cancelling through
--    admin_cancel_job. Nothing else changes in the state machine.
-- 2. jobs_professional_required: an unmatched job (no professional) could not be cancelled by anyone,
--    because the CHECK allowed a NULL professional only in 'assigned'. Cancelled/closed jobs may now
--    have no professional.
-- 3. admin_cancel_job: one transaction that locks the job, verifies the expected state, runs the
--    canonical transition as the signed-in admin, cancels the booking, withdraws an outstanding offer,
--    and records the internal reason. The reason never goes to job_events (customers can read those).
-- 4. Notifications: job_events of type admin_cancel notify the customer (customer-safe category text)
--    and the currently assigned professional (neutral text).
-- Payments are never touched; a paid payment sets payment_review_required on the cancellation record.

-- ---------------------------------------------------------------------------------------------
-- 2. unmatched jobs can be cancelled
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.jobs DROP CONSTRAINT jobs_professional_required;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_professional_required
  CHECK (professional_id IS NOT NULL OR current_state IN ('assigned', 'cancelled', 'closed'));

-- ---------------------------------------------------------------------------------------------
-- internal record of admin cancellations (admin read only; written only by admin_cancel_job)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.admin_job_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  cancelled_by uuid NOT NULL REFERENCES public.profiles(id),
  from_state text NOT NULL,
  internal_reason text NOT NULL CHECK (char_length(internal_reason) BETWEEN 5 AND 500),
  customer_reason_category text NOT NULL CHECK (customer_reason_category IN (
    'professional_unavailable', 'scheduling_issue', 'service_not_fulfillable',
    'customer_request', 'safety_or_operational', 'other')),
  payment_review_required boolean NOT NULL,
  paid_payment_count integer NOT NULL DEFAULT 0,
  pending_payment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_job_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_job_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_job_cancellations TO authenticated;
CREATE POLICY admin_job_cancellations_admin_read ON public.admin_job_cancellations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- a withdrawn offer may record why
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict', 'too_far', 'not_my_skill', 'need_more_detail', 'other',
    'professional_suspended', 'job_cancelled']));

-- ---------------------------------------------------------------------------------------------
-- notification kind + body override
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY['job_accepted', 'eta_shared', 'running_late', 'pro_arrived', 'quote_requested',
    'quote_approved', 'quote_declined', 'job_cancelled', 'job_cancelled_by_admin', 'job_completed',
    'new_message']));

DROP FUNCTION public._notify(uuid, public.jobs, text, text, uuid);

CREATE FUNCTION public._notify(p_user uuid, p_job public.jobs, p_kind text, p_source_type text,
                               p_source_id uuid, p_body text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_body text;
  v_link text;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;

  SELECT t.title, t.body INTO v_title, v_body FROM (VALUES
    ('job_accepted',    'Your professional accepted the job',          'They will be in touch about the visit.'),
    ('eta_shared',      'Arrival window shared',                       'Your professional shared when they expect to arrive.'),
    ('running_late',    'Your professional is running late',           'They updated their arrival window.'),
    ('pro_arrived',     'Your professional has arrived',               'Open the booking to follow the visit.'),
    ('quote_requested', 'A quote needs your approval',                 'Review the quote to let the work continue.'),
    ('quote_approved',  'Your quote was approved',                     'You can continue with the work.'),
    ('quote_declined',  'Your quote was declined',                     'You can continue with the original scope or cancel.'),
    ('job_cancelled',   'This job was cancelled',                      'Open the job to see what happened.'),
    ('job_cancelled_by_admin', 'Fixify cancelled this booking',        'Open the booking to see what happens next.'),
    ('job_completed',   'Your professional has marked the work as completed', 'Open the booking to see the details.'),
    ('new_message',     'You have a new message',                      'Open the job to read and reply.')
  ) AS t(kind, title, body) WHERE t.kind = p_kind;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Unknown notification kind %', p_kind USING ERRCODE = '22023';
  END IF;

  v_link := CASE WHEN p_user = p_job.customer_id
    THEN '/customer/bookings/' || p_job.booking_id::text
    ELSE '/professional/jobs/' || p_job.id::text END;

  INSERT INTO public.notifications (user_id, job_id, kind, title, body, link, source_type, source_id)
  VALUES (p_user, p_job.id, p_kind, v_title, COALESCE(NULLIF(btrim(p_body), ''), v_body), v_link,
          p_source_type, p_source_id)
  ON CONFLICT (user_id, source_type, source_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public._notify(uuid, public.jobs, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify(uuid, public.jobs, text, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public._notify_for_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.job_events%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_kind text;
  v_recipient uuid;
  v_phrase text;
  v_body text;
BEGIN
  SELECT * INTO v_event FROM public.job_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_kind := CASE
    WHEN v_event.event_type = 'eta_shared' THEN 'eta_shared'
    WHEN v_event.event_type = 'running_late' THEN 'running_late'
    WHEN v_event.event_type = 'quote_approved' THEN 'quote_approved'
    WHEN v_event.event_type = 'quote_declined' THEN 'quote_declined'
    WHEN v_event.event_type = 'admin_cancel' AND v_event.to_state = 'cancelled' THEN 'job_cancelled_by_admin'
    WHEN v_event.event_type = 'state_transition' AND v_event.to_state = 'accepted' THEN 'job_accepted'
    WHEN v_event.event_type = 'state_transition' AND v_event.to_state = 'arrived' THEN 'pro_arrived'
    WHEN v_event.event_type = 'state_transition' AND v_event.to_state = 'quote_pending' THEN 'quote_requested'
    WHEN v_event.event_type = 'state_transition' AND v_event.to_state = 'completed' THEN 'job_completed'
    WHEN v_event.event_type = 'state_transition' AND v_event.to_state = 'cancelled' THEN 'job_cancelled'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_event.job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_kind IN ('quote_approved', 'quote_declined') THEN
    IF v_job.professional_id IS DISTINCT FROM v_event.actor_user_id THEN
      PERFORM public._notify(v_job.professional_id, v_job, v_kind, 'job_event', v_event.id);
    END IF;
  ELSIF v_kind = 'job_cancelled_by_admin' THEN
    -- Customer-safe wording only: the internal reason is never in the event metadata.
    v_phrase := CASE v_event.metadata->>'customer_reason_category'
      WHEN 'professional_unavailable' THEN 'your professional being unavailable'
      WHEN 'scheduling_issue' THEN 'a scheduling issue'
      WHEN 'service_not_fulfillable' THEN 'the service not being able to be fulfilled'
      WHEN 'customer_request' THEN 'your request'
      WHEN 'safety_or_operational' THEN 'a safety or operational concern'
      ELSE 'an operational reason'
    END;
    v_body := 'Your Fixify booking has been cancelled by Fixify due to ' || v_phrase
      || '. No further action is required. If you made a payment, its status and any refund decision'
      || ' will be communicated separately.';
    PERFORM public._notify(v_job.customer_id, v_job, v_kind, 'job_event', v_event.id, v_body);
    IF v_job.professional_id IS NOT NULL THEN
      PERFORM public._notify(v_job.professional_id, v_job, v_kind, 'job_event', v_event.id,
        'Fixify cancelled this job. You do not need to attend. Open the job for details.');
    END IF;
  ELSIF v_kind = 'job_cancelled' THEN
    FOR v_recipient IN
      SELECT DISTINCT u FROM unnest(ARRAY[v_job.customer_id, v_job.professional_id]) AS u WHERE u IS NOT NULL
    LOOP
      IF v_recipient IS DISTINCT FROM v_event.actor_user_id THEN
        PERFORM public._notify(v_recipient, v_job, v_kind, 'job_event', v_event.id);
      END IF;
    END LOOP;
  ELSE
    IF v_job.customer_id IS DISTINCT FROM v_event.actor_user_id THEN
      PERFORM public._notify(v_job.customer_id, v_job, v_kind, 'job_event', v_event.id);
    END IF;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 1. transition_job_state: NULL-safe authorization, admin cancel only via admin_cancel_job
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_job_state(p_job_id uuid, p_new_state text, p_actor_user_id uuid,
                                                       p_metadata jsonb DEFAULT '{}'::jsonb)
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
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_caller IS NOT NULL THEN
    IF p_actor_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Actor does not match the signed-in user';
    END IF;
    -- Explicit allow-list; every term is true or false, never NULL.
    v_allowed :=
      -- the assigned professional (a job with no professional has no such party)
      (v_job.professional_id IS NOT NULL AND v_caller = v_job.professional_id)
      -- the customer may cancel, and may resume work by answering a quote; starting a job is the
      -- professional's step, behind the start code
      OR (v_caller = v_job.customer_id
          AND ((p_new_state = 'cancelled'
                AND v_job.current_state IN ('quote_pending', 'assigned', 'accepted', 'on_the_way', 'arrived'))
               OR (p_new_state = 'in_progress' AND v_job.current_state = 'quote_pending')))
      -- an administrator, cancelling, and only inside admin_cancel_job for this exact job
      OR (p_new_state = 'cancelled'
          AND COALESCE(current_setting('app.admin_cancel_job', true), '') = p_job_id::text
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'admin'));
    IF NOT COALESCE(v_allowed, false) THEN
      RAISE EXCEPTION 'Not allowed to change this job';
    END IF;
  END IF;

  IF p_new_state = 'accepted' THEN
    SELECT verification_status INTO v_status
    FROM public.professional_profiles WHERE user_id = v_job.professional_id;
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Professional not found';
    END IF;
    IF v_status <> 'verified' THEN
      RAISE EXCEPTION 'Professional must be verified to accept jobs. Current status: %', v_status;
    END IF;
  END IF;

  -- Quote guard 1: quote_pending means a quote is actually waiting for the customer.
  IF p_new_state = 'quote_pending'
     AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE job_id = p_job_id AND status = 'pending_customer') THEN
    RAISE EXCEPTION 'A job can only wait on a quote that has been sent' USING ERRCODE = '22023';
  END IF;

  -- Quote guard 2: leaving quote_pending for work needs the quote answered first
  -- (respond_to_quote updates the quote before it calls this function).
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

  -- Code gates. Backend callers (no signed-in user: service role, support tooling) are not gated.
  IF v_caller IS NOT NULL THEN
    IF v_job.current_state = 'arrived' AND p_new_state = 'in_progress'
       AND NOT EXISTS (SELECT 1 FROM public.job_codes
                       WHERE job_id = p_job_id AND purpose = 'start' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the start code from the customer before starting work' USING ERRCODE = '22023';
    END IF;
    IF v_job.current_state = 'in_progress' AND p_new_state = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.job_codes
                       WHERE job_id = p_job_id AND purpose = 'finish' AND status = 'used') THEN
      RAISE EXCEPTION 'Enter the finish code from the customer before completing the job' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.jobs
  SET
    current_state = p_new_state,
    updated_at = now(),
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

  -- Code lifecycle follows the state.
  IF p_new_state = 'on_the_way' THEN
    PERFORM public._issue_job_code(p_job_id, 'start', p_actor_user_id, false);
  ELSIF p_new_state = 'in_progress' AND NOT EXISTS (
          SELECT 1 FROM public.job_codes
          WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used')) THEN
    PERFORM public._issue_job_code(p_job_id, 'finish', p_actor_user_id, false);
  ELSIF p_new_state = 'quote_pending' THEN
    -- Work is paused for a quote: a finish code verified before it must not complete the job later.
    UPDATE public.job_codes SET status = 'invalidated'
    WHERE job_id = p_job_id AND purpose = 'finish' AND status IN ('active', 'used');
  ELSIF p_new_state IN ('cancelled', 'completed', 'closed') THEN
    UPDATE public.job_codes SET status = 'invalidated'
    WHERE job_id = p_job_id AND status = 'active';
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 3. admin_cancel_job
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cancel_job(
  p_job_id uuid,
  p_expected_state text,
  p_reason text,
  p_customer_reason_category text
)
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
$function$;

REVOKE ALL ON FUNCTION public.admin_cancel_job(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_job(uuid, text, text, text) TO authenticated, service_role;
