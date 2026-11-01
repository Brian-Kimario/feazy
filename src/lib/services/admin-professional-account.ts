/**
 * Admin read for one professional's account: standing, workload, performance, complaints and admin
 * history. Not a server-action module. The admin role is checked before the service-role client exists.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';

const ACTIVE_STATES = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending'];

export interface ProfessionalJobRow {
  jobId: string;
  bookingId: string;
  reference: string | null;
  state: string;
  scheduledStart: string | null;
  createdAt: string;
}

export interface ProfessionalAccount {
  userId: string;
  name: string;
  verificationStatus: string;
  isAvailable: boolean;
  yearsExperience: number | null;
  joinedAt: string;
  pendingOffers: ProfessionalJobRow[];
  activeJobs: ProfessionalJobRow[];
  recentJobs: ProfessionalJobRow[];
  metrics: {
    jobsCompleted: number;
    acceptanceRate: number | null;
    completionRate: number | null;
    cancelRate: number | null;
    offersAccepted: number;
    offersDeclined: number;
    offersExpired: number;
    ratingAverage: number | null;
    ratingCount: number;
    medianResponseSeconds: number | null;
  } | null;
  complaints: { id: string; jobId: string; kind: string; status: string; reportedAt: string }[];
  history: { id: string; at: string; action: string; from: string; to: string; reason: string }[];
  adminActivity: { id: string; at: string; action: string }[];
  contact: { email: string | null; phone: string | null };
  availability: { day: number; start: string; end: string }[];
  serviceAreas: { city: string; area: string | null; radiusKm: number | null }[];
  documents: { id: string; type: string; status: string; uploadedAt: string; reviewedAt: string | null }[];
}

export async function getProfessionalAccount(userId: string): Promise<AdminResult<ProfessionalAccount | null>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: true, data: null };

  const admin = await createTypedAdminClient();
  const prof = await admin
    .from('professional_profiles')
    .select('user_id, display_name, verification_status, is_available, years_experience, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (prof.error) {
    console.error('getProfessionalAccount profile:', prof.error.message);
    return adminFailure('FAILED', 'Could not load this professional. Reload to try again.');
  }
  if (!prof.data) return { ok: true, data: null };

  const [jobs, metrics, exceptions, events, audit] = await Promise.all([
    admin
      .from('jobs')
      .select('id, booking_id, current_state, created_at')
      .eq('professional_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('professional_metrics').select('*').eq('professional_id', userId).maybeSingle(),
    admin
      .from('job_exceptions')
      .select('id, job_id, kind, status, reported_at')
      .eq('professional_id', userId)
      .order('reported_at', { ascending: false })
      .limit(20),
    admin
      .from('professional_verification_events')
      .select('id, created_at, action, from_status, to_status, reason')
      .eq('professional_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('audit_logs')
      .select('id, created_at, action')
      .eq('user_id', userId)
      .like('action', 'admin.%')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  const [contact, avail, areas, vers] = await Promise.all([
    admin.from('profiles').select('email, phone').eq('id', userId).maybeSingle(),
    admin.from('professional_availability').select('day_of_week, start_time, end_time').eq('professional_id', userId).eq('is_active', true).order('day_of_week').order('start_time').limit(50),
    admin.from('professional_service_areas').select('city, area, radius_km').eq('professional_id', userId).eq('is_active', true).limit(50),
    admin.from('professional_verifications').select('id').eq('professional_id', userId).limit(20),
  ]);
  const verIds = (vers.data ?? []).map((v) => v.id);
  const docs = verIds.length
    ? await admin.from('professional_verification_documents').select('id, document_type, status, uploaded_at, reviewed_at').in('verification_id', verIds).order('uploaded_at', { ascending: false }).limit(30)
    : { data: [], error: null };
  const failed = [jobs, metrics, exceptions, events, audit, contact, avail, areas, vers, docs].find((r) => r.error);
  if (failed?.error) {
    console.error('getProfessionalAccount:', failed.error.message);
    return adminFailure('FAILED', 'Could not load this professional. Reload to try again.');
  }

  const bookingIds = [...new Set((jobs.data ?? []).map((j) => j.booking_id))];
  const bookings = new Map<string, { reference: string | null; start: string | null }>();
  if (bookingIds.length > 0) {
    const b = await admin.from('bookings').select('id, booking_reference, scheduled_start').in('id', bookingIds);
    if (b.error) {
      console.error('getProfessionalAccount bookings:', b.error.message);
      return adminFailure('FAILED', 'Could not load this professional. Reload to try again.');
    }
    for (const r of b.data ?? []) bookings.set(r.id, { reference: r.booking_reference, start: r.scheduled_start });
  }
  const rows: ProfessionalJobRow[] = (jobs.data ?? []).map((j) => ({
    jobId: j.id,
    bookingId: j.booking_id,
    reference: bookings.get(j.booking_id)?.reference ?? null,
    state: j.current_state,
    scheduledStart: bookings.get(j.booking_id)?.start ?? null,
    createdAt: j.created_at,
  }));

  const m = metrics.data;
  return {
    ok: true,
    data: {
      userId: prof.data.user_id,
      name: prof.data.display_name,
      verificationStatus: prof.data.verification_status,
      isAvailable: Boolean(prof.data.is_available),
      yearsExperience: prof.data.years_experience ?? null,
      joinedAt: prof.data.created_at,
      pendingOffers: rows.filter((r) => r.state === 'assigned'),
      activeJobs: rows.filter((r) => ACTIVE_STATES.includes(r.state)),
      recentJobs: rows.filter((r) => !ACTIVE_STATES.includes(r.state) && r.state !== 'assigned').slice(0, 15),
      metrics: m
        ? {
            jobsCompleted: m.jobs_completed ?? 0,
            acceptanceRate: m.acceptance_rate ?? null,
            completionRate: m.completion_rate ?? null,
            cancelRate: m.cancel_rate ?? null,
            offersAccepted: m.offers_accepted ?? 0,
            offersDeclined: m.offers_declined ?? 0,
            offersExpired: m.offers_expired ?? 0,
            ratingAverage: m.rating_average ?? null,
            ratingCount: m.rating_count ?? 0,
            medianResponseSeconds: m.median_response_seconds ?? null,
          }
        : null,
      complaints: (exceptions.data ?? []).map((e) => ({
        id: e.id,
        jobId: e.job_id,
        kind: e.kind,
        status: e.status,
        reportedAt: e.reported_at,
      })),
      history: (events.data ?? []).map((e) => ({
        id: e.id,
        at: e.created_at,
        action: e.action,
        from: e.from_status,
        to: e.to_status,
        reason: e.reason,
      })),
      adminActivity: (audit.data ?? []).map((a) => ({ id: a.id, at: a.created_at, action: a.action })),
      contact: { email: contact.data?.email ?? null, phone: contact.data?.phone ?? null },
      availability: (avail.data ?? []).map((r) => ({ day: r.day_of_week, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5) })),
      serviceAreas: (areas.data ?? []).map((r) => ({ city: r.city, area: r.area ?? null, radiusKm: r.radius_km ?? null })),
      documents: (docs.data ?? []).map((d) => ({ id: d.id, type: d.document_type, status: d.status, uploadedAt: d.uploaded_at, reviewedAt: d.reviewed_at ?? null })),
    },
  };
}
