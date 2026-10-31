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
