import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isTerminal } from '@/lib/jobs/states';
import {
  bookingTab,
  isLiveState,
  isOfferOpen,
  isPaymentDue,
  isQuoteAwaitingCustomer,
  missingProfessional,
  type BookingTab,
} from '@/lib/shell/rules';

/**
 * Data behind the role shells (top bar counts, bell, active-job chip) and the dashboards.
 * Every query uses the RLS-scoped server client, and each loader is wrapped in React
 * `cache()` so the layout and the page share one round trip per request.
 */

/** Supabase returns an embedded row as an object, an array or null depending on the FK. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/* ── Customer ─────────────────────────────────────────────────────────────── */

export interface CustomerBooking {
  id: string;
  reference: string;
  bookingStatus: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  amount: number | null;
  createdAt: string;
  /** Set while the matcher has found no eligible professional. */
  unmatchedSince: string | null;
  serviceName: string;
  categoryName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  job: {
    id: string;
    state: string;
    completedAt: string | null;
  } | null;
  tab: BookingTab;
  /** The scheduled start is in the past. */
  startPassed: boolean;
  paymentDue: boolean;
  /** Quote the customer can approve or decline now, if any. */
  pendingQuote: { id: string; total: number } | null;
}

export interface CustomerInboxItem {
  kind: 'quote' | 'payment' | 'unmatched';
  id: string;
  bookingId: string;
  href: string;
  title: string;
  detail: string;
  /** Null for items with no amount (an unmatched booking). */
  amount: number | null;
}

export interface CustomerShellData {
  bookings: CustomerBooking[];
  /** Bookings on the Active tab that have a job (shown in the top-bar chip). */
  activeJobs: CustomerBooking[];
  inbox: CustomerInboxItem[];
  error: boolean;
}

