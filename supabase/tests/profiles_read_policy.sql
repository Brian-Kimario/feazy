-- profiles RLS: a signed-in user reads only their own row, and an admin reads all rows.
-- Regression guard for the recursive "Admins can read all profiles" policy (migration 124).
-- Run against a database where every migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profiles_read_policy.sql
-- Runs in one transaction that is rolled back. A failed ASSERT stops the run.
BEGIN;

CREATE FUNCTION pg_temp.count_profiles_as(p_user uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO r FROM public.profiles;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN 'ok:' || r;
END $f$;

DO $test$
DECLARE
  c_user uuid := '00000000-0000-4000-8000-0000000000f1';
  c_admin uuid := '00000000-0000-4000-8000-0000000000f2';
  v_res text;
  v_total bigint;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (c_user, 'profiles-rls-1@example.invalid'), (c_admin, 'profiles-rls-2@example.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role) VALUES (c_user, 'customer'), (c_admin, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  SELECT count(*) INTO v_total FROM public.profiles;

  v_res := pg_temp.count_profiles_as(c_user);
  ASSERT v_res = 'ok:1', 'a customer must read exactly their own profile without recursion, got ' || v_res;

  v_res := pg_temp.count_profiles_as(c_admin);
  ASSERT v_res = 'ok:' || v_total, 'an admin must read every profile, got ' || v_res || ' expected ' || v_total;

  RAISE NOTICE 'profiles_read_policy: all checks passed';
END $test$;

ROLLBACK;
