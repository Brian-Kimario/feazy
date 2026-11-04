# Release candidate package: booking pricing, quotes, assessment and service areas

Branch: `feat/founder-revisions` (local only; not pushed, not merged, not deployed).
Companion doc: [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md) (pricing, quote, assessment and service-area rules, with what is verified).

**Status: local release candidate, not released.** Migrations 119–126 replay on a fresh disposable database. The changed SQL suites pass on that replay and on the main local database, and the type check, unit tests, production build and Chromium inspection journey pass (section 8). Production has none of migrations 119–126, the leaked legacy service-role key has not been revoked, and no release decision has been made. Section 11 is the readiness matrix: every release step is NO until its blocker is cleared.

## 1. Scope of this release

- Transactional price check in `create_booking` (`P0003`, no row created on mismatch).
- Structured booking path: `create_booking_with_materials` (materials, quantities, budget, idempotent retry by client request id).
- Free-inspection safeguards: per-customer lock, rate limit (`P0007`), duplicate open inspection (`P0005`), inspector check (`P0006`), inspection visit created when the gate is on.
- Quote accounting by kind (migrations 122 and 123): repair quotes and additional-work quotes are separate; newer repair revisions supersede earlier ones.
- Completion gate in Postgres (migration 123): a repair job cannot complete without an approved repair quote.
- Sign-in fix (migration 124): the admin read policy on `profiles` no longer recurses. Check production first (section 2).
- Profile e-mail column for fresh databases (migration 121).
- **Assessment state (migration 125).** A repair job (`quote_after_inspection`) moves `arrived` → `assessing`, not straight to `in_progress`. The professional sends the repair quote from `assessing`. Additional-work quotes are refused while assessing. Verified by `assessing_state.sql`.
- **Service-area gate (migration 126).** `create_booking` refuses a property whose city has no verified professional with an active service area (`P0008`). Nothing is written, and the customer sees "We do not serve this area yet." Verified by `service_area_gate.sql`.
- **Legacy path switch (migration 126).** `matching_config.legacy_booking_path_enabled` (default `1`). With `0`, a booking call without a client request id is refused (`P0009`), and the customer is asked to refresh.
- App state lists include `assessing` (messaging, cancellation review, admin operations, the progress rail and the transition buttons). Live database functions were audited against the app list: the four that lack `assessing` are intentionally excluded or notification-only.

Not in this release: inspector capacity and calendar (an inspector is checked only for `is_active`), inspection no-show flow, admin overrides written to `audit_logs`, an in-app notification for `assessing` (the customer sees the state in the app only), and any universal minimum charge (none exists, by design).

## 2. Migration sequence, preflight and backup

Apply forward only, in this order. Do not skip or reorder. Stop on the first error, and run each file in its own transaction.

1. `supabase/migrations/20261102_119_inspection_foundation.sql`
2. `supabase/migrations/20261102_120_materials_and_categories.sql`
3. `supabase/migrations/20261102_121_profiles_email_column.sql`
4. `supabase/migrations/20261104_122_payment_sums_approved_quotes.sql`
5. `supabase/migrations/20261104_123_quote_accounting_and_completion_gate.sql`
6. `supabase/migrations/20261104_124_profiles_admin_read_policy.sql`
7. `supabase/migrations/20261104_125_assessing_state.sql` (needs 123: wraps the core transition)
8. `supabase/migrations/20261104_126_service_area_gate.sql` (needs 119 and 120: redefines the booking RPC)

**Preflight (read-only; only after the owner authorises production access):**

- Confirm the production project ref is `azmajqztvcuwajaaldqm` before running anything.
- Confirm migration history: 119–124 expected present, 125 and 126 absent.
- Confirm `jobs.current_state` holds only the known states.
- Check whether production's `profiles` admin read policy is recursive. This decides whether 124 is needed there.
- Count repair jobs (`services.pricing_model = 'quote_after_inspection'`) in `arrived` or `in_progress` with no approved repair quote. Jobs in `arrived` will take the assessment step after 125.
- Coverage check: bookings in the last 30 days whose property city has no verified, active service area. Migration 126 will refuse new bookings in those cities.
- Record row counts for `bookings`, `jobs`, `quotes`, `matching_config` before and after.

