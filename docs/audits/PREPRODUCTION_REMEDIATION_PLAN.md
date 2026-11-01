# Pre-production remediation plan (current-state review)

Date: 2026-11-01. Branch `audit/preproduction-remediation` (HEAD eec8e18, local, nothing pushed).
Status of this document: **planning only. No R1 code written, nothing deployed, nothing pushed to `main`.**
Labels: **[V]** verified this session (SQL on the shared project, read-only, or code read). **[D]** taken from repo docs, not re-run. **[U]** unverified.

## 1. Method and limits

- Read: audit report (Rev 2 + §10), `CLAUDE.md`, `AGENTS.md`, `docs/A3_REVIEW.md`, `docs/ADMIN_REBUILD_PROGRESS.md`, `docs/STAGING_PROPOSAL.md`, `docs/05-decisions/OPEN_DECISIONS.md` (OD-007), `tests/` layout.
- Inspected live (read-only SQL, project `azmajqztvcuwajaaldqm`): bodies of `transition_job_state`, `transition_booking_state`, `customer_cancel_booking`, `decline_job`, `_release_offer`, `_offer_next`, `process_assignment_queue`, `assign_booking`, `professional_withdraw_from_job`, `_professional_conflicts`; row counts by state; drift and overdue queries; cron jobs; security advisors.
- **Not done in this pass:** browser reproduction of each defect, the unread docs (`STATE_MACHINES.md`, `RUNTIME_TRUTH`, `A4_DESIGN`, `P1_BOOKING_CANCEL_DESIGN`, route map, SYSTEM_AUDIT) were not read line by line, so doc-vs-code discrepancies in §6 are partial. `docs/03-architecture/TEST_PLAN.md` is an empty file [V].
- No data was modified.

## 2. Architecture summary (current, [V])

- **Two state columns.** `jobs.current_state` (assigned, accepted, on_the_way, arrived, in_progress, quote_pending, completed, cancelled, closed) is the lifecycle. `bookings.booking_status` (pending, confirmed, cancelled, completed) is *not* advanced by the job lifecycle. `transition_booking_state` allows only `pending|confirmed → cancelled`. **Authoritative source for "what is happening" is the job; for "was the request withdrawn" it is the booking.** This split is the root of the drift findings.
- **Job transitions:** one function, `transition_job_state`, SECURITY DEFINER, actor derived from `auth.uid()` (spoofed `p_actor_user_id` is rejected), start/finish codes enforced, schedule-conflict and verification checks on accept. Hardened relative to the audit.
- **Offers:** a job in `assigned` with `professional_id` and `offer_expires_at` is a pending offer. `_offer_next` ranks, skips ineligible/busy, creates or re-targets the job, writes `matching_decisions`. `_release_offer` (decline/expire) records a `booking_assignment_attempts` row then calls `_offer_next` for the next candidate; if none, `jobs.professional_id` is cleared and `bookings.unmatched_since` set. Lock order: booking → job everywhere (migrations 108/109).
- **Queue:** pg_cron `process-assignment-queue` every minute expires offers and offers unmatched future bookings. Also `job-media-sweep`, `reconcile-notifications`. Vercel cron routes exist but fail closed without `CRON_SECRET` (not set).
- **Cancellation:** customer → `customer_cancel_booking` (reason category, stale-state guard, withdraws offer, flags paid payments, writes `booking_events`). Admin → `admin_cancel_job`, `admin_reconcile_job`. Professional pre-start accepted job → `professional_withdraw_from_job` (returns job to `assigned`, unmatched); after start → exception for admin.
- **Notifications:** in-app rows via triggers; external `notification_logs` rows queue as `pending` and nothing consumes them [D, ADMIN_REBUILD_PROGRESS]. Migration 117 (claims) prepared, not applied.
- **Audit:** `audit_logs` append-only (R0). `job_events`, `booking_events`, `admin_*` tables carry domain history.

## 3. Live data snapshot ([V], 2026-11-01)

| Table | State counts |
|---|---|
| bookings | cancelled 5, confirmed 3, pending 7 |
| jobs | cancelled 8, closed 1, completed 2, in_progress 1 |
| booking_assignment_attempts | declined 2 |
| pending offers (jobs `assigned` with a professional) | **0** |
| overdue unmatched | 1: booking `c779c0d4` (scheduled 2026-10-05, still `pending`) |
| booking/job drift | **6** rows: confirmed/cancelled ×2, pending/cancelled ×3, pending/closed ×1 |

