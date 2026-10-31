# A1 verification: browser results and document-integrity findings

Run 2026-11-01 on the shared database with the owner signed in as admin. Fixtures were three synthetic professionals (`synthetic.pro.*@fixify.invalid`): no password, `is_available=false`, no skills, no service areas, no phone, so the matcher can never rank them. Two had a placeholder document row pointing at `SYNTHETIC-NO-FILE/not-a-real-document.txt` (no storage object exists); one had no documents. No real evidence was fabricated.

## 1. Browser journeys (1280px)

| Case | Result | Database afterwards |
|---|---|---|
| Approve, no documents | Refused in the card: "Required documents missing: id" | still `pending`, no history row; audit `approve.requested` + `approve.failed` |
| Reject, 3-char reason | Confirm button stays disabled; counter shows "0 / min 5 chars" | nothing written |
| Reject, valid reason | Card leaves the queue | `rejected`, `rejection_reason` stored, one `reject` event (actor role admin), audit `reject.requested` + `reject.succeeded` |
| Approve, stale (status changed behind the page) | "Stale request: status is now rejected, expected pending" | no history row; audit requested + failed |
| Approve, one document on file | "Professional verified" panel | `verified`, `is_available` still false, one `approve` event, audit requested + succeeded |
| Unauthorized (rolled-back SQL as real roles) | customer and professional calling `admin_transition_professional_verification`: `42501`; rejected professional self-setting `verification_status` or `is_available`: `42501`; forging a history row: `42501` | unchanged |

375px: no horizontal overflow. **Finding:** Approve, Reject, expand and filter buttons are 28 to 30px high, under the 44px target (the Operations drawer is fine). To fix in the RoleShell migration (A5).

Cleanup: synthetic professional, verification, document and notification rows deleted; verified professionals back to 2; `c779c0d4` untouched. **Left behind:** the three `@fixify.invalid` auth users and 8 `audit_logs` rows, because `audit_logs` is append-only and its FK to the user blocks deleting them. They have no professional profile, so they cannot be matched or sign in.

## 2. Document-integrity findings

