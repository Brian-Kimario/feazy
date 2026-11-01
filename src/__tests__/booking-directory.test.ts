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