Cron: `process-assignment-queue` `* * * * *`, `job-media-sweep` `0 */6 * * *`, `reconcile-notifications` `*/10 * * * *`.

## 4. Capability baseline per role

Classification: IV implemented and verified, IU implemented unverified, PI partial, BR broken, NI not implemented, BD blocked by owner decision.

### Customer
| Capability | Class | Evidence |
|---|---|---|
| Sign in / role routing | IV | R0 live tests, role-signin spec [D] |
| Create booking | IU | `create_booking` RPC exists; browser journey not re-run this session |
| See matching status / assigned pro | IU | not re-run |
| Cancel booking (any state before start, incl. no-job) | IV | `customer_cancel_booking`, A3 review browser + concurrency runs [D]; body read [V] |
| Cancel after arrival / in progress | PI | `in_progress` refused with "contact support"; `arrived` allowed with no admin review (see R1-05) |
| Quote approve / decline | IU | `respond_to_quote` exists; not re-run |
| Pay (Razorpay UPI) | PI | sandbox only; webhook HMAC verified earlier; ₹349 pending synthetic payment; no refund path (OD-009 open) |
| Report no-show | IU | RPC exists; happy path never run |
| Receive WhatsApp/SMS | NI | queue has no consumer |
| Overdue-unmatched booking: told, can reschedule | NI | booking stays `pending` silently (c779c0d4) |

### Professional
| Capability | Class | Evidence |
|---|---|---|
| Sign in, verification status | IV | A1 journeys [D] |
| See and accept offers | IU | `transition_job_state` accept path read [V]; concurrency Tier 1 SQL (local disposable DB) [D] |
| Decline offer with reason | IV (SQL) / IU (UI) | `decline_job` body [V]; 2 live declines exist |
| Max 3 concurrent pending offers | **NI** | `_offer_next` only skips ±2h conflicts; no count cap [V] |
| Withdraw before start | IV | `professional_withdraw_from_job` body [V]; Tier 1 SQL [D] |
| Cancel an accepted/started job *directly* | **BR** | `transition_job_state` lets the assigned professional set `cancelled` from accepted/on_the_way/arrived/in_progress/quote_pending with **no reason, no booking update, no admin review** [V] |
| Job progress, codes, ETA, media, quote | IU | functions exist; Phase 3b spec exists, not re-run |
| Earnings view | IU | not re-run |

### Admin
| Capability | Class | Evidence |
|---|---|---|
| Console pages (10) | IV | 200 responses, a11y sweep, contrast audit [D] |
| Verify/reject professionals, document review | IV | A1 journeys [D]; integrity gap open |
| Cancel job, reconcile mismatch | IV | A3 browser + concurrency [D] |
| Assign / reassign / withdraw offer / resolve exception / suspend recovery | PI | Tier 1 local SQL only; UI exists; not run against shared DB or via Playwright [D] |
| Finance (read-only) | IV | page loads; no refund/payout NI (OD-009) |
| Communications | PI | shows banner that delivery is not operating |
| Private message access, complaints model | NI | by design |

## 5. Findings reconciliation

Columns: current status | R0 effect | root cause | severity | dependency.

