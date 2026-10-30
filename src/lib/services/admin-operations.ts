import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminActor } from '@/lib/admin/guard';
import { adminFailure, isAdminFailure, type AdminResult } from '@/lib/admin/result';
import {
  OPS_CASE_TYPES,
  OPS_LIVE_JOB_STATES,
  classifyBooking,
  classifyVerification,
  sortCases,
  type OpsBookingRow,
  type OpsCase,
} from '@/lib/admin/operations';
import { resolveOperationsThresholds, type OperationsThresholds } from '@/lib/admin/operations-config';

/**
 * The one source of Operations exceptions. Reads real columns with the service-role client (admins
 * have no RLS read on bookings) after the role check, and returns a typed failure for any query
 * error so the page can show an error state rather than an empty queue.
 */

const JOB_LIMIT = 500;
const BOOKING_LIMIT = 200;
const VERIFICATION_LIMIT = 200;

const oneOrMany = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).nullable();
function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const bookingEmbed = z.object({
  id: z.string(),
  booking_reference: z.string(),
  booking_status: z.string(),
  scheduled_start: z.string(),
  scheduled_end: z.string().nullable(),
  unmatched_since: z.string().nullable(),
  created_at: z.string(),
  service: oneOrMany(z.object({ name: z.string() })),
  property: oneOrMany(
    z.object({ address: oneOrMany(z.object({ city: z.string().nullable() })) }),
  ),
});
type BookingEmbed = z.infer<typeof bookingEmbed>;

const jobRow = z.object({
  id: z.string(),
  current_state: z.string(),
  professional_id: z.string().nullable(),
  offer_expires_at: z.string().nullable(),
  updated_at: z.string(),
  booking: oneOrMany(bookingEmbed),
});

const verificationRow = z.object({
  user_id: z.string(),
  display_name: z.string(),
  verification_status: z.string(),
  created_at: z.string(),
});

const BOOKING_SELECT = `id, booking_reference, booking_status, scheduled_start, scheduled_end, unmatched_since, created_at,
  service:services!bookings_service_id_fkey ( name ),
  property:properties!bookings_property_id_fkey ( address:addresses ( city ) )`;

function cityOf(b: BookingEmbed): string | null {
  return first(first(b.property)?.address ?? null)?.city ?? null;
}

function toRow(b: BookingEmbed, job: OpsBookingRow['job']): OpsBookingRow {
  return {
    id: b.id,
    reference: b.booking_reference,
    status: b.booking_status,
    scheduledStart: b.scheduled_start,
    scheduledEnd: b.scheduled_end,
    unmatchedSince: b.unmatched_since,
    createdAt: b.created_at,
    serviceName: first(b.service)?.name ?? 'Service',
    city: cityOf(b),
    job,
  };
}

export interface OpsQueue {
  cases: OpsCase[];
  generatedAt: string;
  thresholds: OperationsThresholds;
  /** True when a query hit its row cap, so the queue may be incomplete. */
  truncated: boolean;
}

async function adminOr(): Promise<AdminResult<{ userId: string }>> {
  return getAdminActor();
}

type Admin = SupabaseClient<Database>;

/** The shared admin client is untyped; the schema types are applied here once. */
async function typedAdmin(): Promise<Admin> {
  return (await createAdminClient()) as unknown as Admin;
}

/** Latest job_events / job_messages timestamp per job, for the "no meaningful activity" rule. */
async function latestActivity(
  admin: Admin,
  jobIds: string[],
): Promise<{ events: Map<string, string>; messages: Map<string, string> } | string> {
  const events = new Map<string, string>();
  const messages = new Map<string, string>();
  if (jobIds.length === 0) return { events, messages };

  const [ev, msg] = await Promise.all([
    admin.from('job_events').select('job_id, created_at').in('job_id', jobIds).order('created_at', { ascending: false }).limit(5000),
    admin.from('job_messages').select('job_id, created_at').in('job_id', jobIds).order('created_at', { ascending: false }).limit(5000),
  ]);
  if (ev.error) return `job events: ${ev.error.message}`;
  if (msg.error) return `job messages: ${msg.error.message}`;
  for (const r of ev.data ?? []) if (!events.has(r.job_id)) events.set(r.job_id, r.created_at);
  for (const r of msg.data ?? []) if (!messages.has(r.job_id)) messages.set(r.job_id, r.created_at);
  return { events, messages };
}

