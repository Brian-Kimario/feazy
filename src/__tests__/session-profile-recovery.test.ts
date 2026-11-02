import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
const adminSelectSingle = vi.fn();
const userSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: userSingle }) }) }),
  }),
}));

const adminFrom = () => ({
  upsert,
  select: () => ({ eq: () => ({ single: adminSelectSingle }) }),
});
vi.mock('@/lib/admin/client', () => ({ createTypedAdminClient: async () => ({ from: adminFrom }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: async () => ({ from: adminFrom }) }));

import { getCurrentProfile } from '@/lib/auth/session';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('getCurrentProfile recovery never overwrites an existing role', () => {
  it('PGRST116: inserts with ignoreDuplicates and returns the row that exists (e.g. a professional created by the signup trigger)', async () => {
    userSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'none' } });
    upsert.mockResolvedValue({ error: null });
    adminSelectSingle.mockResolvedValue({ data: { id: 'u1', role: 'professional' }, error: null });
    const p = await getCurrentProfile();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][1]).toMatchObject({ onConflict: 'id', ignoreDuplicates: true });
    expect(p?.role).toBe('professional');
  });

  it('PGRST201: reads only, never writes', async () => {
    userSingle.mockResolvedValue({ data: null, error: { code: 'PGRST201', message: 'ambiguous' } });
    adminSelectSingle.mockResolvedValue({ data: { id: 'u1', role: 'admin' }, error: null });
    const p = await getCurrentProfile();
    expect(upsert).not.toHaveBeenCalled();
    expect(p?.role).toBe('admin');
  });

  it('returns null when creation fails', async () => {
    userSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'none' } });
    upsert.mockResolvedValue({ error: { code: '23503', message: 'x' } });
    expect(await getCurrentProfile()).toBeNull();
  });
});
