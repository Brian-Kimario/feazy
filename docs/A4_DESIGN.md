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
- `job_exceptions` has `kind = 'professional_no_show'` only, unique `(job_id, kind)`, status open|resolved|dismissed, resolution fields. `report_professional_no_show` (customer) refuses an `assigned` job ("No professional has accepted this job yet") and requires the scheduled start to be 30+ minutes past; the exact full list of permitted states was not re-read after this correction, so treat "accepted/on_the_way, no arrival" as the intended case, not a verified list.
- Live data **[V]**: 12 jobs; 0 pairs of active jobs for one professional within 2 h of each other.

### 1.2 Defect: incompatible offers and acceptances are possible **[A — not reproduced]**
`_rank_professionals` excludes a professional with a conflicting active job, but the check and the offer are not atomic and nothing serialises per professional:
1. Two sessions — for example a customer's `assign_booking` for booking B1 and the queue (or another customer's `assign_booking`) for B2 — rank the same top professional at the same moment. READ COMMITTED means neither sees the other's uncommitted offer. They hold different booking locks, so nothing blocks them. Both commit. The professional now has two `assigned` offers within 2 h.
2. `transition_job_state(… 'accepted')` does not re-check overlap or availability, so the professional can accept **both**.
3. Nothing in the schema forbids it (no unique/exclusion constraint; cross-table).
This is a **scheduling-integrity defect**. Exposure is limited today (few professionals, the queue serialises its own runs), and live data shows no overlap, but it is real. Fix included in A4 (section 5).
The 2-hour window also ignores job duration. That stays: provisional per owner.

## 2. State-transition matrix **[P]**

"Reassign" means a controlled change of the assigned professional via the new functions, never a direct column write.

| Job state | Booking | Admin: assign/offer | Admin: withdraw offer | Admin: reassign | Pro cancels/withdraws | Suspension of the pro | Notes |
|---|---|---|---|---|---|---|---|
| none (no job) | pending | **Yes** (targeted offer) | n/a | n/a | n/a | n/a | creates the job in `assigned` |
| assigned, no pro | pending | **Yes** | n/a | n/a | n/a | n/a | unmatched booking |
| assigned, pro set (offer) | pending | replace = withdraw + offer | **Yes** | **Yes** (= withdraw + new offer) | decline (existing `decline_job`) → matching continues | offer withdrawn automatically (exists), re-offered | expiry exists |
| accepted, `now < scheduled_start` | confirmed | n/a | n/a | **Yes**, offer-first: job returns to `assigned`, old pro released | **withdraw** via new function → `assigned`, re-match | job kept, **flagged for review**; admin may reassign | needs new edge accepted→assigned (admin/pro-withdraw context only) |
| accepted, `now ≥ scheduled_start` | confirmed | no | no | **No — admin review** | admin review | flagged | late: no silent change |
| on_the_way / arrived / in_progress / quote_pending | confirmed | no | no | **No — admin review** | admin review | flagged | cancel stays via `admin_cancel_job` |
| completed / cancelled / closed | — | no | no | no | no | no | terminal |

Rules: no reassignment after work has started (on_the_way and later) in any circumstance; if a customer's price, schedule or scope would change, the function refuses and the case goes to admin review (consent flow is a later slice). Booking status: `pending` while an offer is open; the booking/job pair is changed in one transaction so they cannot disagree.

## 3. Contracts **[P]**

All functions are SECURITY DEFINER, `search_path = public`, `REVOKE ALL … FROM PUBLIC, anon`, granted to `authenticated` and re-verify `profiles.role = 'admin'` inside (the pattern of `admin_cancel_job`). Each takes an `expected_*` precondition, a reason (≥ 10 chars, Zod-validated in the app), and an idempotency key. Each writes an immutable `job_events` row and returns a typed value (`{ok, code, …}`); stale state is a value, not an exception.

### 3.1 `admin_assign_professional(p_booking_id, p_professional_id, p_expected_job_state, p_expected_professional_id, p_reason, p_idempotency_key)`
Manual targeted offer. Behaviour:
1. Verify admin. Lock booking, then job (if any), then take the professional lock (section 5).
2. Preconditions (typed refusal otherwise): booking `pending` and in the future; job absent or `assigned`; state and current professional equal the expected values; professional verified, available, not suspended, skills/area match (admin may not override verification or conflicts in v1); no schedule conflict (same check as the fix); not already attempted on this booking.
3. Replace any open offer: write an attempt (`withdrawn`, `admin_reassigned`) for the previous professional.
4. Write `matching_decisions(kind='manual')`, set `jobs.professional_id`, `offer_expires_at`, `bookings.professional_id`, clear `unmatched_since`. Create the job if absent.
5. Event `admin_assigned`; notify the new professional (offer) and, if replaced, the previous one. The professional still accepts or declines — admin assignment is **an offer**, never an auto-accept.
Idempotent on the key: a repeat returns the original result.

