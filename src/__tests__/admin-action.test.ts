import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
}));
const audit = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, failAt: [] as number[] }));

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
  }),
}));

vi.mock('@/lib/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');
  return {
    ...actual,
    logAuditEvent: async (entry: Record<string, unknown>) => {
      const n = audit.rows.length + 1;
      if (audit.failAt.includes(n)) {
        audit.rows.push({ ...entry, __failed: true });
        return { success: false, error: 'db down' };
      }
      audit.rows.push(entry);
      return { success: true };
    },
  };
});

import { runAdminAction } from '@/lib/admin/action';
import { isAdminFailure } from '@/lib/admin/result';
import {
  approveProfessionalInput,
  rejectProfessionalInput,
  verificationDocumentPath,
  cancelJobInput,
  CANCEL_CUSTOMER_REASONS,
} from '@/validators/admin';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const schema = z.object({ id: z.guid() });

function run(execute = vi.fn(async () => ({ ok: true as const, data: null })), input: unknown = { id: TARGET }) {
  return {
    execute,
    promise: runAdminAction({
      name: 'admin.test.thing',
      schema,
      input,
      subjectUserId: (i) => i.id,
      targetType: 'thing',
      targetId: (i) => i.id,
      execute,
    }),
  };
}

beforeEach(() => {
  session.user = { id: ADMIN };
  session.role = 'admin';
  audit.rows = [];
  audit.failAt = [];
});

