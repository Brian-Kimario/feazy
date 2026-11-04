# Release candidate package: booking pricing, quotes and free inspection

Branch: `feat/founder-revisions` (local only; not pushed, not merged, not deployed).
Companion docs: [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md) (pricing and quote rules, with what is verified), [FOUNDER_FEEDBACK_IMPLEMENTATION.md](FOUNDER_FEEDBACK_IMPLEMENTATION.md) (what changed and what is verified).

**Status: local release candidate, not released.** Local SQL suites, unit tests, type-check, production build and the Chromium inspection journey pass (see section 8). Production has none of migrations 119–124, the leaked legacy service-role key has not been revoked, and no release decision has been made.

## 1. Scope of this release

- Transactional price check in `create_booking` (`P0003`, no row created on mismatch).
- Structured booking path: `create_booking_with_materials` (materials, quantities, budget, idempotent retry).
- Free-inspection safeguards: per-customer lock, rate limit (`P0007`), duplicate open inspection (`P0005`), inspector check (`P0006`), inspection visit created with the gate on.
- Quote accounting by kind (migration 122 and 123): repair quotes and additional-work quotes are separate. Revisions supersede earlier repair quotes. Payable amount follows the owner's rules (see [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md) section 4).
- Completion gate in Postgres (migration 123): a repair job cannot move from `in_progress` to `completed` without an approved repair quote.
- Sign-in fix (migration 124): the admin read policy on `profiles` no longer recurses. Before this, every non-owner profile read failed with `42P17`, which blocked sign-in.
- Profile e-mail column for fresh databases (migration 121).
- Regenerated database types; founder sign-in copy in `src/lib/brand.ts`.

Not in this release: customer or inspector service-area coverage, inspector capacity and calendar, inspection no-show flow, admin override written to `audit_logs`, any universal minimum charge (none exists, by design).

## 2. Migration order and backup

Apply forward only, in this order. Do not skip or reorder.

1. `supabase/migrations/20261102_119_inspection_foundation.sql`
2. `supabase/migrations/20261102_120_materials_and_categories.sql`
3. `supabase/migrations/20261102_121_profiles_email_column.sql`
4. `supabase/migrations/20261104_122_payment_sums_approved_quotes.sql`
5. `supabase/migrations/20261104_123_quote_accounting_and_completion_gate.sql`
6. `supabase/migrations/20261104_124_profiles_admin_read_policy.sql`

Before applying any of them to production:

- Take a fresh backup or point-in-time snapshot and record its identifier. **Owner action.**
- Confirm the production project ref is `azmajqztvcuwajaaldqm` before running anything.
- Run each file in its own transaction and stop on the first error.

Expected production effect (not checked against production in this pass):

| Migration | Effect |
|---|---|
| 119 | Adds switches, inspectors, inspection visits, `get_booking_free_inspection`, and a nine-argument `create_booking` with defaults. It drops the six-argument `create_booking` (`DROP FUNCTION IF EXISTS`). The legacy app call uses named arguments with five parameters, so it resolves to the nine-argument function. Switch stays `0`. |
| 120 | Adds `service_materials`, `create_booking_with_materials`, `set_booking_material_preferences`, `budget_preference`, `quantity`. Drops the earlier `set_booking_material_preferences(uuid, uuid[])` and `create_booking_with_materials(... uuid[])`. |
| 121 | `ADD COLUMN IF NOT EXISTS profiles.email`. Production already has the column, so this is a no-op there. |
| 122 | Replaces `_job_payment_amount` so the payable amount sums approved quotes, not only one. Signature unchanged. |
| 123 | Adds `quotes.quote_kind` (`repair` or `additional_work`, backfilled: fixed-price repair quotes become `additional_work`), `revision`, and the `create_quote(..., p_quote_kind)` argument. Splits accounting by kind. Wraps `transition_job_state` with the completion gate; the original becomes `_transition_job_state_core`. |
| 124 | Replaces the admin read policy on `profiles` with a `SECURITY DEFINER` helper (`_is_admin_user`). Without this, sign-in fails for every non-owner profile read on a database that has the original policy. **Check production for the recursive policy first (read-only), and only then decide whether 124 is needed there.** |

## 3. Compatibility by code path

The app chooses a path from what the form sends. Both paths can run against the same database.

