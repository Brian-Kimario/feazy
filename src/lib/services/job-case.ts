import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import {
  buildProgress,
  buildTimeline,
  type CaseEvent,
  type CaseParties,
  type ProgressStep,
  type TimelineEntry,
} from '@/lib/jobs/progress';
import { getBookingProfessional, type BookingProfessional } from '@/lib/services/matching';
import { getQuoteForReview, intakeOptionLabels, one, type QuoteForReview } from '@/lib/services/shell';
import { getJobCustomerContact, type JobCustomerContact } from '@/app/professional/actions';

/**
 * The case file behind `/customer/bookings/[id]` and `/professional/jobs/[id]`: one job's
 * progress, timeline, inspections and quotes, plus what each side needs to act. Reads use
 * the RLS-scoped client; each loader checks the caller's side of the job again.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CaseQuote {
  id: string;
  status: string;
  reason: string;
  subtotal: number;
  discount: number;
  taxesOrFees: number;
  total: number;
  createdAt: string;
  updatedAt: string | null;
  expiresAt: string | null;
  items: { id: string; itemType: string; description: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

export interface CaseInspection {
  id: string;
  findings: string;
  recommendation: string | null;
  createdAt: string;
}

export interface CaseMedia {
  id: string;
  kind: string;
  createdAt: string;
  isPdf: boolean;
  /** Short-lived signed URL; null when it could not be signed. */
  url: string | null;
}

/** Signed media links last an hour; the page is re-rendered on every visit. */
const MEDIA_URL_SECONDS = 3600;

export interface CaseEta {
  earliest: string;
  latest: string;
  /** When the window was sent (the latest eta_shared or running_late event). */
  sharedAt: string | null;
  /** The window's end is behind us and the professional has not marked arrival. */
  passed: boolean;
}

export interface CaseRecords {
  progress: ProgressStep[];
  timeline: TimelineEntry[];
  /** Newest first. */
  quotes: CaseQuote[];
  /** Newest first. */
  inspections: CaseInspection[];
  /** Oldest first. */
  media: CaseMedia[];
  paidAt: string | null;
  /** The professional's stated arrival window, shown only before they arrive. */
  eta: CaseEta | null;
  /** When the professional last said they are running late, while that still matters. */
  lateReportedAt: string | null;
  /** True when part of the history could not be read; the page says so instead of showing less. */
  incomplete: boolean;
}

interface JobRow {
  id: string;
  current_state: string;
  customer_id: string;
  professional_id: string | null;
  created_at: string | null;
  accepted_at: string | null;
  on_the_way_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  eta_earliest: string | null;
  eta_latest: string | null;
}

const JOB_COLUMNS = `id, current_state, customer_id, professional_id, created_at, accepted_at,
  on_the_way_at, arrived_at, started_at, completed_at, cancelled_at, eta_earliest, eta_latest`;

/** States in which an arrival window or a late notice still means something. */
const BEFORE_ARRIVAL: ReadonlySet<string> = new Set(['accepted', 'on_the_way']);

function asRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function loadRecords(
  supabase: ServerClient,
  input: {
    role: 'customer' | 'professional';
    viewerId: string;
    bookingCreatedAt: string | null;
    bookingCancelled: boolean;
    job: JobRow | null;
  },
): Promise<CaseRecords> {
  const { job } = input;
  let incomplete = false;
  let events: CaseEvent[] = [];
  let quotes: CaseQuote[] = [];
  let inspections: CaseInspection[] = [];
  let media: CaseMedia[] = [];
  let paidAt: string | null = null;

  if (job) {
    const [eventsRes, quotesRes, inspectionsRes, paidRes, mediaRes] = await Promise.all([
      supabase
        .from('job_events')
        .select('id, from_state, to_state, actor_user_id, event_type, metadata, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('quotes')
        .select(
          `id, status, reason, subtotal, discount, taxes_or_fees, total, created_at, updated_at, expires_at,
           items:quote_items!quote_items_quote_id_fkey ( id, item_type, description, quantity, unit_price, line_total )`,
        )
        .eq('job_id', job.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('inspections')
        .select('id, findings, recommendation, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false }),
      supabase.rpc('job_paid_at', { p_job_id: job.id }),
      supabase
        .from('job_media')
        .select('id, kind, storage_path, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true }),
    ]);

    for (const [name, res] of [
      ['events', eventsRes],
      ['quotes', quotesRes],
      ['inspections', inspectionsRes],
      ['paid_at', paidRes],
      ['media', mediaRes],
    ] as const) {
      if (res.error) {
        console.error(`job case ${name}:`, res.error.message);
        incomplete = true;
      }
    }

    events = (eventsRes.data ?? []).flatMap((e) =>
      e.created_at
        ? [
            {
              id: e.id,
              fromState: e.from_state,
              toState: e.to_state,
              actorUserId: e.actor_user_id,
              eventType: e.event_type,
              metadata: asRecord(e.metadata),
              createdAt: e.created_at,
            },
          ]
        : [],
    );
    quotes = (quotesRes.data ?? []).map((q) => ({
      id: q.id,
      status: q.status,
      reason: q.reason,
      subtotal: Number(q.subtotal),
      discount: Number(q.discount ?? 0),
      taxesOrFees: Number(q.taxes_or_fees ?? 0),
      total: Number(q.total),
      createdAt: q.created_at ?? '',
      updatedAt: q.updated_at,
      expiresAt: q.expires_at,
      items: (q.items ?? []).map((i) => ({
        id: i.id,
        itemType: i.item_type,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        lineTotal: Number(i.line_total),
      })),
    }));
    inspections = (inspectionsRes.data ?? []).map((i) => ({
      id: i.id,
      findings: i.findings,
      recommendation: i.recommendation,
      createdAt: i.created_at ?? '',
    }));
    paidAt = paidRes.data ?? null;

    const mediaRows = mediaRes.data ?? [];
    const urls = new Map<string, string>();
    if (mediaRows.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from('job-media')
        .createSignedUrls(mediaRows.map((m) => m.storage_path), MEDIA_URL_SECONDS);
      if (signError) {
        console.error('job case media urls:', signError.message);
        incomplete = true;
      }
      for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
    }
    media = mediaRows.map((m) => ({
      id: m.id,
      kind: m.kind,
      createdAt: m.created_at,
      isPdf: m.storage_path.toLowerCase().endsWith('.pdf'),
      url: urls.get(m.storage_path) ?? null,
    }));
  }

  const beforeArrival = job != null && BEFORE_ARRIVAL.has(job.current_state);
  const lastLate = beforeArrival ? [...events].reverse().find((e) => e.eventType === 'running_late') : undefined;
  const lastWindow = beforeArrival
    ? [...events].reverse().find((e) => e.eventType === 'running_late' || e.eventType === 'eta_shared')
    : undefined;
  const eta: CaseEta | null =
    beforeArrival && job.eta_earliest && job.eta_latest
      ? {
          earliest: job.eta_earliest,
          latest: job.eta_latest,
          sharedAt: lastWindow?.createdAt ?? null,
          passed: new Date(job.eta_latest).getTime() < Date.now(),
        }
      : null;

  const parties: CaseParties = {
    customerId: job?.customer_id ?? input.viewerId,
    professionalId: job?.professional_id ?? null,
  };
  const latestQuote = quotes[0] ?? null;
  const latestInspection = inspections[0] ?? null;

  return {
    progress: buildProgress({
      role: input.role,
      bookingCreatedAt: input.bookingCreatedAt,
      bookingCancelled: input.bookingCancelled,
      job: job && {
        state: job.current_state,
        professionalId: job.professional_id,
        createdAt: job.created_at,
        acceptedAt: job.accepted_at,
        onTheWayAt: job.on_the_way_at,
        arrivedAt: job.arrived_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        cancelledAt: job.cancelled_at,
      },
      events,
      inspection: latestInspection?.createdAt ? { createdAt: latestInspection.createdAt } : null,
      quote: latestQuote?.createdAt
        ? { id: latestQuote.id, status: latestQuote.status, createdAt: latestQuote.createdAt, updatedAt: latestQuote.updatedAt }
        : null,
      paidAt,
    }),
    timeline: buildTimeline({
      role: input.role,
      viewerId: input.viewerId,
      parties,
      bookingCreatedAt: input.bookingCreatedAt,
      events,
      paidAt,
    }),
    quotes,
    inspections,
    media,
    paidAt,
    eta,
    lateReportedAt: lastLate?.createdAt ?? null,
    incomplete,
  };
}

/* ── Customer ─────────────────────────────────────────────────────────────── */

export interface CustomerCase extends CaseRecords {
  booking: {
    id: string;
    reference: string;
    status: string;
    scheduledStart: string;
    pricingModel: string;
    /** bookings.quoted_or_base_amount: the price at booking, before any quote. */
    bookedAmount: number | null;
    createdAt: string | null;
    problemSummary: string | null;
    intakeOptions: string[];
    unmatchedSince: string | null;
  };
  service: { id: string; name: string; description: string | null; categoryName: string | null } | null;
  property: { id: string; name: string; propertyType: string; address: string | null } | null;
  job: { id: string; state: string; arrivedAt: string | null } | null;
  professional: BookingProfessional | null;
  /** What job_payment_amount says is owed, in paise. Set only while payment is due. */
  amountDuePaise: number | null;
  /** Completed and unpaid, but job_payment_amount found no approved quote or booking price. */
  noPayableAmount: boolean;
  /** The quote waiting on this customer, if it can still be answered. */
  pendingQuote: QuoteForReview | null;
}

export async function getCustomerCase(userId: string, bookingId: string): Promise<CustomerCase | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, customer_id, booking_reference, scheduled_start, pricing_model, quoted_or_base_amount,
       booking_status, created_at, problem_summary, intake_options, unmatched_since,
       service:services!bookings_service_id_fkey (
         id, name, description, category:service_categories!services_category_id_fkey ( name )
       ),
       property:properties!bookings_property_id_fkey (
         id, name, property_type, address:addresses ( address_line_1, area, city )
       ),
       jobs!jobs_booking_id_fkey ( ${JOB_COLUMNS} )`,
    )
    .eq('id', bookingId)
    .eq('customer_id', userId)
    .maybeSingle();

  if (error) console.error('getCustomerCase:', error.message);
  if (!data) return null;

  const job = one<JobRow>(data.jobs);
  const service = one(data.service);
  const property = one(data.property);
  const address = one(property?.address);

  const [records, professional] = await Promise.all([
    loadRecords(supabase, {
      role: 'customer',
      viewerId: userId,
      bookingCreatedAt: data.created_at,
      bookingCancelled: data.booking_status === 'cancelled',
      job,
    }),
    getBookingProfessional(data.id),
  ]);

  let amountDuePaise: number | null = null;
  let noPayableAmount = false;
  if (job?.current_state === 'completed' && !records.paidAt) {
    const { data: paise, error: amountError } = await supabase.rpc('job_payment_amount', { p_job_id: job.id });
    if (amountError?.code === '22023') noPayableAmount = true;
    else if (amountError) console.error('getCustomerCase amount:', amountError.message);
    else if (paise != null && Number(paise) > 0) amountDuePaise = Number(paise);
  }

  const waiting = records.quotes.find((q) => q.status === 'pending_customer');
  const review = waiting ? await getQuoteForReview(userId, waiting.id) : null;

  return {
    ...records,
    booking: {
      id: data.id,
      reference: data.booking_reference,
      status: data.booking_status,
      scheduledStart: data.scheduled_start,
      pricingModel: data.pricing_model,
      bookedAmount: data.quoted_or_base_amount == null ? null : Number(data.quoted_or_base_amount),
      createdAt: data.created_at,
      problemSummary: data.problem_summary,
      intakeOptions: intakeOptionLabels(data.intake_options),
      unmatchedSince: data.unmatched_since,
    },
    service: service && {
      id: service.id,
      name: service.name,
      description: service.description,
      categoryName: one(service.category)?.name ?? null,
    },
    property: property && {
      id: property.id,
      name: property.name,
      propertyType: property.property_type,
      address: address ? [address.address_line_1, address.area, address.city].filter(Boolean).join(', ') : null,
    },
    job: job && { id: job.id, state: job.current_state, arrivedAt: job.arrived_at },
    professional,
    amountDuePaise,
    noPayableAmount,
    pendingQuote: review?.awaitingCustomer ? review : null,
  };
}

/* ── Professional ─────────────────────────────────────────────────────────── */

export interface ProfessionalCase extends CaseRecords {
  job: { id: string; state: string; offerExpiresAt: string | null; bookingId: string };
  booking: {
    reference: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    pricingModel: string | null;
    customerPrice: number | null;
    problemSummary: string | null;
    intakeOptions: string[];
  };
  serviceName: string;
  categoryName: string | null;
  inspectionFee: number | null;
  property: { name: string | null; propertyType: string | null };
  /** Name, phone and address; released by the database only after acceptance. */
  contact: JobCustomerContact | null;
  /** Area and city, released while the offer is open (get_offer_localities). */
  locality: { area: string | null; city: string; distanceKm: number | null } | null;
}

export async function getProfessionalCase(userId: string, jobId: string): Promise<ProfessionalCase | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      `${JOB_COLUMNS}, offer_expires_at, booking_id,
       booking:bookings!jobs_booking_id_fkey (
         booking_reference, scheduled_start, scheduled_end, created_at, booking_status,
         problem_summary, intake_options, pricing_model, quoted_or_base_amount,
         service:services!bookings_service_id_fkey (
           name, inspection_fee, category:service_categories!services_category_id_fkey ( name )
         )
       ),
       property:properties!jobs_property_id_fkey ( name, property_type )`,
    )
    .eq('id', jobId)
    .eq('professional_id', userId)
    .maybeSingle();

  if (error) console.error('getProfessionalCase:', error.message);
  if (!data) return null;

  const booking = one(data.booking);
  const service = one(booking?.service);
  const property = one(data.property);
  const offerOpen = data.current_state === 'assigned';

  const [records, contact, places] = await Promise.all([
    loadRecords(supabase, {
      role: 'professional',
      viewerId: userId,
      bookingCreatedAt: booking?.created_at ?? null,
      bookingCancelled: booking?.booking_status === 'cancelled',
      job: data,
    }),
    offerOpen ? Promise.resolve(null) : getJobCustomerContact(data.id),
    offerOpen ? supabase.rpc('get_offer_localities', { p_job_ids: [data.id] }) : Promise.resolve(null),
  ]);

  if (places?.error) console.error('getProfessionalCase locality:', places.error.message);
  const place = places?.data?.find((p) => p.job_id === data.id && p.city);

  return {
    ...records,
    job: { id: data.id, state: data.current_state, offerExpiresAt: data.offer_expires_at, bookingId: data.booking_id },
    booking: {
      reference: booking?.booking_reference ?? null,
      scheduledStart: booking?.scheduled_start ?? null,
      scheduledEnd: booking?.scheduled_end ?? null,
      pricingModel: booking?.pricing_model ?? null,
      customerPrice: booking?.quoted_or_base_amount == null ? null : Number(booking.quoted_or_base_amount),
      problemSummary: booking?.problem_summary ?? null,
      intakeOptions: intakeOptionLabels(booking?.intake_options),
    },
    serviceName: service?.name ?? 'Service',
    categoryName: one(service?.category)?.name ?? null,
    inspectionFee: service?.inspection_fee == null ? null : Number(service.inspection_fee),
    property: { name: property?.name ?? null, propertyType: property?.property_type ?? null },
    contact,
    locality: place ? { area: place.area ?? null, city: place.city, distanceKm: place.distance_km ?? null } : null,
  };
}
