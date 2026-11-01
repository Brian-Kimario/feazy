# A4 — Assignment, reassignment, suspension, cancellation recovery, no-show (DESIGN ONLY)

Status: **design. Nothing here has been applied to any database.** Draft SQL is in `supabase/proposed/a4/` (outside `supabase/migrations/`, so no tool applies it). Date 2026-11-01.
Owner decisions in force: execution mode DRAFT ONLY; keep the time-overlap capacity rule (provisional); no migrations on the shared project; no staging provisioning; no push or deploy.
Labels: **[V]** verified read-only against the live schema this session; **[A]** analysis of code or SQL; **[P]** proposed behaviour, not built.

## 1. Verified architecture

### 1.1 Offers are a job state, not a table **[V]**
- An offer is a `jobs` row with `current_state = 'assigned'`, `professional_id` set and `offer_expires_at`. One outstanding offer per booking; `jobs.booking_id` is unique, so a booking has at most one job ever.
- `jobs_professional_required`: `professional_id` may be NULL only in `assigned | cancelled | closed`.
- History: `booking_assignment_attempts` (outcome ∈ declined|expired|withdrawn; `reason_code` list incl. `professional_suspended`, `job_cancelled`), `matching_decisions` (offered/unmatched with score inputs), `job_events` (`reassigned`, `unmatched`, `assigned`).
- `_offer_next(booking, actor)` is the only offering function: locks booking then job, ranks, writes the decision, sets `jobs.professional_id` + `bookings.professional_id`. `_release_offer` records the attempt then calls `_offer_next`. `_assign_booking_internal` only offers when the booking is `pending` and the job is absent or unassigned. `process_assignment_queue` (service role, one run at a time via `pg_try_advisory_xact_lock`) expires offers and offers pending bookings. `assign_booking` is granted to `authenticated` but requires `customer_id = auth.uid()`.
- Eligibility (`_rank_professionals`): verified, `is_available`, weekly availability window, **no other job in an active state (`assigned…quote_pending`) with `scheduled_start` within ±2 h**, no previous attempt on this booking, matching skill and service area. Ranking uses `_matching_setting` weights.
- Job state machine (`transition_job_state`): assigned→accepted|cancelled; accepted→on_the_way|cancelled; on_the_way→arrived|cancelled; arrived→in_progress|cancelled; in_progress→quote_pending|completed|cancelled; quote_pending→in_progress|cancelled; completed|cancelled→closed. **There is no backward edge.** Caller allow-list: the assigned professional (any valid edge), the customer (cancel, resume after quote), an admin only for `cancelled` inside `admin_cancel_job` (session flag `app.admin_cancel_job`).
- Accepting checks only `verification_status = 'verified'`. A trigger `jobs_guard_professional_verified` checks it again on any change of `professional_id`.
- Notifications: `job_events` insert → triggers `trg_notify_on_job_event` and `trg_job_state_transition_notify` → `_notify`. New event types need the notification function extended.
- Access: RLS on `jobs`, `job_events`, `quotes`, `job_messages` (participants) and `bookings` keys off `professional_id = auth.uid()`, so **clearing or replacing `jobs.professional_id` and `bookings.professional_id` revokes the former professional's access** automatically.
- Lock order (migrations 108/109): booking → job → (professional `FOR NO KEY UPDATE`). The professional row is taken with `NO KEY UPDATE` because attempts take `KEY SHARE` through the foreign key.
- Existing privileged RPCs: `admin_cancel_job`, `admin_reconcile_job`, `admin_transition_professional_verification` (suspend withdraws `assigned` offers via `_release_offer`, sets `is_available = false`, leaves active jobs untouched). `_offer_next`, `_release_offer`, `_assign_booking_internal`, `process_assignment_queue` are `service_role` only.
- `job_exceptions` has `kind = 'professional_no_show'` only, unique `(job_id, kind)`, status open|resolved|dismissed, resolution fields. `report_professional_no_show` (customer) refuses `assigned`, `arrived`, `in_progress`, `quote_pending`, `completed`, `closed` and `cancelled` jobs and any job with `arrived_at`, and requires now ≥ scheduled start + 30 min; permitted: `accepted` / `on_the_way` without arrival. **[V]**
- Live data **[V]**: 12 jobs; 0 pairs of active jobs for one professional within 2 h of each other.

