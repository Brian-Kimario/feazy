# A3 — Consistent lock order (migration 108)

Status: **APPLIED 2026-10-31 with owner approval** (`supabase db query --linked -f`). Dry run 18 cases passed. Concurrency tests run: 1, 2, 3, 5 pass; **test 4 found a second, pre-existing deadlock (profile row lock vs booking lock) that 108 does not fix**; see section 8.

Migration: `supabase/migrations/20261031_108_consistent_lock_order.sql` (generated from the live definitions by `supabase/dry-runs/gen_108_migration.py`, every replacement asserted to match exactly once)
Rollback: `supabase/rollbacks/20261031_108_rollback.sql` (the live bodies captured 2026-10-31)
Dry run: `supabase/dry-runs/gen_108.py`, report `…108_consistent_lock_order.dryrun.report.json`

## 1. Root cause

Booking and job rows are both locked in one transaction. The canonical order is **booking, then job** (`_offer_next`, `customer_cancel_booking`, `transition_booking_state`, `admin_reconcile_job`). Two paths took the opposite order:

| Path | Old order |
|---|---|
| `admin_cancel_job` | job `FOR UPDATE`, later booking `FOR UPDATE` |
| `_release_offer` (used by `decline_job`, queue offer expiry, suspension withdraw) | job `FOR UPDATE`, then `_offer_next` locks the booking |
| queue expiry loop | job `FOR UPDATE SKIP LOCKED`, then `_release_offer` |
| suspension loop | job `FOR UPDATE` per job, then `_release_offer` |

Reproduced live (2026-10-31): admin cancel held the job and wanted the booking while a customer cancel held the booking and wanted the job; PostgreSQL aborted the admin cancel with `40P01`. State stayed consistent.

## 2. Lock-order changes (functions only)

- `admin_cancel_job`: read `booking_id`, lock booking, lock job. Later booking lock removed.
- `_release_offer`: read `booking_id`, lock booking, lock job. For `p_outcome = 'expired'` the deadline is re-checked under the lock, so an offer that was renewed or cancelled meanwhile is not released.
- `process_assignment_queue`: expiry loop locks the booking (`FOR UPDATE OF b SKIP LOCKED`, `ORDER BY booking_id`); offer loop also `SKIP LOCKED` on bookings. The cron never waits for a customer/admin transaction.
- `admin_transition_professional_verification`: suspension loop selects jobs without locking, `ORDER BY booking_id`; `_release_offer` locks booking then job per item. Two concurrent suspensions therefore cross in the same order.

No table, column, signature, return type or grant changes (`CREATE OR REPLACE` keeps grants).

Other lock holders checked in the live catalog: `_assign_booking_internal` (booking only), `_offer_next` (booking, job), `admin_reconcile_job`, `customer_cancel_booking` (booking, job). `report_professional_no_show` locks a job and only does a plain read of the booking, so it never waits on a booking lock and cannot close a cycle. No triggers on `jobs`/`bookings` touch the other table.

## 3. Compatibility assessment