| Path | Trigger | Needs | Price guard | Materials and budget stored |
|---|---|---|---|---|
| Structured | Form sends `clientRequestId` (`structuredBooking` true in `src/app/customer/bookings/new/page.tsx`) | Migrations 119 and 120 | Inside the RPC, transactional (`P0003`) | Yes |
| Legacy | No `clientRequestId` | Six-argument `create_booking` (production today) | Read before insert in `createBookingAction`; a switch flipped between read and insert is not caught | No |

- Until 119 and 120 are applied, the wizard shows the legacy path. This is what production runs now.
- Before 119 is applied, `get_booking_free_inspection` is missing, so the page reads `null`, the wizard sends no expected decision (`freeInspection ?? undefined`), and the legacy guard is skipped. Verified by reading `src/app/customer/bookings/new/page.tsx`, `src/components/customer/BookingWizard.tsx` and `src/lib/services/booking-pricing.ts`. **Not run against a database without 119.** Check this in staging before production.
- After 119 and 120 are applied, the wizard uses the structured path only if `get_booking_free_inspection` and `service_materials` are both readable. The page checks this and falls back to legacy on error.
- Known gap: the legacy path has a read-before-insert window. It closes only when the structured path is live.
- Migration 119 compatibility is covered by `supabase/tests/migration_119_compatibility.sql` (legacy five-argument call, six-positional call, free inspection off and on, signed-out refusal).

## 4. Environment variables and flags

| Name | Value for this release | Note |
|---|---|---|
| `NEXT_PUBLIC_FREE_INSPECTION` | Keep off (unset or false) in production | Controls the public promise in `src/lib/brand.ts`. Separate from the database switch. |
| `matching_config.free_inspection_enabled` | `0` in production | Set to `1` only with founder approval, after migrations and smoke tests. |
| `matching_config.inspection_gate_enabled` | `0` in production unless approved | With it on, an active inspector must exist (`P0006`). |
| `booking_rate_limit_per_hour` | `5` (default) | Change only with founder approval. |

Do not commit real values. `.env.example` lists variable names only.

The local seed script (`scripts/seed-local-e2e-users.sh`) sets `free_inspection_enabled`, `inspection_gate_enabled` and the rate limit on the **local** stack only. It is hard-coded to `127.0.0.1` and never reads or writes production configuration.

## 5. Owner decisions and actions (not performed in this pass)

These need a person with access or a decision. None were run here.

1. **Revoke the leaked legacy service-role key.** Revoke it in the Supabase dashboard (API settings). Then confirm revocation with a real request. A request with the old key must return an authentication error. Keep the proof.
2. **Rotate the new key in Vercel.** Changing the Vercel environment variable does **not** revoke the leaked key. Revocation is step 1 only.
3. Confirm the mailboxes used for founder and support sign-ins.
4. Delete `/tmp_tsc.log` (local file from an earlier run; not in the repo).
5. Review the 11 suspect test bookings in production. **Identify their owners, timestamps, references and relationships first.** Do not delete any of them without a separate reviewed plan.
6. Founder decisions:
   - Whether free inspection applies to fixed-price services (today the switch only changes `inspection` services).
   - Whether budget or quantity should ever affect the quotation (current design: no).
   - Whether a global switch change should make open fixed-price forms ask for confirmation again (current behaviour, accepted for now).
   - Whether repair jobs need an "assessing" state, so an assessment cannot begin before a quote is approved. Today this is an open gap (see [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md) section 4).
   - Whether the legacy booking path is retired. It has no `clientRequestId`, its six-argument call skips the in-transaction price guard, and its pre-read free-inspection check is racy.
7. **Service-area safeguards (decision needed).** Matching finds only professionals whose `professional_service_areas` match the property's city, and the area when one is set. Booking does not check that the property is inside a served area. A customer outside any covered city gets no professional rather than a clear refusal. Options: (a) refuse bookings outside covered cities with a clear message; (b) accept them and show "no professional available" (current). Inspector coverage has the same gap: an inspector is checked only for `is_active`, not for city or capacity.
8. Onboard professionals for categories with zero coverage before any inspection is offered there.

## 6. Smoke tests after approval (to run in staging, then production)

Run these only after the owner approves each step. Record the result for each.

