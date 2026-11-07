-- 130: test-data isolation inside the production project.
-- Applied to production project azmajqztvcuwajaaldqm, ledger version 20261107142450 (name test_data_isolation).
-- The statements below are exactly those applied. Only the in-function comments were dropped on apply;
-- the function bodies are otherwise identical (verified by normalised hash, see the PR description).
--
-- Rules enforced server-side:
--   * Eligibility comes only from public.test_identities (allowlist of auth user IDs).
--   * bookings.is_test is derived from the customer on insert and cannot be changed afterwards.
--   * A test booking can only be assigned to an allowlisted test professional, and vice versa (on jobs).
--   * process_assignment_queue never offers a test booking.
--   * notification_logs rows for a test customer or test job are stored as 'expired' (never sent).

BEGIN;

CREATE TABLE IF NOT EXISTS public.test_identities (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_identities FROM PUBLIC, anon, authenticated;

INSERT INTO public.test_identities (user_id, label)
SELECT u.id, v.label
FROM (VALUES
  ('a56652e0-6cce-471c-9926-d168b288a123'::uuid, 'admin.test@fixify.dev'),
  ('f38e0a73-7e04-44b5-8dd6-9a42b0378da4'::uuid, 'support.test@fixify.dev'),
  ('5a100000-0000-4000-8000-000000000001'::uuid, 'synthetic.pro.reject@fixify.invalid'),
  ('5a100000-0000-4000-8000-000000000002'::uuid, 'synthetic.pro.approve@fixify.invalid'),
  ('5a100000-0000-4000-8000-000000000003'::uuid, 'synthetic.pro.nodocs@fixify.invalid'),
  ('5b100000-0000-4000-8000-000000000001'::uuid, 'synthetic.pro.rv1@fixify.invalid'),
  ('5b100000-0000-4000-8000-000000000002'::uuid, 'synthetic.pro.rv2@fixify.invalid')
) AS v(user_id, label)
JOIN auth.users u ON u.id = v.user_id
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._is_test_user(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.test_identities t WHERE t.user_id = p_user)
$$;

REVOKE ALL ON FUNCTION public._is_test_user(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._bookings_set_test_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_test := public._is_test_user(NEW.customer_id);
  ELSIF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'is_test is set by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_test_flag ON public.bookings;
CREATE TRIGGER trg_bookings_test_flag
  BEFORE INSERT OR UPDATE OF is_test ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public._bookings_set_test_flag();

CREATE OR REPLACE FUNCTION public._jobs_test_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_booking_is_test boolean;
BEGIN
  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
     AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id THEN
    RETURN NEW;
  END IF;

  SELECT b.is_test INTO v_booking_is_test FROM public.bookings b WHERE b.id = NEW.booking_id;

  IF COALESCE(v_booking_is_test, false) IS DISTINCT FROM public._is_test_user(NEW.professional_id) THEN
    RAISE EXCEPTION 'test and real activity cannot be assigned to each other'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_test_isolation ON public.jobs;
CREATE TRIGGER trg_jobs_test_isolation
  BEFORE INSERT OR UPDATE OF professional_id, booking_id ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public._jobs_test_isolation();

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
      AND NOT b.is_test
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

CREATE OR REPLACE FUNCTION public._notification_logs_test_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public._is_test_user(NEW.customer_id)
     OR EXISTS (SELECT 1 FROM public.jobs j JOIN public.bookings b ON b.id = j.booking_id
                 WHERE j.id = NEW.job_id AND b.is_test) THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_logs_test_isolation ON public.notification_logs;
CREATE TRIGGER trg_notification_logs_test_isolation
  BEFORE INSERT ON public.notification_logs
  FOR EACH ROW EXECUTE FUNCTION public._notification_logs_test_isolation();

COMMIT;
