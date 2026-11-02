# R1-A Design: one cancellation policy

Status: **APPROVED. Migration 118 written and dry-run (rolled back); not applied, awaiting owner go-ahead.**
Scope: R1-01 close-out and R1-05 from `PREPRODUCTION_REMEDIATION_PLAN.md`. No fees (owner direction); refunds and fees stay in OD-007.
Evidence: live catalog of project `azmajqztvcuwajaaldqm`, read 2026-11-02. [V] = read from the live function or table.

## 1. Diagnose: what the database allows today

| Actor | Path | What it allows | Gap |
|---|---|---|---|
| Professional | `transition_job_state(..., 'cancelled')` directly [V] | Assigned professional may take **any** valid edge, including `cancelled` from accepted, on_the_way, arrived, in_progress, quote_pending. | No reason, no review, booking not updated (the cause of the drift rows), notification only as a generic transition. No app code calls it (`src/app/professional/actions.ts` only uses `accepted`), so it is reachable only by a direct API call. |
| Professional | `professional_withdraw_from_job(job, reason)` [V] | Reason 5 to 500 chars. Accepted and before scheduled start: job returns to `assigned`, booking unmatched, attempt logged. Otherwise: opens a `job_exceptions` row `professional_withdrawal_request` for admin, state unchanged. | Correct shape. Already the "review" pattern. |
| Professional | `decline_job` | Offer-stage decline with reason code. | Fine. |
| Customer | `customer_cancel_booking(booking, expected_state, reason_category, note)` [V] | Cancels job and booking together from any state except `in_progress`/completed. Reason category is mandatory (6 values). Allows `arrived`. | `arrived` and `quote_pending` cancel immediately with no review. Payments counted, never changed (correct). |
| Admin | `admin_cancel_job`, `admin_reconcile_job` | Audited, expected-state guarded. | Fine; stays the only way to force a cancel after arrival. |

Root cause (R-2): cancellation is implemented per actor. Only the customer and admin paths update the booking; the professional's raw edge does not.

## 2. Policy (proposed, needs owner confirmation, OD-1)

Stage is the job state when the request is made.

| Stage | Customer | Professional | Admin |
|---|---|---|---|
| `assigned` (offer out) | Cancel now | Decline (existing) | Cancel |
| `accepted`, before scheduled start | Cancel now | Withdraw: job re-enters matching (existing) | Cancel |
| `accepted` after start time, `on_the_way` | Cancel now | Withdrawal **request** (review) | Cancel |
| `arrived`, `quote_pending`, `in_progress` | Cancellation **request** (review) | Withdrawal **request** (review) | Cancel / reconcile |
| terminal | not eligible | not eligible | n/a |

Rules common to every row:
1. A reason is mandatory. Customer: one of the six categories plus optional note (≤300). Professional: free text 5 to 500 (existing). Admin: free text (existing).
2. A professional can never set `cancelled` directly. Only a customer cancel, an admin cancel, or an admin-resolved review produces `cancelled`.
3. A review request does **not** change job or booking state. It opens an exception and is visible as "cancellation under review" to every party. The job keeps its real state until an admin resolves it.
4. No payment is created, changed or refunded by any cancel path. Paid payments are flagged for review as today (`payment_review_required`).

## 3. Design

### 3.1 Block the raw professional cancel (smallest safe change)
In `transition_job_state`, the first allow clause becomes `v_caller = professional_id AND p_new_state <> 'cancelled'`. The customer and admin clauses are untouched. Nothing else in the function changes.
Backward compatibility: no application code on `main`, the audit branch, or the generated types depends on a professional cancelling this way [V by grep]. Only a direct API caller is affected, which is the intent.

### 3.2 One internal cancel function
`_cancel_job_and_booking(job_id, actor, actor_role, reason_category, note, source)`, SECURITY DEFINER, not executable by clients. It performs what `customer_cancel_booking` does today after its checks: job cancel via `transition_job_state` (so codes, events and notifications stay uniform), withdraw the outstanding offer, move the booking, count payments. Callers: `customer_cancel_booking` and (R1-B) the drift backfill. This removes the per-actor divergence and leaves a single place to change policy.
`admin_cancel_job` is not rewritten in R1-A. It already updates both rows and has its own audit table; moving it onto the shared function is listed as a later cleanup to keep this change small.

