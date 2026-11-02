-- Rollback for 20261030_105_admin_cancel_job.sql
-- Restores transition_job_state / _notify / _notify_for_event and the three CHECK constraints
-- to their pre-A2 definitions, and removes admin_job_cancellations and admin_cancel_job.
--
-- WARNING: restoring the old transition_job_state re-introduces the NULL-unsafe party check
-- (an unmatched job's cancel is then blocked only by jobs_professional_required).
-- Jobs cancelled by an admin without a professional would violate the restored
-- jobs_professional_required CHECK; clear or convert them first (the final statement lists them).
-- Existing job_events rows with event_type 'admin_cancel' and notifications with kind
-- 'job_cancelled_by_admin' are kept as history; the restored kind CHECK is added NOT VALID so
-- they do not block the rollback.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_cancel_job(uuid, text, text, text);
DROP TABLE IF EXISTS public.admin_job_cancellations;

ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict','too_far','not_my_skill','need_more_detail','other','professional_suspended']))
  NOT VALID;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY['job_accepted','eta_shared','running_late','pro_arrived','quote_requested',
    'quote_approved','quote_declined','job_cancelled','job_completed','new_message']))
  NOT VALID;

ALTER TABLE public.jobs DROP CONSTRAINT jobs_professional_required;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_professional_required
  CHECK (professional_id IS NOT NULL OR current_state = 'assigned') NOT VALID;

DROP FUNCTION public._notify(uuid, public.jobs, text, text, uuid, text);

-- original definitions (captured from the live database before A2 was applied)
CREATE OR REPLACE FUNCTION public._notify(p_user uuid, p_job jobs, p_kind text, p_source_type text, p_source_id uuid)
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
  VALUES (p_user, p_job.id, p_kind, v_title, v_body, v_link, p_source_type, p_source_id)
  ON CONFLICT (user_id, source_type, source_id) DO NOTHING;
END;
$function$
;

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
$function$
;

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
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_caller IS NOT NULL THEN
    IF p_actor_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Actor does not match the signed-in user';
    END IF;
    -- The customer may cancel, and may resume work by answering a quote. Starting a job is the
    -- professional's step, behind the start code.
    IF v_caller <> v_job.professional_id
       AND NOT (v_caller = v_job.customer_id
                AND (
                  (p_new_state = 'cancelled'
                   AND v_job.current_state IN ('quote_pending', 'assigned', 'accepted', 'on_the_way', 'arrived'))
                  OR (p_new_state = 'in_progress' AND v_job.current_state = 'quote_pending')
                )) THEN
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
$function$
;


REVOKE ALL ON FUNCTION public._notify(uuid, public.jobs, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify(uuid, public.jobs, text, text, uuid) TO service_role;

COMMIT;