/** All of the customer's bookings, newest first, with job, payment and quote status. */
export const getCustomerShell = cache(async (userId: string): Promise<CustomerShellData> => {
  const supabase = await createClient();
  const now = new Date();

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, booking_reference, booking_status, scheduled_start, scheduled_end, quoted_or_base_amount, created_at,
       unmatched_since,
       service:services!bookings_service_id_fkey ( name, category:service_categories!services_category_id_fkey ( name ) ),
       property:properties!bookings_property_id_fkey ( id, name ),
       job:jobs!jobs_booking_id_fkey (
         id, current_state, completed_at,
         payments:payments!payments_job_id_fkey ( status ),
         quotes:quotes!quotes_job_id_fkey ( id, status, total, expires_at, created_at )
       )`,
    )
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('getCustomerShell:', error.message);
    return { bookings: [], activeJobs: [], inbox: [], error: true };
  }

  const bookings: CustomerBooking[] = (data ?? []).map((row) => {
    const service = one(row.service);
    const category = one(service?.category);
    const property = one(row.property);
    const job = one(row.job);
    const jobState = job?.current_state ?? null;
    const paymentStatuses = (job?.payments ?? []).map((p) => p.status);
    const awaiting = (job?.quotes ?? [])
      .filter((q) => isQuoteAwaitingCustomer({ status: q.status, jobState, expiresAt: q.expires_at }, now))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];

    return {
      id: row.id,
      reference: row.booking_reference,
      bookingStatus: row.booking_status,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      amount: row.quoted_or_base_amount == null ? null : Number(row.quoted_or_base_amount),
      createdAt: row.created_at,
      unmatchedSince: row.unmatched_since,
      serviceName: service?.name ?? 'Service',
      categoryName: category?.name ?? null,
      propertyId: property?.id ?? null,
      propertyName: property?.name ?? null,
      job: job ? { id: job.id, state: job.current_state, completedAt: job.completed_at } : null,
      tab: bookingTab(
        { bookingStatus: row.booking_status, jobState, scheduledStart: row.scheduled_start },
        now,
      ),
      startPassed: row.scheduled_start != null && new Date(row.scheduled_start) < now,
      paymentDue: isPaymentDue({ jobState, paymentStatuses, amount: row.quoted_or_base_amount }),
      pendingQuote: awaiting ? { id: awaiting.id, total: Number(awaiting.total) } : null,
    };
  });

  const inbox: CustomerInboxItem[] = [];
  for (const b of bookings) {
    const missing = missingProfessional({
      bookingStatus: b.bookingStatus,
      jobState: b.job?.state ?? null,
      unmatchedSince: b.unmatchedSince,
      startPassed: b.startPassed,
    });
    if (missing) {
      inbox.push({
        kind: 'unmatched',
        id: `unmatched-${b.id}`,
        bookingId: b.id,
        href: `/customer/bookings/${b.id}`,
        title: missing === 'overdue' ? 'No professional was assigned' : 'No professional available yet',
        detail: `${b.serviceName} · ${b.reference}`,
        amount: null,
      });
    }
    if (b.pendingQuote) {
      inbox.push({
        kind: 'quote',
        id: b.pendingQuote.id,
        bookingId: b.id,
        href: `/customer?quote=${b.pendingQuote.id}`,
        title: 'Quote waiting for your approval',
        detail: `${b.serviceName} · ${b.reference}`,
        amount: b.pendingQuote.total,
      });
    }
    if (b.paymentDue && b.amount != null) {
      inbox.push({
        kind: 'payment',
        id: `pay-${b.id}`,
        bookingId: b.id,
        href: `/customer/bookings/${b.id}`,
        title: 'Payment due',
        detail: `${b.serviceName} · ${b.reference}`,
        amount: b.amount,
      });
    }
  }

  const activeJobs = bookings.filter((b) => b.tab === 'active' && b.job && !isTerminal(b.job.state));

  return { bookings, activeJobs, inbox, error: false };
});

export interface DashboardCategory {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
}

export interface DashboardProperty {
  id: string;
  name: string;
  propertyType: string;
  city: string | null;
  area: string | null;
}

/** Active service categories and the customer's properties, for the dashboard's side column. */
export async function getCustomerDashboardExtras(userId: string): Promise<{
  categories: DashboardCategory[];
  properties: DashboardProperty[];
  error: boolean;
}> {
  const supabase = await createClient();
  const [categoriesResult, propertiesResult] = await Promise.all([
    supabase
      .from('service_categories')
      .select('id, name, description, icon_key')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('properties')
      .select('id, name, property_type, address:addresses ( city, area )')
      .eq('owner_customer_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (categoriesResult.error) console.error('getCustomerDashboardExtras categories:', categoriesResult.error.message);
  if (propertiesResult.error) console.error('getCustomerDashboardExtras properties:', propertiesResult.error.message);

  return {
    categories: (categoriesResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      iconKey: c.icon_key,
    })),
    properties: (propertiesResult.data ?? []).map((p) => {
      const address = one(p.address);
      return {
        id: p.id,
        name: p.name,
        propertyType: p.property_type,
        city: address?.city ?? null,
        area: address?.area ?? null,
      };
    }),
    error: Boolean(categoriesResult.error || propertiesResult.error),
  };
}

export interface QuoteForReview {
  id: string;
  jobId: string;
  bookingId: string | null;
  reference: string;
  serviceName: string;
  propertyName: string;
  proName: string;
  reason: string;
  subtotal: number;
  discount: number;
  taxesOrFees: number;
  total: number;
  expiresAt: string | null;
  /** False when the quote can no longer be approved or declined (answered, expired, job moved on). */
  awaitingCustomer: boolean;
  items: {
    id: string;
    itemType: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

/**
 * One quote with its line items, for the approval drawer. RLS limits quotes to the
 * customer's own jobs, and the job's customer is checked again here.
 */
export async function getQuoteForReview(userId: string, quoteId: string): Promise<QuoteForReview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('quotes')
    .select(
      `id, job_id, status, reason, subtotal, discount, taxes_or_fees, total, expires_at,
       items:quote_items!quote_items_quote_id_fkey ( id, item_type, description, quantity, unit_price, line_total ),
       professional:professional_profiles!quotes_professional_id_fkey ( display_name ),
       job:jobs!quotes_job_id_fkey (
         customer_id, current_state, booking_id,
         booking:bookings!jobs_booking_id_fkey ( booking_reference, service:services!bookings_service_id_fkey ( name ) ),
         property:properties!jobs_property_id_fkey ( name )
       )`,
    )
    .eq('id', quoteId)
    .maybeSingle();

  if (error) {
    console.error('getQuoteForReview:', error.message);
    return null;
  }
  const job = one(data?.job);
  if (!data || !job || job.customer_id !== userId) return null;

  const booking = one(job.booking);
  return {
    id: data.id,
    jobId: data.job_id,
    bookingId: job.booking_id,
    reference: booking?.booking_reference ?? '',
    serviceName: one(booking?.service)?.name ?? 'Service',
    propertyName: one(job.property)?.name ?? '',
    proName: one(data.professional)?.display_name ?? 'Your professional',
    reason: data.reason ?? '',
    subtotal: Number(data.subtotal ?? 0),
    discount: Number(data.discount ?? 0),
    taxesOrFees: Number(data.taxes_or_fees ?? 0),
    total: Number(data.total ?? 0),
    expiresAt: data.expires_at,
    awaitingCustomer: isQuoteAwaitingCustomer(
      { status: data.status, jobState: job.current_state, expiresAt: data.expires_at },
      new Date(),
    ),
    items: (data.items ?? []).map((i) => ({
      id: i.id,
      itemType: i.item_type,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
  };
}

/* ── Professional ─────────────────────────────────────────────────────────── */

/** bookings.intake_options is [{option, label, ...}]; anything else is ignored. */
export function intakeOptionLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { option, label } = item as { option?: unknown; label?: unknown };
    if (typeof label !== 'string' || !label) return [];
    return [typeof option === 'string' && option ? `${option}: ${label}` : label];
  });
}

export interface ProJob {
  id: string;
  state: string;
  bookingId: string | null;
  reference: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  serviceName: string;
  categoryName: string | null;
  propertyType: string | null;
  offerExpiresAt: string | null;
  completedAt: string | null;
  /** The customer's description, written to be read before accepting. */
  problemSummary: string | null;
  /** Labels of the options chosen at booking, e.g. "Number of taps: 2". */
  intakeOptions: string[];
  /** bookings.pricing_model, copied from the service when the booking was made. */
  pricingModel: string | null;
  /** bookings.quoted_or_base_amount: what the customer is charged before any quote. */
  customerPrice: number | null;
  /** services.inspection_fee, for inspection-priced services. */
  inspectionFee: number | null;
  /** Area and city of the property, released for open offers only (get_offer_localities). */
  locality: { area: string | null; city: string; distanceKm: number | null } | null;
}

export interface ProShellData {
  displayName: string | null;
  verificationStatus: string | null;
  rejectionReason: string | null;
  isAvailable: boolean;
  /** Offers waiting for this professional's answer, soonest expiry first. */
  requests: ProJob[];
  /** Accepted or live jobs, soonest scheduled first. */
  upcoming: ProJob[];
  /** Most recently updated job where the pro is travelling or on site. */
  liveJob: ProJob | null;
  error: boolean;
}

const OPEN_JOB_STATES = ['assigned', 'accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending'];

const PRO_JOB_SELECT = `id, current_state, offer_expires_at, completed_at, updated_at,
  booking:bookings!jobs_booking_id_fkey (
    id, booking_reference, scheduled_start, scheduled_end,
    problem_summary, intake_options, pricing_model, quoted_or_base_amount,
    service:services!bookings_service_id_fkey (
      name, inspection_fee, category:service_categories!services_category_id_fkey ( name )
    )
  ),
  property:properties!jobs_property_id_fkey ( property_type )`;

export const getProfessionalShell = cache(async (userId: string): Promise<ProShellData> => {
  const supabase = await createClient();
  const now = new Date();

  const [profileRes, jobsRes] = await Promise.all([
    supabase
      .from('professional_profiles')
      .select('display_name, verification_status, is_available')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('jobs')
      .select(PRO_JOB_SELECT)
      .eq('professional_id', userId)
      .in('current_state', OPEN_JOB_STATES)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  const profile = profileRes.data;
  const status = profile?.verification_status ?? null;

  let rejectionReason: string | null = null;
  if (status === 'rejected') {
    const { data: review } = await supabase
      .from('professional_verifications')
      .select('rejection_reason')
      .eq('professional_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    rejectionReason = review?.rejection_reason ?? null;
  }

  if (profileRes.error) console.error('getProfessionalShell profile:', profileRes.error.message);
  if (jobsRes.error) console.error('getProfessionalShell jobs:', jobsRes.error.message);

  const jobs: ProJob[] = (jobsRes.data ?? []).map((row) => {
    const booking = one(row.booking);
    const service = one(booking?.service);
    const category = one(service?.category);
    const property = one(row.property);
    return {
      id: row.id,
      state: row.current_state,
      bookingId: booking?.id ?? null,
      reference: booking?.booking_reference ?? null,
      scheduledStart: booking?.scheduled_start ?? null,
      scheduledEnd: booking?.scheduled_end ?? null,
      serviceName: service?.name ?? 'Service',
      categoryName: category?.name ?? null,
      propertyType: property?.property_type ?? null,
      offerExpiresAt: row.offer_expires_at,
      completedAt: row.completed_at,
      problemSummary: booking?.problem_summary ?? null,
      intakeOptions: intakeOptionLabels(booking?.intake_options),
      pricingModel: booking?.pricing_model ?? null,
      customerPrice: booking?.quoted_or_base_amount == null ? null : Number(booking.quoted_or_base_amount),
      inspectionFee: service?.inspection_fee == null ? null : Number(service.inspection_fee),
      locality: null,
    };
  });

  const byStart = (a: ProJob, b: ProJob) =>
    (a.scheduledStart ?? '9999').localeCompare(b.scheduledStart ?? '9999');

  const requests = jobs
    .filter((j) => j.state === 'assigned' && isOfferOpen(j.offerExpiresAt, now))
    .sort((a, b) => (a.offerExpiresAt ?? '9999').localeCompare(b.offerExpiresAt ?? '9999'));
  const upcoming = jobs.filter((j) => j.state !== 'assigned').sort(byStart);

  // Address columns are hidden until acceptance; the RPC releases area and city for offers.
  if (requests.length > 0) {
    const { data: places, error: placesError } = await supabase.rpc('get_offer_localities', {
      p_job_ids: requests.map((j) => j.id),
    });
    if (placesError) console.error('getProfessionalShell localities:', placesError.message);
    for (const place of places ?? []) {
      const job = requests.find((j) => j.id === place.job_id);
      if (job && place.city) {
        job.locality = {
          area: place.area ?? null,
          city: place.city,
          distanceKm: place.distance_km == null ? null : Number(place.distance_km),
        };
      }
    }
  }
  // `jobs` is ordered by updated_at desc, so the first live one is the most recent.
  const liveJob = jobs.find((j) => isLiveState(j.state)) ?? null;

  return {
    displayName: profile?.display_name ?? null,
    verificationStatus: status,
    rejectionReason,
    isAvailable: profile?.is_available ?? false,
    requests,
    upcoming,
    liveJob,
    error: Boolean(profileRes.error || jobsRes.error),
  };
});

export interface ProWeekSummary {
  completedCount: number;
  /** Sum of the approved quote total, else the booking amount, for jobs completed since `since`. */
  jobValue: number;
  /** Completed jobs with neither an approved quote nor a booking amount; left out of `jobValue`. */
  unpricedCount: number;
  since: string;
  error: boolean;
}

/** Jobs this professional completed since `since` and their value to the customer. */
export async function getProfessionalCompletedSince(userId: string, since: Date): Promise<ProWeekSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      `id, completed_at,
       booking:bookings!jobs_booking_id_fkey ( quoted_or_base_amount ),
       quotes:quotes!quotes_job_id_fkey ( status, total )`,
    )
    .eq('professional_id', userId)
    .in('current_state', ['completed', 'closed'])
    .gte('completed_at', since.toISOString());

  if (error) {
    console.error('getProfessionalCompletedSince:', error.message);
    return { completedCount: 0, jobValue: 0, unpricedCount: 0, since: since.toISOString(), error: true };
  }

  let jobValue = 0;
  let unpricedCount = 0;
  for (const row of data ?? []) {
    const approved = (row.quotes ?? []).find((q) => q.status === 'approved');
    const raw = approved ? approved.total : one(row.booking)?.quoted_or_base_amount;
    const amount = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(amount)) jobValue += amount;
    else unpricedCount += 1;
  }

  return { completedCount: data?.length ?? 0, jobValue, unpricedCount, since: since.toISOString(), error: false };
}

/**
 * All-time completed jobs, counted from `jobs`. `professional_profiles.completed_jobs_count`
 * is not maintained by any trigger, so it is not used.
 */
export async function getProfessionalCompletedCount(userId: string): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', userId)
    .in('current_state', ['completed', 'closed']);
  if (error) {
    console.error('getProfessionalCompletedCount:', error.message);
    return null;
  }
  return count ?? 0;
}
