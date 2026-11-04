-- The original "Admins can read all profiles" policy (001) checks admin status with a subquery on public.profiles.
-- A SELECT policy on profiles that reads profiles applies RLS to that subquery again, so every read of profiles by
-- an authenticated user fails with 42P17 "infinite recursion detected in policy". getUserRole() reads profiles at
-- sign-in, so this blocks sign-in for every role.
-- The admin check moves into a SECURITY DEFINER helper, which reads profiles without applying RLS. This is the same
-- pattern _require_admin() already uses. The policy keeps its name and meaning.

CREATE OR REPLACE FUNCTION public._is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'::public.user_role);
$$;

REVOKE ALL ON FUNCTION public._is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_admin_user() TO authenticated;

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public._is_admin_user());