async function professionalNames(admin: Admin, ids: string[]): Promise<Map<string, string> | string> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data, error } = await admin.from('professional_profiles').select('user_id, display_name').in('user_id', ids);
  if (error) return `professional names: ${error.message}`;
  for (const r of data ?? []) names.set(r.user_id, r.display_name);
  return names;
}

export async function getOperationsQueue(now: Date = new Date()): Promise<AdminResult<OpsQueue>> {
  const actor = await adminOr();
  if (isAdminFailure(actor)) return actor;

  let thresholds: OperationsThresholds;
  try {
    thresholds = resolveOperationsThresholds();
  } catch {
    return adminFailure('FAILED', 'The OPS_* alert threshold settings are invalid. Fix the environment and reload.');
  }

  const admin = await typedAdmin();
  const fail = (what: string, message: string) => {
    console.error(`getOperationsQueue ${what}:`, message);
    return adminFailure('FAILED', `Could not load operations data (${what}).`);
  };

  const [jobsRes, noJobRes, verifRes] = await Promise.all([
    admin
      .from('jobs')
      .select(
        `id, current_state, professional_id, offer_expires_at, updated_at,
         booking:bookings!jobs_booking_id_fkey ( ${BOOKING_SELECT} )`,
      )
      .in('current_state', OPS_LIVE_JOB_STATES)
      .order('created_at', { ascending: true })
      .limit(JOB_LIMIT),
    admin
      .from('bookings')
      .select(`${BOOKING_SELECT}, jobs:jobs!jobs_booking_id_fkey ( id )`)
      .eq('booking_status', 'pending')
      .is('jobs', null)
      .order('scheduled_start', { ascending: true })
      .limit(BOOKING_LIMIT),
    admin
      .from('professional_profiles')
      .select('user_id, display_name, verification_status, created_at')
      .in('verification_status', ['documents_submitted', 'under_review'])
      .order('created_at', { ascending: true })
      .limit(VERIFICATION_LIMIT),
  ]);
  if (jobsRes.error) return fail('jobs', jobsRes.error.message);
  if (noJobRes.error) return fail('bookings without a job', noJobRes.error.message);
  if (verifRes.error) return fail('verification', verifRes.error.message);

  const jobs = z.array(jobRow).safeParse(jobsRes.data);
  if (!jobs.success) return fail('jobs shape', jobs.error.issues[0]?.message ?? 'invalid');
  const noJob = z.array(bookingEmbed).safeParse(noJobRes.data);
  if (!noJob.success) return fail('bookings shape', noJob.error.issues[0]?.message ?? 'invalid');
  const verifs = z.array(verificationRow).safeParse(verifRes.data);
  if (!verifs.success) return fail('verification shape', verifs.error.issues[0]?.message ?? 'invalid');

  const jobsWithBooking = jobs.data.filter((j) => first(j.booking) !== null);
  const proIds = [...new Set(jobsWithBooking.flatMap((j) => (j.professional_id ? [j.professional_id] : [])))];
  const activityIds = jobsWithBooking
    .filter((j) => j.current_state === 'in_progress' || j.current_state === 'quote_pending')
    .map((j) => j.id);

  const [names, activity] = await Promise.all([professionalNames(admin, proIds), latestActivity(admin, activityIds)]);
  if (typeof names === 'string') return fail('professionals', names);
  if (typeof activity === 'string') return fail('activity', activity);

  const rows: OpsBookingRow[] = [
    ...jobsWithBooking.map((j) =>
      toRow(first(j.booking) as BookingEmbed, {
        id: j.id,
        state: j.current_state,
        professionalId: j.professional_id,
        professionalName: j.professional_id ? (names.get(j.professional_id) ?? null) : null,
        offerExpiresAt: j.offer_expires_at,
        updatedAt: j.updated_at,
        lastEventAt: activity.events.get(j.id) ?? null,
        lastMessageAt: activity.messages.get(j.id) ?? null,
      }),
    ),
    ...noJob.data.map((b) => toRow(b, null)),
  ];

  const cases: OpsCase[] = [];
  for (const row of rows) {
    const c = classifyBooking(row, now, thresholds);
    if (c) cases.push(c);
  }
  for (const v of verifs.data) {
    cases.push(
      classifyVerification({
        userId: v.user_id,
        displayName: v.display_name,
        status: v.verification_status,
        createdAt: v.created_at,
      }),
    );
  }

  return {
    ok: true,
    data: {
      cases: sortCases(cases),
      generatedAt: now.toISOString(),
      thresholds,
      truncated:
        jobsRes.data.length >= JOB_LIMIT ||
        noJobRes.data.length >= BOOKING_LIMIT ||
        verifRes.data.length >= VERIFICATION_LIMIT,
    },
  };
}