**Backup.** Take a fresh backup or point-in-time snapshot and record its identifier before the first production write. **Owner action.**

**Expected production effect (not checked against production in this pass):**

| Migration | Effect |
|---|---|
| 119 | Adds the switches, inspectors, inspection visits and `get_booking_free_inspection`. Drops the six-argument `create_booking` (`DROP FUNCTION IF EXISTS`, line 204) and creates the nine-argument version with defaults. The legacy app call uses named arguments, so it resolves to the new function. Switch stays `0`. |
| 120 | Adds `service_materials`, `create_booking_with_materials`, `set_booking_material_preferences`, `budget_preference` and `quantity`. Drops the earlier `set_booking_material_preferences(uuid, uuid[])` (line 68) and `create_booking_with_materials(..., uuid[])` (line 210). |
| 121 | `ADD COLUMN IF NOT EXISTS profiles.email`. A no-op where the column already exists. |
| 122 | Replaces `_job_payment_amount` so the payable amount sums approved quotes. Signature unchanged. |
| 123 | Adds `quotes.quote_kind` (`repair` or `additional_work`; fixed-price repair quotes are backfilled to `additional_work`), `revision`, and the `create_quote(..., p_quote_kind)` argument. Wraps `transition_job_state` with the completion gate; the original becomes `_transition_job_state_core`. |
| 124 | Replaces the admin read policy on `profiles` with a `SECURITY DEFINER` helper. Without it, a non-owner profile read on a database with the recursive policy fails with `42P17`, which blocks sign-in. |
| 125 | Adds `assessing` to the state machine and redefines the functions that check job state (the core transition, `create_quote`, `respond_to_quote`, cancellation, messaging, media, inspection submission, no-show and withdrawal, and admin recovery). Existing rows are not changed. Jobs already in `arrived` take the new rules at their next move. |
| 126 | Adds `matching_config.legacy_booking_path_enabled` = `1`. Redefines `create_booking` to refuse unserved cities (`P0008`) and unguarded calls when the switch is `0` (`P0009`). Existing bookings are not changed. |

**Forward only.** There is no production rollback by dropping objects. See section 7.

## 3. Compatibility by code path

The app chooses a path from what the form sends. Both paths can run against the same database.

| Path | Trigger | Needs | Price guard | Materials and budget stored | Service-area gate |
|---|---|---|---|---|---|
| Structured | Form sends `clientRequestId` | Migrations 119 and 120 | Inside the RPC, in the transaction (`P0003`) | Yes | Yes (`P0008`) |
| Legacy | No `clientRequestId` | Six-argument call (production today) | Read before insert in `createBookingAction`; a switch flipped between read and insert is not caught | No | Yes (`P0008`); refused entirely (`P0009`) when `legacy_booking_path_enabled` = 0 |

- Until 119 and 120 are applied, the wizard uses the legacy path. This is what production runs now.
- Before 119 is applied, `get_booking_free_inspection` is missing, so the page reads `null` and the legacy guard is skipped. Verified by reading `src/app/customer/bookings/new/page.tsx`, `src/components/customer/BookingWizard.tsx` and `src/lib/services/booking-pricing.ts`. **Not run against a database without 119.** Check in staging before production.
- After 119 and 120 are applied, the wizard uses the structured path only if `get_booking_free_inspection` and `service_materials` are readable, and falls back to legacy on error.
- **Legacy switch.** Leave `legacy_booking_path_enabled` = `1` at deploy. Flip it to `0` only after the structured path is confirmed live in production. A stale form with no client request id is then refused (`P0009`) and the customer is asked to refresh. This is a post-deploy owner step.
- Known gap: the legacy path has a read-before-insert window. It closes only when the structured path is live.
- `supabase/tests/migration_119_compatibility.sql` covers the legacy five-argument call, the six-positional call, free inspection off and on, and a signed-out refusal.

## 4. Environment variables and flags

