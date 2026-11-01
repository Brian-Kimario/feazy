import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminActor } from '@/lib/admin/guard';
import { adminFailure, isAdminFailure, type AdminResult } from '@/lib/admin/result';
import { describeAdminAction } from '@/lib/admin/activity';
import { getOperationsCaseDetail, type OpsCaseDetail } from '@/lib/services/admin-operations';

/**
 * Read-only case workspace for one booking. The route id may be a booking id or a job id (the
 * Jobs directory links by job); both resolve to the booking, which always exists, whereas a
 * job does not for an unmatched request. Plain server module reached from the page, never an
 * endpoint; every export re-checks the admin role.
 */

export interface CaseParty {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CaseQuote {
  status: string;
  total: number;
  reason: string;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface CaseException {
  kind: string;
  status: string;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface CaseAdminAction {
  id: string;
  label: string;
  outcome: 'succeeded' | 'failed';
  at: string;
  reason: string | null;
}

export interface CaseWorkspace {
  generatedAt: string;
  bookingId: string;
  jobId: string | null;
  detail: OpsCaseDetail;
  problemSummary: string | null;
  urgency: string;
  pricingModel: string;
  amount: number | null;
  customer: CaseParty | null;
  professional: CaseParty | null;
  quotes: CaseQuote[];
  exceptions: CaseException[];
  adminActions: CaseAdminAction[];
}

type Admin = SupabaseClient<Database>;

const idSchema = z.guid();

const bookingRow = z.object({
  id: z.string(),
  customer_id: z.string(),
  professional_id: z.string().nullable(),
  problem_summary: z.string().nullable(),
  urgency: z.string(),
  pricing_model: z.string(),
  quoted_or_base_amount: z.number().nullable(),
});

const auditRow = z.object({
  id: z.string(),
  action: z.string(),
  created_at: z.string(),
  changes: z.record(z.string(), z.unknown()).nullable(),
});

export async function getCaseWorkspace(rawId: unknown): Promise<AdminResult<CaseWorkspace | null>> {
  const actor = await getAdminActor();
  if (isAdminFailure(actor)) return actor;

  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) return { ok: true, data: null };
  const id = parsedId.data;

  const admin = (await createAdminClient()) as unknown as Admin;
  const fail = (what: string, message: string) => {
    console.error(`getCaseWorkspace ${what}:`, message);
    return adminFailure('FAILED', `Could not load the case (${what}).`);
  };

  // Resolve to a booking: the id is a booking id, else a job id.
  let bookingId: string | null = null;
  const direct = await admin.from('bookings').select('id').eq('id', id).maybeSingle();
  if (direct.error) return fail('booking lookup', direct.error.message);
  if (direct.data) bookingId = direct.data.id;
  else {
    const viaJob = await admin.from('jobs').select('booking_id').eq('id', id).maybeSingle();
    if (viaJob.error) return fail('job lookup', viaJob.error.message);
    bookingId = viaJob.data?.booking_id ?? null;
  }
  if (!bookingId) return { ok: true, data: null };

  // Any booking-case type loads the booking branch; only 'verification' takes the other one.
  const detail = await getOperationsCaseDetail({ type: 'stale_pending', id: bookingId });
  if (isAdminFailure(detail)) return detail;
  if (!detail.data.booking) return { ok: true, data: null };

  const bookingRes = await admin
    .from('bookings')
    .select('id, customer_id, professional_id, problem_summary, urgency, pricing_model, quoted_or_base_amount')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingRes.error) return fail('booking', bookingRes.error.message);
  const booking = bookingRow.safeParse(bookingRes.data);
  if (!booking.success) return fail('booking shape', booking.error.issues[0]?.message ?? 'invalid');

  const jobRes = await admin.from('jobs').select('id, professional_id').eq('booking_id', bookingId).maybeSingle();
  if (jobRes.error) return fail('job', jobRes.error.message);
  const jobId = jobRes.data?.id ?? null;
  const professionalId = jobRes.data?.professional_id ?? booking.data.professional_id;

  const targetIds = jobId ? [bookingId, jobId] : [bookingId];
  const [quotesRes, exceptionsRes, auditRes, peopleRes] = await Promise.all([
    jobId
      ? admin.from('quotes').select('status, total, reason, created_at, expires_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    jobId
      ? admin.from('job_exceptions').select('kind, status, reported_at, resolved_at, resolution_note').eq('job_id', jobId).order('reported_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('audit_logs')
      .select('id, action, created_at, changes')
      .in('changes->>target_id', targetIds)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', professionalId ? [booking.data.customer_id, professionalId] : [booking.data.customer_id]),
  ]);
  if (quotesRes.error) return fail('quotes', quotesRes.error.message);
  if (exceptionsRes.error) return fail('exceptions', exceptionsRes.error.message);
  if (auditRes.error) return fail('audit', auditRes.error.message);
  if (peopleRes.error) return fail('parties', peopleRes.error.message);

  const audit = z.array(auditRow).safeParse(auditRes.data ?? []);
  if (!audit.success) return fail('audit shape', audit.error.issues[0]?.message ?? 'invalid');

  const people = new Map<string, CaseParty>();
  for (const p of peopleRes.data ?? []) {
    people.set(p.id, { id: p.id, name: p.full_name ?? 'Unnamed', email: p.email, phone: p.phone });
  }

  const adminActions: CaseAdminAction[] = [];
  for (const r of audit.data) {
    const d = describeAdminAction(r.action);
    if (!d) continue;
    adminActions.push({
      id: r.id,
      label: d.label,
      outcome: d.outcome,
      at: r.created_at,
      reason: typeof r.changes?.reason === 'string' ? r.changes.reason : null,
    });
  }

  return {
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      bookingId,
      jobId,
      detail: detail.data,
      problemSummary: booking.data.problem_summary,
      urgency: booking.data.urgency,
      pricingModel: booking.data.pricing_model,
      amount: booking.data.quoted_or_base_amount,
      customer: people.get(booking.data.customer_id) ?? null,
      professional: professionalId ? (people.get(professionalId) ?? null) : null,
      quotes: (quotesRes.data ?? []).map((q) => ({
        status: q.status,
        total: Number(q.total),
        reason: q.reason,
        createdAt: q.created_at,
        expiresAt: q.expires_at,
      })),
      exceptions: (exceptionsRes.data ?? []).map((e) => ({
        kind: e.kind,
        status: e.status,
        reportedAt: e.reported_at,
        resolvedAt: e.resolved_at,
        resolutionNote: e.resolution_note,
      })),
      adminActions,
    },
  };
}
