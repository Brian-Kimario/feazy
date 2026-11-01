-- ROLLBACK for A4 / 112. DRAFT. NOT EXECUTED. Apply only after 113-115 are rolled back.
-- Precondition (run first, must return 0): any rows using the new vocabulary block the rollback.
--   select count(*) from booking_assignment_attempts where reason_code in ('admin_withdrawn','admin_reassigned','professional_withdrew');
--   select count(*) from job_exceptions where kind='professional_suspended_active_job' or preference='admin';
BEGIN;
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_resolution_complete;
ALTER TABLE public.job_exceptions DROP COLUMN resolution, DROP COLUMN finding;
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_preference_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_preference_check
  CHECK (preference = ANY (ARRAY['reassign','support']));
ALTER TABLE public.job_exceptions DROP CONSTRAINT job_exceptions_kind_check;
ALTER TABLE public.job_exceptions ADD CONSTRAINT job_exceptions_kind_check CHECK (kind = 'professional_no_show');
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY['schedule_conflict','too_far','not_my_skill','need_more_detail','other','professional_suspended','job_cancelled']));
DROP TABLE public.admin_operation_requests;
DROP FUNCTION public._require_admin();
COMMIT;
