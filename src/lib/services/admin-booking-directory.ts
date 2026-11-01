/**
 * Searchable, paginated booking/job directory. Not a server-action module: reached from the Jobs page only.
 * Booking is the row (a booking with no job is "unmatched"); the case page is keyed by booking id.
 */

import { z } from 'zod';
import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { LIFECYCLE_JOB_STATES, PAGE_SIZE, directoryInput, lifecycleOf, type DirectoryInput, type Lifecycle } from '@/lib/admin/booking-directory';

const one = <T extends z.ZodType>(s: T) => z.union([s, z.array(s)]).nullable();
const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const row = z.object({
  id: z.string(),
  booking_reference: z.string(),
  booking_status: z.string(),
  scheduled_start: z.string(),
  created_at: z.string().nullable(),
  quoted_or_base_amount: z.number().nullable(),
  customer_id: z.string(),
  service: one(z.object({ name: z.string() })),
  customer: one(z.object({ full_name: z.string().nullable() })),
  // PostgREST returns an object when jobs.booking_id is unique and an array otherwise; accept both.
  jobs: one(z.object({ id: z.string(), current_state: z.string(), professional_id: z.string().nullable(), created_at: z.string() })),
});

export interface DirectoryRow {
  bookingId: string;
  reference: string;
  service: string;
  customerId: string;
  customerName: string;
  professionalId: string | null;
  professionalName: string | null;
  jobId: string | null;
  jobState: string | null;
  bookingStatus: string;
  lifecycle: Lifecycle;
  scheduledStart: string;
  amount: number | null;
  openExceptions: number;
  drift: string | null;
}

export interface Directory {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listBookingDirectory(raw: unknown): Promise<AdminResult<Directory>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const input: DirectoryInput = directoryInput.parse(raw ?? {});
  const a = await createTypedAdminClient();
  const fail = (what: string, m: string) => {
    console.error(`listBookingDirectory ${what}:`, m);
    return adminFailure('FAILED', 'Could not load the booking directory. Reload to try again.');
  };

  // Unmatched bookings have no job, so an assignment filter cannot apply to them.
  const assignment = input.lifecycle === 'unmatched' ? 'all' : input.assignment;
  const inner = (input.lifecycle !== 'all' && input.lifecycle !== 'unmatched') || assignment !== 'all';
  let q = a
    .from('bookings')
    .select(
      `id, booking_reference, booking_status, scheduled_start, created_at, quoted_or_base_amount, customer_id,
       service:services!bookings_service_id_fkey ( name ),
       customer:profiles!bookings_customer_id_fkey ( full_name ),
       jobs:jobs${inner ? '!inner' : ''}!jobs_booking_id_fkey ( id, current_state, professional_id, created_at )`,
      { count: 'exact' },
    );

  if (input.lifecycle === 'unmatched') q = q.eq('booking_status', 'pending').is('jobs', null);
  else if (input.lifecycle !== 'all') q = q.in('jobs.current_state', LIFECYCLE_JOB_STATES[input.lifecycle as keyof typeof LIFECYCLE_JOB_STATES]);
  if (assignment === 'with_professional') q = q.not('jobs.professional_id', 'is', null);
  else if (assignment === 'no_professional') q = q.is('jobs.professional_id', null);
  if (input.from) q = q.gte('scheduled_start', `${input.from}T00:00:00+05:30`);
  if (input.to) q = q.lt('scheduled_start', `${nextDay(input.to)}T00:00:00+05:30`);