### 1.2 Defect: incompatible offers and acceptances are possible **[A — not reproduced]**
`_rank_professionals` excludes a professional with a conflicting active job, but the check and the offer are not atomic and nothing serialises per professional:
1. Two sessions — for example a customer's `assign_booking` for booking B1 and the queue (or another customer's `assign_booking`) for B2 — rank the same top professional at the same moment. READ COMMITTED means neither sees the other's uncommitted offer. They hold different booking locks, so nothing blocks them. Both commit. The professional now has two `assigned` offers within 2 h.
2. `transition_job_state(… 'accepted')` does not re-check overlap or availability, so the professional can accept **both**.
3. Nothing in the schema forbids it (no unique/exclusion constraint; cross-table).
This is a **scheduling-integrity defect**. Exposure is limited today (few professionals, the queue serialises its own runs), and live data shows no overlap, but it is real. Fix drafted in 111 (section 4).
The 2-hour window also ignores job duration. That stays: provisional per owner.

## 2. Package contents (all DRAFT, none applied)

Directory `supabase/proposed/a4/`. Each forward file has a `_ROLLBACK.sql`. Nothing here is in `supabase/migrations/`.

| File | Purpose | Rollback notes |
|---|---|---|
| `20261102_111_a4_scheduling_integrity` | Professional-row lock model (no advisory locks), `_professional_conflicts`, reschedule guard trigger, read-committed guard, replacement `_offer_next` and `transition_job_state` (booking lock + recheck at accept) | Restores live bodies; drops trigger and 3 helpers |
| `20261102_112_a4_vocabulary_idempotency` | `_require_admin()`, `admin_operation_requests`, widened `reason_code`/`kind`/`preference` checks, `detail`/`finding`/`resolution`/`resolution_basis` columns, closure constraint | Counts-based preconditions; reverses all |
| `20261102_113_a4_admin_assignment` | `admin_assign_professional`, `admin_withdraw_offer`, `admin_reassign_job`, idempotency helpers, `accepted->assigned` edge guard trigger | Drops functions and trigger; history rows kept |
| `20261102_114_a4_recovery` | `professional_withdraw_from_job` (cutoff), two-phase suspension (`admin_transition_professional_verification` + `admin_recover_suspended_professional`), `admin_resolve_exception` | Restores live suspension body; drops 3 functions |
| `20261102_115_a4_notifications` | 3 new notification kinds, `_notify`, `_notify_for_event`, kind check | Fails loudly if new-kind rows exist (owner decides) |
| `20261102_116_a4_lifecycle_drift` | Read-only view `a4_assignment_drift` | Drops view |

Not "ready": **revision 2 of 111-115 has never been parsed or executed by PostgreSQL.** See sections 11 and 14.

## 3. State-transition matrix

"Reassign" = controlled change of professional through the new functions. No new state machine: the only new edge is **accepted → assigned**, written only by `admin_reassign_job` and `professional_withdraw_from_job`, both with a `job_events` row.

| Job state | Admin assign | Admin withdraw offer | Admin reassign | Pro withdraw | Suspension of pro | Notes |
|---|---|---|---|---|---|---|
| none (booking pending) | Yes (offer) | n/a | n/a | n/a | n/a | creates job `assigned` |
| assigned, no pro | Yes | n/a | n/a | n/a | n/a | expected_state `assigned`, expected pro NULL |
| assigned, pro (offer) | Yes (replaces) | Yes | Yes | decline (existing) | offers released (exists) | replaced pro gets attempt `admin_reassigned` |
| accepted, before start (DB clock) | no | no | Yes (back to `assigned`, new offer) | Yes, controlled (`professional_withdraw_from_job`) | job kept, exception raised in recovery phase 2 | refuses `NEEDS_CUSTOMER_CONSENT` if a non-declined/expired quote exists |
| accepted, at/after start | no | no | `NEEDS_ADMIN_REVIEW` | request recorded (`review_requested`), no state change | exception raised | no silent change late |
| on_the_way … quote_pending | no | no | no | request recorded (`review_requested`) | exception raised | cancel via `admin_cancel_job` |
| completed / cancelled / closed | no | no | no | no | no | terminal |

