# P1 — Customer booking cancellation (migration 107)

Status: **APPLIED to the shared database on 2026-10-30 with owner approval** (`supabase db query --linked -f`). App layer built (§10); no UI control yet.

Migration: `supabase/migrations/20261030_107_customer_cancel_booking.sql`
Dry run: `supabase/dry-runs/gen_107.py` → `20261030_107_customer_cancel_booking.dryrun.sql`, report in `…dryrun.report.json` (35 cases, rolled back).

## 1. What was wrong

- The customer cancel capability does not exist in the live database. `cancelBooking()` in `src/lib/services/bookings.ts` is uncalled
  dead code that calls a `transition_booking_state` RPC (with an `@ts-ignore`) and relies on a `booking_events` table. Both were defined in
  `20261004_002` but never applied. No customer UI or action cancels a booking.
- A fresh replay of `20261004_002` would create an insecure function: caller-supplied `p_actor_user_id` and `p_actor_role`, EXECUTE granted to
  every signed-in user. 107 drops that signature and installs a safe replacement, so a replay ends in the same state as production.
- A customer whose booking has no professional yet (the `c779c0d4` class) had no way out at all.

## 2. Design

| Object | Role |
|---|---|
| `booking_events` | Append-only history of booking status changes. RLS: the booking's customer and admins can SELECT. No INSERT/UPDATE/DELETE for clients (revoked, and no policy). Replay-safe: `CREATE TABLE IF NOT EXISTS` with the 002 shape, extra `event_type` column added idempotently, 002's policy dropped. |
| `transition_booking_state(booking, new_status, actor, role, event_type, reason, metadata)` | **Internal** booking state machine. Locks the booking, explicit allow-list (`pending`/`confirmed` → `cancelled` only), clears `unmatched_since`, writes `booking_events`. EXECUTE revoked from every role; only other SECURITY DEFINER functions call it. |
| `customer_cancel_booking(booking, expected_state, reason_category, note)` | The only customer entry point. |

There is deliberately **no second booking state machine**: job state still drives progress. `booking_status` stays the vestigial open/withdrawn marker and
cancellation is the only transition. Stale no-job booking resolution (`c779c0d4`) reuses this call rather than a new path.

### customer_cancel_booking contract

