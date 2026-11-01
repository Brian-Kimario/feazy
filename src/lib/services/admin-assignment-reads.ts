/**
 * Admin reads for the assignment UI. Not a server-action module: nothing here can be called from the
 * browser. Each function checks the admin role before it creates the service-role client.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';

export interface AssignableProfessional {
  userId: string;
  name: string;
}

/** Verified, available professionals. Final eligibility (schedule overlap etc.) is decided by the RPC. */
export async function listAssignableProfessionals(): Promise<AdminResult<AssignableProfessional[]>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);

  const admin = await createTypedAdminClient();
  const { data, error } = await admin
    .from('professional_profiles')
    .select('user_id, display_name')
    .eq('verification_status', 'verified')
    .neq('is_available', false)
    .order('display_name')
    .limit(200);
  if (error) {
    console.error('listAssignableProfessionals:', error.message);
    return adminFailure('FAILED', 'Could not load professionals. Reload to try again.');
  }
  return { ok: true, data: (data ?? []).map((p) => ({ userId: p.user_id, name: p.display_name })) };
}

export interface OpenException {
  id: string;
  jobId: string;
  bookingId: string | null;
  kind: string;
  preference: string;
  status: string;
  reportedAt: string;
  scheduledStart: string;
  detail: string | null;
  finding: string | null;
  professionalId: string | null;
}

export interface DriftRow {
  bookingId: string | null;
  jobId: string | null;
  driftKind: string | null;
  bookingStatus: string | null;
  jobState: string | null;
}

export async function listOpenExceptions(): Promise<AdminResult<{ exceptions: OpenException[]; drift: DriftRow[] }>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);

  const admin = await createTypedAdminClient();
  const [ex, drift] = await Promise.all([
    admin
      .from('job_exceptions')
      .select('id, job_id, kind, preference, status, reported_at, scheduled_start, detail, finding, professional_id')
      .eq('status', 'open')
      .order('reported_at', { ascending: true })
      .limit(100),
    admin
      .from('a4_assignment_drift')
      .select('booking_id, job_id, drift_kind, booking_status, job_state')
      .limit(100),
  ]);
  if (ex.error || drift.error) {
    console.error('listOpenExceptions:', ex.error?.message ?? drift.error?.message);
    return adminFailure('FAILED', 'Could not load exceptions. Reload to try again.');
  }
  const jobIds = [...new Set((ex.data ?? []).map((e) => e.job_id))];
  const bookingByJob = new Map<string, string>();
  if (jobIds.length > 0) {
    const jobs = await admin.from('jobs').select('id, booking_id').in('id', jobIds);
    if (jobs.error) {
      console.error('listOpenExceptions jobs:', jobs.error.message);
      return adminFailure('FAILED', 'Could not load exceptions. Reload to try again.');
    }
    for (const j of jobs.data ?? []) bookingByJob.set(j.id, j.booking_id);
  }
  return {
    ok: true,
    data: {
      exceptions: (ex.data ?? []).map((e) => ({
        id: e.id,
        jobId: e.job_id,
        bookingId: bookingByJob.get(e.job_id) ?? null,
        kind: e.kind,
        preference: e.preference,
        status: e.status,
        reportedAt: e.reported_at,
        scheduledStart: e.scheduled_start,
        detail: e.detail,
        finding: e.finding,
        professionalId: e.professional_id,
      })),
      drift: (drift.data ?? []).map((d) => ({
        bookingId: d.booking_id,
        jobId: d.job_id,
        driftKind: d.drift_kind,
        bookingStatus: d.booking_status,
        jobState: d.job_state,
      })),
    },
  };
}