| Name | Value for this release | Note |
|---|---|---|
| `NEXT_PUBLIC_FREE_INSPECTION` | Off (unset or false) in production | Controls the public promise in `src/lib/brand.ts`. Separate from the database switch. |
| `matching_config.free_inspection_enabled` | `0` in production | Set to `1` only with founder approval, after migrations and smoke tests. |
| `matching_config.inspection_gate_enabled` | `0` in production unless approved | With it on, an active inspector must exist (`P0006`). |
| `matching_config.legacy_booking_path_enabled` | `1` at deploy; `0` only as a post-deploy owner step | `0` refuses unguarded booking calls (`P0009`). See section 3. |
| `booking_rate_limit_per_hour` | `5` (default) | Change only with founder approval. |

**Coverage is data, not a flag.** A city is bookable only when a verified professional has an active `professional_service_areas` row for it. Other cities are refused (`P0008`). The owner must confirm the coverage rows before deploy.

Do not commit real values. `.env.example` lists variable names only.

`scripts/seed-local-e2e-users.sh` sets the free-inspection, inspection-gate and rate-limit values on the **local** stack only. It is hard-coded to `127.0.0.1`, refuses other endpoints, and never reads or writes production configuration.

## 5. Owner decisions and actions (not performed in this pass)

These need a person with access or a decision. None were run here.

1. **Revoke the leaked legacy service-role key** in the Supabase dashboard (API settings). Then confirm revocation with a real request: the old key must return an authentication error. Keep the evidence with the key redacted. See section 12.
2. **Rotate the new key in Vercel.** Changing the Vercel variable does **not** revoke the leaked key. Revocation is step 1.
3. Confirm the mailboxes used for founder and support sign-ins.
4. Review the 11 suspect test bookings in production (identified in an earlier pass; not re-queried here). Identify their owners, timestamps, references and relationships first. Do not delete or alter any of them without a separate reviewed plan. See section 14.
5. Founder decisions:
   - **Assessing state.** Implemented in migration 125: a repair job is assessed before a quote is sent. Confirm the customer copy "Professional is assessing the repair".
   - **Service areas.** Implemented in migration 126 as option (a): refuse bookings outside covered cities, with a clear message. Confirm the coverage data before deploy.
   - Whether free inspection applies to fixed-price services. Today the switch only changes `inspection` services. **Open.**
   - Whether budget or quantity should ever affect the quotation. Current design: no.
   - Whether a global switch change should make open fixed-price forms ask for confirmation again. Current behaviour, accepted for now.
   - Whether the legacy booking path is retired, and when. The switch exists; retiring the path is the owner's call. **Open.**
6. Onboard verified professionals for each city and category to be served. A city with no verified coverage refuses bookings by design.
7. Confirm the founder-approved public copy and catalogue in `src/lib/brand.ts` and the catalogue. **Not re-checked in this pass.**

## 6. Smoke tests after approval (staging first, then production)

Run these only after the owner approves each step. Record the result for each.

| # | Test | Expected |
|---|---|---|
| 1 | Sign up and sign in with a new account (fresh staging database) | Profile row created; sign-in succeeds |
| 2 | Book a fixed-price service on the legacy path, switch `0` | Booking created; amount equals `services.base_price` |
| 3 | Book on the structured path with materials and a budget | One booking; materials with quantities and budget stored |
| 4 | Submit the same structured request twice with one `clientRequestId` | Same booking returned; one row |
| 5 | Change `free_inspection_enabled` between opening the form and submitting (staging only) | `price_changed`; no row created |
| 6 | Budget `100` on the structured path | Rejected (`22023`); no row created |
| 7 | Exceed the hourly booking limit | Rejected (`P0007`) |
| 8 | Two open inspections for the same property and service (staging only) | Second rejected (`P0005`) |
| 9 | Repair job: professional sends a repair quote from `assessing`; customer approves | Quote accepted; job resumes in `in_progress` |
| 10 | Repair job: try to complete with no approved repair quote | Rejected (`22023`); completes after an approved repair quote |
| 11 | Fixed-price job: approved additional-work quote, then payment | Payable amount is base price plus the approved quote only |
| 12 | Repair job: start the assessment from `arrived`; try to move straight to `in_progress` | Moves to `assessing`; direct move rejected (`22023`) |
| 13 | Repair job in `assessing`: send an additional-work quote | Rejected; a repair quote is accepted |
| 14 | Book a property in a city with no verified coverage | Refused with "We do not serve this area yet"; no row (`P0008`) |
| 15 | After switching `legacy_booking_path_enabled` to `0`: submit a form with no client request id | Refused with "Please refresh the page and book again" (`P0009`); the structured form still books |