| ID | Topic | Now | Notes |
|---|---|---|---|
| F-01..F-04, debug/test routes, forged audit inserts, excess grants | R0 | **Closed [V prod 404s, live tests]** | R0 |
| Hard-coded test password | Closed in tree; **history still contains it; rotation UNVERIFIED** | owner action | High until rotated |
| Leaked-password protection | **Disabled [V advisor]** | owner action | Medium; UNVERIFIED fix |
| `transition_job_state` actor spoof | Closed [V body] | — | — |
| Missing booking-cancel function (R1-01) | **Resolved**: `customer_cancel_booking` + `transition_booking_state` exist and reuse `transition_job_state` [V] | — | Closed pending Playwright |
| Orphaned jobs / queue / recovery (R1-02) | Largely resolved by A4 (111–116): recovery RPCs, advisory-locked queue [V]. **UNVERIFIED on shared DB** (Tier 1 was local) | — | Medium |
| Booking/job inconsistency (R1-03) | **Open**: 6 drift rows [V]. Cause: professional/admin job cancel and job completion do not update the booking | split state design | High (data trust) |
| Overdue unmatched (R1-04) | **Open**: `_offer_next` records "start time passed" and leaves booking `pending`; queue skips `scheduled_start <= now()` [V]; c779c0d4 is the live case | no overdue state, no customer notice, no escalation | High |
| Cancellation policy (R1-05) | **Open / partly BR**: direct professional cancel via RPC has no reason, no admin review, leaves booking `pending` [V]; arrival-stage customer cancel not reviewed | policy OD-007 open | High |
| 3-offer cap (R1-06) | **Open** [V] | no limit in `_offer_next` | Medium; DB-level needed |
| Notifications never sent | Open | no consumer; migration 117 + SNS dep missing | High for launch |
| Verification document integrity | Open, proposed fix awaiting decision | `docs/A1_DOCUMENT_INTEGRITY.md` | High |
| `contact_messages_rate_limit()` anon-executable SECURITY DEFINER | Open [V advisor] | trigger function granted to anon | Low; revoke EXECUTE |
| `_job_code_purpose` mutable search_path | Open [V advisor] | — | Low |
| 36 SECURITY DEFINER RPCs executable by `authenticated` | By design; each checks `auth.uid()` | **needs a per-function review**, not all re-read | Medium UNVERIFIED |
| 5 tables RLS-on, no policy (admin_operation_requests, job_code_*, notification_failures) | Intentional deny-all [V] | document | Info |
| Playwright never executed | Open | `E2E_TEST_PASSWORD` unavailable to the agent | Release blocker |
| Shared prod/dev DB | Accepted by owner (no staging) | guardrails in STAGING_PROPOSAL | Release risk |
| Migration tracking drift | **Open**: Supabase tracked list is incomplete vs repo files; 104–110 and 117 unconfirmed | — | Medium |
| Code on `main` (2611a2a) vs DB | DB is ahead (A4 applied; `main` lacks admin rebuild) | backward-compat check **UNVERIFIED** | High until checked |

I did not individually re-run F-05..F-26 reproductions; rows above group those that the new schema visibly changed. Items not listed keep their audit status until reproduced (Phase R1-0 below).

## 6. Documentation vs code discrepancies (partial)

1. `docs/audits/PREPRODUCTION_AUDIT_REPORT.md` still lists missing cancel function, test routes and open grants as live; superseded by §5 here.
2. `docs/03-architecture/TEST_PLAN.md` is **empty**.
3. `docs/STAGING_PROPOSAL.md` correctly says no staging; `A3_REVIEW.md` still lists "isolated staging project" as a release blocker. Owner decision conflicts; blocker should be restated as "guardrailed shared-DB testing".
4. `CLAUDE.md` rule 3 says job state changes go only through `transition_job_state`; `professional_withdraw_from_job` and `_offer_next` update `jobs.current_state/professional_id` directly (guarded by an edge-guard setting). Intentional but undocumented.
5. `CLAUDE.md` says "empty validators" as debt; not re-checked.
6. `vitest.live.config.ts` includes `tests/phase3-state-machine.test.ts`, which inserts jobs with fake booking ids using the anon key; against current RLS/FKs it is almost certainly failing or meaningless [U]. Treat as stale.
7. `main` does not contain the admin rebuild or the A4 app layer while the DB does.

## 7. Root causes (grouped)

1. **Split booking/job state with no owner of reconciliation.** Fix by defining the booking status as derived from the job at defined transition points, or by making cancellation paths all go through one function.
2. **Cancellation implemented per actor**, not as one policy service (customer RPC, admin RPC, professional raw transition + withdraw RPC).
3. **Matching handles only the future.** Past-start bookings fall out of every queue.
4. **No cross-row invariant for offers** (cap, overlap) beyond the ±2h check.
5. **No consumer for external notifications.**
6. **Shared environment**, tests not repeatable on isolated fixtures.

## 8. Lifecycle design review: professional declines an offer (current behaviour [V])

`decline_job` → `_release_offer('declined')` → inserts `booking_assignment_attempts` (declined, reason, decision) → `_offer_next` → either re-targets the **same job** to the next ranked professional (`reassigned` event, new `offer_expires_at`, booking.professional_id updated) or, with no eligible pro, clears `jobs.professional_id` and sets `bookings.unmatched_since`. Customer is not told. Booking stays `pending`. Audit: `job_events`, attempts, `matching_decisions`. Gaps: no customer visibility of "searching again", no cap on how many attempts, no escalation after N declines or when start time is near, and a declining professional can be offered the same booking again only if the ranker does not exclude prior attempts [U, ranker not read].

## 9. Phased plan

Rule per phase: Review → Diagnose → Design → Evaluate → Implement → Verify → Document → Review Gate. Migrations touch production data; each needs dry run in a transaction, rollback script, backward-compat check against `main`'s code, and explicit owner go-ahead.

