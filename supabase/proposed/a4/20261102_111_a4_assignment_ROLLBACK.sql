-- DRAFT — NOT APPLIED — rollback for 20261102_111_a4_assignment_draft.sql
-- Safe only before any row uses the new vocabulary. Check first (all must return 0):
--   SELECT count(*) FROM booking_assignment_attempts WHERE outcome = 'reassigned'
--      OR reason_code IN ('admin_withdrawn','admin_reassigned','professional_cancelled');
--   SELECT count(*) FROM job_exceptions WHERE kind <> 'professional_no_show' OR finding IS NOT NULL OR resolution IS NOT NULL;
--   SELECT count(*) FROM matching_decisions WHERE kind = 'manual';
-- If any is non-zero, do NOT drop the constraints; archive the rows to a table first.
-- PATCH POINTS A/B/C must be reverted by re-applying the pre-111 definitions of _offer_next and
-- transition_job_state (take them from supabase/migrations at the commit before promotion).

BEGIN;
DROP VIEW IF EXISTS public.a4_assignment_drift;
DROP FUNCTION IF EXISTS public.admin_assign_professional(uuid, uuid, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public._professional_conflicts(uuid, uuid);
DROP FUNCTION IF EXISTS public._lock_professional_schedule(uuid);
DROP TABLE IF EXISTS public.admin_action_keys;

ALTER TABLE public.job_exceptions DROP COLUMN IF EXISTS finding, DROP COLUMN IF EXISTS resolution;
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_kind_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_kind_check CHECK (kind = 'professional_no_show');
-- preference / reported_by NOT NULL are restored only if no system-raised rows exist (checked above).
ALTER TABLE public.job_exceptions ALTER COLUMN preference SET NOT NULL, ALTER COLUMN reported_by SET NOT NULL;

ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_outcome_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_outcome_check
  CHECK (outcome = ANY (ARRAY['declined','expired','withdrawn']));
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict','too_far','not_my_skill','need_more_detail','other','professional_suspended','job_cancelled']));
COMMIT;