### 3.2 `admin_withdraw_offer(p_job_id, p_expected_professional_id, p_reason, p_requeue boolean, p_idempotency_key)`
Only for `assigned` with a professional. Records an attempt `withdrawn`/`admin_withdrawn`, clears the professional on job and booking, sets `unmatched_since`; `p_requeue = true` leaves the booking for the queue, false parks it (`admin_hold` flag — see open decisions). Event `offer_withdrawn`; notifies the professional.

### 3.3 `admin_reassign_job(p_job_id, p_new_professional_id, p_expected_state, p_expected_professional_id, p_reason, p_idempotency_key)`
Allowed only when `current_state ∈ {assigned, accepted}` and `scheduled_start > now()` (and, for `accepted`, `arrived_at/on_the_way_at IS NULL`).
- `assigned`: same as 3.1.
- `accepted`: refuse if any quote for the job is not terminal, or a job code was used; otherwise: attempt row (`reassigned`, `admin_reassigned`) for the former professional; job state back to `assigned` through the **one new canonical edge accepted→assigned**, taken only under session flag `app.admin_reassign_job = <job id>` (same guard pattern as cancel); new professional offered (3.1 steps 4–5); codes issued at `on_the_way` are not yet issued so none to void; `accepted_at` cleared into the event metadata.
- Both: the previous professional loses access automatically (RLS on `professional_id`); they receive a notification. The customer is notified that their professional changed, with no price/schedule change. Payments are not touched; quotes are preserved (guard refuses if non-terminal).
Customer consent: not required while schedule, price and scope are unchanged (the function cannot change them). Anything that would change them is out of scope and refused with code `NEEDS_CUSTOMER_CONSENT`.

### 3.4 `professional_withdraw_from_job(p_job_id, p_reason_code, p_note)` (replaces the professional's direct `cancelled`)
Called by the assigned professional.
- `assigned`: existing `decline_job` (unchanged); matching continues.
- `accepted`, `now < scheduled_start`: job back to `assigned` (new edge, professional-withdraw context), attempt `withdrawn`/`professional_cancelled`, booking stays `pending`, `_offer_next` runs; if no eligible professional, `unmatched_since` is set so it shows on the unmatched queue. Customer is notified that we are finding a replacement; **the booking is not cancelled**.
- `accepted` at/after `scheduled_start`, or any later state: **refused** with `NEEDS_ADMIN_REVIEW`; an open `job_exceptions` row `professional_withdrew` is created and admins are alerted.
- To make this effective the professional's `cancelled` edge in the allow-list is removed for `accepted…`; this is a behaviour change to confirm with the owner (open decision D-A4-4). The five historical "drift" rows are not touched.

### 3.5 Suspension **[P]** (changes to `admin_transition_professional_verification` 'suspend')
- Already **[V]**: sets `is_available = false`; eligibility requires `verified` so no new offers; outstanding `assigned` offers are withdrawn and re-offered.
- Add: for each job in `accepted | on_the_way | arrived | in_progress | quote_pending` assigned to the professional, create an open `job_exceptions` row `professional_suspended_active_job` and an event; **do not change job state or cancel**. These appear in the Command Center as admin-review items. Reactivation does not restore offers or availability (`is_available` stays false until the professional turns it on; already true).
- Customer notification only when the admin acts (reassign or cancel), not on suspension itself.

### 3.6 No-show resolution (admin) **[P]**
Terms: **potential** = derived, not stored (job accepted/on_the_way, no `arrived_at`, `now > scheduled_start + 30 min`); **reported** = open `job_exceptions` row from the customer; **confirmed** = admin finding recorded after reviewing evidence; **resolved** = an outcome recorded. Lateness is never auto-classified.
`admin_resolve_no_show(p_exception_id, p_finding, p_resolution, p_evidence_note, p_expected_status, p_reason, p_idempotency_key)`
- `p_finding` ∈ `confirmed | not_confirmed | inconclusive`; `p_resolution` ∈ `reassigned | customer_rescheduled | cancelled_no_fee | completed_late | no_action`.
- Evidence the UI must show before submit: job timeline (`job_events` with timestamps and GPS-free), messages count, ETA/arrival timestamps, professional's history of reports, the customer's preference (reassign/support). Evidence note is required.
- `confirmed + reassigned` calls 3.3 in the same transaction (if allowed by section 2; otherwise refused). `cancelled_no_fee` calls the existing `admin_cancel_job`. **No automatic refund, penalty or metric change**; a confirmed finding adds a record for later policy.
- Closes the exception (`resolved` or `dismissed`), writes `resolved_by`, `resolved_at`, note; event `no_show_resolved`.

## 4. Booking/job consistency **[P]**
- Invariants to assert in tests (and as a read-only drift report for the console): (i) `bookings.professional_id IS NOT DISTINCT FROM jobs.professional_id` whenever a job exists; (ii) job `assigned` with a professional ⇒ booking `pending`; (iii) job `accepted…quote_pending` ⇒ booking `confirmed`/`in_progress` per existing mapping; (iv) no professional has two active jobs within the 2-hour window (the scheduling invariant).
- All A4 functions update booking and job in one transaction, in lock order.
- Payments and quotes are never written by A4 functions; guards read them only.

