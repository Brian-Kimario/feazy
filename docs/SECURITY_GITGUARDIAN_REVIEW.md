# GitGuardian review (PR #5, 2026-11-03)

**Conclusion: the 24 "Supabase JWT Secret" findings on PR #5 are false positives. A separate, real exposure exists in git history and is tracked below.**

## The 24 findings
All 24 are in `supabase/dry-runs/106|107|108*.dryrun.sql`. Each is a synthetic
`set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` used to impersonate a user
inside a rolled-back dry run. There is no signature and no signing secret, so it cannot authenticate anywhere.
Safe to dismiss as "false positive / test fixture". Only these three files were checked; dismiss them individually, not in bulk.

## The real exposure (not among the 24)
`check_migrations.js`, `verify_rls.js` and `test_connection.js` hardcoded the project's `service_role` and `anon`
JWTs. The files were removed in commit 0a3c975, but the service-role key remains in public git history
(introduced in 44d730c) on several branches. Removal does not revoke it.

Required: rotate it (see the rotation procedure delivered with the post-merge report). Until rotated, treat the
database as accessible to anyone who read the repository. The key value is intentionally not recorded here.

## Prevention
Scripts under `scripts/` read `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`; none hardcode secrets.
