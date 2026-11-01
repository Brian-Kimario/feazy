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
        '20261102_111_a4_scheduling_integrity.sql', // copy of the live transition_job_state body (generic machine)
        '20261102_113_a4_admin_assignment.sql', // admin_reassign_job: accepted -> assigned behind the edge guard
        '20261102_114_a4_recovery.sql', // professional_withdraw_from_job: accepted -> assigned behind the edge guard
      ].sort(),
    );
  });

  it('marks every revision-2 draft as not parsed or tested by PostgreSQL', () => {
    for (const f of ['111_a4_scheduling_integrity', '112_a4_vocabulary', '113_a4_admin', '114_a4_recovery', '115_a4_notif']) {
      const file = forward.find((x) => x.includes(f))!;
      expect(read(file)).toMatch(/NOT parsed or tested by PostgreSQL/);
    }
  });

  // REGRESSION: the fixed active-state list used by the conflict check must cover every non-terminal state the
  // transition machine can leave a job in. If a new active state is added to the machine and not to the helper,
  // a professional could be double-booked through it.
  it('conflict-check active states equal the non-terminal states of transition_job_state', () => {
    const sql = read(forward.find((f) => f.includes('111_a4_scheduling'))!);
    const from = new Set([...sql.matchAll(/current_state = '(\w+)' AND p_new_state/g)].map((m) => m[1]));
    const nonTerminal = [...from].filter((x) => !['completed', 'cancelled', 'closed'].includes(x)).sort();
    const helper = sql.match(/ELSE ARRAY\[([^\]]+)\] END/)![1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
    expect(helper).toEqual(nonTerminal);
    const committed = sql.match(/THEN ARRAY\[([^\]]+)\]/)![1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
    expect(committed).toEqual(nonTerminal.filter((x) => x !== 'assigned'));
  });

  // REGRESSION: definer-helper call chain. Helpers are not callable by any end-user role and are not privileged themselves.
  it('111 helpers are revoked from every role and the conflict helper is SECURITY INVOKER', () => {
    const sql = read(forward.find((f) => f.includes('111_a4_scheduling'))!);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\._schedule_active_states\(boolean\), public\._professional_conflicts\(uuid, uuid, boolean\),\s*public\._require_read_committed\(\) FROM PUBLIC, anon, authenticated, service_role/,
    );
    const conflicts = sql.split('CREATE OR REPLACE FUNCTION public._professional_conflicts')[1].split('$$;')[0];
    expect(conflicts).not.toMatch(/SECURITY DEFINER/);
  });

  it('every SECURITY DEFINER function in the drafts pins search_path including pg_temp (or documents the live exception)', () => {
    for (const f of forward) {
      const bodies = read(f).split(/CREATE OR REPLACE FUNCTION /).slice(1);
      for (const b of bodies) {
        const head = b.split(/\$\$|\$function\$/)[0];
        if (!/SECURITY DEFINER/.test(head)) continue;
        if (/^public\.transition_job_state/.test(b)) continue; // keeps the live search_path 'public', documented in 111
        expect(head, `${f}: ${head.slice(0, 60)}`).toMatch(/SET search_path TO 'public', 'pg_temp'/);
      }
    }
  });

  // Lock-order discipline: no advisory locks anywhere, and the L3 professional lock is never taken before L1/L2 in the RPCs.
  it('uses no advisory locks and takes the professional row lock after booking and job locks', () => {
    for (const f of forward) {
      const sql = read(f);
      expect(sql.replace(/--.*$/gm, '')).not.toMatch(/pg_advisory|_lock_professional_schedule/);
    }
    for (const f of ['113_a4_admin', '114_a4_recovery']) {
      const bodies = read(forward.find((x) => x.includes(f))!).split(/CREATE OR REPLACE FUNCTION /).slice(1);
      for (const b of bodies) {
        const code = b.replace(/--.*$/gm, '');
        const pro = code.search(/FROM public\.professional_profiles[^;]*FOR (NO KEY )?UPDATE/);
        if (pro < 0) continue;
        const booking = code.search(/FROM public\.bookings[^;]*FOR UPDATE/);
        // admin_transition_professional_verification takes ONLY L3 and no booking/job lock at all (phase 1)
        if (/^public\.admin_transition_professional_verification/.test(b)) {
          expect(booking).toBe(-1);
          expect(code).not.toMatch(/FROM public\.jobs[^;]*FOR UPDATE/);
          expect(code).not.toMatch(/INSERT INTO public\.job_exceptions/);
          continue;
        }
        expect(booking).toBeGreaterThanOrEqual(0);
        expect(booking).toBeLessThan(pro);
      }
    }
  });

  it('no function inserts job_exceptions while holding the professional row lock', () => {
    for (const f of forward) {
      for (const b of read(f).split(/CREATE OR REPLACE FUNCTION /).slice(1)) {
        const code = b.replace(/--.*$/gm, '');
        if (/professional_profiles[^;]*FOR (NO KEY )?UPDATE/.test(code)) {
          expect(code).not.toMatch(/INSERT INTO public\.job_exceptions/);
        }
      }
    }
  });

  it('withdrawal uses the DB clock and the recovery-edge guard; there is exactly one accepted->assigned mechanism per RPC', () => {
    const w = read(forward.find((f) => f.includes('114_a4_recovery'))!).split('CREATE OR REPLACE FUNCTION public.professional_withdraw_from_job')[1].split('REVOKE ALL')[0];
    expect(w).toMatch(/v_now < v_start/);
    expect(w).toMatch(/set_config\('app\.a4_recovery_edge'/);
    expect(w).not.toMatch(/p_(now|time|start)/); // no client-supplied time
    const a = read(forward.find((f) => f.includes('113_a4_admin'))!);
    expect(a).toMatch(/CREATE TRIGGER jobs_guard_recovery_edge/);
  });

  it('inconclusive findings cannot close an exception (constraint and function agree)', () => {
    const v = read(forward.find((f) => f.includes('112_a4'))!);
    expect(v).toMatch(/status = 'resolved'\s+AND finding = 'confirmed'/);
    expect(v).toMatch(/status = 'dismissed' AND finding = 'not_confirmed'/);
    const r = read(forward.find((f) => f.includes('114_a4_recovery'))!);
    expect(r).toMatch(/An inconclusive finding is not a resolution/);
    expect(r).toMatch(/'still_open'/);
  });

  it('does not use the rejected matching_decisions kind "manual"', () => {
    for (const f of forward) expect(read(f)).not.toMatch(/kind\s*=\s*'manual'|,\s*'manual'\s*,/);
  });
});