### 3.3 Review requests reuse `job_exceptions`
- Extend `job_exceptions_kind_check` with `customer_cancellation_request`. The table already has open/resolved/dismissed status, admin finding and resolution columns, and a unique `(job_id, kind)` so a repeat request is idempotent.
- `customer_cancel_booking`: when the job is `arrived`, `quote_pending` or `in_progress` (and `on_the_way`/accepted rules per table above are direct), insert the exception with the reason category and note in `detail`, write a `job_events` row `customer_cancellation_requested`, and return `{ok:true, outcome:'review_requested'}`. Direct cancels return `outcome:'cancelled'`. Today's `in_progress` refusal becomes a review request, so the customer is never told to "contact support" with no record.
- Admin acts in two steps, as today: `admin_cancel_job` cancels job and booking (audited), then `admin_resolve_exception` records the resolution. Resolving does not itself cancel. A dismissal leaves the job running. Existing resolution checks apply unchanged. (Corrected after reading `admin_resolve_exception`.)

### 3.4 Visible "under review"
Customer, professional and admin job views read the open exception. Wording: "Cancellation under review. Fixify will contact you." Not shown as cancelled and not styled as a terminal state. Booking list gets the same badge. No new column: derived from an open `job_exceptions` row.

### 3.5 Consistency guard
`_cancel_job_and_booking` is the only writer that sets `bookings.booking_status='cancelled'` for a cancelled job. A verification query (job cancelled while booking not cancelled, and the reverse) is added to the test suite; permanent prevention (trigger or constraint) is decided in R1-B.

## 4. Alternatives considered

| Option | Verdict |
|---|---|
| A. Derive booking status from job by trigger | Rejected for R1-A. Larger blast radius on a shared production DB; evaluated again in R1-B. |
| B. New `cancellation_requests` table | Rejected. `job_exceptions` already has the lifecycle, RLS, admin resolution and idempotency; a second table duplicates it. |
| C. Let the professional cancel before arrival | Rejected: it bypasses re-matching. Withdraw already covers it and returns the job to the queue. |
| D. Customer cancel is always immediate | Rejected: after arrival work and travel have occurred; owner asked for review. |

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration on shared production DB | Dry run in a rolled-back transaction, rollback script, owner go-ahead (plan §9 rule). |
| Replacing `transition_job_state` | Change is one predicate; migration contains a diff against the live body and a test that every other edge and actor is unchanged. |
| Customer UI on `main` expects the old result shape | `ok` is unchanged; `outcome` is additive. PR #4 already reads only `ok`/`code`/`message`. |
| Stuck reviews | Admin queue already lists open exceptions; add age highlighting in R1-C. |
| Unique `(job_id, kind)`: a resolved request blocks a later one | Accept in R1-A (one review per job per kind); revisit if repeated cancels after a dismissal occur. |

## 6. Acceptance and tests

Acceptance: (1) professional RPC cancel from every state is refused; (2) reason mandatory for every actor; (3) arrived/quote_pending/in_progress customer cancel opens a review and leaves job and booking unchanged; (4) all three views show "under review"; (5) admin resolution to cancelled leaves job, booking, events and notification consistent; (6) no payment row changes.

Tests:
- SQL role tests (customer owner, other customer, professional owner, other professional, admin, anon) for each policy row, run in a rolled-back transaction on synthetic data.
- Concurrency: cancel vs accept; customer cancel vs admin cancel; duplicate review request.
- Unit tests for the UI state mapping; Playwright journey on synthetic past-dated fixtures once `E2E_TEST_PASSWORD` is available.
- Regression: existing tests and `pnpm tsc --noEmit`.

## 7. Implementation plan (after approval)
1. Migration `20261102_118_cancellation_policy.sql` with rollback `..._118_rollback.sql` (3.1, 3.2, 3.3 SQL).
2. Service and server action updates: customer cancel reason picker and outcome handling; professional withdrawal UI states; admin resolution wiring.
3. "Under review" badges (3.4).
4. Dry run, owner go-ahead, apply, verify with synthetic data, document.

## 8. Decisions needed (review gate)
1. Confirm the policy table in §2, in particular: customer cancels directly up to `on_the_way` and needs review from `arrived`; professionals never cancel directly.
2. Confirm customer review applies to `in_progress` too (today it is refused outright).
3. Confirm `admin_cancel_job` stays as is in R1-A and moves to the shared function later.
4. Confirm the one-review-per-job-per-kind limit is acceptable.
