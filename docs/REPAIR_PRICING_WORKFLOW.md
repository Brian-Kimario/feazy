# Repair pricing workflow

Status: verified on `feat/founder-revisions` against the migrations, app code and local test runs listed in section 6. Local results come from the local stack, not production. Items still not verified are marked **open**.

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
- Customer quantities are not authoritative for the bill. The professional or inspector confirms the actual materials (`inspector_confirm_materials`, `get_visit_materials`, `admin_set_material_price`). **Open:** not re-verified in the current pass.
- `get_booking_materials` / `_booking_materials_json` return `budget` and per-material `quantity` for the read model.

## 4. After booking: the quotation and what the customer pays

### 4.1 Quote kinds

Migration 123 (`supabase/migrations/20261104_123_quote_accounting_and_completion_gate.sql`) separates quotes by kind:

| Kind | Meaning | Allowed on |
|---|---|---|
| `repair` | The repair itself, priced after inspection | `quote_after_inspection` jobs only |
| `additional_work` | Extra work found during the job, approved by the customer | Any pricing model (`fixed` jobs get only this kind) |

- `create_quote(p_job_id, p_reason, p_items, p_quote_kind)`: when `p_quote_kind` is NULL, the kind is `additional_work` for `fixed` bookings and `repair` otherwise. A `fixed` booking refuses `repair` (`22023`). Existing repair quotes on fixed-price bookings were backfilled to `additional_work`.
- Each quote has a `revision` within its kind. A newer repair revision supersedes an earlier one.

### 4.2 Lifecycle

1. Assignment: `assign_booking` (customer) or the assignment queue offers the job. `_assign_booking_internal` does not offer a job that already has a professional, so a repeated call is harmless.
2. Work starts. Fixed and inspection jobs move `arrived` → `in_progress`. A repair job (`quote_after_inspection`) moves `arrived` → `assessing` (migration 125). It cannot go straight to `in_progress`; the transition is refused with `22023`.
3. Repair pricing: `create_quote` by the assigned professional, from `assessing` (kind `repair`) or `in_progress`. Additional work is quoted from `in_progress` only; it is refused while `assessing`. Moves the job to `quote_pending`.
4. Decision: `respond_to_quote(p_quote_id, 'approved' | 'declined', p_reason)` (`20261029_002`), callable by the job's customer only. Rejects an already-answered quote, a job not in `quote_pending`, and an expired quote. Both outcomes resume work through `transition_job_state()`. Approval authorises the quote; a decline sends the job back to continue or cancel the original scope.
5. `transition_job_state` guards the move out of `quote_pending`: it can go to `in_progress` only after the quote is answered.

### 4.3 What is payable

Enforced in `_job_payment_amount` (migrations 122 and 123), for every caller. Payment is only available once the job is `completed`.

| Pricing model | Payable amount |
|---|---|
| `fixed` | Agreed base price, plus every approved `additional_work` quote |
| `quote_after_inspection` | The operative repair quote (latest approved repair revision; earlier revisions are superseded and never counted), plus every approved `additional_work` quote |
| `inspection` (inspection-only visit) | The inspection fee. Zero when free inspection is on, which is not payable |

- Declined, expired, pending and superseded quotes never count.
- Approved quotes with a total of zero or less are ignored.
- A `quote_after_inspection` job with no approved repair quote has no payable amount: the function raises `22023`.

### 4.4 Completion gate

`transition_job_state` (migration 123) wraps the core transition. A `quote_after_inspection` job cannot move `in_progress` → `completed` unless an approved repair quote exists. The error is `22023`: "A repair job cannot be completed without a customer-approved repair quote". Inspection-only jobs may complete without one.

**Resolved (migration 125):** a repair job starts in `assessing`, not `in_progress`. Work on a repair cannot start until a repair quote is sent, because the core transition refuses `arrived` → `in_progress` for `quote_after_inspection`. `supabase/tests/assessing_state.sql` covers this.

**Open:** quote expiry is enforced at answer time, not by a sweep. The two-account browser run is not done (section 6).

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

Admin override: `admin_assign_professional` (`20261101074513_a4_113_admin_assignment.sql`) assigns a professional by hand and is not gated by the inspection gate. It requires an admin (`_require_admin`), a reason of at least 10 characters, and an idempotency key (`p_request_id`). It writes a `matching_decisions` row (`manual: true`, admin id, reason) and a `job_events` row (`admin_assign`, with reason and request id). It does **not** write to `audit_logs`. `supabase/tests/admin_override_assignment.sql` covers `admin_assign_professional` and `admin_withdraw_offer`. `supabase/tests/admin_reassign_job.sql` covers `admin_reassign_job`: refusals, stale state, customer consent, schedule and eligibility guards, the successful reassignment and its audit rows, and idempotent replay. It passes on the replay (section 6).