Offers created by an administrator are **offers**: the professional still accepts or declines. Admin does not override verification, availability or schedule conflicts.

Operation detail (actor / expected-state check / records / lock order / failure / idempotency):

| Operation | Actor | Expected-state input | Records written | Failure codes | Idempotency |
|---|---|---|---|---|---|
| manual assignment | admin | `p_expected_state` none\|assigned + `p_expected_professional_id` | jobs, bookings, attempt (displaced pro), `matching_decisions` kind `offered` with `inputs.manual`, job_event `admin_assign` | STALE_STATE, STALE_PROFESSIONAL, BOOKING_NOT_ASSIGNABLE, PROFESSIONAL_INELIGIBLE, SCHEDULE_CONFLICT | `(admin, op, request_id)` + input hash; changed inputs → IDEMPOTENCY_KEY_REUSED |
| offer withdrawal | admin | expected professional | attempt `withdrawn/admin_withdrawn`, jobs, bookings (unmatched), event `admin_withdraw_offer` | STALE_*, NOT_AN_OFFER | same |
| reassignment | admin | state assigned\|accepted + expected pro | attempt, jobs (accepted_at/eta cleared), bookings, decision, event `admin_reassign` | STALE_*, NEEDS_ADMIN_REVIEW, NEEDS_CUSTOMER_CONSENT, PROFESSIONAL_INELIGIBLE, SCHEDULE_CONFLICT | same |
| professional withdrawal | the assigned professional | none (state read under lock) | before start: attempt, jobs, bookings, event `professional_withdrew`; otherwise `job_exceptions` request + event `professional_withdrawal_requested` | STALE_STATE (40001); "Job not found" for non-owner | natural (second call finds `assigned` or an existing request) |
| suspension (phase 1) | admin | `p_expected_status` | profile, verification event with counts; no offers/exceptions | stale status 55000 | status check |
| suspension recovery (phase 2) | admin | pro must be `suspended` | released offers, `job_exceptions` rows for active jobs, events | STALE_STATE (40001); `done:false` means call again | idempotent by construction |
| no-show / exception resolution | admin | `p_expected_status` = `open` | `job_exceptions` finding/resolution, event `exception_resolved` | STALE_STATE, RESOLUTION_MISMATCH | `(admin, resolve_exception, request_id)` |
| lifecycle sync | none yet | n/a | drift view only | n/a | n/a |
| scheduling protection | system | n/a | none | SCHEDULE_CONFLICT (ERRCODE 23P01) | n/a |

No-show semantics (corrected): the live `report_professional_no_show` refuses assigned/arrived/in_progress/quote_pending/completed/closed/cancelled jobs and any job with `arrived_at`, and requires now ≥ scheduled start + 30 min. The permitted states are therefore **accepted and on_the_way without arrival**. A customer report is an *allegation*; the admin finding (`confirmed | not_confirmed | inconclusive`) is separate, and `admin_resolve_exception` changes no job state and applies no penalty: cancellation or reassignment is done first by its own audited operation, then recorded and verified here.

## 4. Scheduling-race analysis (REVISION 2)

Everything below is **derived from function bodies and documented PostgreSQL lock semantics. Nothing has been reproduced; no SQL has been parsed or run.**

### 4.1 Confirmed defects (a defect in the draft or live code that follows directly from reading it)
| ID | Where | Defect | Fix |
|---|---|---|---|
| C1 | live matcher/accept | No per-professional serialization; two offers within ±2 h can both be created and both accepted (section 1.2) | 111: L3 professional row lock + recheck at offer and accept |
| C2 | draft 111 rev. 1 | Advisory lock acquired in a different position relative to row locks in matcher vs accept (opposite-order acquisition) | 111 rev. 2: advisory locks removed entirely; the professional row is the only serializer |
| C3 | draft 114 rev. 1 | Suspension held the pro row (`NO KEY UPDATE`) and then inserted `job_exceptions` (needs `KEY SHARE` on the job); accept holds the job and waits for the pro row: **deadlock** | 114 rev. 2: exceptions only created while no L3 lock is held (invariant I1) |
| C4 | live suspension | Takes pro `FOR UPDATE` first, then jobs, then `_release_offer` (booking, then job): inversion of booking → job → pro | 114: phase 1 takes L3 only; phase 2 takes booking → job and no L3 |
| C5 | draft 114 rev. 1 | Withdrawal had no time cutoff: a professional could leave 5 minutes before (or after) the visit silently | 114: DB-clock cutoff, review path after start |
| C6 | draft 112 rev. 1 | `inconclusive` finding set status `resolved` | 112 constraint + 114 function: inconclusive never closes a case |
| C7 | live | `bookings.scheduled_start` has no DB guard against change while a job is live; the accept recheck assumes it is stable | 111: `bookings_guard_schedule_change` trigger |
| C8 | draft 113 rev. 1 | `accepted → assigned` was merely "not forbidden" | 113 section 0: `jobs_guard_recovery_edge` trigger |

