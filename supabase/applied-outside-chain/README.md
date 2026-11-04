# Applied outside the migration chain

Files in this folder are already applied to production but are **not** part of the
fresh-database replay chain in `supabase/migrations/`.

- `20261104_127_booking_prerequisites.sql` (md5 `97630d28f14109e10e1f5cb9a737134e`)
  - Applied to production; its stored SQL matches this file.
  - Not idempotent over migrations 119–126, which already create its objects. Replaying it after them fails with `policy "inspectors_select_self_or_admin" ... already exists`.
  - Do not replay it, and do not edit it.

Keep this folder out of `supabase/migrations/`. Fresh databases are built from `supabase/migrations/` (001–126 plus 128).
