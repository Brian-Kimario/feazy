# Repair pricing workflow

Status: verified on `feat/founder-revisions` against the migrations, app code and local test run listed below. Local results are from a replay of every migration in order on a fresh local database, not from production. Items still not verified are marked **open**.

There is no universal minimum charge. Each service carries its own price, and the budget preference range (₹500–₹20,000) is a range the customer may choose from. It is not a price floor.

## 1. What the customer pays at booking

`create_booking` (`supabase/migrations/20261102_119_inspection_foundation.sql`) takes the amount from the service row only. Option modifiers are not applied at booking.

| Pricing model | `matching_config.free_inspection_enabled` = 0 | `free_inspection_enabled` = 1 |
|---|---|---|
| `fixed` | `services.base_price` | `services.base_price` |
| `inspection` | `services.inspection_fee` | `NULL`, pricing_model stored as `quote_after_inspection` (no amount) |
| `quote_after_inspection` | `NULL` | `NULL` |

- Decision read by the customer page: `get_booking_free_inspection()` (RPC), called by `getFreeInspectionStatus` in `src/lib/services/booking-pricing.ts`. It returns `true`, `false`, or `null` on error. `null` means unknown, not off. On the legacy path, a `null` read makes the action fail with `failed` and create nothing.
- The public price card (`priceInfo` in `src/components/customer/BookingWizard.tsx`) reads the same decision.
- Production: the switch is `0`. Keep it `0` in production unless the founder decides otherwise. The public promise is controlled separately by `NEXT_PUBLIC_FREE_INSPECTION` (`src/lib/brand.ts`).

## 2. Guard against a changed price

Verified in the database (`create_booking`, 119):

- The customer's confirmed view is sent as `p_expected_free_inspection` and `p_expected_amount`.
- Inside the booking transaction, after the switch rows are locked `FOR SHARE`, the RPC compares both values with the live decision. A mismatch raises `P0003` before any insert, so **no booking row is created**.
- A switch change made after the customer loaded the page therefore fails safely. This applies to fixed-price bookings too, because the free-inspection decision is compared for every service. Accepted behaviour; the founder should know that flipping the switch makes every open booking form ask for confirmation again.

Two paths reach the database:

| Path | When | Guard |
|---|---|---|
| Structured | Form sends `clientRequestId` (after 119 and 120 are applied; `structuredBooking` in `src/app/customer/bookings/new/page.tsx`) | Inside the RPC, transactional |
| Legacy | Form does not send `clientRequestId`, i.e. production until the migrations are applied | Read-before-insert in `createBookingAction` (`src/app/customer/bookings/new/actions.ts`). A switch flipped between the read and the insert is not caught. Known gap, closed only by the structured path. |

Application mapping (`createBookingFailure`): `P0003` → `price_changed` with the message asking the customer to confirm the new price.

## 3. Materials and budget are preferences, not prices

Verified in migration 120 (`supabase/migrations/20261102_120_materials_and_categories.sql`):

| Field | Storage | Rule |
|---|---|---|
| Material and quantity | `booking_material_preferences` (`material_id`, `quantity` 1–10) | Only materials linked to the service in `service_materials` with `is_customer_selectable`. At most 10 distinct materials. Set through `set_booking_material_preferences(uuid, jsonb)`. |
| Budget | `bookings.budget_preference numeric(10,2)` | 500–20,000 by check constraint and by `create_booking_with_materials` (`22023` before any insert). Not part of the amount charged. |

- `create_booking_with_materials` (120) wraps `create_booking` in one call: it validates the budget, returns the existing booking when `p_client_request_id` was already used, creates the booking, saves the preferences, then saves the budget. A refused input creates no booking row.
- Customer quantities are not authoritative for the bill. The professional or inspector confirms the actual materials (`inspector_confirm_materials`, `get_visit_materials`, `admin_set_material_price`). **Not re-verified in this pass.**
- `get_booking_materials` / `_booking_materials_json` return `budget` and per-material `quantity` for the read model.

## 4. After booking: the quotation

Verified from the migrations:

1. Assignment: `assign_booking` (customer) or the assignment queue offers the job. `_assign_booking_internal` does not offer a job that already has a professional, so a repeated call is harmless.
2. Work starts: job `in_progress`.
3. Extra work: `create_quote(p_job_id, p_reason, p_items)` (`20261030_012`), callable by the assigned professional only, and only while the job is `in_progress`. Moves the job to `quote_pending`.
4. Decision: `respond_to_quote(p_quote_id, 'approved' | 'declined', p_reason)` (`20261029_002`), callable by the job's customer only. Rejects an already-answered quote, a job not in `quote_pending`, and an expired quote. Both outcomes resume work through `transition_job_state()`. Approval authorises the extra work; a decline sends the job back to continue or cancel the original scope.
5. `transition_job_state` (`20261030_021`) guards the move out of `quote_pending`: it can go to `in_progress` only after the quote is answered.

