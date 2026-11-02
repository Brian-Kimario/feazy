# Slice 2 verification and profile-recovery analysis

Date: 2026-11-01. Branch `audit/preproduction-remediation`. Nothing pushed, nothing deployed, no migration applied.
Labels: **[V]** verified (command or read-only query run in this session), **[A]** analysis from reading code, **[P]** proposed.

## 1. Slice 2 follow-up results

| Item | Result |
|---|---|
| Job-detail query vs live schema | **[V]** Read-only: `properties` has `address_id` and no `address_line1/city/postal_code`; `addresses` has `address_line_1, city, postal_code`. The corrected select embeds `properties!jobs_property_id_fkey (… address:addresses (…))`. All 12 live jobs resolve job → property → address (0 missing). **Not verified:** the PostgREST request itself was never sent (no admin credentials, nothing to authenticate with). |
| Inspector shows property address | **[A]** Mapping reads `property.address.address_line_1/city/postal_code`. **Not verified in a browser.** |
| Runtime authorization tests | **[V]** New `src/__tests__/admin-runtime-authorization.test.ts`: 9 tests, passing. Callers: unauthenticated, customer, professional, user with no profile row. For each, representative reads (`getAllJobs`, `getAdminMetrics`, `getUnverifiedProfessionals`, `getAdminJobDetail`) and mutations (`adminCancelJob`, `adminReconcileJob`, `approveProfessional`, `suspendProfessional`) are refused, the service-role client is **never created**, no RPC runs and no admin audit row is written. A fifth case asserts the guard query runs before the service-role client for an admin. Supabase is mocked, so this proves ordering and refusal, not database behaviour. |
| Browser, Playwright, accessibility | **Not run.** |

## 2. `getCurrentProfile` recovery defect (`src/lib/auth/session.ts`)

### Behaviour before the fix **[V from code]**
On any profile-read error the function used the service-role client:
- `PGRST116` (no row) and `PGRST201` both ran `upsert({id, full_name, role: 'customer'}, {onConflict: 'id'})`.
- An upsert with `ON CONFLICT DO UPDATE` writes every supplied column, so **if a row existed, its `role` was reset to `customer`**.
- Both used `@ts-ignore` and `as any`.

### Reachability **[V live schema, A reasoning]**
- `profiles` has RLS `profiles_select_own` (`auth.uid() = id`). An owner can always read their own row, so RLS never hides an existing profile from its owner. A row an RLS denial hides does not exist for that caller.
- `PGRST201` is PostgREST's *ambiguous embedding* error. `select('*')` has no embed, so **the branch could not be reached by this query**. Its "denied by RLS" comment was wrong.
- `PGRST116` needs zero rows for `id = auth.uid()`. Profiles are created by `handle_new_user()` (SECURITY DEFINER trigger, AFTER INSERT on `auth.users`), in the same transaction as the signup. So a missing row is rare: a signup whose trigger failed, or a deleted profile.
- **Conditions under which an existing role could be overwritten:** a request for a *newly created* user reads the profile before the signup transaction is visible, gets `PGRST116`, then the upsert runs after the trigger commits. Then the trigger's row — including `role = 'professional'` from the signup metadata — is replaced with `customer`. An admin cannot be hit this way (admins are not created by signup), but a professional signup can, and only inside a small window. Probability: low. Impact: wrong role, silently, with no audit row.
- Not reproduced; there is no safe way to do so against the shared database.

### Fix **[V applied, tests pass]**
Smallest safe change, nothing else in the auth module touched:
- `PGRST116`: `upsert(..., {onConflict: 'id', ignoreDuplicates: true})` (INSERT … ON CONFLICT DO NOTHING), then re-read the row with the service client. An existing row of any role is never written.
- `PGRST201` and other errors: read-only service-client fetch, no write.
- `@ts-ignore`/`any` removed (uses `createTypedAdminClient`).
- Tests: `src/__tests__/session-profile-recovery.test.ts` (3 passing): ignore-duplicates flag is set; a professional row that appears is returned; `PGRST201` performs no write; creation failure returns `null`.

Remaining caveat: a user whose trigger-created row never appeared is created as `customer`. That matches the previous intent.
