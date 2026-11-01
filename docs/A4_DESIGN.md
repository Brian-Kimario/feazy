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
| `20261102_111_a4_scheduling_integrity` | Per-professional advisory lock, `_professional_conflicts`, replacement `_offer_next` and `transition_job_state` (recheck at accept) | Restores live bodies verbatim; drops 3 helpers |
| `20261102_112_a4_vocabulary_idempotency` | `_require_admin()`, `admin_operation_requests`, widened `reason_code`/`kind`/`preference` checks, `finding`/`resolution` columns | Counts-based preconditions; reverses all |
| `20261102_113_a4_admin_assignment` | `admin_assign_professional`, `admin_withdraw_offer`, `admin_reassign_job`, idempotency helpers | Drops functions; history rows kept |
| `20261102_114_a4_recovery` | `professional_withdraw_from_job`, reordered/extended suspension, `admin_resolve_exception` | Restores live suspension body; drops 2 functions |
| `20261102_115_a4_notifications` | 3 new notification kinds, `_notify`, `_notify_for_event`, kind check | Fails loudly if new-kind rows exist (owner decides) |
| `20261102_116_a4_lifecycle_drift` | Read-only view `a4_assignment_drift` | Drops view |

Not "ready": the SQL has never been executed, not even parsed by Postgres in this session. See section 11.

## 3. State-transition matrix

"Reassign" = controlled change of professional through the new functions. No new state machine: the only new edge is **accepted → assigned**, written only by `admin_reassign_job` and `professional_withdraw_from_job`, both with a `job_events` row.

| Job state | Admin assign | Admin withdraw offer | Admin reassign | Pro withdraw | Suspension of pro | Notes |
|---|---|---|---|---|---|---|
| none (booking pending) | Yes (offer) | n/a | n/a | n/a | n/a | creates job `assigned` |
| assigned, no pro | Yes | n/a | n/a | n/a | n/a | expected_state `assigned`, expected pro NULL |
| assigned, pro (offer) | Yes (replaces) | Yes | Yes | decline (existing) | offers released (exists) | replaced pro gets attempt `admin_reassigned` |
| accepted, before start | no | no | Yes (back to `assigned`, new offer) | Yes (`professional_withdraw_from_job`) | job kept, exception raised | refuses `NEEDS_CUSTOMER_CONSENT` if a non-declined/expired quote exists |
| accepted, at/after start | no | no | `NEEDS_ADMIN_REVIEW` | `NEEDS_ADMIN_REVIEW` | exception raised | no silent change late |
| on_the_way … quote_pending | no | no | no | `NEEDS_ADMIN_REVIEW` | exception raised | cancel via `admin_cancel_job` |
| completed / cancelled / closed | no | no | no | no | no | terminal |

Offers created by an administrator are **offers**: the professional still accepts or declines. Admin does not override verification, availability or schedule conflicts.

Operation detail (actor / expected-state check / records / lock order / failure / idempotency):

| Operation | Actor | Expected-state input | Records written | Failure codes | Idempotency |
|---|---|---|---|---|---|
| manual assignment | admin | `p_expected_state` none\|assigned + `p_expected_professional_id` | jobs, bookings, attempt (displaced pro), `matching_decisions` kind `offered` with `inputs.manual`, job_event `admin_assign` | STALE_STATE, STALE_PROFESSIONAL, BOOKING_NOT_ASSIGNABLE, PROFESSIONAL_INELIGIBLE, SCHEDULE_CONFLICT | `(admin, op, request_id)` + input hash; changed inputs → IDEMPOTENCY_KEY_REUSED |
| offer withdrawal | admin | expected professional | attempt `withdrawn/admin_withdrawn`, jobs, bookings (unmatched), event `admin_withdraw_offer` | STALE_*, NOT_AN_OFFER | same |
| reassignment | admin | state assigned\|accepted + expected pro | attempt, jobs (accepted_at/eta cleared), bookings, decision, event `admin_reassign` | STALE_*, NEEDS_ADMIN_REVIEW, NEEDS_CUSTOMER_CONSENT, PROFESSIONAL_INELIGIBLE, SCHEDULE_CONFLICT | same |
| professional cancel recovery | the assigned professional | state must be `accepted` | attempt `withdrawn/professional_withdrew`, jobs, bookings, event `professional_withdrew` | NEEDS_ADMIN_REVIEW; "Job not found" for non-owner (no enumeration) | natural (second call finds state `assigned`) |
| suspension recovery | admin | `p_expected_status` | profile, verification event, released offers, `job_exceptions` rows for active jobs | stale status 55000, retry 40001 | status check |
| no-show / exception resolution | admin | `p_expected_status` = `open` | `job_exceptions` finding/resolution, event `exception_resolved` | STALE_STATE, RESOLUTION_MISMATCH | `(admin, resolve_exception, request_id)` |
| lifecycle sync | none yet | n/a | drift view only | n/a | n/a |
| scheduling protection | system | n/a | none | SCHEDULE_CONFLICT (ERRCODE 23P01) | n/a |

