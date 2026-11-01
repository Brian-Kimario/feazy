-- A4 / 112  VOCABULARY, ADMIN GUARD, IDEMPOTENCY  (REVISION 2)   *** DRAFT. NOT APPLIED. NOT EXECUTED. ***
-- NOT parsed or tested by PostgreSQL.
-- Depends on: nothing. Required by 113, 114, 115.
-- Live constraints this widens (read 2026-11-01):
--   booking_assignment_attempts_reason_code_check, job_exceptions_kind_check,
--   job_exceptions_preference_check.  matching_decisions is NOT changed: admin offers use kind 'offered'.
BEGIN;

-- Authorization primitive for every privileged RPC. A caller must be a real signed-in user
-- (auth.uid() is NULL for service_role and for anon) whose profiles.role is 'admin'.
-- Reads profiles with the definer's rights; role is NEVER taken from a parameter or JWT claim.
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC, anon, authenticated, service_role;
-- NB: the admin_* functions are SECURITY DEFINER and owned by postgres, so they call it internally;
-- authenticated callers never need EXECUTE on the helper itself.

-- Idempotency ledger. One row per (admin, operation, client request id).
CREATE TABLE public.admin_operation_requests (
  admin_id      uuid        NOT NULL REFERENCES public.profiles(id),
  operation     text        NOT NULL,
  request_id    uuid        NOT NULL,
  request_hash  text        NOT NULL,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, operation, request_id)
);
ALTER TABLE public.admin_operation_requests ENABLE ROW LEVEL SECURITY;
-- No policies: not readable or writable through PostgREST. Only SECURITY DEFINER functions touch it.
REVOKE ALL ON public.admin_operation_requests FROM PUBLIC, anon, authenticated;

-- Attempt reasons for administrator and professional withdrawals.
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict','too_far','not_my_skill','need_more_detail','other',
    'professional_suspended','job_cancelled',
    'admin_withdrawn','admin_reassigned','professional_withdrew']));

-- Exceptions (REVISION 2): two more kinds, explicit findings so an allegation is never recorded as a fact, and a record of
-- HOW a closure was evidenced. See docs/A4_DESIGN.md section 10 for the full finding x resolution contract.
--   professional_no_show               customer allegation (live)
--   professional_suspended_active_job  system-raised when a suspended professional still holds in-flight work (114)
--   professional_withdrawal_request    professional asked to leave a job at/after its start or once under way (114)
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_kind_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_kind_check
  CHECK (kind = ANY (ARRAY['professional_no_show','professional_suspended_active_job','professional_withdrawal_request']));
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_preference_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_preference_check
  CHECK (preference = ANY (ARRAY['reassign','support','admin']));   -- 'admin' = system/professional-raised, no customer preference
ALTER TABLE public.job_exceptions
  ADD COLUMN detail           text CHECK (detail IS NULL OR length(detail) <= 500),
  ADD COLUMN finding          text CHECK (finding IN ('confirmed','not_confirmed','inconclusive')),
  ADD COLUMN resolution       text CHECK (resolution IN ('reassigned','cancelled','customer_declined','no_action')),
  ADD COLUMN resolution_basis text CHECK (resolution_basis IN ('system_verified','admin_attested'));
-- Row-shape contract (status values 'open' | 'resolved' | 'dismissed' are the live ones, re-verify before applying):
--   open      : finding NULL, or 'inconclusive' (an investigation note, NOT a closure); no resolution, no resolver.
--   resolved  : finding 'confirmed' ; resolution, basis, resolver and time all present.
--   dismissed : finding 'not_confirmed' ; resolution must be 'no_action'; basis, resolver and time present.
-- 'inconclusive' can therefore never appear on a closed row: it cannot equal "resolved".
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_resolution_complete CHECK (
     (status = 'open' AND resolution IS NULL AND resolution_basis IS NULL AND resolved_by IS NULL AND resolved_at IS NULL
        AND (finding IS NULL OR finding = 'inconclusive'))
  OR (status = 'resolved'  AND finding = 'confirmed' AND resolution IS NOT NULL AND resolution_basis IS NOT NULL
        AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  OR (status = 'dismissed' AND finding = 'not_confirmed' AND resolution = 'no_action' AND resolution_basis IS NOT NULL
        AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL));
-- Verified read-only 2026-11-01: job_exceptions has 0 rows, so the check cannot be violated at apply time.
-- Re-run `select status, count(*) from job_exceptions group by 1` immediately before applying; if rows exist, this
-- constraint must be added NOT VALID and the rows reviewed first.

COMMIT;
