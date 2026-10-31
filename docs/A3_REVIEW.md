# A3 review — Operations and assignment recovery

Prepared 2026-10-31 for owner review. A4 (reassignment, suspension) stays blocked until this is accepted.
Branch `audit/preproduction-remediation`; all commits local, nothing pushed.

## 1. Delivered

| Slice | What | Commits | State |
|---|---|---|---|
| A3.1 | Read-only Operations exception queue; unsafe reassign/dispute actions removed | 19e59e3 | Done |
| A3.2 | `admin_reconcile_job` (migration 106): audited reconcile of cancelled-booking/assigned-job mismatches, with `admin_reconciliations` table, drawer action, Zod, `runAdminAction` audit | c49ee3c, 25fdca8, 32fc397 | Applied, verified live |
| P1 | `customer_cancel_booking` + internal `transition_booking_state` + `booking_events` (migration 107), service, server action, customer UI control | 61f9719, d709f5d, 2761e09, cb9c68c, 40004d5, 8434d65 | Applied, verified live |

Design records: `docs/A3_2_RECOVERY_DESIGN.md`, `docs/P1_BOOKING_CANCEL_DESIGN.md`. Rollbacks: `supabase/rollbacks/20261030_106_rollback.sql`; 107 rollback in design §9.

## 2. Critical recovery capabilities and how each was verified

| Capability | Verified by |
|---|---|
| Admin can cancel a job with customer category and private reason | Earlier slice A2 |
| Admin can reconcile a mismatch (booking cancelled, job still assigned) | Dry run; two-session concurrency test (B blocked on the row lock, then `STALE_STATE`); browser run on a fixture: 1 event, 1 record, 0 notifications, 0 payments touched, queue 0 |
| Customer can cancel their own booking (including one with no professional) | 35-case dry run; two-session concurrency test (`ALREADY_CANCELLED`); two synthetic bookings cancelled through the UI, `booking_events` row correct, synthetic data deleted |
| Cancellation never changes a payment | Dry run d20/d21; live tests had no payments |
| Stale or foreign requests are refused | Dry run d01–d10, d17/d18; unit tests |
| Every privileged call is authorised in the database, not trusted from the client | Actor from `auth.uid()`, EXECUTE grants checked live, internal state machine revoked from all roles |

Suite at last run: `pnpm tsc --noEmit` clean; Vitest 366 passed, 16 skipped.

## 3. Re-verification (2026-10-31) and what is still not verified

**Now verified live** (synthetic, past-dated rows on the shared database, all deleted afterwards; `c779c0d4` untouched, `booking_events` empty):

- **40P01 deadlock.** Reproduced with the real functions: one session held the job lock then called `admin_cancel_job`; a second ran `customer_cancel_booking` on the same booking (booking→job vs job→booking). PostgreSQL aborted the **admin cancel** with `40P01` and the customer cancel committed. End state was consistent: booking and job `cancelled`, one `booking_events` row, one job cancel event, **no** `admin_job_cancellations` row (the loser rolled back whole). No corruption.
  - The customer path shows its retry message for `40P01`. The admin path (`adminCancelJob`) shows the generic "The job could not be cancelled" and records the audit row as failed. Safe, but it does not say "try again". Aligning the lock order (open item 1) removes the case.
- **Paid booking through the UI.** A synthetic job with a job-level `paid` payment (provider `synthetic`, no real transaction): the cancel panel showed the no-automatic-refund copy; confirm cancelled the booking and job, the page showed "This booking is cancelled" with "You paid for this booking. Cancelling does not refund it automatically…", the payment row was untouched (`paid`), and `booking_events` recorded `payment_review_required: true`, `paid_payment_count: 1`. So `kase.paidAt` does cover job payments, as designed.
  - Cosmetic: a cancelled-and-paid page still shows the green "Payment received" block above the cancelled notice. Consider hiding it once cancelled (A5 polish).

**Assigned-professional cancellation (verified 2026-10-31).** Isolated fixtures: a synthetic verified professional (`synthetic.pro.a3@fixify.invalid`, `is_available=false`, no skills, no service areas, no phone, no password, so the matcher can never rank or contact them) and two past-dated bookings of `customer.a@fixify.dev`. Cancelled through the real UI (booking page, reason, confirm):

| Check | Accepted job | Assigned job with open offer |
|---|---|---|
| Booking / job state | `cancelled` / `cancelled` | `cancelled` / `cancelled` |
| `booking_events` | one row, customer, `changed_my_mind`, `job_state: accepted`, `payment_review_required: false` | one row, `found_other_help`, `job_state: assigned` |
| `job_events` | `accepted>cancelled` | `assigned>cancelled` |
| Offer withdrawal | n/a | one `withdrawn` attempt, `offer_expires_at` cleared |
| Professional notified | `job_cancelled` (unread) | `job_cancelled` (unread) |
| Customer notified of own action | 0 | 0 |
| WhatsApp | one `cancellation/whatsapp` row queued `pending`; the professional has no phone, row deleted in cleanup | same |
| Active codes | 0 | 0 |
| Payments | none (paid case verified earlier: preserved, flagged) | none |