Not covered: quote expiry is enforced at answer time, not by a sweep. **Open:** end-to-end run with two real accounts in the browser.

## 5. Free inspection safeguards

All enforced in `create_booking` (119) after the price check and before the insert:

| Check | Code | Rule |
|---|---|---|
| Per-customer serialisation | advisory lock | `pg_advisory_xact_lock` on the customer, taken before the retry lookup, so two parallel submissions cannot both pass the checks |
| Retry | — | Same `client_request_id` returns the existing booking; nothing is inserted or charged |
| Rate limit | `P0007` | More than `booking_rate_limit_per_hour` (default 5) bookings by the customer in the last hour, paid or free |
| Duplicate open inspection | `P0005` | An open inspection (models `inspection` and `quote_after_inspection`, paid or free) for the same property and service |
| No inspector | `P0006` | Only when `inspection_gate_enabled` = 1 and no active inspector exists |
| Visit created | — | With the gate on, an `inspection_visits` row with status `requested` is created |
| Cancellation | trigger `bookings_close_visit` | Cancelling a booking sets its open visits to `cancelled` (`_close_visit_on_booking_cancel`) |

**Note:** `P0004` is not used. It is PostgreSQL's `assert_failure` code, which `WHEN OTHERS` handlers do not catch, so the rate limit uses `P0007`.

Admin override: `admin_assign_professional` (`20261101074513_a4_113_admin_assignment.sql`) assigns a professional by hand and is not gated by the inspection gate. Verified by reading the code: it requires an admin (`_require_admin`), a reason of at least 10 characters, and an idempotency key (`p_request_id`). It writes a `matching_decisions` row (`manual: true`, admin id, reason) and a `job_events` row (`admin_assign`, with reason and request id). It does **not** write to `audit_logs`. **Not executed in this pass.**

**Missing dependencies (not built):**
- Customer service-area coverage. The app does not check that a property is inside a served area; no table models it.
- Inspector capacity and calendar. The inspector is only checked for `is_active`; visit slots are not checked for clashes.
- No-show handling for inspections: the `missed` status exists on `inspection_visits` but the flow that sets it was not verified here.

## 6. Verification run

| Check | Command | Result |
|---|---|---|
| Migrations replay | `replay.sh` (all migrations in order, fresh local DB) | Completed. 3 files flagged (`20261030_011`, `_016`, `_019`); these are `unschedule` output that the script reports as errors. Not failures. |
| SQL guard tests | `psql -v ON_ERROR_STOP=1 -f supabase/tests/booking_pricing_guard.sql` | `NOTICE: booking_pricing_guard: all checks passed`; the transaction is rolled back. |
| Type check | `pnpm tsc --noEmit` | Exit 0 (after regenerating `src/lib/supabase/database.types.ts` from the local database) |
| Unit tests | `pnpm test` | 46 files passed, 1 skipped; 593 tests passed, 16 skipped, 15 todo; exit 0 |
| Production build | `pnpm build` | Exit 0 |
| Browser / Playwright | — | **Not run.** Not claimed. |

The SQL test covers: changed policy (fixed price and switch changed, no row created); correct policy (free inspection stored as quote-after-inspection with no amount; fixed price at the confirmed amount); duplicate submission (same key returns the same booking, one row); unauthorized callers (signed out and professional → `42501`; another customer's property → `P0002`); open-inspection duplicate (`P0005`); rate limit (`P0007`); no inspector with the gate on (`P0006`), then success with an active inspector and a `requested` visit; wrapper (materials stored with quantity, budget stored, retry adds no rows, budget 100 / quantity 11 / unlinked material → `22023`, no booking row).

## 7. Production compatibility

- Production runs the six-argument `create_booking` and has no `create_booking_with_materials`, `set_booking_material_preferences`, `get_booking_free_inspection`, or `service_materials`. The app therefore keeps the legacy call until those exist (`structuredBooking` is false).
- Migrations 119, 120 and 121 are not applied to production. 121 adds `profiles.email` with `IF NOT EXISTS`. Production already has that column, so it is a no-op there, but it is needed for a fresh database.
- Free inspection must stay off in production until the migrations are applied and the owner approves the switch.

## 8. Founder decisions still needed

- Whether free inspection applies to fixed-price services. Today the switch only changes `inspection` models.
- Whether budget and quantity should ever affect the quotation. The current design says no.
- Whether a global switch flip should make open fixed-price forms ask for confirmation again (current behaviour, accepted for now).
