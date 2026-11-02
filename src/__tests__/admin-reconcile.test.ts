import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  rpc: vi.fn(),
}));
const audit = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, failFirst: false }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: session.role ? { role: session.role } : null,
            error: session.role ? null : { message: 'none' },
          }),
        }),
      }),
    }),
    rpc: session.rpc,
  }),
}));
vi.mock('@/lib/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');
  return {
    ...actual,
    logAuditEvent: async (entry: Record<string, unknown>) => {
      if (audit.failFirst && audit.rows.length === 0) {
        audit.rows.push({ ...entry, __failed: true });
        return { success: false, error: 'db down' };
      }
      audit.rows.push(entry);
      return { success: true };
    },
  };
});

import { adminReconcileJob } from '@/lib/services/admin';
import { isAdminFailure } from '@/lib/admin/result';
import { reconcileJobInput } from '@/validators/admin';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const input = { jobId: JOB, expectedState: 'assigned', reason: 'booking cancelled, job left open' };
const OK = { ok: true, job_id: JOB, booking_id: 'b', from_state: 'assigned', to_state: 'cancelled', offer_withdrawn: false };

beforeEach(() => {
  session.user = { id: ADMIN };
  session.role = 'admin';
  session.rpc.mockReset();
  audit.rows = [];
  audit.failFirst = false;
});

describe('reconcileJobInput', () => {
  it('accepts only an assigned job with a real reason, trimmed', () => {
    expect(reconcileJobInput.safeParse(input).success).toBe(true);
    expect(reconcileJobInput.safeParse({ ...input, reason: '  fine reason ' }).data?.reason).toBe('fine reason');
  });
  it.each([
    ['bad id', { ...input, jobId: 'x' }],
    ['short reason', { ...input, reason: 'no' }],
    ['accepted job', { ...input, expectedState: 'accepted' }],
    ['in-progress job', { ...input, expectedState: 'in_progress' }],
    ['missing state', { jobId: JOB, reason: input.reason }],
  ])('rejects %s', (_n, v) => expect(reconcileJobInput.safeParse(v).success).toBe(false));
});

describe('adminReconcileJob', () => {
  it.each([null, 'customer', 'professional', 'support'])('does not call the database for role %s', async (role) => {
    session.role = role;
    const r = await adminReconcileJob(input);
    expect(isAdminFailure(r)).toBe(true);
    expect(session.rpc).not.toHaveBeenCalled();
    expect(audit.rows).toHaveLength(0);
  });

  it('rejects an unauthenticated caller', async () => {
    session.user = null;
    const r = await adminReconcileJob(input);
    expect(isAdminFailure(r) && r.code).toBe('UNAUTHENTICATED');
    expect(session.rpc).not.toHaveBeenCalled();
  });

  it('validates before auditing or calling the database', async () => {
    const r = await adminReconcileJob({ ...input, expectedState: 'completed' });
    expect(isAdminFailure(r) && r.code).toBe('INVALID_INPUT');
    expect(session.rpc).not.toHaveBeenCalled();
    expect(audit.rows).toHaveLength(0);
  });

  it('fails closed when the request audit row cannot be written', async () => {
    audit.failFirst = true;
    const r = await adminReconcileJob(input);
    expect(isAdminFailure(r) && r.code).toBe('AUDIT_UNAVAILABLE');
    expect(session.rpc).not.toHaveBeenCalled();
  });

  it('calls the RPC with the validated input and audits requested then succeeded', async () => {
    session.rpc.mockResolvedValue({ data: OK, error: null });
    const r = await adminReconcileJob(input);
    expect(r.ok).toBe(true);
    expect(session.rpc).toHaveBeenCalledWith('admin_reconcile_job', {
      p_job_id: JOB,
      p_expected_state: 'assigned',
      p_reason: input.reason,
    });
    expect(audit.rows.map((x) => x.action)).toEqual([
      'admin.job.reconcile.requested',
      'admin.job.reconcile.succeeded',
    ]);
    expect(audit.rows.every((x) => x.created_by === ADMIN)).toBe(true);
  });

  it.each(['STALE_STATE', 'NOT_ELIGIBLE'])('turns a %s refusal into a failure, never a success', async (code) => {
    session.rpc.mockResolvedValue({ data: { ok: false, code, message: 'Refresh and review.' }, error: null });
    const r = await adminReconcileJob(input);
    expect(isAdminFailure(r) && r.error).toBe('Refresh and review.');
    expect(audit.rows[1].action).toBe('admin.job.reconcile.failed');
    expect(audit.rows[1].success).toBe(false);
  });

  it('shows actionable database errors and hides unexpected ones', async () => {
    session.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only administrators can reconcile jobs' } });
    const a = await adminReconcileJob(input);
    expect(isAdminFailure(a) && a.error).toBe('Only administrators can reconcile jobs');

    session.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation internal_secret broke' } });
    const b = await adminReconcileJob(input);
    expect(isAdminFailure(b) && b.error).toBe('The job could not be reconciled');
  });

  it('treats an empty RPC result as a failure', async () => {
    session.rpc.mockResolvedValue({ data: null, error: null });
    expect(isAdminFailure(await adminReconcileJob(input))).toBe(true);
  });
});

describe('reconcile wiring (static)', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

  it('the service uses the RPC and never writes job state or payments itself', () => {
    const src = read('src/lib/services/admin.ts');
    expect(src).toContain("rpc('admin_reconcile_job'");
    expect(src).toContain("name: 'admin.job.reconcile'");
    expect(src).not.toMatch(/rpc\('transition_job_state'/);
  });

  it('the drawer offers the repair only for an assigned state mismatch', () => {
    const src = read('src/components/admin/OperationsQueue.tsx');
    expect(src).toMatch(/item\.type === 'state_mismatch'[\s\S]{0,80}item\.jobState === 'assigned'/);
  });
});
