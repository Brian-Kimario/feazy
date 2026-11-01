import { NextResponse } from "next/server";

/**
 * PATCH /api/admin/users/[id]/role — DISABLED.
 *
 * This route used to let any admin session set any user's role (including `admin`) with the
 * service-role client, outside the audited admin action runner: no reason, no expected-state
 * check, and the audit row was written after the change. Nothing in the app called it.
 *
 * Administrator accounts are provisioned through the controlled procedure in
 * docs/ADMIN_PROVISIONING.md. A future in-app flow must be built on runAdminAction with
 * re-authentication, a mandatory reason and last-admin protection before this route returns.
 *
 * The handler does nothing, reads no body and touches no data, so it is safe to leave in place
 * as an explicit tombstone (other methods get Next's default 405).
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Role changes through this endpoint are disabled." },
    { status: 410 }
  );
}
