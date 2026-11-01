# Staging environment proposal (PROPOSAL ONLY — nothing provisioned)

> **Owner decision, 2026-11-01: no separate staging.** Dev and testing will use the existing production-shared Supabase project (`azmajqztvcuwajaaldqm`); test data is removed when done. The rest of this document is kept as the alternative.
> What that decision does **not** cover: schema/function/constraint changes are not removed by deleting test data, so each A4 migration still needs its own explicit go-ahead and the rollback script. Required guardrails if testing there:
> - Every test row is tagged and removable: synthetic users use `@test.invalid` emails and a `[TEST]` name prefix; bookings/jobs created for them are listed by id in a cleanup script before deletion.
> - Tests never touch real professionals, real customers, the two legacy verified professionals, or booking `c779c0d4`.
> - Test bookings are scheduled by relative offsets, deleted promptly, and no notifications/payments are triggered for real users (Razorpay test mode only).
> - Concurrency tests call functions as synthetic users only; run `a4_assignment_drift` before and after to prove nothing real changed.

Date: 2026-11-01. Labels: **[V]** verified in this repo/session, **[P]** proposed.
Correction to the brief: the project authenticates with **Supabase Auth** (`@supabase/ssr`), not Clerk. **[V]** No Clerk dependency exists. Staging therefore needs a second Supabase project, not a Clerk instance.

## Why
**[V]** The only Supabase project (`azmajqztvcuwajaaldqm`) is shared with production. A4 migrations change privileged functions and constraints, and the concurrency tests create jobs and offers. *(Superseded by the owner decision above, which permits testing on the shared project subject to the guardrails. Read "may not run" as "may not run without separate authorization of the exact effects.")*

## Components
| Area | Proposal |
|---|---|
| Supabase project | **[P]** Separate project `feasy-staging`, same region as production. Never reuse production keys or the production URL. |
| Migrations | **[P]** Apply `supabase/migrations/*` in order via the Supabase CLI against staging only, then `supabase/proposed/a4/*` once approved. CI step compares staging and production migration lists before any production apply. |
| Auth | **[P]** Staging Supabase Auth with email sign-in only; test users created by a seed script (`@staging.invalid` addresses). No OAuth providers, no real emails. Email sending disabled or routed to Inbucket-style capture. |
| Storage | **[P]** Own buckets (`verification-documents` etc.) with the same policies from migrations; only synthetic files. |
| Scheduled matching | **[P]** `process_assignment_queue` is service_role only and serialised by an advisory lock. Staging calls it from `pg_cron` (if the extension is enabled) or a scheduled route. Production scheduling is untouched. Concurrency tests call it directly. |
| Notification isolation | **[P]** `notifications` rows are written normally, but delivery channels (email/SMS/push) are disabled by env in staging. Test assertions read the table. |
| Payments | **[P]** Razorpay **test mode** keys and a test webhook secret; webhook URL points at the staging deployment. Only Razorpay published test instruments. No refund or payout execution (still deferred). |
| Deployment | **[P]** A separate Vercel (or equivalent) project/environment `staging`, deployed from a non-main branch, with its own env vars and a `robots: noindex` header and basic-auth or Vercel protection. |
| Fixtures | **[P]** Seed script: 1 admin, 6 professionals (verified/suspended/unavailable mix), 4 customers, properties, bookings at relative future dates computed at seed time. All names/phones synthetic. Resettable by re-running the seed on a wiped schema. |

## Environment variables (names only; values never committed)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, plus a new `APP_ENV=staging` so code and tests can refuse to run destructive fixtures unless it is `staging`. Add `APP_ENV` to `.env.example` when implemented (rule 11).

## Safety rails [P]
- Test harness refuses to run unless `APP_ENV=staging` and the Supabase URL is not the production project ref.
- Service-role key for staging stored only in the staging deployment and the developer's local `.env.staging` (git-ignored).
- Concurrency/authorization SQL tests from `docs/A4_DESIGN.md` section 6 run on the staging project **if one is ever created**. On the shared project they run only after the owner separately authorizes their exact effects and isolation (synthetic data, no real professionals reachable, no notifications to real users). Transaction rollback does not guarantee that external side effects cannot occur; concurrency tests need committed sessions and cannot be rolled back. Read-only schema inspection is always permitted. The tests are now in `docs/A4_DESIGN.md` section 8.

## Cost estimate **[A — unverified; confirm in the dashboard before approving]**
- Supabase: a second project. Free tier is possible for light use but pauses when idle and has limits; Pro is about USD 25/month per organisation plus compute for a second project (the first small compute is typically covered by the included credit, additional projects bill compute separately). Expect roughly USD 10–25/month extra.
- Hosting: Vercel hobby/preview may suffice at USD 0; a Pro seat is already needed only if production uses one.
- Razorpay test mode: free.
- Total: about USD 0–25/month. I did not call the Supabase cost API; the project tooling offers `get_cost`/`confirm_cost`, which should be used before any creation.

## Decision needed
Approve provisioning (and the monthly cost) separately. Until then nothing in this document has been created.
