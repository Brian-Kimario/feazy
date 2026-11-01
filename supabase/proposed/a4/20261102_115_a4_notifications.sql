-- A4 / 115  NOTIFICATIONS FOR ASSIGNMENT EVENTS       *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- Depends on: 113 (event types admin_assign / admin_withdraw_offer / admin_reassign), 114 (professional_withdrew).
-- Both function bodies below are the LIVE bodies read 2026-11-01 with only the marked additions.
-- WARNING for any future test: applying this and then running 113/114 operations against real bookings WILL create
-- in-app notifications for real users. Rollback of a transaction does not recall anything already read by a client.
-- WhatsApp: on_job_state_transition only fires for to_state accepted/on_the_way/arrived/in_progress/completed/cancelled.
-- All new events use to_state 'assigned', so NO notification_logs (WhatsApp) rows are created by A4.
BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind = ANY (ARRAY[
  'job_accepted','eta_shared','running_late','pro_arrived','quote_requested','quote_approved','quote_declined',
  'job_cancelled','job_cancelled_by_admin','job_completed','new_message',
  'professional_changed','assignment_removed','professional_withdrew']));   -- ADDED: last three

CREATE OR REPLACE FUNCTION public._notify(p_user uuid, p_job jobs, p_kind text, p_source_type text, p_source_id uuid, p_body text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_title text; v_body text; v_link text;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
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
    ('new_message',     'You have a new message',                      'Open the job to read and reply.'),
    -- ADDED
    ('professional_changed', 'Your professional has changed',          'We are arranging a replacement for your visit. Open the booking for details.'),
    ('assignment_removed',   'A job was removed from you',             'You no longer need to attend this job.'),
    ('professional_withdrew','Your professional can no longer attend', 'We are finding you a replacement. No action is needed.')
  ) AS t(kind, title, body) WHERE t.kind = p_kind;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Unknown notification kind %', p_kind USING ERRCODE = '22023'; END IF;
  v_link := CASE WHEN p_user = p_job.customer_id
    THEN '/customer/bookings/' || p_job.booking_id::text
    ELSE '/professional/jobs/' || p_job.id::text END;
  INSERT INTO public.notifications (user_id, job_id, kind, title, body, link, source_type, source_id)
  VALUES (p_user, p_job.id, p_kind, v_title, COALESCE(NULLIF(btrim(p_body), ''), v_body), v_link, p_source_type, p_source_id)
  ON CONFLICT (user_id, source_type, source_id) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public._notify_for_event(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_event public.job_events%ROWTYPE; v_job public.jobs%ROWTYPE; v_kind text; v_recipient uuid; v_phrase text; v_body text;
  v_from_pro uuid;
BEGIN
  SELECT * INTO v_event FROM public.job_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

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
    -- ADDED
    WHEN v_event.event_type IN ('admin_assign','admin_withdraw_offer','admin_reassign') THEN 'assignment_removed'
    WHEN v_event.event_type = 'professional_withdrew' THEN 'professional_withdrew'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN RETURN; END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_event.job_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ADDED branch. Rules:
  --  * The professional who LOST the assignment is told (from_professional_id), never the new one via this path:
  --    offers to professionals are surfaced by the existing offer UI, as before (offers notify nobody today).
  --  * The customer is told only if they had been told "accepted" (from_state = 'accepted'): a reassignment of a mere
  --    offer is invisible to them, and an initial admin_assign (from_state 'none') notifies nobody.
  --  * Withdrawal by the professional (accepted -> assigned) tells the customer.
  IF v_event.event_type IN ('admin_assign','admin_withdraw_offer','admin_reassign') THEN
    v_from_pro := NULLIF(v_event.metadata->>'from_professional_id', '')::uuid;
    IF v_from_pro IS NOT NULL THEN
      PERFORM public._notify(v_from_pro, v_job, 'assignment_removed', 'job_event', v_event.id);
    END IF;
    IF v_event.event_type = 'admin_reassign' AND v_event.from_state = 'accepted' THEN
      PERFORM public._notify(v_job.customer_id, v_job, 'professional_changed', 'job_event', v_event.id);
    END IF;
    RETURN;
  ELSIF v_event.event_type = 'professional_withdrew' THEN
    PERFORM public._notify(v_job.customer_id, v_job, 'professional_withdrew', 'job_event', v_event.id);
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
END; $function$;
COMMIT;

-- KNOWN INCOMPLETE / UNVERIFIED:
--  * That notify_on_job_event calls _notify_for_event for EVERY job_events insert (including event types it does not map)
--    was inferred, not re-read this pass. If it filters by event_type, the new types must be added there too.
--  * The old professional's link /professional/jobs/<id> may 404 after reassignment (RLS no longer lets them see the job).
--    Needs a UI decision; the in-app notification text does not depend on following the link.
--  * Recipients of the professional-initiated reconcile ('admin_reconcile') are unchanged.
--  * Notification copy (3 new strings) needs owner approval.
