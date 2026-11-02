# Feazy release: migrations 119 and 120, free inspection and materials

Status: verified on a disposable LOCAL Supabase stack (real Auth, Postgres, PostgREST). Nothing has been applied to the shared project, pushed, deployed, or sent externally. Every step below needs the owner's go-ahead.

## 1. What ships
- DB: `20261102_119_inspection_foundation.sql`, then `20261102_120_materials_and_categories.sql`. Both additive. 120 depends on 119.
- App: inspector workspace `/inspector`, admin `/admin/inspections` and `/admin/catalogue`, booking wizard material selection, customer/professional materials and findings panels.
- Rollbacks: `supabase/rollbacks/` (120 first, then 119). Rolling back after real data exists loses inspections/materials, so back up first.

## 2. Local verification result (this branch)
Playwright journey `tests/e2e/inspection-journey.spec.ts` (opt-in: `E2E_LOCAL_JOURNEY=1`, local stack only), 8 tests passing:
customer wizard with materials and free inspection; admin registers inspector and assigns visit (bad id refused); inspector confirms materials (zero quantity refused) and submits findings; customer sees findings and confirmed materials; admin, catalogue and inspector routes blocked for customers; another customer cannot see the booking; admin availability toggle removes the category from the booking flow and restores it; invalid guide price refused; fixed-price service books with no inspection; professional sees findings and materials and accepts; 375px layouts have no horizontal overflow.
Plus, with real JWTs over PostgREST: on-the-way, arrive, start-code verification (wrong code refused), quote creation, approval by the customer only (stranger and the professional refused, double approval refused). Payments: 0 rows. No inspection fee line in any quote. No external notification keys were configured; only in-app notification rows were written.
Also: 564 to 567 Vitest tests pass, `tsc` clean for `src`.

Defects found and fixed here: mobile booking wizard overflowed by 166px (single auto-width grid column with 8 category tabs); the professional job page did not show the free-inspection findings it is entitled to read.

## 3. Known caveat: repo migrations are not a clean replay of production
Production's applied history differs from the repo (extra `profiles.email`, a narrower `profiles` policy set, 17 recorded migrations through 118). A from-scratch replay of the repo fails on legacy files (`20261001_001`, `20261004_001/003/005`, `20261030_102`). 119 and 120 applied cleanly on top of the live-shaped schema. So: apply ONLY 119 then 120 to production (never `db reset` or a full replay).

## 4. Config
- `.env`: `NEXT_PUBLIC_FREE_INSPECTION=true` only after 119 is live (copy flag; `.env.example` already lists it, default false).
- DB flags (`matching_config`): `free_inspection_enabled` (0 to 1) and `inspection_gate_enabled` (0 to 1). Both default 0.
- Category availability in `/admin/catalogue`: only Electrical (2 verified pros) and Plumbing (1) have coverage. Leave every other category on Coming soon (or Manual assignment) until it has a verified professional.
- Catalogue data: add materials, brands and guide prices in `/admin/catalogue`. `supabase/seeds/local_synthetic_catalogue.sql` is LOCAL ONLY; never run it in production.

## 5. Inspector onboarding
1. Create an account for the inspector and give it the professional role (normal sign-up plus admin role change).
2. In `/admin/inspections`, "Register inspector": paste the account id, name, phone.
3. Inspector signs in via the professional door, lands on `/inspector`.
4. Assign each requested visit from the admin queue; record the actual cost after completion.

## 6. Deployment sequence
1. Owner approval for production changes.
2. Backup: Supabase dashboard backup (or `pg_dump`) of the project; note the restore point. Confirm `supabase/rollbacks/` scripts are present.
3. Apply 119, run sanity SQL (tables exist, `matching_config` flags 0), then apply 120.
4. Deploy the app with `NEXT_PUBLIC_FREE_INSPECTION=false` (app tolerates both migrations present and flags off; existing flows unchanged).
5. Register at least one real inspector; set category availability (Electrical and Plumbing bookable, the rest Coming soon); add real materials and prices.
6. Smoke test as an admin: `/admin/inspections`, `/admin/catalogue`. Book one test inspection with an internal account and walk it through.
7. Flip `matching_config.free_inspection_enabled` to 1, then `inspection_gate_enabled` to 1, then set `NEXT_PUBLIC_FREE_INSPECTION=true` and redeploy.
8. Watch the admin inspection queue and cost totals for the first week.
Rollback: set the two flags to 0 and the env flag to false first (instant, no data loss); revert the app deploy; only then consider the SQL rollbacks.

## 7. Operational dependencies still open
- Real inspectors and their coverage area, plus the city limit for free inspections.
- Verified professionals for every category beyond Electrical and Plumbing.
- Real material catalogue and guide prices; logo and OG assets.
- Domain, DNS and external messaging remain untouched (see `FOUNDER_FEEDBACK_IMPLEMENTATION.md`).