  if (input.q) {
    const like = `%${input.q}%`;
    const [cust, pros] = await Promise.all([
      a.from('profiles').select('id').or(`full_name.ilike.${like},email.ilike.${like}`).limit(50),
      a.from('professional_profiles').select('user_id').ilike('display_name', like).limit(50),
    ]);
    if (cust.error) return fail('customer search', cust.error.message);
    if (pros.error) return fail('professional search', pros.error.message);
    let bookingIdsViaPro: string[] = [];
    const proIds = (pros.data ?? []).map((p) => p.user_id);
    if (proIds.length) {
      const j = await a.from('jobs').select('booking_id').in('professional_id', proIds).limit(200);
      if (j.error) return fail('professional jobs', j.error.message);
      bookingIdsViaPro = (j.data ?? []).map((x) => x.booking_id);
    }
    const parts = [`booking_reference.ilike.${like}`];
    const custIds = (cust.data ?? []).map((c) => c.id);
    if (custIds.length) parts.push(`customer_id.in.(${custIds.join(',')})`);
    if (bookingIdsViaPro.length) parts.push(`id.in.(${bookingIdsViaPro.join(',')})`);
    q = q.or(parts.join(','));
  }

  const [col, asc] = input.sort === 'created_desc' ? ['created_at', false] : ['scheduled_start', input.sort === 'scheduled_asc'];
  const from = (input.page - 1) * PAGE_SIZE;
  const res = await q.order(col, { ascending: asc }).range(from, from + PAGE_SIZE - 1);
  if (res.error) return fail('bookings', res.error.message);
  const parsed = z.array(row).safeParse(res.data);
  if (!parsed.success) return fail('shape', parsed.error.issues[0]?.message ?? 'invalid');

  const latest = parsed.data.map((b) => ({ b, job: [...(b.jobs === null ? [] : Array.isArray(b.jobs) ? b.jobs : [b.jobs])].sort((x, y) => y.created_at.localeCompare(x.created_at))[0] ?? null }));
  const proIds = [...new Set(latest.flatMap((l) => (l.job?.professional_id ? [l.job.professional_id] : [])))];
  const jobIds = latest.flatMap((l) => (l.job ? [l.job.id] : []));
  const bookingIds = latest.map((l) => l.b.id);

  const [names, exc, drift] = await Promise.all([
    proIds.length ? a.from('professional_profiles').select('user_id, display_name').in('user_id', proIds) : Promise.resolve({ data: [], error: null }),
    jobIds.length ? a.from('job_exceptions').select('job_id').eq('status', 'open').in('job_id', jobIds) : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? a.from('a4_assignment_drift').select('booking_id, drift_kind').not('drift_kind', 'is', null).neq('drift_kind', 'job_active_booking_pending').in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (names.error) return fail('names', names.error.message);
  if (exc.error) return fail('exceptions', exc.error.message);
  if (drift.error) return fail('drift', drift.error.message);
  const nameOf = new Map((names.data ?? []).map((n) => [n.user_id, n.display_name]));
  const excCount = new Map<string, number>();
  for (const e of exc.data ?? []) excCount.set(e.job_id, (excCount.get(e.job_id) ?? 0) + 1);
  const driftOf = new Map((drift.data ?? []).flatMap((d) => (d.booking_id && d.drift_kind ? [[d.booking_id, d.drift_kind] as const] : [])));

  const total = res.count ?? 0;
  return {
    ok: true,
    data: {
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      rows: latest.map(({ b, job }) => ({
        bookingId: b.id,
        reference: b.booking_reference,
        service: first(b.service)?.name ?? 'Service',
        customerId: b.customer_id,
        customerName: first(b.customer)?.full_name ?? 'Customer',
        professionalId: job?.professional_id ?? null,
        professionalName: job?.professional_id ? (nameOf.get(job.professional_id) ?? null) : null,
        jobId: job?.id ?? null,
        jobState: job?.current_state ?? null,
        bookingStatus: b.booking_status,
        lifecycle: lifecycleOf(b.booking_status, job?.current_state ?? null),
        scheduledStart: b.scheduled_start,
        amount: b.quoted_or_base_amount,
        openExceptions: job ? (excCount.get(job.id) ?? 0) : 0,
        drift: driftOf.get(b.id) ?? null,
      })),
    },
  };
}

function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
