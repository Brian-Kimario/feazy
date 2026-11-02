# Professional verification state machine: compatibility assessment

Status: **drafted, dry-run verified, NOT applied** to the shared database. Awaiting owner approval.
Migration: `supabase/migrations/20261030_104_professional_verification_state_machine.sql`
Rollback: `supabase/rollbacks/20261030_104_professional_verification_state_machine.rollback.sql`
Live SQL tests: `tests/security/verification-state-machine.dryrun.sql` (run inside `BEGIN … ROLLBACK`)

## 1. Why the original migration is not used
`20261004_003_phase3_verification_state_machine.sql` was never applied (live has no
`transition_professional_verification_status`). It has a syntax error and its function took a
caller-supplied `p_admin_user_id`, so any caller could claim to be an admin. It is left untouched;
see section 9 for how future environments should treat it.

## 2. Live state inspected (shared Supabase project)
| Item | Finding |
|---|---|
| `professional_verifications`, `professional_verification_documents` | exist, 0 rows each |
| `professional_verification_events`, new RPCs | do not exist |
| Professionals | 2, both `verified`; `pro.a` unavailable, `pro.b` available with one `in_progress` job |
| `under_review` | no rows; the app never writes it |
| Existing guard | `professional_profiles_guard_protected_columns` (from 20261030_102) lets admin/service through unrestricted |
| Existing assignment | `_rank_professionals` filters verified + available; `transition_job_state` checks verified on accept; nothing at the table level |