Inputs: booking id, `p_expected_state` (the job's `current_state` the customer saw, or `'no_job'`), a reason category
(`changed_my_mind | booked_by_mistake | found_other_help | schedule_conflict | price_concern | other`), optional note ≤ 300 chars.

Raises (client errors): `42501` not signed in; `22023` bad input; `P0002` booking not found **or not yours** (indistinguishable, no existence leak).

Returns `{ok:false, code, message}` for ordinary refusals:

| code | when |
|---|---|
| `STALE_STATE` | the job/booking is not in the state the customer saw (returns `actual_state`) |
| `NOT_ELIGIBLE` | work has started (`in_progress`) or the booking/job is completed or closed |
| `ALREADY_CANCELLED` | booking and job are already cancelled (a double click or retry) |

Returns `{ok:true, booking_id, job_id, from_state, to_state, offer_withdrawn, payment_review_required, paid_payment_count, pending_payment_count}` on success.

## 3. Authorization design

- Actor is always `auth.uid()`; never a parameter. Ownership is enforced by the booking lookup `WHERE id = … AND customer_id = auth.uid()`.
- The call is **customers' only**. Professionals and admins get `P0002` on someone else's booking. Admins keep `admin_cancel_job`; professionals keep their own job transitions.
- The job cancel itself goes through `transition_job_state`, whose existing allow-list already permits the owning customer to cancel from
  `quote_pending, assigned, accepted, on_the_way, arrived` and refuses `in_progress`. 107 adds no new job authority and does not edit
  `transition_job_state`, `admin_cancel_job` or `admin_reconcile_job`.
- `booking_status` cannot be changed by a customer directly (no UPDATE policy; dry run d27 shows 0 rows updated).

## 4. State-transition analysis

| Booking / job when called | Result |
|---|---|
| pending, no job (`no_job`) | booking → cancelled |
| job `assigned` (offer held or not) | job → cancelled, outstanding offer withdrawn (`withdrawn`/`job_cancelled` attempt, `offer_expires_at` cleared), booking → cancelled |
| job `accepted`, `on_the_way`, `arrived`, `quote_pending` | job → cancelled (codes invalidated, professional notified), booking → cancelled |
| job `in_progress` | refused `NOT_ELIGIBLE` (contact support) |
| job `completed` / `closed` | refused `NOT_ELIGIBLE` |
| booking pending but job already `cancelled` (historical drift) | booking → cancelled only, no second job event |
| everything cancelled | refused `ALREADY_CANCELLED` |

Locking: booking `FOR UPDATE`, then job `FOR UPDATE`, the same order as `_offer_next`, so cancel serialises cleanly against the assignment queue.
The matcher only offers `booking_status = 'pending'` bookings, so a cancelled booking is never re-offered (d29).

**Known interaction:** `admin_cancel_job` locks job then booking. A customer cancel and an admin cancel of the same booking at the same instant can
deadlock; PostgreSQL aborts one with `40P01` and nothing is corrupted. The app layer must show a retry message for `40P01`. Aligning
`admin_cancel_job`'s lock order is a recommended small follow-up, not done here to keep 107 away from a live privileged function.

## 5. Payments

Never changed. Paid and pending payments are counted (by booking or job); a paid payment sets `payment_review_required` in the return value and in
the `booking_events` metadata (d20/d21 confirm the rows are untouched). No refund, capture or recharge happens; refunds remain an admin-authorised
decision. The customer message must say so and point to support.

## 6. Notifications and audit

- The job cancel uses the normal `state_transition` event, so the existing triggers notify the professional (`job_cancelled`) and queue the WhatsApp
  cancellation exactly as for a professional cancel. The cancelling customer is not notified of their own action (d13/d14: customer 0, professional 1).
- Audit: `job_events` (cancel row), `booking_events` (actor, role, reason category, note, job state, payment flag), `booking_assignment_attempts` for a withdrawn offer.

## 7. Compatibility assessment

- New objects only, plus the replacement of the unapplied 002 function. Nothing live depends on `booking_events` or `transition_booking_state`.
- `admin_cancel_job`, `admin_reconcile_job` and `transition_job_state` behave as before (d30–d32). `process_assignment_queue` unaffected (d29).
- `database.types.ts` needs regenerating after apply; the dead `cancelBooking()` must be replaced (app layer, after approval).
- Older migrations `20261004_002` and `_007` still describe the old design in comments; 107 makes a replay safe, but neutralising them is tracked.

## 8. Dry-run results (35 cases, all rolled back; the live database was re-checked and holds no trace)

Authorization: unauthenticated 42501; anon denied; other customer / professional / admin → `P0002`, booking untouched (d01–d05).
Validation: bad category, long note, null expected state, unknown booking (d06–d09).
Stale and duplicate: stale refused with nothing written; duplicate returns `ALREADY_CANCELLED` with one event each (d10, d17, d18).
Happy paths: no-job, assigned with and without offer, accepted, on_the_way, arrived, quote_pending (d11–d14), including offer withdrawal, professional notified, codes invalidated.
Refusals: `in_progress`, `completed` (d15, d16). Drift booking synced without a second job event (d19).
Payments preserved and flagged (d20, d21). RLS: owner and admin read `booking_events`, other customer reads none, clients cannot write or call the internal function, cannot update `booking_status` (d22–d27).
Allow-list: `cancelled → pending` refused (d28). Regression: matcher skips cancelled booking, admin cancel and professional cancel unchanged, customer still cannot cancel `in_progress` via the job machine (d29–d32).

Observation (pre-existing, not changed): when a **professional** cancels, the job becomes `cancelled` but the booking stays `pending` (d31). That is the source of the five historical drift rows. A customer can now clear it with this call (d19); whether a professional cancel should instead re-offer the booking is a product decision for A4.

Not yet done: a real two-session concurrency test (needs approval to apply), a UI control, 375 px checks.

## 8b. Apply and concurrency verification

- Applied; verified live: `customer_cancel_booking` EXECUTE for `authenticated`/`service_role` only (no PUBLIC/anon); `transition_booking_state` owner-only; `booking_events` RLS on with one SELECT policy.
- Real two-session test on a synthetic assigned job: session A cancelled and held its transaction 6 s; session B started 2.5 s later, blocked until A committed, then returned `ALREADY_CANCELLED`. Result: one `booking_events` row, one job cancel event, booking and job `cancelled`.
- Synthetic bookings, jobs, notifications and the queued (pending) WhatsApp rows they produced were deleted afterwards; `booking_events` is empty again.
- Not verified: UI, 375 px, `40P01` against a concurrent admin cancel.

## 9. Rollback plan

107 only adds objects. To roll back after an apply (no data of value is lost beyond cancellation history rows):

```sql
DROP FUNCTION IF EXISTS public.customer_cancel_booking(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.transition_booking_state(uuid, text, uuid, text, text, text, jsonb);
-- keep booking_events (history); drop only if empty and the owner agrees:
-- DROP TABLE public.booking_events;
```

Bookings already cancelled through the call stay cancelled; that is a legitimate customer decision, not damage.

## 10. App layer (built, no UI)

- `cancelBookingSchema` / `CUSTOMER_CANCEL_REASONS` in `src/validators/booking.ts` (booking id, expected state, one of six reason categories, optional note ≤ 300).
- `cancelBooking()` in `src/lib/services/bookings.ts` replaces the dead function (no `@ts-ignore`, no console). Zod → signed-in check → `customer_cancel_booking` via the user-scoped client → typed `ActionResult`.
  Refusals (`STALE_STATE`, `NOT_ELIGIBLE`, `ALREADY_CANCELLED`) → `rejected` with the database message; `42501` → unauthenticated; `P0002` → not_found; `22023` → invalid_input;
  `40P01`/`40001` → retry message; anything else → generic `failed` (details not leaked); malformed payloads never count as success.
  The outcome carries `paymentReviewRequired` so the UI can say nothing was refunded.
- `cancelBookingAction()` in `src/app/customer/actions.ts` revalidates `/customer` only on success.
- Tests: `src/__tests__/customer-cancel-booking.test.ts` (validation, RPC arguments, error mapping, refusals, revalidation, static wiring).
- Still owner decisions: the customer UI control (booking detail, confirm dialog with reason category, payment-review copy) and `c779c0d4`.

## 11. Open items still tracked

Document-integrity gap in verification; `admin_cancel_job` lock-order alignment; neutralising 002/003/007; support-role reads; customer notice on mid-job suspension;
professional cancel leaves booking `pending`; `c779c0d4` (resolve through this call once approved, with the customer's consent or owner direction).