describe('runAdminAction authorization', () => {
  it('rejects an unauthenticated caller without validating, auditing or executing', async () => {
    session.user = null;
    const { execute, promise } = run(undefined, 'garbage');
    const r = await promise;
    expect(isAdminFailure(r) && r.code).toBe('UNAUTHENTICATED');
    expect(execute).not.toHaveBeenCalled();
    expect(audit.rows).toHaveLength(0);
  });

  it.each(['customer', 'professional', 'support'])('rejects role %s', async (role) => {
    session.role = role;
    const { execute, promise } = run();
    const r = await promise;
    expect(isAdminFailure(r) && r.code).toBe('FORBIDDEN');
    expect(execute).not.toHaveBeenCalled();
    expect(audit.rows).toHaveLength(0);
  });

  it('rejects a caller with no profile row', async () => {
    session.role = null;
    const { execute, promise } = run();
    expect(isAdminFailure(await promise)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runAdminAction validation and audit', () => {
  it('returns INVALID_INPUT for bad input and never executes', async () => {
    const { execute, promise } = run(undefined, { id: 'not-an-id' });
    const r = await promise;
    expect(isAdminFailure(r) && r.code).toBe('INVALID_INPUT');
    expect(execute).not.toHaveBeenCalled();
    expect(audit.rows).toHaveLength(0);
  });

  it('writes requested then succeeded rows attributed to the session admin', async () => {
    const { execute, promise } = run();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(execute).toHaveBeenCalledWith({ actorId: ADMIN, input: { id: TARGET } });
    expect(audit.rows.map((x) => x.action)).toEqual([
      'admin.test.thing.requested',
      'admin.test.thing.succeeded',
    ]);
    expect(audit.rows.every((x) => x.created_by === ADMIN && x.user_id === TARGET)).toBe(true);
  });

  it('fails closed when the request row cannot be written', async () => {
    audit.failAt = [1];
    const { execute, promise } = run();
    const r = await promise;
    expect(isAdminFailure(r) && r.code).toBe('AUDIT_UNAVAILABLE');
    expect(execute).not.toHaveBeenCalled();
  });

  it('turns a throw into a typed failure and records it, never a success', async () => {
    const { promise } = run(vi.fn(async () => { throw new Error('boom'); }));
    const r = await promise;
    expect(isAdminFailure(r) && r.code).toBe('FAILED');
    expect(audit.rows[1].action).toBe('admin.test.thing.failed');
    expect(audit.rows[1].success).toBe(false);
  });

  it('passes through an execute failure and records it as failed', async () => {
    const { promise } = run(vi.fn(async () => ({ ok: false as const, code: 'FAILED' as const, error: 'nope' })));
    const r = await promise;
    expect(isAdminFailure(r) && r.error).toBe('nope');
    expect(audit.rows[1].action).toBe('admin.test.thing.failed');
  });

  it('flags auditIncomplete when only the closing row fails', async () => {
    audit.failAt = [2];
    const { promise } = run();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(r.ok && r.auditIncomplete).toBe(true);
  });
});

describe('admin validators', () => {
  it('requires a real id and a reason of at least 5 characters to reject', () => {
    expect(rejectProfessionalInput.safeParse({ professionalId: TARGET, expectedStatus: 'pending', reason: 'bad' }).success).toBe(false);
    expect(rejectProfessionalInput.safeParse({ professionalId: 'x', expectedStatus: 'pending', reason: 'valid reason' }).success).toBe(false);
    expect(rejectProfessionalInput.safeParse({ professionalId: TARGET, expectedStatus: 'pending', reason: '  valid reason ' }).data?.reason).toBe('valid reason');
    expect(approveProfessionalInput.safeParse({ professionalId: TARGET, expectedStatus: 'pending' }).success).toBe(true);
  });

  it.each(['../x/y', `${TARGET}/../other/doc.pdf`, '/abs/path', `${TARGET}//a`, `${TARGET}/./a`])(
    'refuses document path %s',
    (p) => expect(verificationDocumentPath.safeParse(p).success).toBe(false),
  );
  it('accepts a normal document path', () => {
    expect(verificationDocumentPath.safeParse(`${TARGET}/license.pdf`).success).toBe(true);
  });
});

describe('cancelJobInput', () => {
  const ok = { jobId: TARGET, expectedState: 'accepted', reason: ' pro no-show ', customerReasonCategory: 'scheduling_issue' };

  it('accepts a valid cancellation and trims the internal reason', () => {
    expect(cancelJobInput.safeParse(ok).data?.reason).toBe('pro no-show');
  });

  it.each([
    ['bad job id', { ...ok, jobId: 'x' }],
    ['short reason', { ...ok, reason: 'no' }],
    ['terminal expected state', { ...ok, expectedState: 'completed' }],
    ['cancelled expected state', { ...ok, expectedState: 'cancelled' }],
    ['unknown category', { ...ok, customerReasonCategory: 'because' }],
    ['missing category', { ...ok, customerReasonCategory: undefined }],
  ])('rejects %s', (_n, input) => expect(cancelJobInput.safeParse(input).success).toBe(false));

  it('offers every category the database accepts', () => {
    expect(CANCEL_CUSTOMER_REASONS.map((r) => r.value).sort()).toEqual([
      'customer_request',
      'other',
      'professional_unavailable',
      'safety_or_operational',
      'scheduling_issue',
      'service_not_fulfillable',
    ]);
  });
});

describe('admin authorization is consolidated (static)', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it.each(['src/lib/services/admin.ts', 'src/lib/services/admin-operations.ts'])(
    '%s delegates the role check to getAdminActor',
    (p) => {
      const src = read(p);
      expect(src).toContain('getAdminActor');
      expect(src).not.toMatch(/\.from\('profiles'\)\s*\.select\('role/);
    },
  );

  it('admin server actions hold no role check of their own and delegate to guarded services', () => {
    const src = read('src/app/admin/actions.ts');
    expect(src).not.toMatch(/\.from\('profiles'\)\s*\.select\('role/);
    expect(src).toContain('getOperationsCaseDetail');
    expect(src).toContain("@/lib/services/verification");
  });

  it('admin job cancel is audited, uses the RPC, and never updates current_state directly', () => {
    const src = read('src/lib/services/admin.ts');
    expect(src).toContain("name: 'admin.job.cancel'");
    expect(src).toContain("rpc('admin_cancel_job'");
    expect(src).not.toMatch(/current_state:\s*'cancelled'/);
    expect(src).not.toMatch(/rpc\('transition_job_state'/);
  });

  it('verification approve/reject go through runAdminAction and do not insert audit rows by hand', () => {
    const src = read('src/lib/services/verification.ts');
    expect(src).toContain('runAdminAction');
    expect(src).not.toMatch(/from\('audit_logs'\)/);
  });
});
