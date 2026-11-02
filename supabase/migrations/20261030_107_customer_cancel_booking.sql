-- 20261030_107_customer_cancel_booking
--
-- P1: a customer can cancel their own booking through one audited, owner-verified database call.
--
-- Before this migration the customer cancel capability did not exist in the live database:
-- src/lib/services/bookings.ts cancelBooking() called a transition_booking_state() RPC and relied on a
-- booking_events table that were defined in 20261004_002 but never applied, and nothing in the UI called it.
-- A fresh replay of 20261004_002 would also have created an insecure version (caller-supplied actor and
-- role, EXECUTE granted to every signed-in user). This migration replaces that design.
--
-- 1. booking_events           append-only record of booking status changes (RLS: owner and admin read; no
--                             client writes). Replay-safe against the 20261004_002 shape.
-- 2. transition_booking_state INTERNAL booking state machine (pending|confirmed -> cancelled). Not callable
--                             by clients. Replaces the 20261004_002 function of the same name.
-- 3. customer_cancel_booking  the only customer entry point. Derives the actor from auth.uid(), verifies
--                             ownership, locks booking then job, takes the state the customer saw, cancels the
--                             job through transition_job_state (so notifications, code invalidation and
--                             job_events behave exactly as for every other cancel), withdraws an outstanding
--                             offer, moves the booking, and never changes a payment.
--
-- Nothing here touches admin_cancel_job, admin_reconcile_job or transition_job_state.

-- ---------------------------------------------------------------------------------------------
-- 1. booking_events
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status   text NOT NULL,
  to_status     text NOT NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role    text,
  reason        text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.booking_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'state_transition';

CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON public.booking_events (booking_id, created_at);

ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;

-- The 20261004_002 policy matched bookings.professional_id and the support role; neither is wanted here.
DROP POLICY IF EXISTS booking_events_select_own ON public.booking_events;
DROP POLICY IF EXISTS booking_events_select ON public.booking_events;
CREATE POLICY booking_events_select ON public.booking_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_events.booking_id AND b.customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Written only by transition_booking_state (SECURITY DEFINER). Defence in depth beyond "no write policy".
REVOKE ALL ON public.booking_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_events TO authenticated;
GRANT ALL ON public.booking_events TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. transition_booking_state (internal)
-- ---------------------------------------------------------------------------------------------
-- The vestigial 20261004_002 signature (caller-supplied actor and role, granted to authenticated).
DROP FUNCTION IF EXISTS public.transition_booking_state(uuid, text, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.transition_booking_state(
  p_booking_id    uuid,
  p_new_status    text,
  p_actor_user_id uuid,
  p_actor_role    text,
  p_event_type    text,
  p_reason        text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current text;
BEGIN
  SELECT booking_status INTO v_current FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Explicit allow-list. Job state drives progress; booking_status only records that a request is open or
  -- withdrawn, so cancellation is the one transition anything may make.
  IF NOT COALESCE(p_new_status = 'cancelled' AND v_current IN ('pending', 'confirmed'), false) THEN
    RAISE EXCEPTION 'Invalid booking transition from % to %', v_current, p_new_status USING ERRCODE = '55000';
  END IF;

  UPDATE public.bookings
  SET booking_status = p_new_status, unmatched_since = NULL
  WHERE id = p_booking_id;

  INSERT INTO public.booking_events
    (booking_id, from_status, to_status, actor_user_id, actor_role, event_type, reason, metadata)
  VALUES
    (p_booking_id, v_current, p_new_status, p_actor_user_id, p_actor_role,
     COALESCE(p_event_type, 'state_transition'), p_reason, COALESCE(p_metadata, '{}'::jsonb));

  RETURN true;
END;
$function$;

-- Internal: only other SECURITY DEFINER functions (running as the owner) call it.
REVOKE ALL ON FUNCTION public.transition_booking_state(uuid, text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. customer_cancel_booking
-- ---------------------------------------------------------------------------------------------
-- p_expected_state is what the customer saw: the job's current_state, or 'no_job' when no professional
-- has been matched yet. A refusal that is an ordinary outcome comes back as {ok:false, code, message};
-- authentication, validation and not-found raise (42501, 22023, P0002).
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

REVOKE ALL ON FUNCTION public.customer_cancel_booking(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_booking(uuid, text, text, text) TO authenticated;
