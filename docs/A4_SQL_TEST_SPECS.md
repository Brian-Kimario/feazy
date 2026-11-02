# A4 PostgreSQL test specifications (REVISION 2)

**STATUS: NOT EXECUTED. No scenario below has been run against any database.** The draft SQL in `supabase/proposed/a4/` (111–115) has not been parsed or tested by PostgreSQL. The expected results are predictions from reading the code.

**Authorization.** Running these needs separate, explicit owner approval, after the exact effects below have been reviewed. Do not run them on the shared project `azmajqztvcuwajaaldqm` without it. Preferred first step: a throwaway local PostgreSQL (Docker or `supabase start`) with a schema dump, which needs no shared-project authorization.

**Isolation warnings (apply to every spec)**
- Concurrency specs need two or more committed sessions, so `ROLLBACK` cannot undo them. Cleanup is explicit deletion of synthetic rows.
- Use only synthetic users, professionals, bookings and jobs, with identifiable markers (e.g. `a4test-` prefix). Never touch the two legacy verified professionals, booking `c779c0d4`, or any real customer or professional row.
- Bookings must not be future-dated in a way the live matcher can offer to a real professional. Synthetic professionals must be the only candidates, or the matcher must be disabled for the test.
- Notification triggers (115) must be removed or the test users must have no push/WhatsApp channel, so nothing reaches a real person.
- Each spec states the migrations that must be applied first (the whole 111–115 chain unless stated).

Notation: `S1`/`S2` are separate sessions. `pro` is a synthetic verified professional, `bk*` synthetic bookings, `j*` their jobs.

---

## S1 Matcher vs acceptance (same professional)
- **Setup:** `pro` verified, available. `bk1` with `j1` in `assigned`, offered to `pro` (pending attempt). `bk2` with `j2` unassigned/matching, eligible only for `pro`.
- **Interleaving:** S1: BEGIN; `transition_job_state(j1,'accepted')` as `pro` (holds L1 bk1, L2 j1, L3 pro), do not commit. S2: BEGIN; `_offer_next(j2)` (via `process_assignment_queue` as service role).
- **Expected:** S2 returns immediately without waiting; `pro` recorded as skipped (`candidates_skipped_busy_or_ineligible`); no offer created for `j2`. After S1 commits, a second matcher run evaluates `pro` against the committed `accepted` job.
- **Also check:** reverse order (S2 first): S1's accept waits, then re-reads and either succeeds (no overlap) or raises `SCHEDULE_CONFLICT` (overlap within ±2 h with a committed job).
- **Side effects:** none beyond synthetic rows; no notification if 115 is absent.

## S2 Two simultaneous acceptances
- **Setup:** `pro` verified. `bk1` at T, `bk2` at T+1h (inside ±2 h), each with a job `assigned` and offered to `pro`.
- **Interleaving:** S1 accepts `j1` (do not commit); S2 starts accepting `j2` and blocks on `pro`; S1 commits; S2 resumes.
- **Expected:** S1 succeeds; S2 raises `SCHEDULE_CONFLICT` (23P01); `j2` stays `assigned`, attempt row still pending.
- **Variant:** `bk2` at T+3h: both succeed (outside the window).

## S3 Acceptance vs reschedule
- **Setup:** `bk1`/`j1` offered to `pro`.
- **Interleaving A:** S1 accepts `j1` (uncommitted); S2 `UPDATE bookings SET scheduled_start = ...` for `bk1` blocks on the booking lock; S1 commits; S2 resumes.
- **Expected A:** S2 raises `RESCHEDULE_BLOCKED` (55000), `scheduled_start` unchanged.
- **Interleaving B:** a reschedule of a booking with no live job succeeds. A reschedule of a booking whose job is `assigned` (offer pending): record the actual result, since the draft blocks only live jobs. This tests the stated rule.
- **Side effects:** none.

## S4 Suspension vs offer creation
- **Setup:** `pro` verified; `bk1`/`j1` eligible only for `pro`.
- **Interleaving:** S1: `admin_transition_professional_verification(pro, suspend)` (holds L3, uncommitted). S2: `admin_assign_professional(j1, pro)` blocks on L3. S1 commits.
- **Expected:** S2 raises `PROFESSIONAL_INELIGIBLE`; no attempt row. Matcher run after commit: `pro` not offered. Phase 1 returns `recovery_required` with counts.
- **Variant:** offer created before suspension: `admin_recover_suspended_professional` releases it (attempt closed, job back to matching), `done:true`.