// DB integration / concurrency specs. NOT EXECUTED. Blocked until the owner separately authorizes their exact
// effects and isolation (shared project; rollback does not undo notifications read by clients or other side effects).
// The full step-by-step specifications (setup, session interleaving, expected result) are in docs/A4_SQL_TEST_SPECS.md.
describe.skip('A4 DB integration (NOT EXECUTED — requires separate authorization)', () => {
  it.todo('S1 matcher vs acceptance: _offer_next skips a professional locked by a concurrent accept (SKIP LOCKED), never waits');
  it.todo('S2 two simultaneous acceptances: one pro, two overlapping offers; second raises SCHEDULE_CONFLICT');
  it.todo('S3 acceptance vs reschedule: UPDATE bookings.scheduled_start is rejected (RESCHEDULE_BLOCKED) while a live job exists');
  it.todo('S4 suspension vs offer creation: after phase 1 commits no new offer reaches the suspended professional');
  it.todo('S5 suspension vs offer acceptance: accept either commits before suspension (then job is flagged) or fails ineligible; no deadlock');
  it.todo('S6 withdrawal before start: accepted -> assigned, attempt row, event metadata keeps previous accepted_at/eta, payments untouched');
  it.todo('S7 withdrawal at/after start or under way: no state change, one open professional_withdrawal_request exception');
  it.todo('S8 withdrawal racing customer cancellation: exactly one wins; the loser gets STALE_STATE');
  it.todo('S9 duplicate exception resolution: same request_id replays; different request_id gets STALE_STATE; one audit event');
  it.todo('S10 inconclusive findings: case stays open with finding recorded; confirmed/not_confirmed required to close');
  it.todo('S11 admin authorization: non-admin and auth.uid() NULL raise 42501 on every admin_* RPC');
  it.todo('S12 REPEATABLE READ caller is refused (READ_COMMITTED_REQUIRED)');
  it.todo('S13 a4_assignment_drift reports the six known drifted rows and no others');
  it.todo('S14 notifications: only the mapped events notify; no notification_logs (WhatsApp) rows from A4 events');
  it.todo('S15 edge guard: direct UPDATE accepted -> assigned outside the RPCs raises EDGE_NOT_PERMITTED');
});
