-- ROLLBACK for A4 / 113. DRAFT. NOT EXECUTED. Drops functions only; rows written by them (job_events,
-- booking_assignment_attempts, matching_decisions, admin_operation_requests) are left in place as history.
-- ORDER: roll back 114 first (it relies on nothing here at runtime, but 114's admin_resolve_exception uses _idem_begin/_idem_finish).
BEGIN;
DROP TRIGGER IF EXISTS jobs_guard_recovery_edge ON public.jobs;
DROP FUNCTION IF EXISTS public.jobs_guard_recovery_edge();
DROP FUNCTION IF EXISTS public.admin_reassign_job(uuid,text,uuid,uuid,text,uuid);
DROP FUNCTION IF EXISTS public.admin_withdraw_offer(uuid,uuid,text,uuid);
DROP FUNCTION IF EXISTS public.admin_assign_professional(uuid,uuid,text,uuid,text,uuid);
DROP FUNCTION IF EXISTS public._idem_finish(uuid,text,uuid,jsonb);
DROP FUNCTION IF EXISTS public._idem_begin(uuid,text,uuid,text);
COMMIT;
-- Caveat: a job moved accepted -> assigned by admin_reassign_job stays 'assigned' after rollback; it is a valid
-- state in the original machine and will expire or be accepted normally.
