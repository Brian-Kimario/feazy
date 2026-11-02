# Administrator provisioning (controlled procedure)

There is deliberately **no in-app way** to grant or change roles. The endpoint
`PATCH /api/admin/users/[id]/role` is disabled (returns 410) and its helper was removed.

## Why
Role changes are the highest-privilege mutation in the system. The old endpoint changed roles with the
service-role client, outside `runAdminAction` (no mandatory reason, no fail-closed audit row, no
last-admin protection). Database protection that still applies: the `profiles_prevent_role_change`
trigger and the `profiles_update_own_non_role_fields` RLS policy stop ordinary users from changing a
role; only `service_role` or an existing admin can.

## Procedure to create or change an administrator
1. Two people agree and record the request (who, why, ticket/date).
2. The new admin signs up normally (they get role `customer`).
3. A database owner runs, in the Supabase SQL editor **on the intended project only**:
   ```sql
   update public.profiles set role = 'admin' where id = '<user uuid>' and role = 'customer';
   ```
   Confirm exactly one row changed. Never run this against a project you did not intend to change.
4. Record the change manually in the ticket (the SQL editor is service-role, so the app's
   `audit_logs` will not capture it). Revoke by setting the role back and recording that too.
5. Keep at least two active admins; never remove the last one.

## Before an in-app flow is built
It must use `runAdminAction`, require re-authentication and a reason of at least 5 characters, be
Zod-validated, protect the last admin, and write the audit row before the change (fail closed).
