-- A4 / 116  BOOKING/JOB LIFECYCLE DRIFT DETECTION    *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- Scope: DETECTION ONLY. This file changes no existing row and installs no trigger.
-- Observed read-only 2026-11-01 (bookings LEFT JOIN jobs; 15 rows):
--   booking pending   / job cancelled   x3     booking confirmed / job cancelled   x2
--   booking pending   / job closed      x1     booking pending   / job in_progress x1
--   booking pending   / job completed   x1     booking confirmed / job completed   x1
--   (professional_id agrees on all 15 rows)
-- So bookings.booking_status is NOT kept in sync by the job state machine; only admin_cancel_job,
-- customer_cancel_booking and reconcile write it. The booking_status value set could not be read (no enum or check
-- constraint found on bookings); only pending / confirmed / cancelled have been OBSERVED. Do not assume others.
BEGIN;

CREATE OR REPLACE VIEW public.a4_assignment_drift WITH (security_invoker = true) AS
SELECT b.id AS booking_id, j.id AS job_id, b.booking_status::text AS booking_status, j.current_state AS job_state,
       b.professional_id AS booking_professional_id, j.professional_id AS job_professional_id,
       CASE
         WHEN j.id IS NULL AND b.professional_id IS NOT NULL                    THEN 'booking_has_pro_but_no_job'
         WHEN b.professional_id IS DISTINCT FROM j.professional_id               THEN 'professional_mismatch'
         WHEN j.current_state = 'cancelled' AND b.booking_status::text <> 'cancelled' THEN 'job_cancelled_booking_not'
         WHEN j.current_state IN ('completed','closed') AND b.booking_status::text IN ('pending','cancelled')
                                                                                  THEN 'job_finished_booking_not'
         WHEN j.current_state IN ('on_the_way','arrived','in_progress','quote_pending')
              AND b.booking_status::text = 'pending'                              THEN 'job_active_booking_pending'
       END AS drift_kind
  FROM public.bookings b LEFT JOIN public.jobs j ON j.booking_id = b.id;
-- security_invoker: callers see only rows RLS lets them see; admin console reads it through admin-checked server code.
REVOKE ALL ON public.a4_assignment_drift FROM PUBLIC, anon;
GRANT SELECT ON public.a4_assignment_drift TO authenticated, service_role;
COMMIT;

-- PROPOSED, NOT INCLUDED (needs owner decision D-A4-7 and the booking_status value set):
--   An AFTER UPDATE OF current_state trigger on jobs setting bookings.booking_status:
--     cancelled -> 'cancelled'; accepted..quote_pending -> 'confirmed'; completed/closed -> a terminal value that exists.
--   Backfill of the 6 drifted rows would modify real customer bookings: requires explicit separate authorization and
--   must exclude booking c779c0d4. Until then the drift view is the safe, read-only protection.
-- KNOWN INCOMPLETE: view columns assume bookings.professional_id exists (confirmed via the join above); the status
--   CASE arms cover observed values only.
