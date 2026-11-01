# Admin Console Rebuild — Phase 0 Audit and Plan

Prepared 2026-11-01 on branch `audit/preproduction-remediation`. **Read-only pass.** No application code changed, no migrations applied, nothing pushed. Live DB was queried read-only (SELECT counts and `pg_proc` names).

**Evidence labels:** `[V]` verified by reading code or a read-only query in this pass · `[D]` taken from existing project docs (browser/DB results recorded earlier; not re-run now) · `[R]` reasoned recommendation · `[A]` unverified assumption · `[OD]` owner decision needed.

**Not done in this pass (stated, not hidden):** I did not drive the localhost app in a browser, did not run Vitest/Playwright/tsc, and did not read every line of `JobDetailModal`, `JobsTable`, `CustomersTable`, `VerificationQueue`. UI findings for those come from greps (hex counts, dialog roles, `any` counts) and earlier recorded browser checks `[D]`. The a11y and 375px items below are therefore hypotheses to confirm in Phase 1.

---

## A. Current-state capability matrix

Status key: VERIFIED (end to end, with recorded evidence) · IMPL/UNVER · PARTIAL · BROKEN · MISSING · BLOCKED-BIZ · BLOCKED-BE.

| Capability | UI | Backend | Status | Defects / notes | Dependencies | Pri |
|---|---|---|---|---|---|---|
| Admin authorization guard | layout + per-page re-check | `getAdminActor` `src/lib/admin/guard.ts:12` | VERIFIED `[V][D]` | Role re-checked in layout (`layout.tsx:44`) and again in every page; duplicated, harmless | — | keep |
| Audited action runner | n/a | `runAdminAction` `src/lib/admin/action.ts:27` (fail-closed `.requested` row, then `.succeeded/.failed`) | VERIFIED `[V]` | Only used by cancel, reconcile, approve/reject/suspend/reactivate, doc review. Role-change API and `verifyProfessional` wrapper are outside it (see defects) | — | keep |
| Audit log immutability | none | append-only trigger, INSERT revoked (`20261030_102…sql:11-31`) | VERIFIED `[D]` | 88 rows live `[V]` | — | keep |
| Admin cancel job | `JobsTable`, `JobDetailModal`, `CancelJobDialog` | `admin_cancel_job` (mig 105/108) via `adminCancelJob` `admin.ts:438` | VERIFIED `[D]` | Paid-job result sets `payment_review_required` but nothing queues the review; `CancelJobDialog` has no dialog role/focus handling `[V grep]` | — | keep, fix a11y |
| Reconcile cancelled-booking/assigned-job | `ReconcileJobPanel` in Operations drawer | `admin_reconcile_job` (mig 106) | VERIFIED `[D]` | Only `assigned` is repairable; paid refused by design | — | keep |
| Operations exception queue (8 types) | `/admin/operations`, `OperationsQueue` | `getOperationsQueue` (`admin-operations.ts:136`), pure classifier `lib/admin/operations.ts`, env thresholds | VERIFIED read-only `[D]` | Alerts only; no recovery action except reconcile. Truncation flagged in UI | — | keep |
| Case detail (Operations drawer) | `OperationsQueue` drawer (dialog, focus-managed `:167-198`) | `getOperationsCaseDetail` `:298` (events, attempts, decisions, payments) | IMPL/VERIFIED `[D]` | Closest thing to the case workspace; no customer/pro/property panels, no notifications, no actions beyond reconcile | — | build on |
| Unmatched bookings | `/admin/operations/unmatched` | `getUnmatchedBookings` (limit 200, `admin.ts:914`) | PARTIAL `[V]` | Read-only; "there is no admin assign action yet" (page comment). Duplicates Operations `unmatched` type | A4 | med |
| Assignment queue health | banner on Operations + Unmatched | `get_assignment_queue_status` RPC | VERIFIED `[V]` | **Not on Overview.** Banner markup is copy-pasted in two pages | — | high |
| Professional verification approve/reject | `VerificationQueue` | `admin_transition_professional_verification` (mig 104/110) | VERIFIED `[D]` | Requires admin-accepted document that exists in storage (mig 110 applied 2026-11-01 `[D]`) | staging for real upload test | keep |
| Verification document review + signed URL | `VerificationQueue` | `admin_review_verification_document`, `getDocumentSignedUrl` (audited view) | VERIFIED in browser `[D]` | Bucket exists (see Corrections). Browser test used synthetic storage rows, since removed; a real upload end to end is NOT verified | staging DB | high |
| Suspend / reactivate professional | `VerificationQueue:573` | `suspendProfessional/reactivateProfessional` `verification.ts:496/521` | IMPL/UNVER | Concurrency with admin cancel verified `[D]`, but suspension does **not** touch active jobs or offers (A4); no customer notification on mid-job suspension `[D]` | A4 | high |
| Legacy verified professionals (2) | shown as verified | n/a | **BROKEN evidence** `[V]` 2 verified live | One has a file-less accepted doc, one has none `[D]`. Unchanged, correctly. `[OD]` re-verify or suspend | owner | high |
| Overview metrics | `/admin` tiles | `getAdminMetrics` `admin.ts:103` | PARTIAL | See defects D-3..D-5 | — | high |
| Jobs directory | `/admin/jobs`, `JobsTable` | `getAllJobs` (limit 100, `.range`) | PARTIAL | Hard `limit: 100` on the page (`jobs/page.tsx:36`) with `total` shown; client-side filtering over 100 rows only `[A]`; page uses `revalidate = 60` | — | med |
| Job detail inspector | `JobDetailModal` (516 lines, modal) | `getAdminJobDetail` `admin.ts:580` | PARTIAL | Modal, not a workspace; 85 hex literals; no customer/pro contact, no notifications, no messages | — | high |
| Professionals directory | `/admin/professionals` | `getAllProfessionals` | PARTIAL | Combined with verification queue; no active-jobs/availability/history/complaints | — | med |
| Customer directory | `/admin/customers`, `CustomersTable` | `getAllCustomers` | PARTIAL (read-only) | No detail page, no bookings/properties/payments view, no corrections | — | med |
| Payments view | **none** | `getRecentPayments` exists (`admin.ts:346`) but **no caller** `[V grep]` | PARTIAL BE / MISSING UI | Live: 1 payment, `pending` (audit fixture) `[V]`; 0 `paid`, so "Payments received ₹0" | — | med |
| Audit viewer | **none** | `GET /api/admin/audit-logs` exists; no UI | PARTIAL BE / MISSING UI | Route uses in-memory rate limiter (known debt); admin read of all rows depends on RLS/service client `[A]` | — | high |
| Job events / timeline | inside modal/drawer | `job_events` | PARTIAL | No cross-job activity feed | — | med |
| Reassignment / manual assign / withdraw offer | **none** (removed in A3, commit `19e59e3`) | no function (`pg_proc` has no `reassign*`) `[V]` | MISSING, BLOCKED-BE (A4) | Only `_release_offer` internal helper | A4 design approved, not built `[D]` | high |
| Professional-cancel recovery (re-offer) | none | none | BLOCKED-BIZ `[OD]` | Cancel leaves booking `pending`; 5 historical drift rows `[D]` | A4 | high |
| Reschedule | none | none | MISSING; design only (A3.3) | Needs customer consent flow | owner | med |
| Booking edit (service/address) | none | none | MISSING | Customer-owned data; needs consent + state rules | owner | low |
| No-show handling | count tile on Overview only | `job_exceptions` rows; `possible_no_show` alert | PARTIAL | **No UI to read or resolve a reported no-show**; tile counts open reports but links nowhere `[V]` | A4 | high |
| Quote dispute / revision | none | none | MISSING (A7); stale `pending_customer` quote after cancel unhandled `[D]` | | owner | med |
| Refund review / execution | none | `payment_review_required` flag returned, not persisted as a queue | MISSING / BLOCKED-BE; execution deferred | | provider approval | med |
| Webhook / payment reconciliation view | none | Razorpay webhook `api/webhooks/razorpay` | MISSING UI; webhook capture NOT RUN `[D]` | | staging + test keys | med |
| Notifications / delivery | bell for users only | `notification_logs` | MISSING for admin. Live: **61 rows, all `pending`** `[V]` — no delivery status ever progresses, so "failed notification" cannot be detected | | provider decision | med |
| Message access (audited) | none | `job_messages` RLS participants only | MISSING by design (A7) | Governance gap, not bypass | owner | low |
| Role change | **none** | `PATCH /api/admin/users/[id]/role` (DISABLED in Slice 0.1; was mis-stated as PUT) (`updateUserRole` writes `profiles.role` with service client, accepts `admin`, **not via `runAdminAction`**, audit via `logAdminAction` after the fact, in-memory rate limit) | IMPL/UNVER, **risk** | See D-1 | owner decision | high |
| Admin API `/api/admin/users` | none | lists profiles | IMPL/UNVER | Unused by UI | — | low |
| Customer/professional account restriction | none | none | MISSING | | owner | low |
| Support role | none | `support` profile exists (1) `[V]` | BLOCKED-BIZ | Support reads not designed | owner | low |
| Admin E2E | specs written | — | **Not executed** `[D]` | `E2E_TEST_PASSWORD` absent; release blocker | env | blocker |