Tests 5 and 8 need `free_inspection_enabled` = `1`. Run them only in staging, and set the switch back to `0` afterwards.

## 7. Rollback and forward fix

- Migrations are forward only. Do not drop columns or functions in production to roll back.
- If a migration fails: stop, keep the backup, and fix forward with a new migration named `YYYYMMDD_NNN_description.sql`.
- **Do not revert the app to a build that lacks `assessing` while jobs are in `assessing`.** That build would not recognise those jobs. Check open assessing jobs first (read-only), and revert only after they are handled.
- If the app misbehaves after deploy, revert the deploy to a build that knows `assessing`, and keep the switches at their safe values.
- Switches can be changed at any time:
  - `matching_config.free_inspection_enabled = 0` (off)
  - `matching_config.inspection_gate_enabled = 0` (off)
  - `matching_config.legacy_booking_path_enabled = 1` (re-enables legacy booking calls, if a regression needs them)

## 8. Verification (this pass)

**Replay.** `replay.sh` built a fresh disposable database (`feazy_replay_disposable`) on `127.0.0.1` only and applied all 71 migration files in filename order. It uses shims for the Supabase-managed schemas (`auth`, `storage`, `extensions`, `cron`) and filters out the `pg_cron` line, which only runs in the `postgres` database. The shims are not production behaviour (section 9). A baseline replay of `HEAD` (without 125 and 126) ran alongside it to separate pre-existing failures from new ones.

**SQL suites on the replay (26 files):**

| Result | Suites |
|---|---|
| Pass (17) | `20261030_003_professional_profile_guard`, `_005_create_booking_rpc`, `_006_create_pending_payment`, `_008_matching_v2_ranking`, `_012_case_file_integrity`, `_013_job_paid_at`, `_014_job_media_and_eta`, `_015_job_media_cleanup`, `admin_override_assignment`, `admin_reassign_job`, `assessing_state`, `booking_pricing_guard`, `migration_119_compatibility`, `profiles_read_policy`, `quote_accounting_and_gate`, `quote_payment_invariants`, `service_area_gate` |
| Fail on the replay and fail the same way on the `HEAD` baseline (9) | `20261030_004`, `_016`, `_017`, `_018`, `_019`, `_020`, `_101`, `20261102_117`, `job_codes_and_no_show` |

The nine failing suites are **pre-existing fixture or shim gaps, not regressions from 125 or 126**, and they are not diagnosed beyond that. They are not green, so they must not be counted as passing. `20261030_016` needs `vault.create_secret` and `_101` needs more `auth.users` columns than the shim provides. Fixing them is follow-up work.

**Fixed in this pass.**
- `booking_pricing_guard` and `migration_119_compatibility` booked in Bengaluru with no covering professional. They passed on the local stack only because its seed covers Bengaluru. Both now create a verified Bengaluru professional with an active service area, so they pass on a clean replay.
- Inspectors in `booking_pricing_guard` are deactivated, not deleted.
- `service_area_gate.sql` (new): outside the covered city refused with `P0008` and no row; covered city accepted; inactive area refused; an unverified professional's area not counted; `legacy_booking_path_enabled` = 0 refuses `P0009`, and a guarded booking still works.

**Main local database.** The six suites changed or added in this pass pass there: `booking_pricing_guard`, `migration_119_compatibility`, `service_area_gate`, `assessing_state`, `quote_accounting_and_gate`, `admin_reassign_job`. The full suite was not re-run on the main database.

