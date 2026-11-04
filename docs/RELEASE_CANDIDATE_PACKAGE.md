# Release candidate package: booking pricing and free inspection

Branch: `feat/founder-revisions` (local only; not pushed, not merged, not deployed).
Companion docs: [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md) (verified pricing answers), [FOUNDER_FEEDBACK_IMPLEMENTATION.md](FOUNDER_FEEDBACK_IMPLEMENTATION.md) (what changed and what is verified).

**Status: not ready to release to production.** The code and local tests are in place. Production has none of migrations 119–121, the owner-only credential revocation has not happened, and no browser run of the booking flow has been done in this pass.

## 1. Scope of this release

- Transactional price check in `create_booking` (`P0003`, no row created on mismatch).
- Structured booking path: `create_booking_with_materials` (materials, quantities, budget, idempotent retry).
- Free-inspection safeguards: per-customer lock, rate limit (`P0007`), duplicate open inspection (`P0005`), inspector check (`P0006`), inspection visit created with the gate on.
- Profile e-mail column for fresh databases (migration 121).
- Regenerated database types; founder sign-in copy in `src/lib/brand.ts`.

Not in this release: service-area coverage, inspector capacity and calendar, inspection no-show flow, admin override written to `audit_logs`, any universal minimum charge (none exists, by design).

## 2. Migration order and backup

Apply forward only, in this order. Do not skip or reorder.

1. `supabase/migrations/20261102_119_inspection_foundation.sql`
2. `supabase/migrations/20261102_120_materials_and_categories.sql`
3. `supabase/migrations/20261102_121_profiles_email_column.sql`

Before applying any of them to production:

- Take a fresh backup or point-in-time snapshot and record its identifier. **Owner action.**
- Confirm the production project ref is `azmajqztvcuwajaaldqm` before running anything.
- Run each file in its own transaction and stop on the first error.

Expected production effect:

| Migration | Production effect (read-only checks on the production schema) |
|---|---|
| 119 | Adds switches, inspectors, inspection visits, `get_booking_free_inspection`, and a nine-argument `create_booking` with defaults. It drops the six-argument `create_booking` (`DROP FUNCTION IF EXISTS`, line 204). The legacy app call uses named arguments with five parameters, so it resolves to the nine-argument function. Switch stays `0`. |
| 120 | Adds `service_materials`, `create_booking_with_materials`, `set_booking_material_preferences`, `budget_preference`, `quantity`. Drops the earlier `set_booking_material_preferences(uuid, uuid[])` and `create_booking_with_materials(... uuid[])`. |
| 121 | `ADD COLUMN IF NOT EXISTS profiles.email`. Production already has the column, so this is a no-op there. |

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

## 4. Environment variables and flags

| Name | Value for this release | Note |
|---|---|---|
| `NEXT_PUBLIC_FREE_INSPECTION` | Keep off (unset or false) in production | Controls the public promise in `src/lib/brand.ts`. Separate from the database switch. |
| `matching_config.free_inspection_enabled` | `0` in production | Set to `1` only with founder approval, after migrations and smoke tests. |
| `matching_config.inspection_gate_enabled` | `0` in production unless approved | With it on, an active inspector must exist (`P0006`). |
| `booking_rate_limit_per_hour` | `5` (default) | Change only with founder approval. |

Do not commit real values. `.env.example` lists variable names only.

## 5. Owner-only actions (not performed in this pass)

These need a person with access. None were run here.

1. **Revoke the leaked legacy service-role key.** Revoke it in the Supabase dashboard (API settings). Then confirm revocation with a real request. A request with the old key must return an authentication error. Keep the proof.
2. **Rotate the new key in Vercel.** Changing the Vercel environment variable does **not** revoke the leaked key. Revocation is step 1 only.
3. Confirm the mailboxes used for founder and support sign-ins.
4. Delete `/tmp_tsc.log` (local file from an earlier run; not in the repo).
5. Founder decisions:
   - Whether free inspection applies to fixed-price services (today the switch only changes `inspection` services).
   - Whether budget or quantity should ever affect the quotation (current design: no).
   - Whether a global switch change should make open fixed-price forms ask for confirmation again (current behaviour, accepted for now).
   - City or service-area limits (not modelled in the database).
6. Onboard professionals for categories with zero coverage before any inspection is offered there.

## 6. Smoke tests after approval (to run in staging, then production)

Run these only after the owner approves each step. Record the result for each.

| # | Test | Expected |
|---|---|---|
| 1 | Sign up with a new account (fresh staging database) | Profile row created; no `email` column error |
| 2 | Book a fixed-price service (legacy path, switch `0`) | Booking created, amount equals `services.base_price` |
| 3 | Book with the structured path, switch `0`, materials and budget set | One booking; materials with quantities and budget stored |
| 4 | Submit the same structured request twice with one `clientRequestId` | Same booking returned; one row |
| 5 | Change the switch between opening the form and submitting | `price_changed` message; no row created (structured path) |
| 6 | Budget `100` on the structured path | Rejected (`22023`); no row created |
| 7 | More than the hourly limit of bookings | Rejected (`P0007`) |
| 8 | Open an inspection for a property, then open another for the same property and service | Second rejected (`P0005`) |
| 9 | Quotation: professional creates a quote, customer approves or declines | Job resumes (`in_progress`) after answer |

Switch `free_inspection_enabled` is set to `1` **only** in a staging database, and only for tests 5 and 8. It is set back to `0` afterwards.

## 7. Rollback and forward fix

- Migrations are forward only. Do not drop columns or functions in production to roll back.
- If a migration fails: stop, keep the backup, fix forward with a new migration named `YYYYMMDD_NNN_description.sql`.
- If the app misbehaves after deploy: revert the deploy (the app falls back to legacy only if migrations are not applied), and keep the switches at `0`.
- Switches can be turned off at any time: `matching_config.free_inspection_enabled = 0`, `inspection_gate_enabled = 0`.

## 8. Verification already done (local only)

| Check | Result |
|---|---|
| Migration replay on a fresh local database (119, 120, 121) | Completed; 3 files flagged, all `unschedule` output, not failures |
| `supabase/tests/booking_pricing_guard.sql` | `all checks passed`; rolled back |
| `pnpm tsc --noEmit` | Exit 0 |
| `pnpm test` | 46 files passed, 1 skipped; 593 tests passed, 16 skipped, 15 todo; exit 0 |
| `pnpm build` | Exit 0 |

## 9. Not verified

- Playwright and any browser run of the booking wizard, sign-in copy, or quotation flow in this pass.
- Admin override: verified by reading code only. Not executed, and not written to `audit_logs`.
- `assign_booking` retry: verified by reading code only.
- Production: nothing applied, nothing deployed, no flags changed, no credentials rotated or revoked.