## 5. Scheduling-integrity fix (included in A4) **[P]**
- `_professional_conflicts(pro, booking)`: the existing ±2 h rule as a function.
- `_lock_professional_schedule(pro)`: `pg_advisory_xact_lock(hashtextextended('schedule:' || pro, 0))`. **Taken last, after booking and job locks**, and held only for a read-check-write leaf section that never waits for another lock — so it cannot join a cycle with the 108/109 order.
- In `_offer_next`: after choosing a candidate, take the schedule lock, re-run `_professional_conflicts`; if it now conflicts, try the next ranked candidate instead.
- In `transition_job_state` for `accepted`: take the schedule lock and re-check; refuse with a typed error if another active job now overlaps.
- Why advisory and not a row lock: the professional row is already `FOR NO KEY UPDATE`/`KEY SHARE` in 108/109; a further row lock would re-open that analysis.
- Lock-order table for tests: B(ooking) → J(ob) → P(rofessional-row, NO KEY UPDATE, suspension only) → S(chedule advisory). All new code obeys it.
- Cost: serialises concurrent offers for the same professional only; throughput impact negligible at current scale.
The 3-pending-offers cap is a **separate proposed enhancement** (section 8), not part of A4.

## 6. Test plan **[P — nothing run]**
Run only in a throwaway/local Postgres or a provisioned staging project (never the shared one), with synthetic users.

Authorization (each function): unauthenticated, customer, professional, support (deferred, expect refusal), admin without JWT `sub`; wrong `expected_*`; reuse of idempotency key by a different actor; direct table writes by `authenticated` fail on `jobs.professional_id` / `bookings.professional_id`.
State matrix: one case per row of section 2 (allowed and refused), including on_the_way and `now ≥ scheduled_start`.
Contract: former professional loses read access to job, messages, quotes, events; new professional sees them; quote/payment rows byte-identical before and after; attempt rows and events written exactly once; notifications created for the right recipients.
Concurrency (two sessions, `pg_sleep` barriers):
1. Two bookings offered to the same professional within 2 h by `assign_booking` and the queue concurrently → exactly one offer; the loser tries the next candidate.
2. Two accepts for two overlapping offers (set up by bypassing the fix on a copy to prove the guard) → one succeeds, one typed refusal.
3. `admin_reassign_job` vs professional `accept`/`on_the_way` on the same job → one wins, the other gets a stale-state value.
4. `admin_reassign_job` vs `admin_cancel_job`, vs `customer_cancel_booking`, vs professional suspension, vs queue expiry → no deadlock (all four lock-order pairs), no lost update.
5. Duplicate request with the same idempotency key returns the first result and writes one event.
6. Suspension during reassignment to that professional → assignment refused or immediately withdrawn.
Invariant sweep after every case: section 4 queries return zero rows.

## 7. Owner decisions needed before any A4 implementation
| # | Decision | Recommendation |
|---|---|---|
| D-A4-1 | Apply the scheduling-integrity fix (section 5) first and separately? | Yes — smallest, independent of admin UI; needs staging or an approved window |
| D-A4-2 | Admin assignment creates an **offer** (professional accepts) vs auto-accepts | Offer; keep consent and quote flow intact |
| D-A4-3 | New backward edge accepted→assigned (admin and professional-withdraw only) | Approve |
| D-A4-4 | Remove the professional's direct `cancelled` after acceptance and route through `professional_withdraw_from_job` | Approve; changes professional-app behaviour |
| D-A4-5 | `admin_hold` (park an unmatched booking out of the queue) | Defer; v1 `p_requeue` only true |
| D-A4-6 | Scope of consent: confirm that same schedule/price/scope reassignment needs notice, not consent | Confirm |
| D-A4-7 | Where to run migrations before production (staging, section 11 of the staging doc) | Staging first |

## 8. Separate proposed enhancement: max 3 pending offers
Not implemented, not required for A4. If wanted later: `_professional_open_offers(pro) < 3` in eligibility and in the section 5 re-check under the same schedule lock. Trade-off: protects professionals from queue flooding but lowers match rate on a thin supply. Needs matching-metrics data first.

## 9. Open risks
- The race in 1.2 is unreproduced; it is derived from the function bodies. First step on staging is to reproduce it.
- `notify_on_job_event` must be extended for the new event types; I have not read its CASE list (verify before implementing).
- Notification delivery is unobservable today (61 rows, all `pending`), so "notified" means a row written.
- The two legacy verified professionals are left as they are; they can still be offered work.
- Booking `c779c0d4` is not touched by anything here.
- Admin UI for these actions can ship without the migrations: it renders the existing read-only workspace and links nothing that needs a missing function.
