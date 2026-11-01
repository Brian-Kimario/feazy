import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { directoryInput, lifecycleOf, PAGE_SIZE } from '@/lib/admin/booking-directory';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('booking directory input', () => {
  it('falls back to defaults on bad input', () => {
    const r = directoryInput.parse({ lifecycle: 'nonsense', page: '-4', from: 'yesterday' });
    expect(r.lifecycle).toBe('all');
    expect(r.page).toBeGreaterThanOrEqual(1);
  });

  it('rejects search text containing filter-syntax characters', () => {
    const r = directoryInput.parse({ q: 'a,b).or(x' });
    expect(r.q ?? '').not.toMatch(/[,()]/);
  });

  it('keeps ordinary names and emails', () => {
    expect(directoryInput.parse({ q: 'Dario' }).q).toBe('Dario');
    expect(directoryInput.parse({ q: 'a.b@x.com' }).q).toBe('a.b@x.com');
  });

  it('validates the assignment filter and defaults bad values', () => {
    expect(directoryInput.parse({ assignment: 'no_professional' }).assignment).toBe('no_professional');
    expect(directoryInput.parse({ assignment: "x'); drop" }).assignment).toBe('all');
    expect(directoryInput.parse({}).assignment).toBe('all');
  });

  it('has a sane page size', () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('lifecycleOf', () => {
  it('derives the lifecycle from the job state first', () => {
    expect(lifecycleOf('pending', 'assigned')).toBe('offered');
    expect(lifecycleOf('pending', 'accepted')).toBe('accepted');
    expect(lifecycleOf('pending', 'in_progress')).toBe('active');
    expect(lifecycleOf('pending', 'completed')).toBe('completed');
    expect(lifecycleOf('pending', 'cancelled')).toBe('cancelled');
  });
  it('treats a pending booking without a job as unmatched', () => {
    expect(lifecycleOf('pending', null)).toBe('unmatched');
  });
});

describe('booking directory service (static)', () => {
  const src = read('src/lib/services/admin-booking-directory.ts');
  it('is not a server-action module and checks the admin role before the client', () => {
    expect(src).not.toMatch(/^'use server'/m);
    expect(src.indexOf('requireAdmin()')).toBeGreaterThan(-1);
    expect(src.indexOf('requireAdmin()')).toBeLessThan(src.indexOf('createTypedAdminClient()'));
  });
});

describe('professional directory', () => {
  it('defaults bad filters and rejects unsafe search text', async () => {
    const { professionalDirectoryInput } = await import('@/lib/admin/professional-directory');
    const r = professionalDirectoryInput.parse({ q: 'a,b).or(x', status: 'zzz', availability: '1', workload: 'x', page: '0' });
    expect(r).toEqual({ q: undefined, status: 'all', availability: 'all', workload: 'all', page: 1 });
    expect(professionalDirectoryInput.parse({ status: 'suspended', workload: 'with_active' }).status).toBe('suspended');
  });
  it('service checks the admin role before the client and is not a server-action module', () => {
    const src = read('src/lib/services/admin-professional-directory.ts');
    expect(src).not.toMatch(/^'use server'/m);
    expect(src.indexOf('requireAdmin()')).toBeLessThan(src.indexOf('createTypedAdminClient()'));
  });
});

describe('audit log', () => {
  it('defaults bad filters and drops non-uuid ids', async () => {
    const { auditInput } = await import('@/lib/admin/audit-directory');
    const r = auditInput.parse({ scope: 'x', outcome: 'y', area: 'z', actor: 'a,b', target: "1'); drop", from: 'today', page: '0' });
    expect(r).toEqual({ scope: 'admin', outcome: 'all', area: 'all', actor: undefined, target: undefined, from: undefined, to: undefined, page: 1 });
  });
  it('describes admin actions and plain account events', async () => {
    const { describeAction } = await import('@/lib/admin/audit-directory');
    expect(describeAction('admin.professional.approve.succeeded')).toEqual({ area: 'professional', verb: 'approve', outcome: 'succeeded' });
    expect(describeAction('admin.verification_document.view')).toEqual({ area: 'verification document', verb: 'view', outcome: null });
    expect(describeAction('logout').outcome).toBeNull();
  });
  it('service is read-only, checks the admin role first and never writes', () => {
    const src = read('src/lib/services/admin-audit.ts');
    expect(src).not.toMatch(/^'use server'/m);
    expect(src.indexOf('requireAdmin()')).toBeLessThan(src.indexOf('createTypedAdminClient()'));
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe('finance payments', () => {
  it('defaults bad filters', async () => {
    const { paymentDirectoryInput } = await import('@/lib/admin/finance-directory');
    expect(paymentDirectoryInput.parse({ status: 'x', from: 'now', page: '-1' })).toEqual({ status: 'all', from: undefined, to: undefined, page: 1 });
  });
  it('service is read-only and checks the admin role first', () => {
    const src = read('src/lib/services/admin-payments.ts');
    expect(src).not.toMatch(/^'use server'/m);
    expect(src.indexOf('requireAdmin()')).toBeLessThan(src.indexOf('createTypedAdminClient()'));
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
  });
});

describe('communications', () => {
  it('service is read-only, checks the admin role first and never reads message bodies or job chat', () => {
    const src = read('src/lib/services/admin-communications.ts');
    expect(src).not.toMatch(/^'use server'/m);
    expect(src.indexOf('requireAdmin()')).toBeLessThan(src.indexOf('createTypedAdminClient()'));
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
    expect(src).not.toMatch(/job_messages/);
    expect(src).not.toMatch(/select\('[^']*\bmessage\b/);
  });
});