### 4.2 Theoretical risks (possible only under conditions not observed; mitigated, not proven)
- T1 REPEATABLE READ / SERIALIZABLE callers could miss a just-committed accept in the conflict recheck. Mitigation: `_require_read_committed()` raises 25000. (PostgREST uses READ COMMITTED by default.)
- T2 Matcher locks candidates it then rejects and keeps them until commit. Mitigation: it takes them with `SKIP LOCKED` (never waits), so it cannot be part of a wait cycle; effect is only that a concurrent accept for a rejected candidate waits for the matcher's short transaction.
- T3 Unrelated updates of a professional's profile row briefly take the same row lock. Contention only, not correctness.
- T4 The ranker `_rank_professionals` keeps its own hard-coded state list. It is a pre-filter; the locked recheck is authoritative, and a regression test pins the helper's list to the state machine.
- T5 A role that can run arbitrary SQL can set `app.a4_recovery_edge` or drop the trigger. Out of scope: such a role can do anything.
- T6 The ±2 h window ignores job duration (owner decision: stays).
- T7 Pre-existing definer functions keep `search_path 'public'` (not widened by A4; changing them is separate work).

### 4.3 Scheduling-race analysis, scenario by scenario
| Scenario | Locks / outcome (inferred) |
|---|---|
| Matcher vs acceptance, same professional | Matcher: L1 booking, L2 job, then L3 `SKIP LOCKED`. If an accept holds L3, the matcher skips that candidate (recorded as `candidates_skipped_busy_or_ineligible`), never waits. If the matcher holds L3 first, the accept (holding its own L1/L2) waits for L3, then re-reads under READ COMMITTED and sees the matcher's committed offer; the recheck against **committed** work only means a mere offer does not block acceptance |
| Two simultaneous acceptances (one pro, two offers) | Different bookings, so L1/L2 do not conflict. Both then queue on the same L3. The second proceeds after the first commits, and its fresh-snapshot conflict check sees the first's `accepted` row: `SCHEDULE_CONFLICT` |
| Acceptance vs reschedule | A reschedule must lock L1 (booking) to update `scheduled_start`; accept locks L1 first too, so they serialize. After the accept commits, the trigger rejects the reschedule (`RESCHEDULE_BLOCKED`) while a live job exists. After the reschedule commits (only possible with no live job) there is nothing to accept |
| Suspension vs offer creation | Matcher and admin assign require `verified` read under L3. Phase 1 holds L3 until commit: a concurrent assignment waits, then sees `suspended` (`PROFESSIONAL_INELIGIBLE`). An offer created just before phase 1 is released by phase 2 |
| Suspension vs offer acceptance | Accept holds L1+L2 and waits for L3; phase 1 holds L3 and takes no other lock (I1), so no cycle. If phase 1 commits first the accept fails the `verified` check. If the accept commits first the job is `accepted` and phase 2 raises an exception for it |
| Withdrawal vs customer cancellation | Both lock L1 first. Winner commits; the loser sees `cancelled` or `assigned` and raises `STALE_STATE` (withdrawal) or its own stale handling (cancel) |

## 5. Lock-order specification (REVISION 2)

**Canonical order, no exceptions:** L1 `bookings` row → L2 `jobs` row → L3 `professional_profiles` row (`FOR NO KEY UPDATE`; the sole per-professional schedule serializer) → L4 `job_exceptions` row. There are no advisory locks.