Also verified by rolled-back SQL as the real roles: a duplicate customer cancel returns `ALREADY_CANCELLED` (both expected states); the professional's `on_the_way`, `arrived`, `in_progress`, `completed`, `accepted` transitions are all refused (`P0001`) and `decline_job` is refused (`P0002`); the professional can still read the job; the job has exactly one cancel event. Cleanup: all synthetic bookings, jobs, notifications, log rows and the synthetic auth user deleted; `booking_events` empty; no orphans; `c779c0d4` untouched (`pending`).

Not run here: a future-dated assigned booking with live matching (needs the isolated staging database).

**Still not verified:**

- ~~Reconcile panel~~ **verified 2026-11-01** on the owner's signed-in admin session, with four synthetic past-dated fixtures (deleted afterwards):

  | Case | Result | Database afterwards |
  |---|---|---|
  | Valid (job `assigned`, booking cancelled) | Job closed | 1 job event, 1 `admin_reconciliations` row, 0 notifications, payments untouched; item leaves the queue |
  | Invalid input (reason under 5 chars) | Button stays disabled | nothing written |
  | Stale (job already cancelled when confirmed) | "The job is now cancelled, not assigned. Refresh and review." | nothing written |
  | Terminal (job set to `closed` after the confirm step opened) | "The job is now closed, not assigned. Refresh and review." | nothing written |
  | Paid job | Refused: "A payment was captured for this booking. It needs a person to review the payment before the job is changed." | job still `assigned`, payment still `paid`, no events or records |
  | Unauthorized (customer and professional, rolled-back SQL) | `42501` both | job unchanged |

  Layout: no horizontal overflow at 1280px or 375px; drawer fills 375px; Close and action buttons are 44px high. Cleanup confirmed: no fixtures left, `booking_events` empty, `c779c0d4` still `pending`.
- **A1 approve/reject journeys** (rejection reason, history, audit events, unauthorized attempts): same dependency, plus synthetic pending-verification fixtures that cannot qualify for real work.
- **Playwright:** `tests/e2e/a1-a3-access-and-cancel.spec.ts` written (admin pages closed to customer and professional; customer cancel needs a reason, then cancels). **Execution BLOCKED**: no `E2E_TEST_PASSWORD` in this environment. It type-checks, lints and lists 9 tests across 3 browsers; it has not run and no pass is claimed. Admin approve/reject and reconcile journeys are **not written yet**. External testing stays blocked until a green run (release blocker).

## 4. Open items (kept visible)

1. **Deadlock: closed.** Migrations 108 (lock order) and 109 (suspension row lock `FOR NO KEY UPDATE`) applied 2026-10-31; all five concurrency tests pass with no 40P01. Rough edge: a suspension racing an admin cancel of the same professional's job aborts cleanly with `P0001` and must be retried (see `docs/A3_LOCK_ORDER_DESIGN.md` section 9b).
2. Five historical drift rows (booking pending/confirmed, job cancelled); cause: a professional cancel leaves the booking `pending`. Customers can now clear them; whether a professional cancel should re-offer the booking is an A4 product decision.
3. `c779c0d4` (no-job stale booking): preserved, untouched, still `pending`, still visible in the Operations queue. It belongs to `customer.a@fixify.dev` (Priya Sharma), a designated fixify.dev test/seed account, created 2026-10-04: synthetic, not a real customer. No one has been contacted; resolving it needs your explicit direction.
4. Customer-consented reschedule for expired bookings (design only, A3.3).
5. A quote left `pending_customer` when a job is cancelled is not handled (both cancel paths).
6. Verification document-integrity gap; legacy verified professionals with 0 documents.
7. Old migrations `20261004_002/003/007` still describe the superseded design; replay is safe but they should be neutralised.
8. Support-role reads; customer notification on mid-job suspension; dropping `under_review`.
9. Pre-existing lint errors (`no-explicit-any`) in `src/app/customer/actions.ts`; not from these slices.
10. Operational note: the assignment matcher runs every minute on the shared database, so any synthetic future-dated pending booking will be offered to real professionals. Test bookings must be past-dated.

## 5. Decisions requested before A4

1. Accept A3 as reviewed, or name what must be re-verified first.
2. Professional cancels: re-offer the booking, or cancel it for the customer?
3. Align `admin_cancel_job` lock order now (small migration, needs the usual dry run and approval), or leave and rely on retry?
4. `c779c0d4`: leave, or approach the customer?
5. Run the A1 journeys and an A3 Playwright pass before A4, or after A5?

## 6. A4 gate package

1. Assigned-professional cancellation: verified (section 3).
2. Reconcile panel browser results: verified (section 3), 375px and 1280px.
3. A1 approve/reject browser results: pending your admin sign-in; document-integrity gap still to be investigated separately.
4. Playwright: spec written, execution BLOCKED (no `E2E_TEST_PASSWORD`); admin journeys not yet written.
5. Deadlock root cause: `docs/A3_LOCK_ORDER_DESIGN.md` section 1.
6. Lock-order migrations 108 and 109: **applied** with approval; rollbacks `supabase/rollbacks/20261031_108_rollback.sql`, `20261101_109_rollback.sql`; concurrency tests 1-5 pass.
7. This document updated.
8. Release blockers:  green Playwright run; A1 browser verification (reconcile is done); isolated staging Supabase project (shared database serves localhost, production traffic, matcher and test data); document-integrity gap; legacy verified professionals with 0 documents; professional-cancel policy implementation (A4 design approved, not built).
