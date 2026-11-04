# Runbook: revoke the leaked Supabase service-role key

Owner action. The assistant does not run any step in this file, and nobody should paste a key into a ticket, chat, commit or document. Refer to keys by name only: "the legacy service-role key", "the new key".

This runbook covers the legacy service-role JWT that was exposed in git history (see [SECURITY_GITGUARDIAN_REVIEW.md](SECURITY_GITGUARDIAN_REVIEW.md)). Removing it from the code does not revoke it. It stays valid until it is disabled in Supabase.

Dashboard labels change over time. Where a label below may differ, look for the nearest equivalent and record what you saw.

## Ordering rule

Issue and deploy the new key first. Revoke the legacy key last. Revocation cannot be undone, so do not revoke until every consumer is on the new key and verified. Revoking before that breaks the app.

## 1. Inventory every consumer of the legacy key

Find everywhere the legacy key is used before changing anything.

| Where | What to check | Repo reference |
|---|---|---|
| Vercel, Production | `SUPABASE_SERVICE_ROLE_KEY` value | `src/lib/supabase/admin.ts`, `src/lib/audit.ts` (server only) |
| Vercel, Preview and Development | Same variable, if set | Same |
| GitHub Actions secrets | Any secret holding the key, used by a workflow | None in this repo (no `.github/workflows/`); check the repository's Actions secrets in GitHub settings |
| Supabase Edge Function secrets | Any function that reads the key | None in this repo; check the dashboard |
| Developer machines | `.env.local` copies | Git-ignored; confirm each developer rotates their copy |
| Ops scripts | Scripts under `scripts/` that read `SUPABASE_SERVICE_ROLE_KEY` | `scripts/verify-*.js`, `scripts/apply-*.mjs`, `scripts/seed-local-e2e-users.sh` (local only) |
| Other people or services | Any third party given the key | Owner to confirm |

The browser client (`src/lib/supabase/client.ts`) must not hold this key. Its only mention there is a comment. If the key is found in a `NEXT_PUBLIC_` variable or in client code, stop and treat it as a second incident.

## 2. Identify the legacy key in the Supabase dashboard

1. Open the project in the Supabase dashboard (production project only).
2. Go to Project Settings, then API (sometimes labelled API Keys).
3. Find the legacy keys. Confirm which entry is the service-role key. Do not copy it into anything.
4. Note whether the project is also on the newer key system. If it is, a new secret key can be created there. If not, the owner decides how to issue the replacement.

## 3. Issue the new key

1. Create the new secret key in the same dashboard section. The legacy service-role key cannot be reissued. It can only be disabled, so the replacement is a new secret key (`sb_secret_…`), stored under `SUPABASE_SECRET_KEY`.
2. Store it only in Vercel, as the production value of `SUPABASE_SECRET_KEY`, and in your password manager.
3. Do not put the new key in the repo, in a `.env` file that is committed, or in chat.
4. The app reads `SUPABASE_SECRET_KEY` first and `SUPABASE_SERVICE_ROLE_KEY` only as a fallback (`getServerSecretKey()` in `src/lib/supabase/admin.ts`). Deploy a build that includes that change before step 5. Until it is deployed, the app still uses the legacy key and disabling it breaks the app.

## 4. Update consumers and redeploy

1. Set the new key on Vercel, Production. Environment variable changes apply only after a new deployment, so trigger one.
2. Repeat for any other entry in the inventory. Preview and Development get the new key too, if they use the same variable.
3. Update GitHub Actions secrets and Edge Function secrets if they use the key.
4. Ask each developer to replace the key in their `.env.local`.
5. Test in staging first if a staging project exists. Confirm the app works there before production.

## 5. Revoke the legacy key

Do this only after step 4 is verified.

1. In the same dashboard section, disable the legacy keys, or rotate the JWT signing secret if that is the only option. Read the warning first.
2. Warning: rotating the JWT signing secret signs out every user and invalidates every legacy key. Plan for that on the public app. Disabling only the legacy service-role key is narrower; prefer it if the dashboard offers it.
3. Record the time, the option chosen and the person who did it.

## 6. Verify the old key is rejected

Use a copy of the old key from your secure store. Do not paste it into a shell history or a document. Send one request to the REST endpoint with the old key as the API key and the Authorization header.

- Expected: an authentication error (HTTP 401, or an "Invalid API key" / "JWT" error).
- Failure: HTTP 200 with data. That means the key is still live. Treat it as an active incident and revoke again.

Repeat with the new key. Expected: a normal response.

Keep the status code and the time as evidence. Redact the key in any screenshot or log.

## 7. Check for breakage

Watch for these after the change. Each one uses the admin client or a service-role path.

| Check | What breaks if the new key is wrong |
|---|---|
| Admin pages load (`/admin`, `/admin/inspections`, `/admin/operations`) | Admin reads return errors |
| A test booking can be created and a booking page loads | `createBookingAction` uses the RPC, and the booking page reads with the user session. Confirm both still work |
| Razorpay webhook (`src/app/api/webhooks/razorpay`) records a payment | Webhook writes fail; Razorpay retries, but check for a backlog |
| Cron routes under `src/app/api/cron/` (notification dispatch, assignment queue, job media sweep), gated by `CRON_SECRET` | The routes call Supabase through the service-role client (`src/lib/supabase/admin.ts` or `src/lib/admin/client.ts`); a wrong key stops notifications and assignment retries |
| Audit writes (`src/lib/audit.ts`) | Audit rows stop appearing |
| Vercel logs for `Invalid API key`, `JWT`, or 401 from Supabase | Any remaining consumer still on the old key |

If something breaks, do not re-enable the legacy key by hand. Issue or fix the new key on the failing consumer and redeploy.

## 8. Close the exposure record

1. In GitGuardian, mark the legacy-key finding as resolved, with the revocation time as the reason. Do not mark it a false positive.
2. Note the result in [RELEASE_CANDIDATE_PACKAGE.md](RELEASE_CANDIDATE_PACKAGE.md), section 12.
3. Delete local copies of the old key from scratch files and shell history where you can.

## Done means

- The old key returns an authentication error (step 6, with evidence).
- The new key works in production (step 7 checks pass).
- Every consumer in the inventory is on the new key.
- GitGuardian shows the finding resolved.
