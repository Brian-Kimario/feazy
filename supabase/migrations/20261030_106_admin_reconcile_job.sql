-- A3.2: reconcile a live job whose booking was already cancelled.   *** NOT APPLIED — dry-run only ***
--
-- Drift this repairs: bookings.booking_status = 'cancelled' while the job is still 'assigned'
-- (an unmatched job or an outstanding offer). The matcher only looks at pending bookings, so such a
-- job is never offered, never expired and never closed; it sits in the queue forever.
--
-- Scope is deliberately narrow. The function repairs ONLY the unambiguous case and refuses the rest:
--   repairable : booking cancelled, job 'assigned', no paid payment
--   refused    : job accepted/on_the_way/arrived (a professional committed: use admin_cancel_job so the
--                professional and customer are told properly), in_progress/quote_pending, completed,
--                closed, cancelled, any paid payment, booking not cancelled.
-- It reuses the canonical transition (transition_job_state) and never writes jobs.current_state itself.
-- It never touches payments. It does NOT create a second booking state machine: the booking is already
-- cancelled and is not modified.
--
-- Authorization is independent of the GUC: the function checks auth.uid() is an admin, validates the
-- target, locks booking then job (the matcher's lock order), re-checks the expected state under the
-- lock, then runs the canonical transition. The app.admin_cancel_job flag is the existing, unchanged
-- hand-off that transition_job_state already requires for an administrator's cancellation; it is set
-- only after every check above has passed and cleared immediately after.
--
-- Notifications:
--   * customer: none. They cancelled the booking, or Fixify did, and was told then. A second
--     "cancelled" message about the same booking would be noise. The WhatsApp queue trigger is
--     therefore skipped for admin_reconcile events.
--   * professional: only if they hold an outstanding offer (neutral wording, via the in-app inbox).
--
-- ROLLBACK (see docs/A3_2_RECOVERY_DESIGN.md §9): drop admin_reconcile_job, restore the two previous
-- function bodies from 20261030_105 / the live definitions, drop admin_reconciliations. Rows already
-- reconciled stay reconciled (their job_events and admin_reconciliations rows are the record).

-- ---------------------------------------------------------------------------------------------
-- internal record (admin read only; written only by admin_reconcile_job)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.admin_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  performed_by uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('cancelled_booking_live_job')),
  job_state_before text NOT NULL,
  booking_status_at_time text NOT NULL,
  had_outstanding_offer boolean NOT NULL,
  internal_reason text NOT NULL CHECK (char_length(internal_reason) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_reconciliations TO authenticated;
CREATE POLICY admin_reconciliations_admin_read ON public.admin_reconciliations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------------------------
-- WhatsApp queue trigger: bookkeeping reconciliation is not a customer-facing cancellation
-- (body otherwise identical to the live definition)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_job_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job_customer_id uuid;
  v_notification_type text;
BEGIN
  IF NEW.event_type = 'admin_reconcile' THEN
    RETURN NEW;
  END IF;

  SELECT customer_id INTO v_job_customer_id
  FROM public.jobs
  WHERE id = NEW.job_id;

  v_notification_type := CASE NEW.to_state
    WHEN 'accepted' THEN 'job_assigned'
    WHEN 'on_the_way' THEN 'arrived'
    WHEN 'arrived' THEN 'arrived'
    WHEN 'in_progress' THEN 'arrived'
    WHEN 'completed' THEN 'job_completed'
    WHEN 'cancelled' THEN 'cancellation'
    ELSE NULL
  END;

  IF v_notification_type IS NOT NULL AND v_job_customer_id IS NOT NULL THEN
    INSERT INTO public.notification_logs (
      customer_id, job_id, notification_type, channel_attempted, status
    ) VALUES (
      v_job_customer_id, NEW.job_id, v_notification_type, 'whatsapp', 'pending'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'on_job_state_transition failed for job %: %', NEW.job_id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- in-app notifications: an admin_reconcile event tells only a professional who held an offer
-- (body identical to the live definition apart from the new event mapping and branch)
-- ---------------------------------------------------------------------------------------------
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
    WHEN v_event.event_type = 'admin_reconcile' AND v_event.to_state = 'cancelled' THEN 'job_cancelled'
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

  IF v_event.event_type = 'admin_reconcile' THEN
    IF v_job.professional_id IS NOT NULL THEN
      PERFORM public._notify(v_job.professional_id, v_job, v_kind, 'job_event', v_event.id,
        'This booking was cancelled, so the offer you held no longer applies. You do not need to attend.');
    END IF;
  ELSIF v_kind IN ('quote_approved', 'quote_declined') THEN
    IF v_job.professional_id IS DISTINCT FROM v_event.actor_user_id THEN
      PERFORM public._notify(v_job.professional_id, v_job, v_kind, 'job_event', v_event.id);
    END IF;
  ELSIF v_kind = 'job_cancelled_by_admin' THEN
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
-- admin_reconcile_job
--   Returns {ok:true,...} on repair, {ok:false,code,message} (nothing written) when refused:
--     STALE_STATE      the job is no longer in the state the admin saw (includes a duplicate request)
--     NOT_ELIGIBLE     the case is not the unambiguous one; needs a person (message says why)
--   Raises for: not authenticated / not admin (42501), malformed input (22023), no such job (P0002).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reconcile_job(
  p_job_id uuid,
  p_expected_state text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_reason text := btrim(p_reason);
  v_booking_id uuid;
  v_booking_status text;
  v_job public.jobs%ROWTYPE;
  v_decision uuid;
  v_paid integer;
  v_had_offer boolean;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can reconcile jobs' USING ERRCODE = '42501';
  END IF;
  IF p_job_id IS NULL OR p_expected_state IS NULL THEN
    RAISE EXCEPTION 'Job and expected state are required' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;

  -- booking first, then job: the same order the matcher uses, so the two cannot deadlock
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;
  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT booking_status INTO v_booking_status FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state <> p_expected_state THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_STATE',
      'message', format('The job is now %s, not %s. Refresh and review.', v_job.current_state, p_expected_state));
  END IF;
  IF v_booking_status IS DISTINCT FROM 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', format('The booking is %s, not cancelled. Use job cancellation instead.', v_booking_status));
  END IF;
  IF v_job.current_state <> 'assigned' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', format('The job is %s. Only an unaccepted (assigned) job can be reconciled automatically; use job cancellation so the people involved are told.', v_job.current_state));
  END IF;

  SELECT count(*) INTO v_paid FROM public.payments
  WHERE status = 'paid' AND (job_id = p_job_id OR booking_id = v_job.booking_id);
  IF v_paid > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'message', 'A payment was captured for this booking. It needs a person to review the payment before the job is changed.');
  END IF;

  v_had_offer := v_job.professional_id IS NOT NULL;

  PERFORM set_config('app.admin_cancel_job', p_job_id::text, true);
  PERFORM public.transition_job_state(
    p_job_id, 'cancelled', v_admin,
    jsonb_build_object('event_type', 'admin_reconcile', 'booking_status', v_booking_status));
  PERFORM set_config('app.admin_cancel_job', '', true);

  IF v_had_offer THEN
    SELECT id INTO v_decision FROM public.matching_decisions
    WHERE job_id = p_job_id AND professional_id = v_job.professional_id AND kind = 'offered'
    ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.booking_assignment_attempts
      (booking_id, professional_id, outcome, reason_code, reason, decision_id)
    VALUES (v_job.booking_id, v_job.professional_id, 'withdrawn', 'job_cancelled', NULL, v_decision);
    UPDATE public.jobs SET offer_expires_at = NULL WHERE id = p_job_id;
  END IF;

  INSERT INTO public.admin_reconciliations
    (job_id, booking_id, performed_by, kind, job_state_before, booking_status_at_time,
     had_outstanding_offer, internal_reason)
  VALUES (p_job_id, v_job.booking_id, v_admin, 'cancelled_booking_live_job', v_job.current_state,
          v_booking_status, v_had_offer, v_reason);

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id, 'booking_id', v_job.booking_id,
    'from_state', v_job.current_state, 'to_state', 'cancelled', 'offer_withdrawn', v_had_offer);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reconcile_job(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_job(uuid, text, text) TO authenticated, service_role;
