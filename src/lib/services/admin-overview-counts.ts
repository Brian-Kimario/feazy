/**
 * Counts for the Overview. Not a server-action module. Each figure is read on its own and is `null`
 * when its query fails, so the page shows "Unavailable" instead of a misleading zero.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';

const ACTIVE_JOB_STATES = ['accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending'];

export interface OverviewCounts {
  jobsInProgress: number | null;
  /** Offers waiting for a professional to respond (jobs in `assigned` with a professional). */
  pendingOffers: number | null;
  openExceptions: number | null;
  pendingVerifications: number | null;
  /** Suspended professionals that still hold accepted/active jobs. */
  suspendedWithActiveJobs: number | null;
  professionals: {
    total: number | null;
    verified: number | null;
    pendingReview: number | null;
    available: number | null;
    suspended: number | null;
    withActiveJobs: number | null;
  };
}

type Counter = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function n(label: string, q: Counter): Promise<number | null> {
  const { count, error } = await q;
  if (error || count === null) {
    console.error(`getOverviewCounts ${label}:`, error?.message ?? 'no count');
    return null;
  }
  return count;
}

export async function getOverviewCounts(): Promise<AdminResult<OverviewCounts>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);

  const a = await createTypedAdminClient();
  const head = { count: 'exact', head: true } as const;
  const profiles = () => a.from('professional_profiles').select('user_id', head);

  const [
    jobsInProgress,
    pendingOffers,
    openExceptions,
    pendingVerifications,
    total,
    verified,
    available,
    suspended,
  ] = await Promise.all([
    // Jobs are counted only for real bookings (is_test = false).
    n('in progress', a.from('jobs').select('id, bookings!inner(is_test)', head).in('current_state', ['on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending']).eq('bookings.is_test', false)),
    n('pending offers', a.from('jobs').select('id, bookings!inner(is_test)', head).eq('current_state', 'assigned').not('professional_id', 'is', null).eq('bookings.is_test', false)),
    n('exceptions', a.from('job_exceptions').select('id', head).eq('status', 'open')),
    n('pending verifications', profiles().in('verification_status', ['documents_submitted', 'under_review'])),
    n('pros total', profiles()),
    n('pros verified', profiles().eq('verification_status', 'verified')),
    n('pros available', profiles().eq('verification_status', 'verified').eq('is_available', true)),
    n('pros suspended', profiles().eq('verification_status', 'suspended')),
  ]);

  // Professionals who hold live work. Distinct ids are counted app-side; the id list is capped.
  let withActiveJobs: number | null = null;
  let suspendedWithActiveJobs: number | null = null;
  const active = await a.from('jobs').select('professional_id, bookings!inner(is_test)').in('current_state', ACTIVE_JOB_STATES).not('professional_id', 'is', null).eq('bookings.is_test', false).limit(2000);
  if (active.error || (active.data?.length ?? 0) >= 2000) {
    if (active.error) console.error('getOverviewCounts active jobs:', active.error.message);
  } else {
    const ids = [...new Set((active.data ?? []).map((r) => r.professional_id as string))];
    withActiveJobs = ids.length;
    if (ids.length === 0) {
      suspendedWithActiveJobs = 0;
    } else {
      suspendedWithActiveJobs = await n(
        'suspended with active jobs',
        a.from('professional_profiles').select('user_id', head).eq('verification_status', 'suspended').in('user_id', ids),
      );
    }
  }

  return {
    ok: true,
    data: {
      jobsInProgress,
      pendingOffers,
      openExceptions,
      pendingVerifications,
      suspendedWithActiveJobs,
      professionals: {
        total,
        verified,
        pendingReview: pendingVerifications,
        available,
        suspended,
        withActiveJobs,
      },
    },
  };
}
