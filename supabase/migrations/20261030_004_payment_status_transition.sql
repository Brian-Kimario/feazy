-- 20261030_004_payment_status_transition
--
-- Payment status changes go through transition_payment_status(), called only by the
-- Razorpay webhook with the service role. It locks the payment row, applies one of
--   pending -> paid, pending -> failed, failed -> paid
-- records the change in payment_events, and closes the job (completed -> closed) in the
-- same transaction. A payment that is already paid, or already in the requested status,
-- returns 'already_processed' so provider retries are harmless.
--
-- payments.provider_reference holds the Razorpay order id (set by createUPIIntentPayment)
-- and is not overwritten; the Razorpay payment id is kept on the event row.

-- Only the statuses the app writes. The table is empty when this runs.
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check CHECK (status IN ('pending', 'paid', 'failed'));

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  from_status         text NOT NULL,
  to_status           text NOT NULL,
  provider_event      text NOT NULL,
  provider_payment_id text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_events_payment_id_idx ON public.payment_events (payment_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Read-only for the paying customer and for admin/support. Rows are written only by
-- transition_payment_status().
DROP POLICY IF EXISTS payment_events_select_own ON public.payment_events;
CREATE POLICY payment_events_select_own ON public.payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_events.payment_id
        AND (
          p.customer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles actor
            WHERE actor.id = auth.uid()
              AND actor.role = ANY (ARRAY['admin'::user_role, 'support'::user_role])
          )
        )
    )
  );

REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

CREATE OR REPLACE FUNCTION public.transition_payment_status(
  p_provider_reference  text,
  p_new_status          text,
  p_provider_event      text,
  p_provider_payment_id text,
  p_amount_paise        bigint,
  p_currency            text,
  p_metadata            jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_job_state text;
BEGIN
  IF NOT (
    COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles actor
               WHERE actor.id = auth.uid() AND actor.role = 'admin'::user_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed to change payment status' USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'Unsupported payment status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE provider_reference = p_provider_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for reference %', p_provider_reference
      USING ERRCODE = 'P0002';
  END IF;

  -- Retries, and a late failure event after a successful capture, change nothing.
  IF v_payment.status = 'paid' OR v_payment.status = p_new_status THEN
    RETURN 'already_processed';
  END IF;

  IF NOT (
    (v_payment.status = 'pending' AND p_new_status IN ('paid', 'failed'))
    OR (v_payment.status = 'failed' AND p_new_status = 'paid')
  ) THEN
    RAISE EXCEPTION 'Invalid payment transition from % to %', v_payment.status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  IF p_new_status = 'paid' AND (
    p_currency IS DISTINCT FROM v_payment.currency
    OR p_amount_paise IS DISTINCT FROM round(v_payment.amount * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'Captured % % does not match payment % (% %)',
      p_amount_paise, p_currency, v_payment.id, round(v_payment.amount * 100)::bigint, v_payment.currency
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments
  SET status     = p_new_status,
      paid_at    = CASE WHEN p_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = v_payment.id;

  INSERT INTO public.payment_events
    (payment_id, from_status, to_status, provider_event, provider_payment_id, metadata)
  VALUES
    (v_payment.id, v_payment.status, p_new_status, p_provider_event, p_provider_payment_id,
     COALESCE(p_metadata, '{}'::jsonb));

  IF p_new_status = 'paid' AND v_payment.job_id IS NOT NULL THEN
    SELECT current_state INTO v_job_state FROM public.jobs WHERE id = v_payment.job_id;
    IF v_job_state = 'completed' THEN
      PERFORM public.transition_job_state(
        v_payment.job_id,
        'closed',
        v_payment.customer_id,
        jsonb_build_object(
          'event_type', 'payment_captured',
          'payment_id', v_payment.id,
          'provider_payment_id', p_provider_payment_id
        )
      );
    END IF;
  END IF;

  RETURN 'applied';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.transition_payment_status(text, text, text, text, bigint, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_payment_status(text, text, text, text, bigint, text, jsonb)
  TO service_role;