1. **Approval checks that a row exists, not that evidence exists.** `_verification_missing_documents` only requires a `professional_verification_documents` row of type `id` whose status is not `rejected`. A `pending` (never reviewed) row counts. The approve above succeeded although the reviewer's own "Inspect Document" said "Object not found".
2. **A professional can write any row.** Authenticated users hold INSERT on the table; the policy only checks the verification belongs to them. `storage_path` and `status` are unconstrained. Exercised (rolled-back SQL as the real professional role): an insert with path `anything/at/all.png` and status `accepted` succeeded. So a professional can attach a path to a file that does not exist (or someone else's path) and, once an admin approves without opening it, be verified. Approval is single click with a fixed reason ("Verification approved by admin"), which makes this easy to do by accident.
3. **The storage bucket is not on the live database.** `verification-documents` is created by `20261002_003_verification_storage.sql`, which has not been applied (live buckets: `job-media` only). Real uploads would fail today. The one existing document row (`.../id/synthetic-test.png`, `accepted`, owner verified) has no file.
4. **Legacy verified professionals.** Of 2 verified professionals, 1 has that file-less document and 1 has none (already tracked).

## 3. Proposed fix (needs owner approval; nothing built)

- Apply the storage bucket migration after review (private bucket, per-user folder policies).
- Make approval require a document that is `accepted` by an admin and whose `storage_path` exists in `storage.objects`, enforced inside `admin_transition_professional_verification`.
- Remove the client INSERT grant; documents are created only by the server upload action (service role) after the file is stored, with `status` fixed to `pending`.
- Add an explicit review step before approve (open each document, accept or reject with a note) and a reason field, replacing the one-click approve.
- Decide what to do with the two legacy verified professionals (re-verify or suspend), and which document types are required (currently only `id`).

## 4. Migration 110 (**APPLIED** to the shared database 2026-11-01 with owner approval)

Owner approved the section 3 design on 2026-11-01. Files:
`supabase/migrations/20261101_110_verification_document_integrity.sql`, rollback `supabase/rollbacks/20261101_110_rollback.sql`, dry run `supabase/dry-runs/gen_110.py` → `…110….dryrun.sql`, report `…110….dryrun.report.json`.

What it does:
1. Creates the private `verification-documents` bucket (10 MB; jpeg, png, webp, pdf) with only two storage policies: a professional reads their own folder, an admin reads all. No client upload policy: the server upload action already uses the service role. `support` is not granted (deferred).
2. Drops the client INSERT policy and revokes INSERT/UPDATE/DELETE on `professional_verification_documents` from `authenticated` and `anon`.
3. Adds `admin_review_verification_document(document, 'accepted'|'rejected', note)`: admin only, document must be `pending` (else stale), accept only if the file exists in storage, reject needs a note of 5 or more characters, records reviewer and time.
4. `approve` now requires, for each required type (`id`), a document that is `accepted`, has a reviewer, and whose file exists in `storage.objects` (`_verification_unaccepted_documents`, error `23514`). Reactivate, reject, suspend and the professional's submission check are unchanged.

Dry run (rolled back; live database re-checked: no bucket, no new functions, no fixtures, insert policy still present, 2 verified professionals):

| Area | Result |
|---|---|
| Bucket private; grants | authenticated has no INSERT/UPDATE; review function not executable by anon; helper not executable by clients |
| Professional inserts a document (any path, status `accepted`) | `42501` (the hole from section 2 is closed) |
| Professional or admin updates a document row directly | `42501` both |
| Professional uploads to the bucket | `42501` |
| Service role insert (what the upload action does) | works |
| Owner reads own rows; another professional's rows | 2; 0 |
| Approve with a pending document | `23514` |
| Approve with an `accepted` row whose file is missing (the legacy shape) | `23514` |
| Approve with `accepted` but no reviewer | `23514` |
| Review as customer or professional | `42501` |
| Review bad decision; reject without a note | `22023` |
| Review unknown document; accept with file missing | `P0002`; `23514`, row stays `pending` |
| Review accept, then a second review | ok (reviewer, time, note stored); `55000` |
| Approve after an accepted, existing file | ok; `verified`, `is_available` stays false, one history event |
| Reject a document | ok |
| Reactivate; reject with no documents | unchanged, ok |
| Professional submission with a pending document | still works (`changed: true`) |

Not covered by the dry run, and still to build after the migration is approved and applied:
- Admin UI: per-document Accept/Reject with a note, calling the review function through `runAdminAction` (Zod in `src/validators`, audit rows), and the Approve button disabled until the required document is accepted. Inspect Document should be required before Accept. A one-click approve with a fixed reason remains until then.
- `uploadVerificationDocument` still contains an `@ts-ignore` and `any`; clean up when that file is next touched.
- Real upload of a file into the new bucket, end to end, on the isolated staging project (not done on the shared database).
- The two legacy verified professionals are unchanged. They stay verified; they cannot be re-approved without evidence. Decision still needed: suspend or re-verify.
- Applying needs the usual explicit owner go-ahead; the storage policies in step 1 should be checked to apply under the CLI's role (the dry run created them inside the transaction, so they do).

### Apply record (2026-11-01)

Applied with `supabase db query --linked -f supabase/migrations/20261101_110_verification_document_integrity.sql` (no error). Before: no bucket, 1 document row, 2 verified professionals. After, checked live:

- Bucket `verification-documents` exists and is private; two storage policies (owner read, admin read); no INSERT policy and no INSERT grant for `authenticated` on `professional_verification_documents`.
- `admin_review_verification_document`: not executable by anon; `_verification_unaccepted_documents`: not executable by clients.
- The full dry run was re-run against the live schema (rolled back): all 35 report entries are identical to the pre-apply run.
- No fixtures remain (0 `dry110` users, 0 objects in the bucket); documents still 1, verified professionals still 2; `c779c0d4` untouched.

Consequence to know about now: until the admin review UI is built, **no professional can be approved**, because approve needs an accepted document with a file and nothing yet creates one through the UI. Real uploads should now work (bucket exists) but are untested end to end. Rollback: `supabase/rollbacks/20261101_110_rollback.sql` (keeps the bucket and files). `database.types.ts` not regenerated; do it with the review action.

## 5. Admin document review UI (built 2026-11-01, local commit; browser verification pending)

- `reviewVerificationDocumentInput` (`src/validators/admin.ts`): document id, `accepted|rejected`, note up to 500; a rejection needs 5 or more characters.
- `reviewVerificationDocument` (`src/lib/services/verification.ts`): `runAdminAction` (`admin.verification_document.review`, requested and succeeded/failed audit rows) calling `admin_review_verification_document` with the user-scoped client. `22023`, `P0002`, `55000`, `23514` pass the database message through; anything else becomes a generic message; a malformed result is never success; revalidates `/admin/professionals` only on success.
- `VerificationQueue`: per-document Accept and Reject with a note, offered only for pending documents and only after Inspect Document was opened in that session (Inspect already writes the view audit row). Reviewer notes are shown. Approve is disabled, with an explanation, until the Government ID document is accepted; the database remains the authority. Card Approve/Reject and the document buttons are now 44px high. Existing colour literals in the file were left as they were (token migration is part of A5).
- Types: `admin_review_verification_document` added to `database.types.ts` by hand.
- Tests: `src/__tests__/verification-document-review.test.ts` (12: validator, RPC arguments, non-admin refused before the database, invalid input, error mapping, malformed result, wiring). `pnpm tsc --noEmit` clean; Vitest 378 passed, 16 skipped. Lint of the new code is clean; `verification.ts` still has 19 older `any`/`@ts-ignore` errors (not from this change).
- **Not yet done:** browser verification at 375px and 1280px with synthetic fixtures (one professional with a pending document whose object exists in the bucket, one without), refusals (missing file, stale, short note), and a real upload end to end. The fixture write to the shared database was not run, so nothing here is claimed as browser-verified.