Local and remote migration histories diverge (migrations were applied ad hoc), so the new file is
idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS`, `CREATE OR REPLACE`).

## 3. Transitions enforced
| From | Action | To | Who | Needs |
|---|---|---|---|---|
| pending, documents_submitted, under_review | approve | verified | admin | required documents on file |
| same three | reject | rejected | admin | reason (5-500 chars) |
| verified | suspend | suspended | admin | reason; `is_available=false`; offers withdrawn; active jobs flagged, not cancelled |
| suspended | reactivate | verified | admin | reason; documents re-checked; availability NOT restored |
| pending | submit | documents_submitted | the professional | required documents |
| rejected | resubmit | documents_submitted | the professional | documents uploaded after the rejection |

Everything else raises 55000. A stale `expected_status` also raises 55000, so a double click or a
second admin gets an error, not a second transition.

## 4. Security model
- `admin_transition_professional_verification`: SECURITY DEFINER, `search_path = public, pg_temp`,
  admin is `auth.uid()` and the profile role must be `admin` (anon, customer, professional, support refused with 42501). No admin id parameter exists.
- EXECUTE revoked from PUBLIC, anon, service_role; granted to authenticated only. The function re-checks the role itself.
- The protected-column trigger now refuses any `verification_status` change unless a transaction-local marker set by these functions matches `user_id:new_status`. X
- `is_available = true` requires `verified`, enforced by trigger and a CHECK (0 live rows violate it).
- `professional_verification_events` is append-only (trigger), RLS on: admins read all; a professional reads their own submit/resubmit/approve/reject rows but not suspension notes.
- `audit_logs` is not duplicated. `runAdminAction` still writes the `admin.*` requested/succeeded/failed rows (attempts); the events table is the domain history (what changed, from/to, actor, reason, time). They link by professional id and time.

## 5. Assignment eligibility (highest priority)
Trigger `jobs_guard_professional_verified` (BEFORE INSERT OR UPDATE OF professional_id on `jobs`)
raises 55000 unless the professional is `verified`. It has no bypass, including for service role, so
it covers the ranker, `assign_booking`, admin reassign and any raw write.
Tested directly: pending, documents_submitted, rejected and suspended professionals all fail to be assigned; a verified one succeeds. Accepting an offer after suspension fails in `transition_job_state`.

## 6. Decisions made
- **Offer revocation: same transaction.** Suspension releases each held offer via the existing `_release_offer` (outcome `withdrawn`, reason `professional_suspended`) which re-offers to the next candidate. Atomic is safer than a recovery job: there is never a window where a suspended professional holds an offer. Cost: one function holds row locks briefly. Active jobs are listed in the event metadata for A3 to surface; customer notification for them is not built yet (A3/A4).
- **Why not reuse `job_exceptions`:** it is shaped for customer-reported no-shows (`reported_by NOT NULL`, single `kind`).
- **Lifecycle simplification (recommended, not applied).** `under_review` is never written. Recommended lifecycle: `pending → documents_submitted → verified | rejected`, and `verified ⇄ suspended`. Keep `pending` (nothing submitted) distinct from `documents_submitted` (awaiting review); the evidence gate sits between them. No data migration is needed (no rows hold `under_review`). Consequence: remove `under_review` from `VerificationStatus`, the queue labels, `OnboardingClient`, `rules.ts` and the CHECK constraint in a later cleanup. The migration still accepts it as a reviewable source so nothing breaks meanwhile.

## 7. Application changes in this change set
- `verification.ts`: approve/reject call the new RPC with the expected status (no `p_admin_user_id`, no `@ts-ignore`); suspend/reactivate moved here on `runAdminAction` + Zod; upload calls `submit_professional_verification` and opens a new verification round after a rejection (history kept). The duplicate review-record write is gone; the RPC updates it in the same transaction.
- `services/admin.ts`: old suspend/reactivate removed. `onboarding/actions.ts`: removed dead `submitVerificationDocuments`, which wrote `documents_submitted` through the admin client from any state (an un-suspend hole).
- `admin/actions.ts` `verifyProfessional` reads the current status and passes it as expected.
- `VerificationQueue.tsx`: passes the displayed status; Suspend/Reactivate ask for a reason and show only for verified/suspended rows.
- `src/lib/supabase/pending-rpc.ts`: typed shim until `database.types.ts` is regenerated after apply (then call `supabase.rpc` directly).
- Validators: `expectedStatus` on approve/reject; `suspend`/`reactivate` schemas.

## 8. Test results (executed)
- Transactional dry run against the live DB, rolled back: **64 passed, 0 failed** (authorization by role, validation, evidence, stale/duplicate, tampering, suspension effects, assignment backstop, reactivation, reject + resubmit + history, events protections, grants, search_path). Post-run check confirmed nothing persisted.
- `pnpm tsc --noEmit`: clean. `pnpm exec vitest run`: 243 passed, 16 skipped, 0 failed (includes the new static test file).
- ESLint: the touched files still carry the repo's known `any`/`@ts-ignore` debt (93 problems vs 114 before this change); no new ones introduced.
- Not run: Playwright (blocked here); browser approve/reject/suspend/reactivate (needs the migration applied).

## 9. Open decisions for the owner
1. **Required document types:** currently `['id']` only. Confirm or extend (`license`, `insurance`, `background_check`).
2. **Legacy verified professionals have 0 documents on file.** Reactivating one is blocked (23514) until documents exist. Options: they upload; or an audited backfill marks them grandfathered.
3. **Original migration 20261004_003:** recommend a separate approved commit that turns it into a documented no-op so a fresh environment does not fail on it. Not touched now.
4. **Support role reading verification events:** currently admin only.
5. **Customer notification when a professional is suspended mid-job:** deferred to A3/A4.

## 10. Rollback and recovery
Run the rollback script in one transaction after exporting `professional_verification_events`. It
drops the trigger, functions, constraint and table and converts `withdrawn` attempts. Statuses already
changed are not reverted; the guard body from 20261030_102 must be re-created (copy from that file).
Since the whole migration is additive except the guard replacement, the practical failure mode is a
blocked write, which fails closed.

## 11. Apply plan after approval
`supabase db query --linked -f supabase/migrations/20261030_104_….sql` (never `db push`), re-run the dry-run script's checks, regenerate `database.types.ts`, drop the shim, then browser-verify approve/reject/suspend/reactivate at 375px and 1280px and finish A1 live verification.
