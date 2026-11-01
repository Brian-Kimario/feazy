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
- Legacy quote status `pending_customer_approval`: read-only check on prod found 2 such quotes, both on cancelled jobs (no live impact). The app already treats the legacy value as not awaiting the customer (`rules.test.ts`). No migration needed unless a new row can be written with it.
- `notification_logs_status_check`: prod has no such constraint (checked read-only), and the trigger's `pending` insert works there. Local-only replay artefact, not a live defect.
- Notification link for a removed professional: fixed. `/professional/jobs/[id]` now shows "not available to you" with a link to their jobs instead of a 404. Retry-recovery button added to the suspended professional's page (shown only while offers or active jobs remain); not clicked on real data.

## Phase status
| Phase | Status |
|---|---|
| 1 Foundation | Shell/nav, `ToastProvider`, `ConfirmDialog` (used for suspend/reactivate) built. Dialog/toast not browser-verified (mutating click on real data was not made). Detail drawer not built |
| 2 Actionable Overview | Counts, professional monitoring, attention queue incl. suspended-with-active-jobs and booking/job drift. Desktop loaded; drift cases seen live; suspended-with-jobs unit-tested only (none in live data) |
| 3 Operations / A4 recovery | Exceptions page and assignment panel exist; retry-recovery button unbuilt |
| 4 Jobs & Bookings | Server-driven directory (`/admin/jobs`): lifecycle, search, dates, sort, pagination, exception/drift badges, links to the case page. Browser-checked desktop and mobile; date filter and sort not exercised. No assignment-status filter yet |
| 5 People | Professional account workspace exists. Customer directory (server search, pagination) and customer workspace (properties, bookings, exceptions, account activity) built and browser-checked on desktop. Professional directory (`/admin/professionals`: server search, status/availability/workload filters, pagination; browser-checked desktop) built; the review queue moved to `/admin/professionals/verification`. Missing: documents and availability detail on the professional page; no customer payment visibility or complaints beyond job exceptions |
| 6 Finance | Read-only payments page (`/admin/finance`: status counts, status/date filters, pagination, links to customer and booking; desktop browser-checked). Prod has 1 payment (pending, ₹349, synthetic audit-test order). No refund, payout or payment actions; payment event history and reconciliation not built |
| 7 Activity, Audit, Disputes, Communications | Activity & audit built (`/admin/audit`: read-only, filters for record type/area/outcome/target/actor/dates, pagination, per-target history, professional links; browser-checked desktop and mobile). Job targets are not linked (case page is keyed by booking id). Communications built (`/admin/communications`: notification status counts, unresolved delivery failures, recent notifications, contact-form inbox metadata; bodies and job chat deliberately not read; desktop browser-checked). Disputes: there is no separate dispute model, so job exceptions (`/admin/exceptions`) are the dispute workflow. Viewing private message text needs an audited access path and is not built |
| 8 Integration/regression | Sweep done: all 10 admin pages return 200 with one h1, labelled controls and no unnamed buttons; no horizontal overflow at 375px on overview, operations, exceptions, customers, professionals, finance, communications (jobs/audit checked earlier). tsc clean, 518 tests pass. Lint: the 6 errors in `JobDetailModal.tsx` and `catalogue.ts` are fixed (catalogue options now really carry `values`); `pnpm eslint src` still reports about 70 other pre-existing errors elsewhere (e.g. `supabase/admin.ts`, `proxy.ts`). Not done: contrast/keyboard audit, screen-reader pass, Playwright e2e |

Drift note: `bookings.booking_status` is not advanced by the job lifecycle, so `job_active_booking_pending` is by design and is excluded from attention cases and the directory drift flag.

## Finding: notifications never leave 'pending'
Read-only on prod: all 61 `notification_logs` rows are `pending`, none sent, and `notification_failures` is empty. Either no dispatcher is running or it is not recording results. Needs an owner check of the WhatsApp delivery path before launch.

## Next
Phase 8 regression (desktop and mobile sweep, accessibility), notification dispatch investigation. Leftovers: professional page enrichment, jobs assignment filter, loading skeletons.
