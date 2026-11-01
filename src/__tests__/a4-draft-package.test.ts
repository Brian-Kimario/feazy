import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// STATIC checks on the A4 DRAFT SQL text. These prove file hygiene only; they do NOT execute any SQL
// and say nothing about whether the migrations are correct or safe to apply.
const root = process.cwd();
const dir = join(root, 'supabase/proposed/a4');
const files = existsSync(dir) ? readdirSync(dir) : [];
const forward = files.filter((f) => f.endsWith('.sql') && !f.endsWith('_ROLLBACK.sql'));
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

describe('A4 draft package (static, nothing executed)', () => {
  it('has forward drafts', () => {
    expect(forward.length).toBeGreaterThanOrEqual(6);
  });

  it.each(forward)('%s has a matching ROLLBACK script', (f) => {
    expect(files).toContain(f.replace(/\.sql$/, '_ROLLBACK.sql'));
  });

  it.each(forward)('%s is marked DRAFT / NOT APPLIED', (f) => {
    expect(read(f)).toMatch(/DRAFT\. NOT APPLIED/);
  });

  it('no draft has been copied into supabase/migrations', () => {
    const live = existsSync(join(root, 'supabase/migrations')) ? readdirSync(join(root, 'supabase/migrations')) : [];
    expect(live.filter((f) => /a4_/.test(f))).toEqual([]);
  });

  it('every admin_* function in the drafts authorizes through _require_admin() or the verified-role check', () => {
    const sql = forward.map(read).join('\n');
    const bodies = sql.split(/CREATE OR REPLACE FUNCTION public\./).slice(1);
    const admin = bodies.filter((b) => /^admin_/.test(b));
    expect(admin.length).toBeGreaterThan(0);
    for (const b of admin) {
      expect(b).toMatch(/_require_admin\(\)|profiles WHERE id = v_actor|role::text INTO v_role/);
    }
  });

  it('every admin_* function is revoked from PUBLIC and anon (or keeps its existing grants)', () => {
    const sql = forward.map(read).join('\n');
    for (const name of ['admin_assign_professional', 'admin_withdraw_offer', 'admin_reassign_job', 'admin_resolve_exception']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION[^;]*public\\.${name}\\([^;]*FROM PUBLIC, anon`));
    }
  });

  it('never writes current_state outside the documented, reviewed edges', () => {
    // 113/114 intentionally add accepted->assigned edges; the only direct writers must be those files.
    const offenders = forward.filter((f) => /UPDATE public\.jobs\s+SET current_state/.test(read(f)));
    expect(offenders.sort()).toEqual(
      [
        '20261102_111_a4_scheduling_integrity.sql', // verbatim copy of the live transition_job_state body
        '20261102_113_a4_admin_assignment.sql',
        '20261102_114_a4_recovery.sql',
      ].sort(),
    );
  });

  it('does not use the rejected matching_decisions kind "manual"', () => {
    for (const f of forward) expect(read(f)).not.toMatch(/kind\s*=\s*'manual'|,\s*'manual'\s*,/);
  });
});

// DB integration / concurrency specs. NOT EXECUTED. Blocked until the owner separately authorizes their exact
// effects and isolation (shared project; rollback does not undo notifications read by clients or other side effects).
describe.skip('A4 DB integration (NOT EXECUTED — requires separate authorization)', () => {
  it.todo('admin authorization: admin succeeds; auth.uid() NULL (service_role/anon) raises 42501');
  it.todo('non-admin refusal: customer and professional callers raise 42501 on every admin_* RPC');
  it.todo('stale expected state: wrong p_expected_state / professional raises STALE_STATE / STALE_PROFESSIONAL');
  it.todo('duplicate request: same request_id + inputs replays stored result; changed inputs raise IDEMPOTENCY_KEY_REUSED');
  it.todo('concurrent assignments: two admins assign different pros to one booking; exactly one offer survives');
  it.todo('concurrent offer acceptance: one pro accepting two overlapping offers; second raises SCHEDULE_CONFLICT');
  it.todo('incompatible scheduling: assign/reassign into a +-2h overlap raises SCHEDULE_CONFLICT');
  it.todo('suspended / unverified professionals: assign raises PROFESSIONAL_INELIGIBLE');
  it.todo('suspension: pending offers released, active jobs get open job_exceptions, no deadlock vs concurrent accept');
  it.todo('professional cancellation: accepted -> assigned, pro excluded from re-rank, customer notified once');
  it.todo('no-show resolution: finding/resolution validated; RESOLUTION_MISMATCH when job state contradicts claim');
  it.todo('booking/job consistency: a4_assignment_drift reports the six known drifted rows and no others');
  it.todo('notification correctness: recipients/kinds per matrix; no notification_logs rows from A4 events');
  it.todo('payment preservation: payments and quotes unchanged by assign/withdraw/reassign; NEEDS_CUSTOMER_CONSENT with live quote');
  it.todo('audit integrity: every operation writes exactly one job_events row with admin id, reason and request id');
});
