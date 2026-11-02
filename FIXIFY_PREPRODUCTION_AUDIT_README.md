# FIXIFY — FINAL PRE-PRODUCTION SYSTEM AUDIT

**Document type:** Claude Code execution brief and audit README  
**Mode:** Evidence-first, role-based, browser-led system audit  
**Target:** Existing Fixify application, configured test environment, and authorized test accounts  
**Primary deliverable:** `docs/audits/PREPRODUCTION_AUDIT_REPORT.md` (or the repository's established audit directory)  
**Secondary deliverables:** evidence index, reproducible defect register, risk-ranked remediation roadmap, and release-readiness decision  
**Initial permission:** AUDIT / TEST / DOCUMENT / SAFE TEST-FIXTURE MANAGEMENT. **No production deployment or broad remediation without a separate approval.**

> **Mission:** Act as a demanding but fair independent QA lead, security reviewer, UX researcher, and operations tester. Test Fixify as a real user would, not merely as its developer expects. Seek to falsify assumptions. Document defects with reproducible evidence. Recommend the smallest high-leverage improvements. Avoid invented findings, fabricated test results, and unapproved production changes.

## 0. Authorization and safety boundaries

The owner authorizes Claude Code to:

- Use its available browser/computer tools to sign into **each** listed test account, navigate the entire accessible product, and perform legitimate and negative tests.
- Inspect repository source, `CLAUDE.md`, `AGENTS.md`, product/architecture/state-machine documents, migrations, tests, application logs, browser console/network data, and the database **using authorized access**.
- Create **clearly labeled synthetic test data**, submit test forms, send messages between test users, create/cancel test bookings and jobs via **existing authorized flows**, upload harmless synthetic images, and clean up only verified audit-owned artifacts using approved mechanisms.
- Run non-destructive automated checks, targeted SQL assertions, accessibility checks, and performance measurements.
- Create and update **audit documentation**, including findings and evidence references.
- Suggest code changes and produce a prioritized implementation plan, but **do not silently implement functional changes during the evidence-gathering pass**.

The owner does **not** authorize:

- Real payments, refunds, charges, or triggering actual customer/professional communications; production email/SMS/WhatsApp delivery; unapproved third-party spending.
- Deleting or modifying real customer data; modifying production credentials, secrets, policies, roles, or infrastructure; deploying/pushing code; running destructive migrations; disabling RLS; or broad automated vulnerability scanning against public infrastructure.
- Changing application behavior to make tests pass before recording the original failure.
- Exposing passwords, session tokens, access tokens, private customer information, or full credentials in logs, screenshots, commits, or the report.
- Testing another person's data or accounts outside the explicitly authorized test scope.

**Environment gate:** Before any state-changing action, determine whether the target is production, staging, or a shared linked database. If it is the only live database, prefer read-only analysis and reversible, owner-labeled test fixtures. If a test could impact real users, notifications, queues, or money, STOP and request approval or substitute a safe non-destructive verification. Test accounts are not a blanket authorization to alter production infrastructure.

**Credentials:** Use the test identities in Section 2. The common test password was provided by the owner in chat. Obtain it from the secure execution context (e.g., `FIXIFY_AUDIT_TEST_PASSWORD`) rather than embedding it in a tracked README, command history, source file, screenshot, or report. Rotate this shared password before external testing/production and ideally give each account a unique password. Never print secrets.

## 1. Definition of success and priorities

A passing audit is **not** a count of green unit tests. It is a demonstrable set of end-to-end journeys, explicit authorization checks, accurate state handling, clear UX, reasonable performance, and an honest list of remaining risks.

Prioritize in this order:

1. **P0 — Trust/safety/security:** unauthorized access, IDOR, privilege escalation, exposed files, auth/session leaks, payment misuse, unsafe mutations, data loss.
2. **P0 — Core journey blockers:** unable to book, assign, accept, inspect, quote, approve, complete, or recover a job; misleading status that causes wrong decisions.
3. **P1 — Reliability and operational recovery:** stuck jobs, missed notifications, orphaned uploads, race conditions, retries, missing admin escalation, scheduling/cron failures.
4. **P1 — Usability and accessibility:** unclear next step, misleading labels, blocked mobile navigation, unreadable states, inaccessible forms.
5. **P2 — Performance and polish:** slow routes, excessive polling, N+1 queries, layout shifts, loading feedback, visual consistency.
6. **P3 — Nice-to-have features:** record as future backlog, do not expand scope during audit.

## 2. Role matrix and session strategy

| Role | Test identity | Intended scope |
|---|---|---|
| Customer A | `customer.a@fixify.dev` | Main customer journey, own bookings, chat, notifications, attachments |
| Customer B | `customer.b@fixify.dev` | Second customer, isolation/IDOR checks, simultaneous requests |
| Professional A | `pro.a@fixify.dev` | Offer acceptance, status changes, ETA, media, messages, quote, completion |
| Professional B | `pro.b@fixify.dev` | Other-professional isolation, assignment conflicts, negative tests |
| Admin | `admin.test@fixify.dev` | Oversight, verification, exception handling, operational controls, audit visibility |

**Shared test password:** supplied separately by owner; never copy into this document or screenshots.

Use separate browser profiles/isolated contexts if supported; otherwise explicitly sign out and confirm role switch. Never assume an account is correctly authenticated because the page looks right. Record the visible role and server-side identity where safely possible. Verify that browser back/forward, refresh, and multiple tabs cannot revive stale privileged access.

## 3. Preparation: discovery before clicking

1. Read `CLAUDE.md`, `AGENTS.md`, current roadmap, relevant feature specifications, state-machine definitions, route map, RLS/security conventions, and deployment instructions. Read the relevant installed Next.js documentation before changing any Route Handler/Server Action code (no code changes expected during audit).
2. Inventory actual customer, professional, and admin routes and their entry points. Discover them from the application and repository; **do not assume routes or features exist**.
3. Identify the current deployed URL and environment, linked Supabase project, data sensitivity, whether payment channels are live, notification delivery configuration, and which cron jobs are enabled. Do not invent these facts.
4. Capture baseline: git branch/commit, deployment identifier if available, migration versions, browser viewport, date/time/timezone, known failures, and test credentials readiness. Record secret presence/absence, never secret values.
5. Verify test accounts, roles, permissions, and existence of usable test fixtures. Design safe fixture creation/cleanup; if fixtures cannot be safely created, mark scenarios **BLOCKED** and explain why.
6. Create a scenario coverage matrix with `NOT RUN`, `PASS`, `FAIL`, `BLOCKED`, `PARTIAL`, `NOT APPLICABLE` states. Keep it current.

## 4. Browser-first journey audit

For **every** role, assess each screen at desktop **1280px** and mobile **375px** (add 768px for critical navigation/layout), using actual clicks and form inputs. Record what the user sees, not just database expectations.

### 4A. Visitor and authentication

- Landing page: value proposition, CTA clarity, trust signals, service categories, location/serviceability expectations, loading, dead links, errors, mobile layout.
- Sign-in, sign-out, session expiry, refresh, password/reset if configured, unauthorized route access, role-based redirect, protected back navigation, cross-account session leakage.
- Input validation, actionable errors, accessible focus, keyboard navigation, labels, contrast, empty/error states.
- Test that logged-out and wrong-role visitors cannot reach protected data via direct URL or server action.

### 4B. Customer A: complete happy path

1. Discover service and start a booking. Check service/option labels, pricing explanations, location/address, scheduling, contact fields, validation, confirmation, and duplicate-submit behavior.
2. Check booking status and progress consistency across dashboard, case page, notification bell, and timeline.
3. Observe assignment/acceptance and professional details; verify customer contact disclosure rules.
4. Observe ETA, running-late and expired estimate states; confirm they are professional-provided, not live GPS.
5. Open messaging, send/receive messages, verify unread counts, read state, polling refresh, and terminal read-only behavior.
6. View before/after/part/receipt media; check file permissions, previews, failed-load states, mobile gallery.
7. Follow inspection/quote submission and approval/decline flows **only if implemented**. Verify that displayed and server-enforced prices match, including any hidden or unsupported option price adjustments.
8. Follow start/finish code and completion confirmation **only if implemented**; otherwise mark absent/deferred, not broken.
9. Exercise cancellation, rescheduling, no-show report, and support escalation **only if implemented**; check eligibility and policy disclosure.
10. Inspect history, receipts/payment state, and support/help routes. Do not conduct a real charge.

### 4C. Customer B: isolation and competing state

- Create a separate booking and verify Customer A cannot see it (and vice versa).
- Try direct navigation to another customer's job, booking, attachments, messages, notifications, quote, and timeline.
- Try modifying identifiers in permitted test requests and confirm **server-side** rejection. Avoid broad automated fuzzing.
- Check that one customer's read actions, cancellation, or media access do not affect the other.
- Check two customers performing similar operations at once for accidental data mixing.

### 4D. Professional A: full lifecycle

- Dashboard, profile/verification status, offer queue, offer expiry, accept/decline and concurrent assignment handling.
- Assigned job details, address/contact visibility and authorization boundaries.
- On-the-way, ETA sharing, running-late updates, arrival, before/after/part/receipt media upload and attachment.
- Inspection, quote entry, option pricing, approval/decline response, start/finish verification and completion **as implemented**.
- Messages inbox, send/reply, unread counts, notification bell, read-only terminal thread, refresh/reconnect behavior.
- Test errors: invalid transition, repeat click, slow network, upload failure, wrong file type, double submit, stale tab, expired offer.
- Verify all six mobile navigation items (or current number), touch target usability, labels, active state, no overflow.

### 4E. Professional B: isolation and concurrency

- Cannot view or act on Professional A's jobs, private messages, customer contact, receipts, or media.
- Cannot accept another professional's offer or submit ETA/media/quote/transition on an unrelated job.
- If safely testable, simulate competing offer acceptance and reassignment; ensure one authoritative active assignment and no stale access.
- Verify previously assigned professional's access is revoked appropriately, including historical conversation privacy.

### 4F. Admin: operational control plane

- Confirm actual admin routes, dashboard metrics, filters, search, case details, professional verification, assignment oversight, cancellation/no-show exception queue, support actions, and audit trails.
- Check role/permission enforcement on every sensitive admin action; verify admin-only views are not exposed to customers/professionals.
- Identify stuck bookings, overdue jobs, failed queue processing, notification failures, orphan media, missing cron secrets, inconsistent status projections.
- Verify admin actions produce clear outcomes, audit records, and safe confirmation for irreversible operations.
- Check whether admin access to private conversations has a justified, audited workflow. If not built, flag as a governance gap rather than bypassing RLS.
- Never perform destructive admin actions on real data.

## 5. Cross-role adversarial and recovery scenarios

Run controlled, bounded tests against **test-owned resources only**:

- **IDOR/RBAC:** guessed/swapped job IDs, booking IDs, notification IDs, storage paths, conversation IDs, server-action parameters, direct RPC calls.
- **Session integrity:** sign-out then back, stale tabs, role switch, concurrent sessions, token expiration, `httpOnly` posture, CSRF-relevant mutations.
- **State machine:** invalid jumps, stale requests, double acceptance, cancellation vs arrival race, completion vs message send race, retry/idempotency.
- **Scheduling:** timezone, past times, expired offers, no-show threshold, ETA expiration, delayed cron, admin escalation, missing assignments.
- **Pricing/payment:** price source of truth, hidden option changes, negative/zero values, quote tampering, payment-state claims; **no real transactions**.
- **Files:** MIME/size checks, attachment authorization, private access, orphan cleanup and 24-hour retention, failed attachment, safe preview, signed URL expiry.
- **Messaging/notifications:** XSS as text, 2,000-char cap, 10/min rate limit, duplicate client keys, read-state consistency, polling backoff, wrong-user notification, delayed delivery and reconciliation.
- **Failures:** network interruption, timeout, server 4xx/5xx, empty data, offline/reconnect, upload retry, malformed input, unconfigured third-party services.
- **Privacy:** exposed PII in HTML, console, error messages, logs, network responses, URLs, screenshots, and cross-user data.
- **Accessibility:** keyboard-only flow, semantic labels, focus visibility/order, dialog behavior, color contrast, touch targets, error announcements.

Do not conduct denial-of-service tests, high-volume brute force, or indiscriminate scans.

## 6. UX quality rubric

For each important screen, score **1–5** with a short explanation:

| Dimension | Guiding question |
|---|---|
| Clarity | Can a first-time user explain what this screen means? |
| Next action | Is the primary action unmistakable? |
| Feedback | Are loading, success, error, and pending states truthful? |
| Consistency | Do labels, status badges, totals, and timelines agree? |
| Trust | Does the interface accurately describe fees, professional identity, privacy, and timing? |
| Mobile | Is it usable with touch, without overflow or tiny controls? |
| Accessibility | Can keyboard and assistive-technology users operate it? |
| Recovery | Can users recover from mistakes, delays, and partial failures? |

Prefer **small, evidence-backed changes** over redesigns. Recommend improved copy, state labels, CTA placement, progressive disclosure, error messages, and mobile navigation only when a specific observation supports the change. Separate **defects** from **subjective UX opportunities**.

## 7. Performance and operational health

Measure, don't guess:

- Route navigation and initial render on representative customer, professional, and admin screens; collect browser timing/network evidence where available.
- Excessive client requests, duplicate fetches, 15-second polling fan-out, background polling, retries, and unnecessary refreshes.
- N+1 lookups in message inbox (up to 50 counterpart lookups reported previously), database query efficiency, pagination, indexing, slow queries where observable.
- Large media loading, image dimensions, caching, layout shifts, loading skeletons, slow connections.
- Cron health: assignment queue every minute; media sweep every six hours; notification reconciliation every ten minutes **verify actual deployment configuration**.
- Operational secrets/configuration presence, scheduler authorization, failure visibility, notification recovery, orphan cleanup, and deployment health.
- Browser console errors, server errors, failed requests, noisy logs, unexpected data discrepancies.

Capture reproducible numbers with test conditions; do not claim universal performance from one local run. Avoid expensive load tests against production.

## 8. Audit methodology and evidence standard

For each scenario:

1. Record the expected behavior from the specification or clearly label an inferred expectation.
2. Execute in the browser using the specified role; use repository/DB inspection to explain the result.
3. Capture relevant screenshot or short recording, URL/route, role, viewport, timestamp, browser console/network status, and relevant sanitized DB evidence.
4. Repeat unexpected behavior at least once when safe.
5. Distinguish root cause **confirmed**, **suspected**, and **unknown**.
6. Record whether the scenario passed, failed, was partially verified, was blocked, or was not applicable.
7. Cross-check what the UI claims against persisted server/database state.
8. Avoid recording passwords, tokens, real private data, or full sensitive payloads.

**Finding severity:**

- **BLOCKER:** data exposure, account compromise, real-money misuse, irreversible data loss, or core journey impossible; no external release.
- **HIGH:** major role workflow broken, wrong authorization, unsafe state transition, recurring unrecoverable failures, significant misleading financial/status information.
- **MEDIUM:** recoverable functional issue, substantial UX confusion, accessibility barrier, material performance regression.
- **LOW:** minor copy/layout polish or edge-case inconvenience.
- **OPPORTUNITY:** unproven enhancement; not a defect.

For each finding provide: `ID`, title, severity, confidence, role(s), affected route/component, prerequisites, exact reproduction steps, expected/actual behavior, evidence path, suspected root cause, user/business impact, smallest safe fix, regression test, owner decision required?, and release blocking status.

## 9. Deliverable: audit README/report

Write `docs/audits/PREPRODUCTION_AUDIT_REPORT.md` (or repository-equivalent), structured as:

1. **Executive verdict:** READY / CONDITIONALLY READY / NOT READY, and why.
2. **Scope and environment:** audited commit, deployment, DB/environment, dates, credentials used by role **without passwords**, exclusions.
3. **Coverage dashboard:** scenario counts by role and PASS/FAIL/BLOCKED/PARTIAL/NOT APPLICABLE.
4. **Core journey map:** customer → professional → admin; where the journey breaks.
5. **Findings summary:** counts by severity, with top five risks.
6. **Detailed reproducible findings:** one subsection per ID, evidence links and exact steps.
7. **UX scorecard:** screen-by-screen scores and concise, high-value improvements.
8. **Security/privacy review:** auth, RLS, IDOR, storage, messaging, notification, admin, secrets.
9. **Performance/operational review:** measured observations, cron health, polling, query patterns.
10. **Known limitations and untested areas:** never disguise blocked checks as passed.
11. **Prioritized remediation plan:** phases **R0** blockers/security, **R1** core correctness, **R2** usability/performance, **R3** optional polish; dependencies, acceptance criteria, regression tests.
12. **Release gates and go/no-go recommendation:** explicit remaining work before Vercel external testing.
13. **Appendix:** evidence index, test fixture inventory and cleanup status, commands run, tests skipped, sanitized logs.

Also create a compact `docs/audits/PREPRODUCTION_FINDINGS.md` if useful: table of `ID | Severity | Role | Issue | Reproduction | Recommendation | Owner decision | Status`.

**Do not commit screenshots containing sensitive data.** Store evidence in an approved private location or use sanitized references. If no safe evidence store exists, describe reproducible steps in the report instead.

## 10. Release gate

Recommend **GO for controlled external user testing** only when:

- No open BLOCKER findings.
- No unresolved HIGH security, privacy, payment, or core-booking integrity findings.
- Critical customer, professional, and admin paths have browser evidence at desktop and mobile.
- Cross-user isolation is verified, including storage, messages, notifications, and direct server operations.
- Scheduled jobs and secrets are verified in the target environment, or affected functionality is explicitly disabled and disclosed.
- Test credentials and shared passwords are rotated/removed from public exposure; test accounts are separated from real users.
- Test-only data is identified and cleaned up or safely retained with clear audit labels.
- Automated tests and Playwright status are accurately reported. If Playwright remains blocked, document compensating manual browser coverage and make an explicit owner risk acceptance; never say it passed.
- Known medium/low issues have owners and follow-up dates.

For **general production launch**, apply a stricter gate: production-grade secrets, staging strategy, backup/recovery, monitoring/alerting, external-service verification, privacy/legal policy review, and operational support readiness. Do not equate a controlled tester release with unrestricted production readiness.

## 11. Execution stages and checkpoints

**Stage A — Baseline (read-only):** discover architecture, environment, roles, routes, existing tests and known risks. Report blockers to safe testing.

**Stage B — Browser journeys:** exercise all five accounts, full customer/professional/admin paths, desktop and mobile. Log findings immediately.

**Stage C — Security and edge cases:** bounded cross-role tests, state transitions, file access, messages, notifications, session lifecycle, retries and concurrency.

**Stage D — Reliability/performance/UX:** operational jobs, polling, timings, console errors, accessibility, copy and interaction quality.

**Stage E — Evidence synthesis:** reproduce and deduplicate findings, rank by severity, draft report and remediation roadmap.

**Stage F — Owner handoff:** deliver report, evidence references, release verdict, and a short prioritized plan. **STOP before implementing remediations**; the owner will bring the report to ChatGPT for independent review and phased authorization.

At every stage: stop if a test may affect real users or money; ask for authorization rather than improvising.

## 12. Instructions for Claude Code's final response

Provide:

- Audit report file path and commit hash if **documentation only** was committed locally; do not push.
- Actual coverage counts and untested scenarios.
- Top 10 findings, ordered by severity and user impact, each with evidence references.
- Top 5 UX improvements with expected benefit and minimal implementation approach.
- Security and operational release blockers.
- Fixture cleanup summary.
- Honest READY / CONDITIONALLY READY / NOT READY verdict for **controlled external testing** and separately for **general production**.
- Questions requiring owner decisions.

**Do not make the product look ready by omitting failing tests. Do not invent defects to fill a quota. Do not make speculative feature requests the priority over functional correctness.**
