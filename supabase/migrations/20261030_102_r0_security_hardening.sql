-- R0 security hardening (pre-production audit findings F-04, F-11).
--
-- 1. audit_logs integrity. The table had a public INSERT policy (user_id = auth.uid()), so any
--    signed-in user could write arbitrary audit rows, and anon/authenticated held UPDATE, DELETE
--    and TRUNCATE grants. Audit rows are now written only by trusted server code (service_role)
--    and are append-only: users keep SELECT on their own rows, nobody can edit or remove a row.
-- 2. Trigger functions on_job_state_transition and sync_profile_email were executable by anon
--    and authenticated through the default PUBLIC grant. Triggers fire without an EXECUTE grant,
--    so the grant is revoked, and sync_profile_email now pins its search_path.

DROP POLICY IF EXISTS audit_logs_insert_own ON public.audit_logs;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.audit_logs_block_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_logs_block_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_block_mutation();

REVOKE ALL ON FUNCTION public.on_job_state_transition() FROM PUBLIC, anon, authenticated;
-- sync_profile_email exists in production but no migration in this repo creates it, so guard the
-- grant and search_path changes for databases (such as a fresh local replay) where it is absent.
DO $$ BEGIN
  IF to_regprocedure('public.sync_profile_email()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.sync_profile_email() SET search_path TO 'public';
  END IF;
END $$;