- Same signatures and results. Behavioural differences: (a) the queue skips a booking another transaction holds and retries next minute; (b) an expired release now fails (`P0001 Job is no longer awaiting a response`, caught by the queue's per-item handler as before) if the offer was renewed; (c) admin cancel of a job whose booking is missing is not possible (FK).
- Callers (`src/lib/services/admin.ts`, customer actions, UI) need no change. The retry messages for `40P01` stay as a defence.
- Retry-only was rejected: it hides the inversion and still aborts the transaction that did real work.

## 4. Dry-run results (18 cases, all rolled back; the live database was not changed)

Admin cancel: assigned with offer withdrawn and record written (e01), accepted (e02), stale state refused and untouched (e03), non-admin 42501 (e04), unknown job P0002 (e05), paid payment preserved (e06), duplicate refused cleanly with the stale-state message (e07).
Decline: declined attempt recorded, job unassigned (e08), another professional refused (e09).
Queue: expired offer released with an `expired` attempt (e10), unexpired left alone (e11), `_release_offer('expired')` on an unexpired offer refused and untouched (e12), cancelled booking untouched (e13), queue runs on a pending booking (e18).
Suspension: pending offer withdrawn, professional `suspended` (e14); accepted job not cancelled (e15).
Customer cancel regression: with offer (e16), no job (e17).
Observation, not a regression: cancelling an `assigned` job writes no `job_cancelled` notification to the professional (e01, `pro_notified: 0`); this matches the pre-108 behaviour.

## 5. Two-session concurrency tests (to run after approval)

Each uses two `supabase db query` processes with explicit `BEGIN`; the first holds its locks with `pg_sleep`, the second starts shorter. Expect: no `40P01`, the second waits then returns a clean refusal.

1. customer cancel vs admin cancel of the same assigned job.
2. customer cancel vs `decline_job`.
3. `process_assignment_queue` (expiry) vs customer cancel: queue skips the locked booking, no wait.
4. admin cancel vs suspension of the assigned professional.
5. two concurrent suspensions of the same professional with two assigned jobs (ordering).

## 6. Rollback

Run `supabase/rollbacks/20261031_108_rollback.sql` through `supabase db query --linked -f`. It restores the four function bodies verbatim and re-introduces the job→booking inversion. No data changes either way.

## 7. Apply plan (needs owner approval)

1. Apply 108 with `supabase db query --linked -f`.
2. Re-check function definitions and grants.
3. Run the five concurrency tests on synthetic past-dated rows; delete them.
4. Record results here.


## 8. Concurrency results after apply (2026-10-31, synthetic past-dated rows, shared DB)

Two parallel sessions, one holding the booking lock for 5 s, the other started 1.5 s later. Synthetic professionals were unavailable, unreachable accounts; all rows deleted afterwards (0 bookings, jobs, users left; `booking_events` empty; `c779c0d4` still `pending`).

| # | Scenario | Result |
|---|---|---|
| 1 | Customer cancel vs admin cancel, same assigned job | Customer waited 3.7 s on the booking lock, then got `ALREADY_CANCELLED`. No 40P01. |
| 2 | Customer cancel vs professional `decline_job` | Decline waited ~6 s, then a clean refusal (`P0001`, job no longer awaiting a response). No 40P01. |
| 3 | Queue expiry vs customer-held booking lock | Queue returned in ~3 s without waiting for the holder (4 s more); the locked job was left untouched (professional still set, 0 expired attempts). (First attempt was invalid: the real matcher had expired that fixture; re-run on a fresh job inside one minute.) |
| 4 | Admin cancel vs suspension of the assigned professional | **40P01 deadlock** (admin cancel aborted, suspension committed, 2 offers withdrawn). |
| 5 | Two concurrent suspensions of one professional | Second waited ~6 s, then a clean `Stale request: status is now suspended`. No 40P01. |

### Finding from test 4 (not caused by 108)
`admin_transition_professional_verification` locks the professional row with `FOR UPDATE` (line ~273 of the migration) and then waits for booking locks. Any path that inserts into `booking_assignment_attempts` (admin cancel, customer cancel, decline, offers) takes `FOR KEY SHARE` on that professional row through the foreign key, and `FOR UPDATE` conflicts with it. That is the cycle profile -> booking against booking -> profile. It existed before 108.

Proposed fix (migration 109, **not prepared or applied; needs owner approval**): lock the professional row `FOR NO KEY UPDATE` instead. The function only updates non-key columns, `FOR NO KEY UPDATE` does not conflict with `KEY SHARE` (so the FK insert never blocks) and still conflicts with itself (concurrent suspensions still serialise, as test 5 requires). Needs a dry run and re-run of tests 4 and 5 after approval.

## 9. Migration 109 (PREPARED, NOT APPLIED)

- Migration: `supabase/migrations/20261101_109_suspension_lock_mode.sql`. One-line change to `admin_transition_professional_verification`: `FOR UPDATE` -> `FOR NO KEY UPDATE` on the professional row (diff against the live definition is exactly that line). Rollback: `supabase/rollbacks/20261101_109_rollback.sql` (live pre-109 body).
- Compatibility: the function updates only non-key columns; signature, grants (anon none, authenticated execute) and behaviour are unchanged. `FOR NO KEY UPDATE` still conflicts with itself, so concurrent verification transitions still serialise (test 5); it no longer conflicts with the attempts-FK `KEY SHARE`, which removes the profile->booking cycle (test 4).
- Dry run (rolled back, synthetic rows; live definition re-checked unchanged afterwards): definition uses `NO KEY UPDATE` (e01); grants unchanged (e02); non-admin 42501 (e03); stale expected status 55000 (e04); short reason 22023 and status unchanged (e05); valid suspend -> suspended, 1 offer withdrawn, job professional cleared, 1 withdrawn attempt (e06); second suspend 55000 (e07); reactivate still stopped by the document gate 23514 (e08). Report: `supabase/dry-runs/20261101_109_suspension_lock_mode.dryrun.report.txt`.
- After approval to apply: apply with `supabase db query --linked -f`, verify definition and grants, then re-run concurrency tests 4 and 5 on fresh synthetic rows (a synthetic professional with two assigned past-dated jobs; test 4 expects no 40P01 and a clean outcome for both sessions).