| # | Test | Expected |
|---|---|---|
| 1 | Sign up and sign in with a new account (fresh staging database) | Profile row created; sign-in succeeds; no `email` column error |
| 2 | Book a fixed-price service (legacy path, switch `0`) | Booking created, amount equals `services.base_price` |
| 3 | Book with the structured path, switch `0`, materials and budget set | One booking; materials with quantities and budget stored |
| 4 | Submit the same structured request twice with one `clientRequestId` | Same booking returned; one row |
| 5 | Change the switch between opening the form and submitting | `price_changed` message; no row created (structured path) |
| 6 | Budget `100` on the structured path | Rejected (`22023`); no row created |
| 7 | More than the hourly limit of bookings | Rejected (`P0007`) |
| 8 | Open an inspection for a property, then open another for the same property and service | Second rejected (`P0005`) |
| 9 | Quotation: professional creates a quote, customer approves or declines | Job resumes (`in_progress`) after answer |
| 10 | Repair job (`quote_after_inspection`): try to complete with no approved repair quote | Rejected (`22023`); completes after an approved repair quote |
| 11 | Fixed-price job: approved additional-work quote, then payment | Payable amount is base price plus the approved quote only |

Switch `free_inspection_enabled` is set to `1` **only** in a staging database, and only for tests 5 and 8. It is set back to `0` afterwards.

## 7. Rollback and forward fix

- Migrations are forward only. Do not drop columns or functions in production to roll back.
- If a migration fails: stop, keep the backup, fix forward with a new migration named `YYYYMMDD_NNN_description.sql`.
- If the app misbehaves after deploy: revert the deploy (the app falls back to legacy only if migrations are not applied), and keep the switches at `0`.
- Switches can be turned off at any time: `matching_config.free_inspection_enabled = 0`, `inspection_gate_enabled = 0`.

## 8. Verification (local stack, this pass)

| Check | Command | Result |
|---|---|---|
| Quote accounting and completion gate | `psql -v ON_ERROR_STOP=1 -f supabase/tests/quote_accounting_and_gate.sql` | `all checks passed` |
| Quote payment invariants | `supabase/tests/quote_payment_invariants.sql` | `all checks passed` |
| Booking pricing guard | `supabase/tests/booking_pricing_guard.sql` | `all checks passed` (fixed this pass: inspectors are deactivated, not deleted) |
| Migration 119 compatibility | `supabase/tests/migration_119_compatibility.sql` | `all checks passed` |
| Admin assignment and offer withdrawal overrides | `supabase/tests/admin_override_assignment.sql` | `all checks passed` |
| Profiles read policy (migration 124) | `supabase/tests/profiles_read_policy.sql` | `all checks passed` |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Unit tests | `pnpm test` | 47 files passed, 1 skipped; 600 tests passed, 16 skipped, 15 todo; exit 0 |
| Production build | `pnpm build` | Exit 0 |
| Inspection journey, Chromium, with phone (375px) and tablet (768px) layout checks | `E2E_LOCAL_JOURNEY=1 pnpm exec playwright test tests/e2e/inspection-journey.spec.ts --project=chromium` after `scripts/seed-local-e2e-users.sh` | 9 passed; screenshots for phone and tablet written to the scratchpad `shots/` folder |

Notes on the journey run:

- The journey books a fresh inspection on each run, so re-seed before every run (`scripts/seed-local-e2e-users.sh`). The seed cancels the synthetic customer's open bookings and their active jobs. Without this, the duplicate guard (`P0005`) and the professional conflict rule block the run.
- A multi-browser run (`pnpm exec playwright test ...` without `--project`) is not reliable as-is. The serial suite books once per browser project, so the second and third projects hit `P0005` unless the seed runs between them.
- **Not run:** Firefox and WebKit. WebKit's browser binary is not installed here (`pnpm exec playwright install webkit` downloads it; not done without approval). Desktop-width screenshots are covered by the journey's default viewport, not by a separate desktop-only check.

## 9. Not verified

- Desktop-width (1280px and wider) layout checks as a separate test. The journey runs at the default viewport only.
- Firefox and WebKit runs of the journey.
- Admin reassignment (`admin_reassign_job`): no override test yet. `admin_assign_professional` and `admin_withdraw_offer` are covered by `admin_override_assignment.sql`.
- Migrations 122–124 replayed from scratch on a fresh database. `supabase db reset --local` was denied in this session, so 122–124 were applied to the existing local database only.
- The end-to-end quote flow with two real accounts in a browser.
- Admin overrides are not written to `audit_logs`.
- `assign_booking` retry: verified by reading code only.
- Production: nothing applied, nothing deployed, no flags changed, no credentials rotated or revoked.
