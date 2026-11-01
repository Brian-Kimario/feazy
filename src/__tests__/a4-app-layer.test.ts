import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  adminAssignProfessionalInput,
  adminReassignJobInput,
  adminResolveExceptionInput,
  adminWithdrawOfferInput,
  professionalWithdrawInput,
  A4_ERROR_CODES,
} from '@/validators/assignment';
import { mapA4Error } from '@/lib/admin/a4-errors';

// Unit and static checks on the A4 application layer. None of these call the database: the RPCs'
// behaviour is NOT tested here.
const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('A4 validators', () => {
  it('assign requires a reason of at least 10 characters and a uuid request id', () => {
    const base = { bookingId: uuid, professionalId: uuid2, expectedState: 'none', reason: 'Customer asked by phone', requestId: uuid };
    expect(adminAssignProfessionalInput.safeParse(base).success).toBe(true);
    expect(adminAssignProfessionalInput.safeParse({ ...base, reason: 'short' }).success).toBe(false);
    expect(adminAssignProfessionalInput.safeParse({ ...base, requestId: 'nope' }).success).toBe(false);
    expect(adminAssignProfessionalInput.safeParse({ ...base, expectedState: 'accepted' }).success).toBe(false);
  });

  it('reassign only accepts the assigned/accepted expected states', () => {
    const base = { jobId: uuid, expectedState: 'accepted', expectedProfessionalId: uuid2, newProfessionalId: uuid, reason: 'Professional unreachable', requestId: uuid };
    expect(adminReassignJobInput.safeParse(base).success).toBe(true);
    expect(adminReassignJobInput.safeParse({ ...base, expectedState: 'in_progress' }).success).toBe(false);
  });

  it('withdraw offer requires the expected professional', () => {
    expect(adminWithdrawOfferInput.safeParse({ jobId: uuid, reason: 'Wrong skill match', requestId: uuid }).success).toBe(false);
  });

  it('inconclusive findings must have no resolution; other findings must have one', () => {
    const base = { exceptionId: uuid, note: 'Called both parties', requestId: uuid };
    expect(adminResolveExceptionInput.safeParse({ ...base, finding: 'inconclusive', resolution: null }).success).toBe(true);
    expect(adminResolveExceptionInput.safeParse({ ...base, finding: 'inconclusive', resolution: 'no_action' }).success).toBe(false);
    expect(adminResolveExceptionInput.safeParse({ ...base, finding: 'confirmed', resolution: null }).success).toBe(false);
    expect(adminResolveExceptionInput.safeParse({ ...base, finding: 'confirmed', resolution: 'reassigned' }).success).toBe(true);
    expect(adminResolveExceptionInput.safeParse({ ...base, note: 'short', finding: 'confirmed', resolution: 'cancelled' }).success).toBe(false);
  });

  it('professional withdrawal reason is 5 to 500 characters', () => {
    expect(professionalWithdrawInput.safeParse({ jobId: uuid, reason: 'sick' }).success).toBe(false);
    expect(professionalWithdrawInput.safeParse({ jobId: uuid, reason: 'I am unwell' }).success).toBe(true);
    expect(professionalWithdrawInput.safeParse({ jobId: uuid, reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('mapA4Error', () => {
  it.each(A4_ERROR_CODES)('maps the %s prefix to its code', (code) => {
    const r = mapA4Error({ message: `${code}: internal detail with job 123` });
    expect(r.code).toBe(code);
    expect(r.message).not.toMatch(/internal detail|123/);
  });

  it('falls back on SQLSTATE and never leaks raw database text', () => {
    expect(mapA4Error({ code: '42501', message: 'permission denied for table x' }).code).toBe('FORBIDDEN');
    expect(mapA4Error({ code: 'P0002', message: 'x' }).code).toBe('NOT_FOUND');
    expect(mapA4Error({ code: '40001', message: 'x' }).code).toBe('STALE_STATE');
    expect(mapA4Error({ code: '23P01', message: 'x' }).code).toBe('SCHEDULE_CONFLICT');
    const unknown = mapA4Error({ code: 'XX000', message: 'relation "secret_table" exploded' });
    expect(unknown.code).toBe('UNKNOWN');
    expect(unknown.message).not.toMatch(/secret_table/);
    expect(mapA4Error(null).code).toBe('UNKNOWN');
  });
});

describe('A4 app-layer wiring (static)', () => {
  const svc = read('src/lib/services/admin-assignment.ts');

  it('every admin assignment action runs through runAdminAction', () => {
    const fns = [...svc.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(fns.sort()).toEqual(
      ['adminAssignProfessional', 'adminReassignJob', 'adminRecoverSuspendedProfessional', 'adminResolveException', 'adminWithdrawOffer'].sort(),
    );
    for (const body of svc.split(/export async function /).slice(1)) expect(body).toMatch(/runAdminAction\(/);
  });

  it('admin reads are not a server-action module and check the admin role', () => {
    const reads = read('src/lib/services/admin-assignment-reads.ts');
    expect(reads).not.toMatch(/^'use server'/m);
    for (const body of reads.split(/export async function /).slice(1)) expect(body).toMatch(/requireAdmin\(\)/);
  });

  it('the professional app has no direct cancel path', async () => {
    expect(read('src/components/professional/StateTransitionButtons.tsx')).not.toMatch(/ALLOWED[^;]*'cancelled'|\["cancelled"\]/);
    expect(read('src/lib/services/jobs.ts')).toMatch(/newState === 'cancelled'\) \{\s*return \{ success: false/);
    expect(read('src/app/professional/actions.ts')).toMatch(/professional_withdraw_from_job/);
  });

  it('suspension runs the recovery phase and refuses to report success while work remains', () => {
    const v = read('src/lib/services/verification.ts');
    expect(v).toMatch(/runSuspensionRecovery/);
    expect(v).toMatch(/still need recovery/);
  });
});
