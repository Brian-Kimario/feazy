-- Payment amount: sum every approved quote on the job, not only the latest one.
--
-- Before: the amount was the total of the single most recent approved quote, so a second
-- approved quote (extra work) replaced the first and the customer paid only for the last one.
-- After: the amount is the sum of all approved quote totals. The base-price fallback is unchanged:
-- it applies only when no approved quote exists.
--
-- Open founder decision (not changed here): for a fixed-price booking, an approved quote still
-- replaces bookings.quoted_or_base_amount instead of being added to it.
--
-- Signature and grants are unchanged, so callers (create_pending_payment, job_payment_amount) need no change.

CREATE OR REPLACE FUNCTION public._job_payment_amount(
  p_job_id   uuid,
  p_customer uuid,
  OUT amount   numeric,
  OUT quote_id uuid,
  OUT booking_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_quotes_total numeric;
  v_latest_quote uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND OR p_customer IS NULL OR v_job.customer_id IS DISTINCT FROM p_customer THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.current_state <> 'completed' THEN
    RAISE EXCEPTION 'Payment is only available once the job is complete (current state: %)',
      v_job.current_state USING ERRCODE = '22023';
  END IF;

  booking_id := v_job.booking_id;

  SELECT sum(q.total), (array_agg(q.id ORDER BY q.created_at DESC, q.id DESC))[1]
    INTO v_quotes_total, v_latest_quote
  FROM public.quotes q
  WHERE q.job_id = p_job_id AND q.status = 'approved' AND q.total > 0;

  IF v_quotes_total IS NOT NULL THEN
    amount := v_quotes_total;
    quote_id := v_latest_quote;
  ELSE
    quote_id := NULL;
    SELECT b.quoted_or_base_amount INTO amount
    FROM public.bookings b
    WHERE b.id = v_job.booking_id AND b.quoted_or_base_amount > 0;
  END IF;

  IF amount IS NULL THEN
    RAISE EXCEPTION 'No payable amount: the job has no approved quote or booking price'
      USING ERRCODE = '22023';
  END IF;

  amount := round(amount, 2);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._job_payment_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;
