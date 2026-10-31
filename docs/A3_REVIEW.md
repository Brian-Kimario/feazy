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

## 3. Not verified (be explicit)

- **40P01 deadlock** between a customer cancel and `admin_cancel_job` (opposite lock order). The app shows a retry message; never reproduced live.
- Customer cancel of a booking **with an assigned professional** and a **paid payment** through the UI (covered by dry run and unit tests only). The paid-booking notice relies on `kase.paidAt`, which covers job payments only.
- Reconcile panel refusal paths and 375px layout.
- A1 approve/reject journeys (Playwright blocked).
- No Playwright coverage of any A3 flow.

## 4. Open items (kept visible)

1. `admin_cancel_job` lock order (job→booking) opposite to matcher/customer cancel (booking→job). Recommended small follow-up.
2. Five historical drift rows (booking pending/confirmed, job cancelled); cause: a professional cancel leaves the booking `pending`. Customers can now clear them; whether a professional cancel should re-offer the booking is an A4 product decision.
3. `c779c0d4` (no-job stale booking): untouched; only resolvable through `customer_cancel_booking` with the customer's consent or owner direction.
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