### Defect register (admin-specific, file evidence)

- **D-1 Role-change endpoint bypasses the audited runner.** `src/app/api/admin/users/[id]/role/route.ts` (route regex allowed customer|professional|admin (not `support`; only the helper's type did); self-change blocked) calls `updateUserRole` (`src/lib/supabase/admin.ts:122`), which updates `profiles.role` with the service client. The audit row is written *after* the change by `logAdminAction`; no `.requested` fail-closed row, no reason, no expected-state check, no Zod (uses ad-hoc `validateRequest`), and the type also allows `support`. Not reachable from the UI, but reachable by any admin session. `[V]` Violates Rule 5 and the "audited privileged action" principle. Recommend: either remove or rebuild on `runAdminAction` + a DB function with last-admin protection.
- **D-2 Whole service files are `'use server'`.** `admin.ts:1` and `verification.ts:1` make every export a client-callable server action, including read functions returning PII (`getAllCustomers`, `getAllProfessionals`) and `uploadVerificationDocument` (a professional action) sitting in the same file as admin actions. Each admin export does call `requireAdmin`/`runAdminAction` `[V]` (11 call sites match 11 admin exports), so no unauthenticated hole found, but the pattern is fragile: one new export without the check is a public endpoint. Recommend a `lib/services/admin/*.ts` server-only layer plus a thin `actions.ts` of explicit actions, and a test that fails if an exported function in a `'use server'` file lacks a guard.
- **D-3 Overview "Payments received" reads 0 / "₹0 — 0 paid payments" and is correct but uninformative**; it sums `status='paid'` by loading every row (`admin.ts:136`, `.select('amount')` unbounded) rather than an aggregate. Not a correctness bug now (0 paid rows `[V]`), a scaling and truthfulness-of-label issue: it is *captured payments* not revenue.
- **D-4 Overview has no matcher/queue health, no payment exceptions, no overdue count by type**; the data for the first exists (`getAssignmentQueueStatus`) and is shown only inside Operations. `completedJobsTotal` is computed (`admin.ts`) and never displayed `[V]`.
- **D-5 "Open no-show reports" tile** (`page.tsx`) has no link and no resolution surface.
- **D-6 `@ts-ignore` / `as any` debt:** 47 occurrences in `admin.ts`, 12 in `verification.ts`, plus `(profile as any).role` in every admin page. Violates Rule 7; `Database` types exist (regenerated in commit `6513ab4`). Mechanical cleanup, low risk, should accompany the service split.
- **D-7 Design-token violations (Rule 9):** hex literal counts: `page.tsx` 60, `VerificationQueue` 88, `JobDetailModal` 85, `JobsTable` 53, `CustomersTable` 25, `CancelJobDialog` 14, `professionals/page` 13, jobs/customers pages 4 each, layout 3. Operations, OperationsQueue, ReconcileJobPanel use tokens (0 hex). The console is visibly two systems `[V]`.
- **D-8 Admin does not use the shared shell.** `admin/layout.tsx` hand-rolls its header and uses `components/shared/AppNavLinks`; customer/professional use `RoleShell` (skip link, `tabIndex={-1}` main, `focus-visible` rings). The admin layout has no skip link `[V]`, and `<main>` has no `tabIndex`. `src/components/shell/nav.ts` icons are typed to customer/pro names only.
- **D-9 Dialog semantics inconsistent.** Only the Operations drawer has `role="dialog"`, `aria-modal`, initial focus (`OperationsQueue.tsx:167-198`). `CancelJobDialog:34` and `VerificationQueue:703` render `fixed inset-0` overlays with no dialog role found by grep `[V grep]`; focus trapping/restoration unverified `[A]`.
- **D-10 Touch targets:** recorded sub-44px controls in `VerificationQueue` (28–30px; partly fixed, chevron still 28px) `[D]`; planned for A5.
- **D-11 Duplicate auth code:** each page repeats the profile/role query then redirects; layout already does it. Harmless; remove in rebuild (keep the layout and service-level checks).
- **D-12 Booking/job status drift** (5 rows `[D]`; live now: 7 pending, 3 confirmed, 5 cancelled bookings vs 8 cancelled jobs `[V]`). Professional cancel leaves booking `pending`.

---

## B. Admin responsibility model

| Verb | What the admin must be able to do | Today |
|---|---|---|
| **See** | Everything needing a decision, ranked, with age and reason; health of the matcher; every record behind a case | Queue + health on Operations; not on Overview |
| **Investigate** | One page per booking/job/professional/customer with parties, timeline, assignment attempts, payments, notifications, audit trail | Drawer (events, attempts, decisions, payments) only |
| **Decide** | Cancel, reconcile, approve/reject, suspend/reactivate, reassign, close unmatched, review no-show, flag refund | First five exist; reassign, no-show, refund-flag missing |
| **Execute** | Only through a named DB function or the audited runner; stale-state check (`expectedState`) on every mutation | Established pattern; keep as the rule |
| **Confirm** | Result state shown after action, linked audit entry, item leaves queue | Reconcile and cancel do this; verification does |
| **Never** | Edit arbitrary columns, mint payments, change identity/ownership, bypass state machine, read messages without a justified audited case | Role-change endpoint (D-1) is the one exception to close |

---

## C. Information architecture

Recommendation `[R]`: keep the six sections but **do not build six top-level routes on day one**; ship only sections that have working content, no placeholders.

| Section | Route | Contents | Build when |
|---|---|---|---|
| Overview | `/admin` | priority queue (links into cases), matcher health, counts, recent admin activity | Phase 2 |
| Operations | `/admin/operations` | existing queue; `/unmatched` folds in as a type filter | exists |
| Jobs & Bookings | `/admin/jobs`, `/admin/jobs/[id]` | search/filter directory (server-side), **case workspace page** | Phase 3–4 |
| People | `/admin/people` tabs: Professionals (incl. verification), Customers; `/admin/people/pro/[id]`, `/customer/[id]` | | Phase 5 |
| Finance | `/admin/finance` | payments list from `getRecentPayments` + refund-review flags | Phase 6 |
| Activity | `/admin/activity` | audit viewer + job events | Phase 6 |

Navigation: desktop = persistent left sidebar (6 items, admin is dense and repeated); mobile = top bar + slide-over menu listing all six (do not squeeze into a 5-tab bar). Keep legacy routes (`/admin/professionals`, `/admin/customers`) as redirects once People ships; do not delete before replacement is verified. Comparison against alternatives: merging Operations into Overview would cut one click but loses a filterable full queue; keeping Operations separate is right. Splitting Verification out of People would match the daily workflow (largest queue) — **recommend People ▸ Professionals defaults to the verification queue** so frequency is preserved.

Click budget `[R]`: alert → case workspace = 1 click; action = 2 (open action, confirm); today alert → Operations → drawer = 2–3.

**RoleShell suitability `[V][R]`:** RoleShell gives the skip link, focus rings, sticky bar and token styling the admin lacks, but it is a top-nav + bottom-tab shell sized for `max-w-7xl` occasional use. Recommend extracting its primitives (skip link, header chrome, NavLinks) and adding an `AdminShell` with a sidebar variant, rather than forcing a top bar with 6 items. `NavIconName` in `shell/nav.ts` must be widened for admin icons.

---

## D. Unified case workspace specification

**Pattern:** full page `/admin/jobs/[id]` (and `/admin/people/...`) for investigation; the existing drawer remains the quick-triage view from queues and links to "Open full case". Drawer-only for single-field decisions (approve/reject a document); full page when more than one record is involved. A modal is wrong for investigation (current `JobDetailModal`).

**Layout (desktop ≥1024):** header (reference, service, state chips for booking and job, severity, age) · left column: Issue summary (why flagged, since when, `nextStep`), Timeline (job_events + assignment attempts + admin decisions + audit, merged, newest first) · right column sticky: Available actions · below: parties (customer, professional with verification and active-job count), schedule/property, quote + payments, notifications. Mobile: single column, actions pinned in a bottom bar.

**Data needs (all existing tables unless noted):** `bookings`, `jobs`, `job_events`, assignment attempts/offers (already read by `getOperationsCaseDetail`), `quotes`, `inspections`, `payments`, `profiles`, `properties`, `professional_profiles`, `audit_logs` filtered by `target_id`, `job_exceptions`, `notification_logs` (read-only; status is always `pending` today so show "no delivery tracking" honestly). Build as **one** service function `getCaseWorkspace(kind, id)` reusing the pieces in `admin.ts:580` and `admin-operations.ts:298`; both are the same shape.

**Action contract (each action declares):** preconditions (computed server-side, returned with the case so disabled buttons can explain why), required fields (`adminReason` ≥5 chars), consequences text, consent required (y/n), notification sent (y/n, to whom), payment-review flag, expected-state token, result state, audit action name. Action list is data-driven so unsupported actions simply do not appear or appear disabled with the reason ("Reassignment arrives with A4").

Initial actions: Cancel, Reconcile (exist). Later: Reassign/retry matching/withdraw offer (A4), Resolve no-show (A4), Flag for payment review (A6), Close unmatched (A4/A3.3).

---

## E. Real-world use-case matrix (prioritised)

Frequency/severity/risk are my estimates `[A]` (no production traffic data yet). Backend column is evidence `[V]`.

| # | Scenario | Entry | Admin path today | Backend support | Missing | Pri |
|---|---|---|---|---|---|---|
| 4 | No professional accepts | Overview/Ops `unmatched`/`stale_pending` | Read-only inspect | Matcher + attempts history exist | Admin retry/assign/close, customer notification, expiry rule `[OD]` | **1** |
| 5/7 | Pro unavailable / cancels after accept | Ops (`state_mismatch`) | Admin cancel or reconcile | Cancel works; booking stays `pending` | Re-offer vs cancel policy `[OD]`, reassignment (A4) | **1** |
| 6 | Pro doesn't arrive | Ops `possible_no_show` + `job_exceptions` | Cancel only | Customer report exists; threshold alert exists | Review/resolve report UI, reassign | **1** |
| 13/16/17 | Booking/job disagree; completed but booking active; quote pending after cancel | Ops `state_mismatch` | Reconcile only for `assigned` | Reconcile (assigned only) | Booking-status sync on terminal job states; stale-quote handling | **1** |
| 11/12 | Invalid docs; suspend with active jobs | Verification queue | Reject/doc review, suspend exists | Doc review verified | Suspension does not release jobs/offers; legacy 2 verified | **1** |
| 9 | Payment succeeded, app pending | none | none | Webhook exists, capture NOT RUN; 0 paid rows | Payments/webhook inspector | 2 |
| 10 | Refund request | none | none | `payment_review_required` flag only | Refund-review queue; execution deferred | 2 |
| 15 | Notification failed | none | none | All 61 rows `pending`; no delivery state | Provider integration first | 3 |
| 3 | Reschedule | none | none | none | Consent flow, RPC (A3.3) | 3 |
| 1/2 | Wrong service/address | none | cancel + customer rebooks | none | Edit-with-consent; low priority | 3 |
| 8 | Quote dispute | none | none | none | A7 | 3 |
| 14 | Property ownership | none | none | none | Narrow design needed `[OD]` | 4 |
| 18 | Invalid/stale admin action | any mutation | `expectedState` refusals | Verified for cancel/reconcile/verify | Uniform stale-state UX copy | 1 (cheap) |
| new | Role change / new admin | none (API only) | API | D-1 | Decide policy `[OD]` | 2 |
| new | Matcher stopped | Ops banner only | Banner | Queue status RPC | Show on Overview + persistent | 1 (cheap) |

Per-scenario detail (trigger, actor, consent, notification, payment, audit, recovery) should be written into the Phase 1 specs once the owner confirms the policy decisions below; writing all 18 in full now would mostly restate undecided policy.

---

## F. UX gap analysis

1. Two visual systems (D-7) and a hand-rolled admin shell (D-8): the console does not look like the rest of Feasy.
2. Overview answers "what needs a decision" but lacks health and payment exceptions, and its metric tiles are generic; no tile links to the case.
3. Investigation requires modal → close → page change; no URL-addressable case (jobs use `?id=` into a modal).
4. Filtering for jobs is client-side over 100 rows `[A]`; no search by reference, customer, professional.
5. Dialog semantics, focus restoration and 44px targets inconsistent (D-9, D-10); admin has no skip link.
6. Disabled-action explanations: only reconcile/cancel have refusal copy.
7. Duplicated queue-health banner in two pages; hand-written badge maps in `page.tsx`.
8. Mobile: tables → recorded alternatives unknown `[A]`; 375px verified only for Operations drawer and verification cards `[D]`.
9. Dead/unclear links: "Open no-show reports" tile has no destination.

---

## G. Backend capability gap analysis

| Needed action | Missing UI | Missing backend | Safe today? |
|---|---|---|---|
| Retry matching for a booking | yes | yes (no admin-callable retry; matcher is cron `process_assignment_queue`) | No |
| Manual assign / reassign / withdraw offer | yes | yes (no function; A4) | No |
| Resolve no-show report | yes | yes (`job_exceptions` has `status`, no admin resolve function found `[A: confirm in Phase 1]`) | No |
| Close/expire unmatched booking | yes | partial (customer cancel exists; no admin booking cancel) | No |
| Sync booking status after job terminal state | n/a | yes | No |
| Release jobs on suspension | yes | yes | No |
| Payments list | yes | **no** (function exists) | Yes (read) |
| Audit viewer | yes | **no** (route exists) | Yes (read) |
| Customer/pro detail pages | yes | **no** (queries exist in pieces) | Yes (read) |
| Refund flag persistence | yes | yes (table/column) | No |
| Admin view of notification failures | yes | yes (no delivery tracking) | No |
| Reschedule / edit booking | yes | yes | No |
| Audited role change | yes | yes (replace D-1) | No |

Rule for the UI `[R]`: a control appears only when its function exists; otherwise it appears disabled with a reason or not at all.

---

## H. Phased implementation plan

Resequenced from your proposal `[R]`: move A4 backend **before** Phase 3 UI that exposes it, and put the foundation cleanup first because every later phase builds on it.

| Slice | Content | Files (expected) | DB | Acceptance | Risk |
|---|---|---|---|---|---|
| **1.1 Foundation** | `AdminShell` (sidebar desktop / menu mobile) built from RoleShell primitives; token migration of existing pages; skip link; shared `PageHeader`, `StatusBadge`, `QueueHealthBanner`, `ActionDialog` (role=dialog, focus trap/restore, 44px) | `components/admin/shell/*`, `app/admin/layout.tsx`, token swap in 6 components | none | Zero hex literals in `app/admin`/`components/admin`; keyboard + 375px/1280px checks recorded; all existing routes unchanged | Low |
| **1.2 Service hardening** | Split `'use server'` services into server-only modules + explicit actions; remove `any/@ts-ignore` using `Database` types; guard test (every exported action calls the guard); resolve D-1 (remove or rebuild role endpoint) | `lib/services/admin*.ts`, `app/admin/actions.ts`, tests | none (role fn only if kept) | `tsc --noEmit` clean for admin; Vitest guard test; behaviour identical | Med (wide diff, mechanical) |
| **2 Overview** | Priority queue from `getOperationsQueue`, matcher health, payment/no-show tiles that link, recent admin activity from `audit_logs` | `app/admin/page.tsx`, small service | none | Every number traces to a query; failure shown as error not zero | Low |
| **3a A4 backend** | Reassign/withdraw offer, professional-cancel recovery, suspension releasing jobs, booking-status sync, no-show resolve | `supabase/migrations/…` + dry-run + rollback, validators, services | **Yes: needs separate approval** | Dry-run + concurrency suite (as for 105–110) | **High** |
| **3b Case workspace + Operations actions** | `/admin/jobs/[id]` workspace, merged timeline, data-driven action panel | new page + components, `getCaseWorkspace` | none | Scenarios 4–7,13 demonstrable on past-dated synthetic data | Med |
| **4 Jobs & Bookings** | Server-side search/filter/pagination, retire `JobDetailModal` | | none (maybe indexes) | Search by ref/name; no 100-row cap | Low |
| **5 People** | Merge professional + verification, detail pages, customer detail | | none | Legacy 2 pros shown with evidence status | Low–Med |
| **6 Finance + Audit** | Payments list, webhook/payment state, refund-review flag, audit viewer | route + RLS check | Maybe (refund flag) | Audit viewer filters by actor/target/action | Med |
| **7 Disputes, messages, notifications** | Only after owner policies | | Yes | | High |
| **8 Verification** | Run the written Playwright specs, axe pass, 375/768/1280, perf | tests | none | **Green Playwright run**, honestly reported | — |

Production-safety rules for every slice: past-dated synthetic data only (matcher offers future bookings to real professionals), no push, migrations one at a time with dry-run, rollback and approval.

---

## I. Owner decision register (revised after owner review)

**Settled — do not reopen:**
- Professional cancels before acceptance: continue matching. After acceptance, before scheduled start: controlled reassignment when feasible, customer notified. After scheduled start: admin intervention. After arrival or during work: admin review, no automatic reassignment. Payment and quote consistency preserved.
- Unmatched booking: flag at scheduled start; escalate after 30 minutes; no silent cancellation; customer-approved rescheduling where required.
- Cancellation fees: none for MVP. Refunds: administrative review only, no automatic execution.
- Support role: deferred. Role changes: no in-app flow (endpoint disabled; see `ADMIN_PROVISIONING.md`).
- Legacy 2 verified professionals: do not auto-suspend; status unchanged pending an owner-approved re-verification process.
- Booking `c779c0d4`: preserve for manual review; never modify automatically.
- Staging Supabase: required before complex live assignment testing and before A4 migrations.
- Reassignment requires explicit authorization, state checks, notifications and audit.

**Still open:**
1. Offer capacity: owner earlier chose **max 3 concurrent pending offers**. Not implemented — see Corrections. Needs a decision whether to enforce it atomically in A4 or accept the current time-overlap rule.
2. Notification provider and delivery tracking (all 61 rows `pending`).
3. Quote left `pending_customer` after cancel: auto-expire or admin resolve.
4. Mandatory cancellation reasons for customers/professionals.
5. Sequencing of A4 vs case workspace: owner chose read-only workspace first.

## J. Release readiness

**Blocks external testing (unchanged from earlier reports plus this pass):** green Playwright run (admin specs never executed); isolated staging Supabase (shared with localhost, production traffic and matcher); legacy verified professionals decision; A4 professional-cancel recovery and orphan/drift handling; D-1 role endpoint (CLOSED in Slice 0.1); real verification upload untested (bucket exists, 0 objects).

**Safe to defer:** reschedule, booking edit, quote disputes, audited message access, refund execution, notification retry, support role, analytics.

**Not release-blocking but should ride with Slice 1:** token/shell consistency, dialog a11y, `any` removal, `'use server'` file split.

---

## Recommended first slice

**Slice 1.1 + 1.2 (foundation and service hardening), starting with 1.2's guard test and the D-1 decision.** Why: it touches no database, changes no behaviour, unblocks every later phase (shell, shared dialog, typed services), closes the one real governance gap (D-1), and gives the case workspace a clean base. Sequencing it before A4 also lets the long-lead owner decisions (I-1, I-2, I-9) be made while it is built. Nothing starts until you approve.


---

## Corrections (Slice 0.1, 2026-11-01)

Re-checked read-only against project `azmajqztvcuwajaaldqm`:

- **Verification storage — earlier statement was wrong.** Bucket `verification-documents` EXISTS (private, 10 MiB, jpeg/png/webp/pdf; created by migration 110). `storage.objects` holds 0 objects in it (only `job-media` has 2). Distinguish: bucket exists = yes; object metadata rows = none; file bytes = none; accepted documents = per the A1 docs, the earlier browser test used synthetic metadata rows which were removed; **a real end-to-end upload has not been verified**.
- **Role endpoint.** It is `PATCH`, not `PUT`. The route accepted `customer|professional|admin`. Protection that already existed: trigger `profiles_prevent_role_change` (only `service_role` or an admin may change a role) and RLS `profiles_update_own_non_role_fields`, so ordinary users could not self-escalate; the risk was an admin session granting admin through the service client without the audited runner. No caller existed in `src`/`tests`.
- **Offer capacity.** No 3-pending-offer cap exists in the database or matcher. `_rank_professionals` excludes professionals with another active job (`assigned…quote_pending`) within ±2 hours of the booking start and down-weights load; there is no count-based limit, and the one-offer rule in the audit (F-21) is likewise not enforced as such. `_offer_next` makes one offer per booking at a time. Nothing was changed.
- **Other role writers found:** `auth/callback/route.ts` and `lib/auth/session.ts` upsert `role: 'customer'`; the user-client upsert is blocked by RLS/trigger for non-customers, but the `session.ts` PGRST201 branch uses the service client and could overwrite an existing row's role with `customer` (a demotion, never an escalation). Logged as a risk; not changed in this slice.
- **`admin-operations.ts` is not `'use server'`** (reached only through `app/admin/actions.ts`); the three other admin modules are.
