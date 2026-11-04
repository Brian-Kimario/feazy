-- handle_new_user (migrations 005 and 101) writes profiles.email, but no migration created that column.
-- Production already has it, added outside the migration history, so this is a no-op there. On a fresh database
-- it stops every sign-up from failing with "column email of relation profiles does not exist".
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
