import { describe, it, expect, vi, beforeEach } from 'vitest';

type Caller = { user: { id: string } | null; role: string | null };
const state: { caller: Caller } = vi.hoisted(() => ({ caller: { user: null, role: null } }));

const { rpc, userFrom, adminCreated, adminFromSpy, audit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  userFrom: vi.fn(),
  adminCreated: vi.fn(),
  adminFromSpy: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.caller.user }, error: null }) },
    rpc,
    from: (table: string) => {
      userFrom(table);
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              state.caller.role ? { data: { role: state.caller.role }, error: null } : { data: null, error: { code: 'PGRST116' } },
          }),
        }),
      };
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: async () => {
    adminCreated();
    return { from: adminFromSpy, rpc: vi.fn() };
  },
}));
vi.mock('@/lib/audit', async (orig) => ({ ...(await orig<object>()), logAuditEvent: audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getAllJobs, getAdminMetrics } from '@/lib/services/admin-reads';
import { getUnverifiedProfessionals } from '@/lib/services/verification-queue';
import { adminCancelJob, adminReconcileJob, getAdminJobDetail } from '@/lib/services/admin';
import { approveProfessional, suspendProfessional } from '@/lib/services/verification';

const ID = '3f2b8c1e-5d4a-4b6f-9a1e-0c7d2e8f4a11';
const callers: Array<[string, Caller]> = [
  ['an unauthenticated caller', { user: null, role: null }],
  ['a customer', { user: { id: 'u-c' }, role: 'customer' }],
  ['a professional', { user: { id: 'u-p' }, role: 'professional' }],
  ['a user with no profile row', { user: { id: 'u-x' }, role: null }],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe.each(callers)('%s', (_label, c) => {
  beforeEach(() => {
    state.caller = c;
  });

  const untouched = () => {
    // The service role is never created, no RPC runs, and no admin audit row is written.
    expect(adminCreated).not.toHaveBeenCalled();
    expect(adminFromSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  };

  it('is refused by admin reads', async () => {
    const jobs = await getAllJobs();
    expect(jobs.error).toBeTruthy();
    expect(jobs.data).toEqual([]);
    const metrics = await getAdminMetrics();
    expect(metrics.error).toBeTruthy();
    const queue = await getUnverifiedProfessionals();
    expect(queue.error).toBeTruthy();
    const detail = await getAdminJobDetail(ID);
    expect(detail.error).toBeTruthy();
    untouched();
  });

  it('is refused by admin mutations', async () => {
    const cancel = await adminCancelJob(ID, 'accepted', 'a valid internal reason', 'other');
    expect(cancel.success).toBe(false);
    const reconcile = await adminReconcileJob({ jobId: ID, expectedState: 'accepted', reason: 'a valid reason' });
    expect(reconcile.ok).toBe(false);
    const approve = await approveProfessional(ID, 'under_review');
    expect(approve.success).toBe(false);
    const suspend = await suspendProfessional(ID, 'a valid reason for suspension');
    expect(suspend.success).toBe(false);
    untouched();
  });
});

describe('an admin caller', () => {
  it('passes the guard before the service role is created', async () => {
    state.caller = { user: { id: 'u-a' }, role: 'admin' };
    const order: string[] = [];
    userFrom.mockImplementation(() => order.push('guard'));
    adminCreated.mockImplementation(() => order.push('service-role'));
    adminFromSpy.mockImplementation(() => {
      throw new Error('stop');
    });
    await getAllJobs().catch(() => {});
    expect(order.indexOf('guard')).toBeLessThan(order.indexOf('service-role'));
    expect(order).toContain('service-role');
  });
});