## S5 Suspension vs offer acceptance
- **Setup:** `pro` verified with `j1` offered (assigned).
- **Interleaving A:** S1 accept (holds L1, L2; waits for L3 held by S2's phase 1). Then S2 commits.
- **Expected A:** S1 fails the `verified` check (ineligible); no deadlock (verify with `pg_locks` / no `40P01` in the log).
- **Interleaving B:** accept commits first; phase 1 then phase 2.
- **Expected B:** `j1` is `accepted`, an open `professional_suspended_active_job` exception exists, job not cancelled or reassigned.
- **Repeat B** many times with randomized timing (e.g. 200 iterations) and assert zero deadlocks; the claim is "no cycle", so any `40P01` is a defect.

## S6 Withdrawal before the start
- **Setup:** `j1` `accepted` by `pro`, `scheduled_start` ≥ 1 day ahead, `accepted_at` and ETA set, a payment and a quote row present.
- **Action:** `pro` calls `professional_withdraw_from_job(j1, 'reason')`.
- **Expected:** returns withdrawn; `j1` = `assigned` with `professional_id` still `pro`; `accepted_at`, ETA, offer expiry cleared; attempt row `withdrawn/professional_withdrew`; event `professional_withdrew` whose metadata holds previous `accepted_at`/ETA; payments and quotes unchanged; booking back in the unmatched pool.
- **Idempotence:** second call raises `STALE_STATE`.
- **Boundary:** start = `now()+1s` withdraws; start = `now()-1s` takes the review path. The clock must be the DB clock; test with a skewed client clock.

## S7 Withdrawal at or after the start, or under way
- **Setup:** one job each in `accepted` (start in the past), `on_the_way`, `arrived`, `in_progress`, `quote_pending`.
- **Expected for each:** no state change; one open exception kind `professional_withdrawal_request`, preference `admin`; event `professional_withdrawal_requested`; return `review_requested`. A repeat call does not create a second open exception. `assigned`, `cancelled`, `closed`, `completed` raise `STALE_STATE`. A non-owner and a missing id get the same "Job not found".

## S8 Withdrawal racing customer cancellation
- **Setup:** `j1` accepted, start in the future.
- **Interleaving:** S1 `professional_withdraw_from_job` and S2 `customer_cancel_booking` (or `admin_cancel_job`) both start; they serialize on the booking lock.
- **Expected:** exactly one wins. If withdrawal first: cancellation then runs against `assigned` and succeeds per its own rules. If cancellation first: withdrawal raises `STALE_STATE` and no `assigned` write occurs. In neither order is a cancelled job left `assigned`.
- **Note:** requires reading `customer_cancel_booking`'s lock order first (not yet re-read).

## S9 Duplicate exception resolution
- **Setup:** one open exception.
- **Action:** two admins (or one admin twice) call `admin_resolve_exception` with the same `request_id`, then with different ones.
- **Expected:** same `request_id` replays the stored result, one audit event; different `request_id` after closure raises `STALE_STATE`; concurrent calls serialize (booking, job, exception locks) and yield one winner.

## S10 Inconclusive and unresolved cases
- **Setup:** open `professional_no_show` exception.
- **Action:** `admin_resolve_exception(finding => 'inconclusive', resolution => NULL)`; then with `resolution` non-NULL.
- **Expected:** first call leaves `status='open'`, records `finding='inconclusive'` and `detail`, returns `still_open`, writes `exception_reviewed`. Second raises an invalid-argument error. A direct `UPDATE ... SET status='resolved', finding='inconclusive'` violates `job_exceptions_resolution_complete`. Confirmed no-show with a job that has an arrival/in-progress event, or before `start + 30 min`, is refused. Missing or short (<20 char) note with `admin_attested` is refused. `confirmed + no_action` for a no-show is refused.

## S11 Admin authorization
- **Action:** call every `admin_*` RPC as (a) anon, (b) a customer, (c) a professional, (d) service role with no `auth.uid()`.
- **Expected:** all raise 42501; no rows written. Admin role is read from `profiles.role`; a forged JWT claim has no effect.

## S12 Isolation level
- **Action:** call `transition_job_state(..., 'accepted')`, `admin_assign_professional` and `admin_reassign_job` inside `BEGIN ISOLATION LEVEL REPEATABLE READ`.
- **Expected:** raise 25000 `READ_COMMITTED_REQUIRED` before any lock or write.

## S13 Drift view
- **Action:** `SELECT drift_kind, count(*) FROM a4_assignment_drift GROUP BY 1` (read-only, safe on the shared project).
- **Expected:** the six known drifted rows and no others, as of the 2026-11-01 inspection; a regression after data changes means the count must be re-baselined, not that the view is wrong.

## S14 Notifications
- **Action:** drive each A4 event with a synthetic customer and professional.
- **Expected:** only the mapped events create in-app notifications; `professional_withdrawal_requested`, `suspended_active_job_flagged`, `exception_reviewed`, `exception_resolved` notify nobody; no `notification_logs` (WhatsApp) rows from A4 events.
- **Warning:** this is the spec most likely to reach a real person. Run only with synthetic users that have no real contact channel.

## S15 Edge guard
- **Action:** as table owner and as `authenticated`, `UPDATE jobs SET current_state='assigned' WHERE current_state='accepted'` directly; then through `admin_reassign_job` and `professional_withdraw_from_job`.
- **Expected:** direct updates raise `EDGE_NOT_PERMITTED` (42501); the two RPCs succeed. The setting is transaction-local: after the RPC, `current_setting('app.a4_recovery_edge', true)` is empty in the same session's next transaction.

---

## Not covered / limits
- Behaviour is predicted, never observed. A passing run proves these scenarios only; it does not prove absence of other deadlocks.
- Lock-wait timing (`lock_timeout`, `deadlock_timeout`) and PostgREST pooling effects are not modelled.
- Load behaviour of `process_assignment_queue` over many bookings is not specified here.
