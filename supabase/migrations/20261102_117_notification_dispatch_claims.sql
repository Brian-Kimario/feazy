-- 20261102_117: notification dispatch claims. NOT APPLIED to the shared project (needs owner authorization).
--
-- Lets a dispatcher own a queued notification_logs row before it contacts a provider, so overlapping
-- runs cannot send the same row twice, and records the attempt outcome on the row.
--
-- Delivery model: at-least-once for retryable failures, at-most-once for ambiguous ones.
--  * A row is claimed (status 'processing') in one statement with FOR UPDATE SKIP LOCKED. No transaction
--    stays open during the provider call.
--  * A claim not finished within the lease is NOT retried: the provider may have accepted the message
--    before the worker died, so the row becomes 'failed' ("abandoned: outcome unknown") for an admin to
--    review. If the late worker then reports back, complete_notification corrects the row to 'sent'.
--  * Retryable failures return to 'pending' with next_attempt_at (backoff chosen by the caller) until
--    p_max_attempts, then 'failed'. Rows older than the freshness window become 'expired', never sent.
-- Unavoidable duplicate risk: the provider accepts, the worker dies, and a human resends. Provider-side
-- idempotency has not been verified for the Razorpay WhatsApp API, so it is not relied on.

ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS channel_delivered text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_status_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'skipped_dnd', 'expired'));

CREATE INDEX IF NOT EXISTS idx_notification_logs_dispatch
  ON public.notification_logs (created_at)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.claim_notifications(
  p_worker uuid,
  p_limit int DEFAULT 20,
  p_max_age interval DEFAULT interval '6 hours',
  p_lease interval DEFAULT interval '5 minutes',
  p_max_attempts int DEFAULT 5
)
RETURNS TABLE (id uuid, customer_id uuid, job_id uuid, notification_type text, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  UPDATE notification_logs l
     SET status = 'failed', error_message = 'abandoned: outcome unknown, not resent', updated_at = now()
   WHERE l.status = 'processing' AND l.claimed_at < now() - p_lease;

  UPDATE notification_logs l
     SET status = 'expired', error_message = 'older than the freshness window, not sent', updated_at = now()
   WHERE l.status = 'pending' AND l.created_at < now() - p_max_age;

  UPDATE notification_logs l
     SET status = 'failed', error_message = coalesce(l.error_message, 'retry limit reached'), updated_at = now()
   WHERE l.status = 'pending' AND l.attempts >= p_max_attempts;

  RETURN QUERY
  WITH picked AS (
    SELECT n.id FROM notification_logs n
     WHERE n.status = 'pending'
       AND n.attempts < p_max_attempts
       AND coalesce(n.next_attempt_at, n.created_at) <= now()
     ORDER BY n.created_at
     LIMIT greatest(p_limit, 0)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE notification_logs l
     SET status = 'processing', claimed_by = p_worker, claimed_at = now(),
         last_attempt_at = now(), attempts = l.attempts + 1, updated_at = now()
    FROM picked
   WHERE l.id = picked.id
  RETURNING l.id, l.customer_id, l.job_id, l.notification_type, l.attempts;
END;
$$;

-- p_outcome: 'sent' | 'retry' | 'failed'. Returns false when the caller no longer owns the row.
CREATE OR REPLACE FUNCTION public.complete_notification(
  p_id uuid,
  p_worker uuid,
  p_outcome text,
  p_channel text DEFAULT NULL,
  p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_retry_after_seconds int DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_outcome NOT IN ('sent', 'retry', 'failed') THEN
    RAISE EXCEPTION 'invalid outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  UPDATE notification_logs l
     SET status = CASE p_outcome WHEN 'sent' THEN 'sent' WHEN 'retry' THEN 'pending' ELSE 'failed' END,
         sent_at = CASE WHEN p_outcome = 'sent' THEN now() ELSE l.sent_at END,
         channel_delivered = CASE WHEN p_outcome = 'sent' THEN p_channel ELSE l.channel_delivered END,
         provider_message_id = coalesce(p_provider_id, l.provider_message_id),
         error_message = CASE WHEN p_outcome = 'sent' THEN NULL ELSE left(p_error, 500) END,
         next_attempt_at = CASE WHEN p_outcome = 'retry' THEN now() + make_interval(secs => greatest(p_retry_after_seconds, 0)) END,
         claimed_by = CASE WHEN p_outcome = 'retry' THEN NULL ELSE l.claimed_by END,
         updated_at = now()
   WHERE l.id = p_id
     AND l.claimed_by = p_worker
     AND (l.status = 'processing'
          OR (p_outcome = 'sent' AND l.status = 'failed' AND l.error_message LIKE 'abandoned:%'));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notifications(uuid, int, interval, interval, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_notification(uuid, uuid, text, text, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notifications(uuid, int, interval, interval, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_notification(uuid, uuid, text, text, text, text, int) TO service_role;