**R1-0 Baseline completion (no code).** Read remaining docs; browser reproduce F-05..F-26 one at a time on fixtures; confirm which migrations are applied (104–110, 117); check `main` code against current DB; owner to supply test password for Playwright run; confirm password rotation and leaked-password protection.

**R1-A Single cancellation policy (R1-01 close-out + R1-05).**
- Design: one internal function used by all actors; professional cannot raise `cancelled` through `transition_job_state` (remove professional from the cancel clause); mandatory reasons after acceptance; arrived/in_progress cancellations create an admin review exception instead of cancelling; "pending review" is a visible state (not shown as cancelled). No fees (owner direction); OD-007 stays open for fees/refunds.
- Acceptance: professional RPC cancel from accepted is refused; reason mandatory; customer UI shows "cancellation under review" until admin resolves; booking/job/event/notification/audit consistent; no payment touched.
- Tests: SQL role tests (customer/pro/admin/anon), concurrency (cancel vs accept, cancel vs admin), Playwright journey with synthetic past-dated fixtures.

**R1-B Booking/job consistency (R1-03).**
- Design choice to evaluate: (a) booking status derived by trigger from job; (b) keep split and ensure every job-cancel path updates booking. Recommend (b) via the shared function from R1-A plus an admin-reviewed backfill of the 6 drift rows (use existing `admin_reconcile_job`/customer cancel; no silent edits).
- Acceptance: drift view returns 0 after backfill and cannot be reintroduced (check constraint or trigger test).

**R1-C Overdue unmatched bookings (R1-04).**
- Design (provisional per owner): add an explicit overdue marker (`overdue_since`, derived status), notify customer, raise admin exception, allow free cancel, automated recovery attempt within ≤30 minutes, then reschedule-with-consent or admin action. Never auto-cancel or auto-reschedule.
- `c779c0d4`: stays untouched until owner directs.
- Acceptance: queue handles past-start bookings deterministically; customer sees status; admin sees case; idempotent.

**R1-D Offer cap (R1-06).** Count active pending offers per professional (jobs `assigned`, `offer_expires_at > now()`), max 3, enforced inside `_offer_next` under the professional row lock, plus a DB constraint-level backstop (trigger on jobs). Exclude expired/declined/cancelled. Overlap rule stays. Acceptance: concurrent offers cannot exceed 3; test with parallel sessions on synthetic professionals.

**R1-E Orphans and recovery verification (R1-02).** Run A4 recovery on the shared DB with synthetic professionals only, plus Playwright admin journeys; verify queue behaviour with a deleted/suspended professional.

**R2 (after R1 gate):** notification dispatcher (apply 117, add SNS dependency or drop SMS, provider choice), verification-document integrity, per-RPC review of the 36 authenticated SECURITY DEFINER functions, revoke `contact_messages_rate_limit` anon EXECUTE, fix `_job_code_purpose` search_path, migration tracking reconciliation, doc cleanup, TEST_PLAN, responsive/a11y/perf pass on customer and professional apps.

## 10. Release blockers (current)

1. Green Playwright run of all role journeys (never executed).
2. R1-A..R1-D implemented and verified.
3. Booking/job drift at zero.
4. Notification delivery decision implemented, or explicitly launched without external channels.
5. Document-integrity fix; legacy verified professionals with 0 documents.
6. Password rotation and leaked-password protection **UNVERIFIED**.
7. Confirm `main` code compatible with the live schema.

## 11. Owner decisions needed

1. R1-A: confirm a professional may not unilaterally cancel an accepted job in-app (must go through withdraw/admin) and the arrived/in-progress review rule.
2. R1-B: approach (b) and permission to run the backfill via audited admin actions on the 6 drift rows (they appear synthetic; ownership not verified).
3. R1-C: confirm ≤30 min recovery window, who is told and how (WhatsApp has no consumer today, so in-app only?), and what to do with `c779c0d4`.
4. R1-D: confirm 3 is a hard cap and that an offer counted while `offer_expires_at` is future.
5. Supply `E2E_TEST_PASSWORD` in the environment for Playwright (never to be written to a file).
6. Rotate the test password and enable leaked-password protection; tell me when done.
7. D-A4-3, D-A4-4, D-A4-8 (still undecided per progress doc).

## 12. Deferred

Fees and refunds (OD-007/009), payout, premium, B2B, dispute model, private message audit access, screen-reader pass, performance measurement, staging project.
