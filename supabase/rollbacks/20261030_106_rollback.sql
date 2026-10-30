-- Rollback snapshot of live function bodies taken before applying 20261030_106 (A3.2).
-- Restore with: supabase db query --linked -f this file, then drop admin_reconcile_job per docs/A3_2_RECOVERY_DESIGN.md §9.
BEGIN;
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
  -- Fetch the job's customer_id
  SELECT customer_id INTO v_job_customer_id
  FROM public.jobs
  WHERE id = NEW.job_id;
  
  -- Map state transitions to notification types
  v_notification_type := CASE NEW.to_state
    WHEN 'accepted' THEN 'job_assigned'
    WHEN 'on_the_way' THEN 'arrived'
    WHEN 'arrived' THEN 'arrived'
    WHEN 'in_progress' THEN 'arrived'
    WHEN 'completed' THEN 'job_completed'
    WHEN 'cancelled' THEN 'cancellation'
    ELSE NULL
  END;
  
  -- Only create notification if there's a mapped type
  IF v_notification_type IS NOT NULL AND v_job_customer_id IS NOT NULL THEN
    INSERT INTO public.notification_logs (
      customer_id,
      job_id,
      notification_type,
      channel_attempted,
      status
    ) VALUES (
      v_job_customer_id,
      NEW.job_id,
      v_notification_type,
      'whatsapp',
      'pending'
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the state transition
  -- This ensures job state changes are never blocked by notification failures
  RAISE WARNING 'on_job_state_transition failed for job %: %', NEW.job_id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_reconcile_job(uuid,text,text);
-- DROP TABLE public.admin_reconciliations;  -- only if no rows were reconciled
COMMIT;
