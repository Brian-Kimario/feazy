-- Rollback for 20261102_117. Rows left in 'processing' or 'expired' are returned to 'pending' first.
UPDATE public.notification_logs SET status = 'pending' WHERE status IN ('processing', 'expired');
DROP FUNCTION IF EXISTS public.complete_notification(uuid, uuid, text, text, text, text, int);
DROP FUNCTION IF EXISTS public.claim_notifications(uuid, int, interval, interval, int);
DROP INDEX IF EXISTS public.idx_notification_logs_dispatch;
ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_status_check;
-- Columns are kept (additive, harmless); drop manually if wanted.
