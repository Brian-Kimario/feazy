/**
 * Searchable, filterable, paginated professional directory. Not a server-action module. Admin role is
 * checked before the service-role client exists; a failed read is an error, never an empty list.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { PRO_PAGE_SIZE, professionalDirectoryInput } from '@/lib/admin/professional-directory';

const ACTIVE_STATES = ['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending'];
const ID_CAP = 2000;

export interface ProfessionalRow {
  userId: string;
  name: string;
  email: string | null;
  status: string;
  isAvailable: boolean;
  rating: number | null;
  completedJobs: number;
  activeJobs: number;
  joinedAt: string | null;
}

export interface ProfessionalDirectory {
  rows: ProfessionalRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listProfessionals(raw: unknown): Promise<AdminResult<ProfessionalDirectory>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const input = professionalDirectoryInput.parse(raw ?? {});
  const fail = (m: string) => {
    console.error('listProfessionals:', m);
    return adminFailure('FAILED', 'Could not load professionals. Reload to try again.');
  };

  const a = await createTypedAdminClient();

  // Professionals holding live work (assigned offers count: they are waiting on this person).
  let activeIds: string[] | null = null;
  const activeCounts = new Map<string, number>();
  if (input.workload !== 'all') {
    const j = await a.from('jobs').select('professional_id').in('current_state', ACTIVE_STATES).not('professional_id', 'is', null).limit(ID_CAP);
    if (j.error) return fail(j.error.message);
    if ((j.data?.length ?? 0) >= ID_CAP) return adminFailure('FAILED', 'Too many active jobs to filter by workload. Narrow the search instead.');
    activeIds = [...new Set((j.data ?? []).map((r) => r.professional_id as string))];
  }

  let nameIds: string[] | null = null;
  if (input.q) {
    const t = input.q.replace(/[%_]/g, '');
    const p = await a.from('profiles').select('id').or(`full_name.ilike.%${t}%,email.ilike.%${t}%`).limit(200);
    if (p.error) return fail(p.error.message);
    nameIds = (p.data ?? []).map((r) => r.id);
  }

  let q = a
    .from('professional_profiles')
    .select('user_id, display_name, verification_status, rating_average, completed_jobs_count, is_available, created_at', { count: 'exact' });
  if (input.q) {
    const t = input.q.replace(/[%_]/g, '');
    q = nameIds && nameIds.length ? q.or(`display_name.ilike.%${t}%,user_id.in.(${nameIds.join(',')})`) : q.ilike('display_name', `%${t}%`);
  }
  if (input.status !== 'all') q = q.eq('verification_status', input.status);
  if (input.availability !== 'all') q = q.eq('is_available', input.availability === 'available');
  if (input.workload === 'with_active') {
    if (!activeIds || activeIds.length === 0) return { ok: true, data: { rows: [], total: 0, page: input.page, pageCount: 1 } };
    q = q.in('user_id', activeIds);
  } else if (input.workload === 'none_active' && activeIds && activeIds.length) {
    q = q.not('user_id', 'in', `(${activeIds.join(',')})`);
  }

  const from = (input.page - 1) * PRO_PAGE_SIZE;
  const res = await q.order('created_at', { ascending: false }).range(from, from + PRO_PAGE_SIZE - 1);
  if (res.error) return fail(res.error.message);
  const pros = res.data ?? [];
  const ids = pros.map((p) => p.user_id);

  const emails = new Map<string, string | null>();
  if (ids.length) {
    const [pr, jobs] = await Promise.all([
      a.from('profiles').select('id, email').in('id', ids),
      a.from('jobs').select('professional_id').in('current_state', ACTIVE_STATES).in('professional_id', ids),
    ]);
    if (pr.error) return fail(pr.error.message);
    if (jobs.error) return fail(jobs.error.message);
    for (const r of pr.data ?? []) emails.set(r.id, r.email);
    for (const r of jobs.data ?? []) activeCounts.set(r.professional_id as string, (activeCounts.get(r.professional_id as string) ?? 0) + 1);
  }

  const total = res.count ?? 0;
  return {
    ok: true,
    data: {
      rows: pros.map((p) => ({
        userId: p.user_id,
        name: p.display_name,
        email: emails.get(p.user_id) ?? null,
        status: p.verification_status,
        isAvailable: p.is_available ?? false,
        rating: p.rating_average === null ? null : Number(p.rating_average),
        completedJobs: Number(p.completed_jobs_count ?? 0),
        activeJobs: activeCounts.get(p.user_id) ?? 0,
        joinedAt: p.created_at,
      })),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / PRO_PAGE_SIZE)),
    },
  };
}
