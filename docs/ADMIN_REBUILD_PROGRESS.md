# Admin rebuild progress

Branch `audit/preproduction-remediation`. Nothing pushed. No migration applied since 111–116 (applied earlier with authorization).

## Current phase
Phase 5 (professional account management) started. Phases 1–4 foundations exist (AdminShell, Overview, Operations, Jobs); A4 recovery UI is in (`/admin/exceptions`, assignment panel on the case page).

## Done
- A4 application layer: typed services, Zod validators, stable error mapping, assignment/withdraw/reassign/resolve UI, professional withdrawal (D-A4-12 copy: refusal → contact support, customer not told).
- `/admin/professionals/[id]`: status, suspend/reactivate, pending offers, active assignments, job history, performance, complaints, verification and admin history. Directory names link to it.
- Drift list now filters healthy bookings (the `a4_assignment_drift` view returns every booking).

## Tier 1 local SQL tests (disposable Postgres 18, synthetic data, auth stubbed)
Passed: assign + idempotent replay; key reuse rejected; stale state; non-admin refused; ±2h conflict at assign; **two overlapping offers accepted concurrently → exactly one wins, other SCHEDULE_CONFLICT**; **suspend committed first → accept refused**; reschedule blocked on a live job; direct accepted→assigned blocked by edge guard; phase-2 recovery releases offers, flags active jobs, replay is a no-op; withdraw before start → released and customer told; withdraw after start → `review_requested`, no customer notification; inconclusive stays open; stale exception status rejected.
Not covered: PostgREST/RLS runtime, real Supabase Auth, race "accept first, then suspend" (verified only by ordering reasoning), reassign/withdraw-offer concurrency, S1 matcher.
Local-only gaps found (prod verified correct, read-only): replay of older migrations leaves `professional_verification_events` and the `booking_assignment_attempts` outcome check in older shapes. Not live defects.

## Defects corrected
- Drift list showed all bookings (app-side filter added).
- Pre-start withdrawal copy and refusal copy.

## Production dependencies / open
- D-A4-3, D-A4-4, D-A4-8 undecided.
- Legacy quote status `pending_customer_approval` is not covered by 111's quote check (would need a migration; not applied).
- `on_job_state_transition` logged a `notification_logs_status_check` violation locally (swallowed). Not yet checked against prod.
- Notification link for a removed professional 404s.

## Phase status
| Phase | Status |
|---|---|
| 1 Foundation | Shell/nav, `ToastProvider`, `ConfirmDialog` (used for suspend/reactivate) built. Dialog/toast not browser-verified (mutating click on real data was not made). Detail drawer not built |
| 2 Actionable Overview | Counts, professional monitoring, attention queue incl. suspended-with-active-jobs and booking/job drift. Desktop loaded; drift cases seen live; suspended-with-jobs unit-tested only (none in live data) |
| 3 Operations / A4 recovery | Exceptions page and assignment panel exist; retry-recovery button unbuilt |
| 4 Jobs & Bookings | Server-driven directory (`/admin/jobs`): lifecycle, search, dates, sort, pagination, exception/drift badges, links to the case page. Browser-checked desktop and mobile; date filter and sort not exercised. No assignment-status filter yet |
| 5 People | Professional account workspace exists. Missing: professional directory pagination/filters, documents, availability detail, customer directory and workspace |
| 6 Finance | Not started (investigation only; no refund/payout actions) |
| 7 Activity, Audit, Disputes, Communications | Not started |
| 8 Integration/regression | Not started |

Drift note: `bookings.booking_status` is not advanced by the job lifecycle, so `job_active_booking_pending` is by design and is excluded from attention cases and the directory drift flag.

## Next
People (professional directory, customer directory and workspace), defects (quote status, notification constraint, removed-professional link, retry recovery), then Finance, Audit, Disputes.