**Invariant I1.** Every transaction that WAITS for an L3 lock already holds the booking's L1 lock and the job's L2 lock (or holds neither because it is an L3-only transaction). A transaction that holds L3 never waits for L1, L2 or L4: `job_exceptions` inserts (which take `KEY SHARE` on the job) are performed only after, or without, holding L3.

**No-wait-cycle argument.** A deadlock needs a cycle of waits. Edges: waiting for L2 while holding L1 (same booking, ordered); waiting for L3 while holding L1/L2; waiting for L4 while holding L1/L2. No edge leaves L3 or L4 except the SKIP LOCKED probe in the matcher, which does not wait. Because the edges only go "downwards" in the order L1 < L2 < L3 < L4 and no wait goes upwards, the wait-for graph is acyclic. Two exceptions need care: (a) `process_assignment_queue` holds earlier iterations' L3 locks while taking a later booking via `SKIP LOCKED` (never waits) and a later L2 (the job row of the booking it holds; I1 holds); (b) multi-booking holders (`admin_recover_suspended_professional`) lock bookings in job-id order, so two concurrent calls cannot cross.

**Lock-order matrix** (rows = function; columns = locks in the order taken; "—" = not taken; SKIP = `SKIP LOCKED`, never waits)
| Function | L1 booking | L2 job | L3 pro row | L4 exception |
|---|---|---|---|---|
| `_offer_next` (matcher) | FOR UPDATE | FOR UPDATE | NO KEY UPDATE, SKIP | — |
| `process_assignment_queue` | SKIP LOCKED | via `_offer_next` | via `_offer_next` (SKIP) | — |
| `transition_job_state` → accepted | FOR UPDATE | FOR UPDATE | NO KEY UPDATE (wait) | — |
| `transition_job_state` other edges | — (live behaviour, unchanged) | FOR UPDATE | — | — |
| `admin_assign_professional` | FOR UPDATE | FOR UPDATE | NO KEY UPDATE (wait) | — |
| `admin_reassign_job` | FOR UPDATE | FOR UPDATE | NO KEY UPDATE (wait) | — |
| `admin_withdraw_offer` | FOR UPDATE | FOR UPDATE | — | — |
| `professional_withdraw_from_job` | FOR UPDATE | FOR UPDATE | — | insert (review path) |
| `admin_transition_professional_verification` | — | — | NO KEY UPDATE | — |
| `admin_recover_suspended_professional` | FOR UPDATE (id order) | FOR UPDATE | — | insert |
| `admin_resolve_exception` | FOR UPDATE | FOR UPDATE | — | FOR UPDATE |
| `_release_offer` (live) | FOR UPDATE | FOR UPDATE | — | — |

Callers of the changed definer functions were inspected in the live source: `_offer_next` is called by `_assign_booking_internal` (which holds the booking) and `process_assignment_queue`; `transition_job_state` is the client-callable entry. Not re-read: `assign_booking`, `customer_cancel_booking`; if either locks job before booking it would violate the order and must be checked before applying.


## 6. Notification-impact analysis

Live: offer events (assigned/reassigned/unmatched) notify nobody. WhatsApp rows (`notification_logs`) are written by `on_job_state_transition` only for to_state accepted/on_the_way/arrived/in_progress/completed/cancelled; A4 events all use to_state `assigned`, so **A4 creates no WhatsApp rows**.

| Event | Old pro | Customer | New pro |
|---|---|---|---|
| `admin_assign` (displacing an offer) | `assignment_removed` | none (never told) | none (existing offer UI) |
| `admin_assign` (from none) | n/a | none | none |
| `admin_withdraw_offer` | `assignment_removed` | none | n/a |
| `admin_reassign` from `assigned` | `assignment_removed` | none | none |
| `admin_reassign` from `accepted` | `assignment_removed` | `professional_changed` | none |
| `professional_withdrew` | n/a | `professional_withdrew` | n/a |
| suspension | none (admin acts separately) | none | n/a |

New kinds need both `_notify` VALUES and `notifications_kind_check` (115). Delivery remains unobservable (notification rows only). Copy strings need owner sign-off. Unverified: whether the event trigger fires `_notify_for_event` for unknown event types, and the old professional's link may 404 after RLS drops their access.

## 7. Authorization and security review (REVISION 2)

