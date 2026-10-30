-- Rollback for 20261030_104_professional_verification_state_machine.sql
-- NOT run automatically. Review, then run in one transaction:
--   supabase db query --linked -f supabase/rollbacks/20261030_104_professional_verification_state_machine.rollback.sql
--
-- BEFORE running: export the history, it is dropped below.
--   \copy (select * from professional_verification_events) to 'pv_events_backup.csv' csv header
--
-- Effect: returns the guard to its 20261030_102 behaviour. Verification statuses already changed
-- stay as they are. After rollback the app code in this change will not work; revert it too.

BEGIN;

DROP TRIGGER IF EXISTS jobs_guard_professional_verified ON public.jobs;
DROP FUNCTION IF EXISTS public.guard_job_professional_verified();

DROP FUNCTION IF EXISTS public.admin_transition_professional_verification(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_professional_verification();
DROP FUNCTION IF EXISTS public._verification_missing_documents(uuid, timestamptz);

ALTER TABLE public.professional_profiles
  DROP CONSTRAINT IF EXISTS professional_availability_requires_verification;

-- 'withdrawn' attempts cannot satisfy the original CHECKs; convert them to the closest old values.
UPDATE public.booking_assignment_attempts SET outcome = 'declined' WHERE outcome = 'withdrawn';
UPDATE public.booking_assignment_attempts SET reason_code = 'other' WHERE reason_code = 'professional_suspended';
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT IF EXISTS booking_assignment_attempts_outcome_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_outcome_check
  CHECK (outcome = ANY (ARRAY['declined'::text, 'expired'::text]));
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT IF EXISTS booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict'::text, 'too_far'::text, 'not_my_skill'::text, 'need_more_detail'::text, 'other'::text]));

DROP TABLE IF EXISTS public.professional_verification_events;
DROP FUNCTION IF EXISTS public._pv_events_block_mutation();

-- Restore the 20261030_102 guard body: copy guard_professional_profile_protected_columns from
-- supabase/migrations/20261030_102_*.sql and execute it here (CREATE OR REPLACE FUNCTION ...).

COMMIT;