**Service-area coverage (migration 126, resolved):** `create_booking` refuses a property whose city has no verified professional with an active `professional_service_areas` row (`P0008`), and nothing is written. Matching still uses the city, and the area when one is set. `supabase/tests/service_area_gate.sql` covers the cases: uncovered city, covered city, inactive area, unverified professional, and the legacy switch (`legacy_booking_path_enabled`, `P0009`).

**Missing dependencies (not built):**
- Inspector capacity and calendar. The inspector is only checked for `is_active`; visit slots are not checked for clashes.
- No-show handling for inspections: the `missed` status exists on `inspection_visits` but the flow that sets it was not verified here.

## 6. Verification run (local)

| Check | Command | Result |
|---|---|---|
| Quote accounting and completion gate | `psql -v ON_ERROR_STOP=1 -f supabase/tests/quote_accounting_and_gate.sql` | `all checks passed` |
| Quote payment invariants | `supabase/tests/quote_payment_invariants.sql` | `all checks passed` |
| Booking pricing guard | `supabase/tests/booking_pricing_guard.sql` | `all checks passed` (covering professional added; inspectors deactivated, not deleted) |
| Migration 119 compatibility | `supabase/tests/migration_119_compatibility.sql` | `all checks passed` (covering professional added) |
| Assessment state (125) | `supabase/tests/assessing_state.sql` | `all checks passed` |
| Service-area gate and legacy switch (126) | `supabase/tests/service_area_gate.sql` | `all checks passed` |
| Admin overrides | `supabase/tests/admin_override_assignment.sql` | `all checks passed` |
| Admin reassignment | `supabase/tests/admin_reassign_job.sql` | `all checks passed` |
| Profiles read policy | `supabase/tests/profiles_read_policy.sql` | `all checks passed` |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Unit tests | `pnpm test` | 47 files passed, 1 skipped; 600 tests passed, 16 skipped, 15 todo; exit 0 |
| Production build | `pnpm build` | Exit 0 |
| Browser journey | `tests/e2e/inspection-journey.spec.ts`, Chromium only | 9 passed (re-seed before each run; see RELEASE_CANDIDATE_PACKAGE.md section 8) |

**Replay.** All 71 migration files applied in order to a fresh disposable database (`feazy_replay_disposable`, local only, with shims for the Supabase-managed schemas). Of the 26 SQL suites run on it, 17 pass, including every suite in the table above. Nine fail identically on the `HEAD` baseline (`20261030_004`, `_016`, `_017`, `_018`, `_019`, `_020`, `_101`, `20261102_117`, `job_codes_and_no_show`). These are pre-existing fixture or shim gaps, not regressions from 125 or 126, and they are not green.

The SQL tests run in a transaction that is rolled back.

**Not run:** Firefox and WebKit journeys. The journey is not reliable across browser projects without re-seeding between them. The two-account quote and approval flow in a browser has no spec.

## 7. Production compatibility

- Production runs the six-argument `create_booking` and has none of `create_booking_with_materials`, `set_booking_material_preferences`, `get_booking_free_inspection`, `service_materials`, `quote_kind`, the completion gate, the `assessing` state, or `legacy_booking_path_enabled`. The app keeps the legacy call until the structured path exists (`structuredBooking` is false).
- Migrations 119–126 are not applied to production. Migration 121 adds `profiles.email` with `IF NOT EXISTS`, a no-op where the column exists. Migration 124 replaces the admin read policy on `profiles`; check production for the recursive policy before deciding it is needed there.
- Migration 125 changes how a repair job starts. A job already in `arrived` takes the new rules at its next move. Migration 126 refuses bookings in cities with no verified coverage; check the coverage data before applying it.
- `legacy_booking_path_enabled` stays `1` at deploy. Flipping it to `0` is a post-deploy owner step, taken only after the structured path is confirmed live.
- Free inspection must stay off in production until the migrations are applied and the owner approves the switch.

## 8. Decisions

Resolved in this branch:

- Repair jobs have an `assessing` state; a repair quote is sent from it (migration 125, section 4.2).
- Customer service-area refusal: option (a) in [RELEASE_CANDIDATE_PACKAGE.md](RELEASE_CANDIDATE_PACKAGE.md) section 5, implemented in migration 126 as `P0008`.
- The legacy booking path has a switch (`legacy_booking_path_enabled`, migration 126). Retiring the path is still open.

Still open for the founder or owner:

- Whether free inspection applies to fixed-price services. Today the switch only changes `inspection` models.
- Whether budget and quantity should ever affect the quotation. The current design says no.
- Whether a global switch flip should make open fixed-price forms ask for confirmation again (current behaviour, accepted for now).
- When, if ever, to retire the legacy booking path (section 2).
- Inspector coverage limits: capacity and calendar (section 5).
