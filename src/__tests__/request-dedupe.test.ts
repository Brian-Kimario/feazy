import { describe, it, expect, vi, beforeEach } from 'vitest';

// React's cache() only memoises inside a server render. Model one request scope here: each cached
// function keeps its last result until the test calls `endRequest()`.
const scope = vi.hoisted(() => ({ resets: [] as Array<() => void> }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      let cached: { value: R } | undefined;
      scope.resets.push(() => {
        cached = undefined;
      });
      return (...args: A): R => (cached ??= { value: fn(...args) }).value;
    },
  };
});

const db = vi.hoisted(() => ({
  getUser: vi.fn(),
  categoryReads: 0,
  categoryRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: db.getUser },
    from: (table: string) => {
      if (table === 'service_categories') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => {
                db.categoryReads += 1;
                return { data: db.categoryRows, error: null };
              },
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'u1', role: 'customer' }, error: null }),
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/admin/client', () => ({ createTypedAdminClient: async () => ({}) }));

import { getCurrentProfile, getCurrentUser } from '@/lib/auth/session';
import { getComingSoonCategories, getServiceCategories } from '@/lib/services/catalogue';

function endRequest() {
  scope.resets.forEach((reset) => reset());
}

beforeEach(() => {
  endRequest();
  db.getUser.mockReset();
  db.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } });
  db.categoryReads = 0;
  db.categoryRows = [
    { id: 'c1', slug: 'plumbing', name: 'Plumbing', description: null, availability: 'bookable', sort_order: 1, is_active: true },
    { id: 'c2', slug: 'solar', name: 'Solar', description: null, availability: 'coming_soon', sort_order: 2, is_active: true },
  ];
});

describe('per-request memoisation of the session user', () => {
  it('getCurrentProfile and a direct getCurrentUser share one auth.getUser() call', async () => {
    const profile = await getCurrentProfile();
    await getCurrentUser();
    expect(profile?.role).toBe('customer');
    expect(db.getUser).toHaveBeenCalledTimes(1);
  });

  it('a new request scope resolves the user again', async () => {
    await getCurrentUser();
    endRequest();
    await getCurrentUser();
    expect(db.getUser).toHaveBeenCalledTimes(2);
  });
});

describe('per-request memoisation of the service catalogue', () => {
  it('bookable and coming-soon lists come from one categories query', async () => {
    const [bookable, comingSoon] = await Promise.all([getServiceCategories(), getComingSoonCategories()]);
    expect(db.categoryReads).toBe(1);
    expect(bookable.map((c) => c.name)).toEqual(['Plumbing']);
    expect(comingSoon.map((c) => c.name)).toEqual(['Solar']);
  });
});