/* ── Case detail ──────────────────────────────────────────────────────────── */

export const opsCaseDetailInput = z.object({
  type: z.enum(OPS_CASE_TYPES),
  id: z.guid(),
});

export interface OpsEventRow {
  at: string;
  kind: string;
  fromState: string | null;
  toState: string | null;
  actor: string;
}
export interface OpsAttemptRow {
  at: string;
  outcome: string;
  reasonCode: string | null;
  reason: string | null;
}
export interface OpsDecisionRow {
  at: string;
  kind: string;
  poolSize: number;
  professionalName: string | null;
}
export interface OpsPaymentRow {
  type: string;
  status: string;
  amount: number;
  paidAt: string | null;
}

export interface OpsCaseDetail {
  /** Fresh classification; null when the case no longer meets its rule. */
  current: OpsCase | null;
  booking: {
    reference: string;
    serviceName: string;
    city: string | null;
    status: string;
    scheduledStart: string;
    scheduledEnd: string | null;
    createdAt: string;
    unmatchedSince: string | null;
  } | null;
  job: { state: string; professionalName: string | null; offerExpiresAt: string | null } | null;
  events: OpsEventRow[];
  decisions: OpsDecisionRow[];
  attempts: OpsAttemptRow[];
  payments: OpsPaymentRow[];
  verification: { displayName: string; status: string; submittedAt: string } | null;
}