- **Ownership/definer:** all A4 functions are `SECURITY DEFINER` owned by the migration role; helpers `_schedule_active_states`, `_professional_conflicts` (SECURITY INVOKER), `_require_read_committed` are revoked from PUBLIC, anon, authenticated and service_role, and are called only from definer functions. `_require_admin` is revoked from all end-user roles. The edge-guard trigger function is revoked from all roles.
- **search_path:** every new or replaced definer function sets `'public','pg_temp'`; an automated static test enforces it. The one exception is the copied live `transition_job_state` (live `'public'`), documented.
- **EXECUTE grants:** admin RPCs and the withdrawal RPC are granted to `authenticated` (+ `service_role`); a regression test requires REVOKE FROM PUBLIC, anon. `CREATE OR REPLACE` keeps existing grants; they must be re-listed after any apply (not altered by the drafts).
- **Authentication/admin check:** `auth.uid()` NULL (anon, service_role) raises 42501. Admin is read from `profiles.role`, never from a parameter or JWT claim.
- **Professional ownership:** the withdrawal RPC compares `jobs.professional_id` to `auth.uid()` after locking, and returns "Job not found" for both strangers and missing jobs. `transition_job_state` pre-checks ownership on the accept path before taking any lock.
- **RLS:** definer functions bypass RLS by design; clients cannot write `bookings` (SELECT policy only, read earlier). RLS on `jobs` and `job_exceptions` writes was **not re-read**: listed as unverified.
- **Unauthorized direct state change:** blocked by `jobs_guard_recovery_edge` (accepted → assigned) and, for rescheduling, `bookings_guard_schedule_change`. Other edges are enforced by the unchanged `transition_job_state` edge table.
- **Call chains:** client → `transition_job_state` (definer) → `_require_read_committed`, `_professional_conflicts` (invoker, run with the definer's rights); no helper is reachable from a client. Admin → `admin_*` (definer) → `_require_admin`, `_idem_begin/_idem_finish` (service_role only), `_release_offer`, `_job_code_event`.

## 8. Tests

**Executed (static, `src/__tests__/a4-draft-package.test.ts`, 26 checks + 15 `it.todo`):** file hygiene; every revision-2 file says it is not parsed/tested; admin functions call `_require_admin`; REVOKE present; direct `current_state` writers limited to reviewed files; regression pinning the conflict-check active-state list to the transition machine's non-terminal states; helper revoke/INVOKER checks; `search_path` with `pg_temp` on every definer function; no advisory locks; L3 taken only after L1; no `job_exceptions` insert in a function that takes L3; withdrawal uses the DB clock and the edge guard; inconclusive cannot close. **These prove file hygiene and structure, not behaviour.**

**NOT EXECUTED:** the 15 PostgreSQL scenarios in `docs/A4_SQL_TEST_SPECS.md` (matcher vs acceptance, simultaneous acceptances, acceptance vs reschedule, suspension vs offer creation / acceptance, withdrawal before and after start, withdrawal racing cancellation, duplicate resolution, inconclusive findings, authorization, isolation level, drift, notifications, edge guard). They need ≥ 2 committed sessions, so they **cannot be rolled back** and need separate authorization with their exact effects reviewed.

## 9. Migration dependency assessment (REVISION 2)

| Migration | Changed by the corrections? | Depends on |
|---|---|---|
| 111 | Yes, rewritten (lock model, reschedule guard, read-committed guard) | live schema only; **may be reviewed and shipped alone** |
| 112 | Yes: kind `professional_withdrawal_request`; columns `detail`, `resolution_basis`; resolution constraint; search_path | live schema |
| 113 | Yes: L3 lock model, `_require_read_committed`, edge-guard trigger + GUC, search_path | 111 (helpers), 112 |
| 114 | Yes, rewritten (withdrawal cutoff, two-phase suspension, resolution contract) | 111, 112, 113 (`_idem_*`, edge guard) |
| 115 | Comments and search_path only; new event types intentionally map to no notification | 113, 114 event names |
| 116 | **No change.** Detection view reads bookings/jobs only; independent of the lock model and of 111/114 | live schema |
Order: 111 → 112 → 113 → 114 → 115; 116 any time. Rollback in reverse; 113's rollback now also drops the trigger; 112's rollback removes the four new columns/kinds and requires them to be unused.


## 10. Booking/job consistency

116 adds a detection view only. Observed 2026-11-01: 6 of 15 bookings disagree with their job (pending/confirmed vs cancelled, completed, closed, in_progress). Only `admin_cancel_job`, `customer_cancel_booking` and reconcile write `booking_status`. The `booking_status` value set could not be read; only pending/confirmed/cancelled observed. A sync trigger and backfill are not drafted: the backfill would modify real customer records and needs separate authorization.

## 11. Production-risk assessment

| Risk | Level | Note |
|---|---|---|
| Replacing `transition_job_state` | High | Core path for every job; copy was made from the live body but not diffed by tooling or executed |
| Replacing `_offer_next` | High | Live matcher |
| Suspension rewrite | Medium-high | Only exercised when suspending a verified pro |
| Constraint widening (112, 115) | Low-medium | `DROP/ADD CONSTRAINT` takes an exclusive lock briefly; job_exceptions has 0 rows |
| New functions (113, 114) | Low until UI calls them | No caller exists |
| Notifications (115) | Medium | Real users receive in-app rows once used |
| Drift view (116) | Low | read-only |
| Everything: same project as production | Elevated | no staging by owner decision; guardrails in `STAGING_PROPOSAL.md` |

## 12. Remaining owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D-A4-1 | Apply 111 first and alone, after review | Yes, in a quiet window with a tested rollback |
| D-A4-2 | Admin assignment is an offer | Yes (as drafted) |
| D-A4-3 | New edge accepted→assigned (admin reassign, pro withdraw only) | Approve |
| D-A4-4 | Route professional cancel after acceptance through `professional_withdraw_from_job` (app change not yet drafted: the professional UI/action still calls `transition_job_state` cancel) | Approve |
| D-A4-5 | Park-from-queue (`admin_hold`) | Defer |
| D-A4-6 | Reassign with unchanged schedule/price/scope needs notice, not consent | Confirm |
| D-A4-7 | booking_status sync + backfill of drifted rows | Decide mapping, authorize backfill separately |
| D-A4-8 | New notification wording (3 strings) | Review |
| D-A4-9 | No-show consequences for professionals (strikes, ratings) | None in v1 |
| D-A4-10 | Test authorization on the shared project (isolation, synthetic data, cleanup) | Review the exact effects first |
| D-A4-11 | Closure policy for `inconclusive` no-show / exception findings (none in A4: they stay open) | Decide whether a time-boxed or second-reviewer closure is acceptable |
| D-A4-12 | Notify the professional when a withdrawal request is refused, and the customer when a no-show report is closed | Decide copy and recipients |

Separate proposed enhancement, not in A4: cap of 3 pending offers per professional (`open offers < 3` in eligibility and the 111 recheck under the same lock). Needs matching-metrics data first.

## 13. Incomplete or unverified (do not read as ready)
- No SQL executed or parsed by Postgres; syntax and semantics unchecked.
- Race and suspension deadlock are inferred, not reproduced.
- Not re-read: `process_assignment_queue`, `assign_booking`, `customer_cancel_booking`, `notify_on_job_event`, RLS on `job_exceptions`.
- Quote status vocabulary assumed (`declined`, `expired` are the only statuses that permit reassignment).
- `_release_offer` behaviour on a job no longer `assigned`, and `_job_code_event` target/event names, not re-read.
- `booking_status` semantics for an unassigned/withdrawn booking undecided.
- Application code (Server Actions, Zod validators, UI) for the new RPCs not written; professional app still cancels directly.
- Grants on `admin_transition_professional_verification` after `CREATE OR REPLACE` need confirmation.
- Notification link for the former professional; rescheduling a booking not rechecked.

## 14. Withdrawal, suspension and exception-resolution contracts (REVISION 2)

### 14.1 Professional withdrawal (`professional_withdraw_from_job`)
One mechanism: a dedicated privileged RPC. It was chosen over extending `transition_job_state` because that function is the generic, client-callable machine; adding the edge there would expose it to every caller without the cutoff, ownership and exception logic. The edge itself is protected by `jobs_guard_recovery_edge`.
| Condition (DB clock, locked rows) | Result |
|---|---|
| state `accepted` and `now() < scheduled_start` | Controlled withdrawal: attempt row (`withdrawn/professional_withdrew`), job → `assigned` with professional, `accepted_at`, ETA, offer expiry cleared (previous `accepted_at`/ETA preserved in the event metadata), booking returns to the unmatched pool, event `professional_withdrew` (customer notified, 115). Payments and quotes untouched. Re-offer is left to the queue |
| `accepted` and `now() >= scheduled_start`, or `on_the_way` / `arrived` / `in_progress` / `quote_pending` | No state change. Open `job_exceptions` (kind `professional_withdrawal_request`, preference `admin`) and event `professional_withdrawal_requested`; returns `review_requested`. An administrator decides (reassign / cancel / refuse) |
| `assigned`, `cancelled`, `closed`, `completed` | `STALE_STATE` (40001) |
| caller is not the job's professional or job missing | "Job not found" (same answer) |

### 14.2 Suspension
Phase 1 `admin_transition_professional_verification(suspend)`: holds L3 only; flips status/availability, writes the verification event; reports `recovery_required`, pending offers and active jobs. After it commits the professional can receive no new offer (matcher, ranker, admin assign all require `verified`) and cannot accept an existing one (accept guard). Phase 2 `admin_recover_suspended_professional(pro, limit ≤ 50)`: no L3 lock; releases pending offers booking → job via `_release_offer`; creates one open `professional_suspended_active_job` exception per active job (booking → job → exception). Active and in-progress jobs are **never auto-cancelled or reassigned**. It returns `done:false` while work remains; repeat until `done:true`. Convergence follows from no new offers reaching a suspended professional. This replaces the 50-iteration loop, whose only purpose was to chase offers created concurrently; a bounded batch with an explicit remaining count makes the outcome deterministic and visible.

### 14.3 Exception resolution (`admin_resolve_exception`)
Status `open` → `resolved` (finding `confirmed`) or `dismissed` (finding `not_confirmed`). `inconclusive` is a recorded finding on an **open** case, never a closure (enforced by the 112 constraint and the function). Basis: `system_verified` (the database proves it) or `admin_attested` (rests on outside information; note ≥ 20 characters). Every call writes an event; closure writes `exception_resolved`.
| Kind | Finding + resolution | Precondition checked in the DB | Basis |
|---|---|---|---|
| no_show | confirmed + cancelled | job cancelled; no arrival/in-progress event; start + 30 min ≤ now | system_verified |
| no_show | confirmed + reassigned | job's professional differs; same allegation check | system_verified |
| no_show | confirmed + customer_declined | same allegation check | admin_attested |
| no_show | confirmed + no_action | **rejected** (a confirmed no-show needs an outcome) | — |
| no_show | not_confirmed + no_action | none; arrival event present → verified else attested | system_verified / admin_attested |
| no_show | inconclusive (resolution NULL) | none | stays open |
| suspended_active_job / withdrawal_request | confirmed + cancelled | job cancelled | system_verified |
| same | confirmed + reassigned | job's professional differs from the exception's | system_verified |
| same | confirmed + no_action | job completed/closed → verified; else work continues as is → attested | system_verified / admin_attested |
| same | not_confirmed, customer_declined | **rejected** | — |
| same | inconclusive | none | stays open |
Duplicate resolution: same `request_id` replays the stored result; a different one gets `STALE_STATE`; concurrent admins serialize on the booking lock. There is no closure policy for inconclusive cases (D-A4-11).

## 15. Remaining blockers before any approval
1. Revision 2 has not been parsed or executed by PostgreSQL. A syntax/semantic pass (ideally on a throwaway local Postgres, which needs no authorization on the shared project) is the first step.
2. Callers `assign_booking`, `customer_cancel_booking`, `notify_on_job_event`, `process_assignment_queue` not re-read for lock order.
3. `_release_offer` / `_job_code_event` behaviours and RLS on `jobs` / `job_exceptions` writes unverified.
4. Owner decisions D-A4-3, D-A4-4, D-A4-8, D-A4-11, D-A4-12; test authorization (D-A4-10) with reviewed isolation.
5. Application changes (Server Actions, Zod schemas, UI) not written; the professional UI still cancels directly.
6. Quote status vocabulary and `booking_status` value set unknown.