| Check | Command | Result |
|---|---|---|
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Unit tests | `pnpm test` | 47 files passed, 1 skipped; 606 tests passed, 16 skipped, 15 todo; exit 0 |
| Production build | `pnpm build` | Exit 0, run after the local dev server was stopped |
| Lint | `pnpm lint` | Exit 1: 166 problems (85 errors, 81 warnings). The same count on `main`, so this branch did not introduce them. |
| SQL suites on the rebuilt `feazy_upgrade_disposable` (119–126 applied in order) | local runner, not committed | 18 pass, 8 fail. The eight are the same harness gaps as the `HEAD` baseline (below). They are not waived. |
| Inspection journey, Chromium | `E2E_LOCAL_JOURNEY=1 E2E_DB_URL=<local Postgres URL> pnpm exec playwright test tests/e2e/inspection-journey.spec.ts --project=chromium --workers=1` | 11 passed |
| Inspection journey, Firefox | same command, `--project=firefox --workers=1` | 11 passed |
| Inspection journey, WebKit | same command, `--project=webkit --workers=1` | 11 passed |

The eight failing SQL suites are `20261030_004`, `_016`, `_017`, `_018`, `_019`, `_020`, `_101` and `job_codes_and_no_show`. Their errors come from fixture and shim gaps: a missing `vault.decrypted_secrets`, an `auth.users` shim without `instance_id`, and psql runs with no signed-in user context. They are not green and are not counted as passing.

Notes on the journey run:

- The journey covers the inspection path, the materials, the admin catalogue and the fixed-price booking. It does not cover the repair quote, assessment or customer approval.
- When `E2E_DB_URL` is set, the suite re-seeds before it runs, so each browser starts from the same state. The seed cancels the synthetic customer's open bookings and active jobs. Without it, the duplicate guard (`P0005`) blocks the run. Run each browser project with `--workers=1`: the suite is serial and shares one database.
- Changes to the journey spec in this pass (test-only): sign-in waits for hydration and for the post-login redirect; the inspector select is found by its combobox role; the reload after registering an inspector was removed, because the form refreshes the list itself; and layout screenshots fall back to the viewport where Firefox refuses a full-page capture taller than 32767px.

## 9. Not verified

- **Two-account quotation flow in a browser** (professional quotes, customer approves or declines). The SQL path is covered by `quote_accounting_and_gate.sql` and `assessing_state.sql`; no browser spec exists.
- **Layout beyond overflow.** The journey asserts no horizontal overflow at 375, 768, 1280 and 1440 widths on the main customer, inspector and admin pages. It does not check visual overlap, text clipping or touch-target size.
- **Console errors.** The journey does not capture browser console messages, so console errors were not checked in any browser in this pass.
- **Production-shaped upgrade.** The replay ran all 71 files on a fresh database, and the local database was upgraded incrementally. Production's schema was not read in this pass, so a production-shaped comparison is still open.
- **Shimmed Supabase schemas.** Replay results depend on shims for `auth`, `storage`, `vault`, `cron` and `extensions`. Real Supabase behaviour may differ.
- **Service-area match ignores stray whitespace (fixed).** Migration 126 first matched `lower(psa.city) = lower(a.city)`, which refused a covered property whose address city had a trailing space (`'Mysuru '`) with `P0008`. The match now uses `lower(btrim(...))` on both sides. `service_area_gate.sql` has a padded, differently cased case that must be bookable. The fix was verified on a rebuilt `feazy_upgrade_disposable` (119–126 applied in order, gate suite passes). `addresses.city` is `NOT NULL`, so a NULL city cannot reach the gate. Coverage ignores professional availability (`is_available`); a verified professional who is unavailable still counts. This is by design and should be confirmed by the founder.
- **Unit test for the `P0008` and `P0009` mapping.** The mapping is a private function in a `'use server'` file and has no test. (The copy is tested through `createBookingAction` in `actions.test.ts`, which covers `P0008` and `P0009`.)
- **Founder-approved copy and catalogue** (section 5, item 7).
- **Admin overrides** are not written to `audit_logs`.
- **Production:** nothing applied, nothing deployed, no flags or env vars changed, no credentials rotated or revoked, no production queries run in this pass.

## 10. Deployment order (after authorisation)

