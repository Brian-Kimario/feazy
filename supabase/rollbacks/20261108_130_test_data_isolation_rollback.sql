-- Rollback for 20261108_130_test_data_isolation.sql.
-- Restores process_assignment_queue to its production body (no is_test predicate), removes the guards,
-- then the flag and the allowlist. Run only with owner approval, in one transaction.
-- Safe to run before any test rows are created; if test rows exist, their is_test flag is lost with the column,
-- so check public.bookings where is_test first and record the IDs.

BEGIN;

DROP TRIGGER IF EXISTS trg_notification_logs_test_isolation ON public.notification_logs;
DROP TRIGGER IF EXISTS trg_jobs_test_isolation ON public.jobs;
DROP TRIGGER IF EXISTS trg_bookings_test_flag ON public.bookings;

DROP FUNCTION IF EXISTS public._notification_logs_test_isolation();
DROP FUNCTION IF EXISTS public._jobs_test_isolation();
DROP FUNCTION IF EXISTS public._bookings_set_test_flag();

-- Production body of process_assignment_queue, before migration 130.
CREATE OR REPLACE FUNCTION public.process_assignment_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_booking record;
  v_expired int := 0;
  v_matched int := 0;
  v_failed int := 0;
  v_unmatched int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('public.process_assignment_queue')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  FOR v_job IN
    SELECT j.id, j.professional_id FROM public.jobs j
    JOIN public.bookings b ON b.id = j.booking_id
    WHERE j.current_state = 'assigned'
      AND j.professional_id IS NOT NULL
      AND j.offer_expires_at IS NOT NULL
      AND j.offer_expires_at < now()
    ORDER BY j.booking_id
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public._release_offer(v_job.id, 'expired', NULL, NULL, v_job.professional_id);
      v_expired := v_expired + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'process_assignment_queue: releasing job % failed: %', v_job.id, SQLERRM;
    END;
  END LOOP;

  FOR v_booking IN
    SELECT b.id, b.customer_id FROM public.bookings b
    LEFT JOIN public.jobs j ON j.booking_id = b.id
    WHERE b.booking_status = 'pending'
      AND b.scheduled_start > now()
      AND (j.id IS NULL OR (j.current_state = 'assigned' AND j.professional_id IS NULL))
    ORDER BY b.id
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    BEGIN
      IF public._assign_booking_internal(v_booking.id, v_booking.customer_id) IS NOT NULL THEN
        v_matched := v_matched + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'process_assignment_queue: offering booking % failed: %', v_booking.id, SQLERRM;
    END;
  END LOOP;

  SELECT count(*) INTO v_unmatched FROM public.bookings
  WHERE booking_status = 'pending' AND unmatched_since IS NOT NULL;

  RETURN jsonb_build_object('expired_offers', v_expired, 'newly_matched', v_matched,
                            'failed', v_failed, 'still_unmatched', v_unmatched);
END;
$$;

DROP FUNCTION IF EXISTS public._is_test_user(uuid);

ALTER TABLE public.bookings DROP COLUMN IF EXISTS is_test;

DROP TABLE IF EXISTS public.test_identities;

COMMIT;