export async function getOperationsCaseDetail(input: unknown): Promise<AdminResult<OpsCaseDetail>> {
  const actor = await adminOr();
  if (isAdminFailure(actor)) return actor;

  const parsed = opsCaseDetailInput.safeParse(input);
  if (!parsed.success) return adminFailure('INVALID_INPUT', 'Invalid case reference.');
  const { type, id } = parsed.data;

  let thresholds: OperationsThresholds;
  try {
    thresholds = resolveOperationsThresholds();
  } catch {
    return adminFailure('FAILED', 'The OPS_* alert threshold settings are invalid.');
  }

  const admin = await typedAdmin();
  const empty: OpsCaseDetail = {
    current: null,
    booking: null,
    job: null,
    events: [],
    decisions: [],
    attempts: [],
    payments: [],
    verification: null,
  };
  const fail = (what: string, message: string) => {
    console.error(`getOperationsCaseDetail ${what}:`, message);
    return adminFailure('FAILED', `Could not load case details (${what}).`);
  };

  if (type === 'verification') {
    const { data, error } = await admin
      .from('professional_profiles')
      .select('user_id, display_name, verification_status, created_at')
      .eq('user_id', id)
      .maybeSingle();
    if (error) return fail('verification', error.message);
    const row = data ? verificationRow.safeParse(data) : null;
    if (!row?.success) return { ok: true, data: empty };
    const stillOpen = ['documents_submitted', 'under_review'].includes(row.data.verification_status);
    return {
      ok: true,
      data: {
        ...empty,
        current: stillOpen
          ? classifyVerification({
              userId: row.data.user_id,
              displayName: row.data.display_name,
              status: row.data.verification_status,
              createdAt: row.data.created_at,
            })
          : null,
        verification: {
          displayName: row.data.display_name,
          status: row.data.verification_status,
          submittedAt: row.data.created_at,
        },
      },
    };
  }

  const { data: bookingData, error: bookingError } = await admin
    .from('bookings')
    .select(`${BOOKING_SELECT}, job:jobs!jobs_booking_id_fkey ( id, current_state, professional_id, offer_expires_at, updated_at, customer_id )`)
    .eq('id', id)
    .maybeSingle();
  if (bookingError) return fail('booking', bookingError.message);
  if (!bookingData) return { ok: true, data: empty };

  const bookingParsed = bookingEmbed
    .extend({
      job: oneOrMany(
        z.object({
          id: z.string(),
          current_state: z.string(),
          professional_id: z.string().nullable(),
          offer_expires_at: z.string().nullable(),
          updated_at: z.string(),
          customer_id: z.string(),
        }),
      ),
    })
    .safeParse(bookingData);
  if (!bookingParsed.success) return fail('booking shape', bookingParsed.error.issues[0]?.message ?? 'invalid');
  const b = bookingParsed.data;
  const job = first(b.job);

  const [eventsRes, attemptsRes, decisionsRes, paymentsRes] = await Promise.all([
    job
      ? admin.from('job_events').select('created_at, event_type, from_state, to_state, actor_user_id').eq('job_id', job.id).order('created_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [], error: null }),
    admin.from('booking_assignment_attempts').select('created_at, outcome, reason_code, reason').eq('booking_id', id).order('created_at', { ascending: false }).limit(30),
    admin.from('matching_decisions').select('created_at, kind, pool_size, professional_id').eq('booking_id', id).order('created_at', { ascending: false }).limit(30),
    admin.from('payments').select('payment_type, status, amount, paid_at').eq('booking_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (eventsRes.error) return fail('events', eventsRes.error.message);
  if (attemptsRes.error) return fail('attempts', attemptsRes.error.message);
  if (decisionsRes.error) return fail('decisions', decisionsRes.error.message);
  if (paymentsRes.error) return fail('payments', paymentsRes.error.message);

  const events = eventsRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const proIds = [
    ...new Set([
      ...(job?.professional_id ? [job.professional_id] : []),
      ...decisions.flatMap((d) => (d.professional_id ? [d.professional_id] : [])),
    ]),
  ];
  const names = await professionalNames(admin, proIds);
  if (typeof names === 'string') return fail('professionals', names);

  const actorIds = [...new Set(events.flatMap((e) => (e.actor_user_id ? [e.actor_user_id] : [])))];
  const roles = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data, error } = await admin.from('profiles').select('id, role').in('id', actorIds);
    if (error) return fail('actors', error.message);
    for (const r of data ?? []) roles.set(r.id, r.role);
  }
  const actorLabel = (actorId: string | null): string => {
    if (!actorId) return 'System';
    const role = roles.get(actorId);
    if (role === 'admin') return 'Admin';
    if (actorId === job?.customer_id) return 'Customer';
    if (actorId === job?.professional_id) return 'Professional';
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';
  };

  const jobState = job?.current_state ?? null;
  let lastEventAt: string | null = null;
  let lastMessageAt: string | null = null;
  if (job && (jobState === 'in_progress' || jobState === 'quote_pending')) {
    const act = await latestActivity(admin, [job.id]);
    if (typeof act === 'string') return fail('activity', act);
    lastEventAt = act.events.get(job.id) ?? null;
    lastMessageAt = act.messages.get(job.id) ?? null;
  }
  const proName = job?.professional_id ? (names.get(job.professional_id) ?? null) : null;
  const row = toRow(
    b,
    job
      ? {
          id: job.id,
          state: job.current_state,
          professionalId: job.professional_id,
          professionalName: proName,
          offerExpiresAt: job.offer_expires_at,
          updatedAt: job.updated_at,
          lastEventAt,
          lastMessageAt,
        }
      : null,
  );
  const fresh = classifyBooking(row, new Date(), thresholds);

  return {
    ok: true,
    data: {
      ...empty,
      current: fresh,
      booking: {
        reference: row.reference,
        serviceName: row.serviceName,
        city: row.city,
        status: row.status,
        scheduledStart: row.scheduledStart,
        scheduledEnd: row.scheduledEnd,
        createdAt: row.createdAt,
        unmatchedSince: row.unmatchedSince,
      },
      job: job ? { state: job.current_state, professionalName: proName, offerExpiresAt: job.offer_expires_at } : null,
      events: events.map((e) => ({
        at: e.created_at,
        kind: e.event_type,
        fromState: e.from_state,
        toState: e.to_state,
        actor: actorLabel(e.actor_user_id),
      })),
      decisions: decisions.map((d) => ({
        at: d.created_at,
        kind: d.kind,
        poolSize: d.pool_size,
        professionalName: d.professional_id ? (names.get(d.professional_id) ?? null) : null,
      })),
      attempts: (attemptsRes.data ?? []).map((a) => ({
        at: a.created_at,
        outcome: a.outcome,
        reasonCode: a.reason_code,
        reason: a.reason,
      })),
      payments: (paymentsRes.data ?? []).map((p) => ({
        type: p.payment_type,
        status: p.status,
        amount: Number(p.amount),
        paidAt: p.paid_at,
      })),
    },
  };
}