No-show semantics (corrected): the live `report_professional_no_show` refuses assigned/arrived/in_progress/quote_pending/completed/closed/cancelled jobs and any job with `arrived_at`, and requires now ≥ scheduled start + 30 min. The permitted states are therefore **accepted and on_the_way without arrival**. A customer report is an *allegation*; the admin finding (`confirmed | not_confirmed | inconclusive`) is separate, and `admin_resolve_exception` changes no job state and applies no penalty: cancellation or reassignment is done first by its own audited operation, then recorded and verified here.

## 4. Scheduling-race analysis

Unchanged from 1.2 (derived from function bodies, **not reproduced**). Fix in 111:
- offer creation (`_offer_next`): try-lock the candidate's schedule lock; skip (do not wait) if held; verify under `FOR SHARE` that the professional is still verified and available; re-run the conflict check including other pending offers; first passing candidate wins.
- acceptance (`transition_job_state` ACCEPT-GUARD): re-read verification `FOR SHARE`, take the blocking schedule lock, re-run the conflict check against **committed** work only (other pending offers do not block acceptance; accepting one of two overlapping offers is legitimate, accepting the second then fails).
- admin assign/reassign: blocking schedule lock + the same check.
- Residual: the ranker's own filter remains lock-free (a hint only; the locked recheck is authoritative). The ±2 h rule ignores job duration (owner decision: stays). If bookings can be rescheduled, the new start is not re-checked (unverified).

## 5. Lock-order specification

Canonical: **booking → job → professional_profiles row → job_exceptions row → per-professional schedule advisory lock (leaf, nothing acquired after it)**.
- Matcher uses `pg_try_advisory_xact_lock` so rank-order iteration can never wait and deadlock.
- Accept (live) was job → pro → advisory; it never took the booking lock. 111 keeps that order (a subsequence of canonical).
- Live suspension took pro row `FOR UPDATE` first and then jobs, and `_release_offer` takes booking while holding the job: an inversion (**deadlock risk inferred from code, not reproduced**). 114 reads status unlocked, releases offers booking→job, then locks the pro `FOR NO KEY UPDATE`, revalidates and rescans (SQLSTATE 40001 if an offer sneaked in).
- Pro row uses `NO KEY UPDATE`/`SHARE`, never `UPDATE`, so FK inserts (`KEY SHARE`) are not blocked.
- `admin_resolve_exception`: booking → job → exception.

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

## 7. Authorization model

Every privileged RPC: `SECURITY DEFINER`, `search_path = public`, `REVOKE ALL FROM PUBLIC, anon`, grant to `authenticated` + `service_role`. The caller is `auth.uid()` (NULL for service_role/anon → 42501) and `profiles.role = 'admin'` read from the table, never from a parameter or JWT claim (`_require_admin()`). The professional-side function checks `jobs.professional_id = auth.uid()` and gives the same "not found" for strangers. The app layer additionally verifies the session (existing `requireAdmin` tests) and validates inputs with Zod before calling. Support role deferred.

## 8. Tests

Executed now (static, `src/__tests__/a4-draft-package.test.ts`, 18 tests): each forward file has a rollback; files are labelled draft; nothing copied into `supabase/migrations`; every `admin_*` function calls `_require_admin()` or the role check; REVOKE from PUBLIC/anon present; direct `current_state` writers limited to the reviewed files; no `kind='manual'`. **These prove file hygiene, not correctness.**

NOT EXECUTED (15 `it.todo` in `describe.skip`, blocked pending separate authorization): admin authorization, non-admin refusal, stale expected state, duplicate request, concurrent assignments, concurrent acceptance, incompatible scheduling, suspended/unverified professionals, suspension recovery, professional cancellation, no-show resolution, booking/job consistency, notification correctness, payment preservation, audit integrity.

Isolation properties to review before any DB test is authorized (shared project): a test needs synthetic users and bookings with past or far-future starts that no real professional can match (none of the two legacy verified professionals), no notification to real users (notifications are written in-transaction; rollback removes the rows but not anything a client already read), concurrency tests need ≥2 committed sessions and therefore cannot be rolled back, and DDL needs the migration applied. Read-only schema inspection only has been performed.

## 9. Migration dependency order

111 (independent, may ship alone) → 112 → 113 → 114 → 115 (needs 113 and 114 event names) → 116 (independent). Rollback in reverse. 114's rollback restores the pre-114 suspension body; 112's rollback needs 0 rows using the new vocabulary.

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

Separate proposed enhancement, not in A4: cap of 3 pending offers per professional (`open offers < 3` in eligibility and the 111 recheck under the same lock). Needs matching-metrics data first.

## 13. Incomplete or unverified (do not read as ready)
- No SQL executed or parsed by Postgres; syntax and semantics unchecked.
- Race and suspension deadlock are inferred, not reproduced.
- Not re-read: `process_assignment_queue`, `assign_booking`, `customer_cancel_booking`, `notify_on_job_event`, RLS on `job_exceptions`.
- Quote status vocabulary assumed (`declined`, `expired` are the only statuses that permit reassignment).
- `booking_status` semantics for an unassigned/withdrawn booking undecided.
- Application code (Server Actions, Zod validators, UI) for the new RPCs not written; professional app still cancels directly.
- Grants on `admin_transition_professional_verification` after `CREATE OR REPLACE` need confirmation.
- Notification link for the former professional; rescheduling a booking not rechecked.