1. Owner authorises the push and the merge; CI is green on the PR.
2. Take the backup (section 2) and record its identifier.
3. Run the read-only preflight (section 2) and record the results.
4. Apply migrations 119 to 126 in order, each in its own transaction, with flags at their deploy values: `free_inspection_enabled` = `0`, `inspection_gate_enabled` = `0`, `legacy_booking_path_enabled` = `1`.
5. Deploy the app build. The migrations must be applied first: the structured path and the `assessing` transitions need them.
6. Run smoke tests 1–4 and 9–14 with free inspection off.
7. Owner decides the legacy switch: set `legacy_booking_path_enabled` = `0` only after the structured path is confirmed live. Run test 15.
8. Free inspection is a separate founder decision. Run tests 5 and 8 in staging, then decide on production. Do not enable it without that approval.

## 11. Release-readiness matrix

The branch is pushed and draft PR #8 is open. Every release step beyond that is **NO** until the owner acts. Each row gives the exact blocker and who clears it.

| Step | Status | Exact blocker | Owner action |
|---|---|---|---|
| Push feature branch | YES | Pushed to `feat/founder-revisions`. The head commit is shown on the PR. | None. |
| Open PR | YES | Draft PR #8: https://github.com/Brian-Kimario/fixify/pull/8 | Keep it as a draft until the owner decides. |
| Merge to `main` | NO | Not authorised. Blockers: the leaked legacy service-role key is not yet revoked; eight SQL suites (section 8) are not fixed or waived; lint has 166 problems on `main` as well. | Revoke the key (section 12 and the runbook). Decide whether the eight SQL suites gate. Authorise the merge. |
| Apply production migrations 119–126 | NO | No production backup recorded; no production preflight run; no authorisation. | Take the backup, run the preflight, authorise the migration run. |
| Deploy with free inspection OFF | NO | Depends on the migrations and the merge. Deploy approval not given. | Approve the deploy after the migrations succeed. |
| Activate free inspection | NO | Founder confirmation of the policy and public copy not given; migrations not applied; staging tests 5 and 8 not run. | Founder decision, then staging tests, then the switch. |
| Revoke the legacy service-role key | NO | Owner action, not performed. The key still works until it is revoked. | Follow [SERVICE_ROLE_KEY_ROTATION.md](SERVICE_ROLE_KEY_ROTATION.md). |

## 12. Credential rotation checklist

Owner actions. The assistant does not perform any of these. Never paste a key into a document, ticket or chat.

The step-by-step runbook, with the consumer inventory, the ordering rule, the old-key rejection check and the breakage checks, is [SERVICE_ROLE_KEY_ROTATION.md](SERVICE_ROLE_KEY_ROTATION.md). Follow it in preference to this list.

1. Revoke the leaked legacy service-role key in the Supabase dashboard (API settings).
2. Verify revocation: send a request with the old key and expect an authentication error. Keep the response as evidence, with the key redacted.
3. Generate the new key and store it in Vercel (production environment only).
4. Changing the Vercel variable does **not** revoke the old key. Step 1 is the revocation.
5. Search for other copies of the old key: CI secrets, local `.env` files and scratch files. Remove or replace them. Do not print them.
6. Decide with the owner whether any other credential exposed alongside the key also needs rotation.
7. Confirm the app works with the new key in staging before production.

## 13. Operational prerequisites

- Verified professionals with active service areas in every city to be served (section 4). Other cities refuse bookings by design.
- At least one active inspector if `inspection_gate_enabled` is turned on.
- A recorded backup or point-in-time recovery point before the production migration run.
- A decision on whether free inspection applies to fixed-price services, and approved public copy (section 5).
- After deploy, watch the counts of refused bookings (`P0008`, `P0009`) and of jobs in `assessing`, so a coverage gap or a stale form is visible quickly.

## 14. Suspected synthetic production bookings (identify only)

Eleven bookings were identified as probable test data in an earlier pass. This pass did not re-query production and did not change any record. For owner review:

- Collect owners, timestamps, references and relationships (jobs, quotes, payments, messages) for each, read-only.
- Decide, booking by booking, whether each is test data.
- Any deletion or alteration needs a separate, reviewed plan. Nothing is deleted or changed by this release.
