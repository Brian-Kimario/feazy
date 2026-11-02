/**
 * Admin reads for server pages: metrics, job/professional/customer lists, payments, the unmatched
 * queue and the assignment-queue health. Not a server-action module: nothing here can be called
 * from the browser. Each function checks the admin role before it creates the service-role client.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { z } from 'zod';
import { missingProfessional } from '@/lib/shell/rules';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  openJobs: number;
  pendingVerifications: number;
  totalRevenuePaise: number;       // sum of payments.amount where status = 'paid' (in paise)
  revenueFormatted: string;        // e.g. "₹1,23,456"
  paidPaymentsCount: number;       // payments with status = 'paid'
  openNoShowReports: number;       // job_exceptions with status = 'open'
  jobsAddedToday: number;
  completedJobsTotal: number;
}

export interface AdminJob {
  id: string;
  current_state: string;
  created_at: string;
  completed_at: string | null;
  // Nested
  customer_name: string | null;
  customer_email: string | null;
  professional_name: string | null;
  professional_email: string | null;
  service_name: string | null;
  property_name: string | null;
  booking_reference: string | null;
  amount: number | null;
}

export interface AdminProfessional {
  user_id: string;
  display_name: string;
  full_name: string | null;
  email: string | null;
  verification_status: string;
  rating_average: number;
  completed_jobs_count: number;
  is_available: boolean;
  created_at: string;
}

export interface AdminPayment {
  id: string;
  customer_name: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  provider: string;
  created_at: string;
  paid_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dashboard metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns headline numbers for the admin overview page.
 * All counts fetched with COUNT(*) — no row reads, efficient on large tables.
 */
export async function getAdminMetrics(): Promise<{
  data: AdminMetrics | null;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: null, error: auth.error };

  try {
    const admin = await createTypedAdminClient();

    // Parallel fetches to minimise latency
    const [
      openJobsRes,
      pendingVerifRes,
      paidPaymentsRes,
      completedJobsRes,
      todayJobsRes,
      openExceptionsRes,
    ] = await Promise.all([
      // Open (non-terminal) jobs
      admin.from('jobs')
        .select('id', { count: 'exact', head: true })
        .not('current_state', 'in', '("completed","cancelled","closed")'),

      // Professionals pending verification
      admin.from('professional_profiles')
        .select('user_id', { count: 'exact', head: true })
        .not('verification_status', 'in', '("verified","suspended","rejected")'),

      // Sum of paid payments
      admin.from('payments')
        .select('amount')
        .eq('status', 'paid'),

      // Completed jobs total
      admin.from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('current_state', 'completed'),

      // Jobs created today
      admin.from('jobs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

      // Open no-show reports awaiting an admin decision
      admin.from('job_exceptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);

    // Revenue: sum amounts from paid payments
    const totalAmount: number = (paidPaymentsRes.data ?? []).reduce(
      (sum, p) => sum + Number(p.amount ?? 0),
      0,
    );

    // Format as INR with commas (Indian style: 1,23,456)
    const revenueFormatted = '₹' + formatIndianNumber(Math.round(totalAmount));

    return {
      data: {
        openJobs: openJobsRes.count ?? 0,
        pendingVerifications: pendingVerifRes.count ?? 0,
        totalRevenuePaise: Math.round(totalAmount * 100),
        revenueFormatted,
        paidPaymentsCount: ((paidPaymentsRes.data as unknown[]) ?? []).length,
        openNoShowReports: openExceptionsRes.count ?? 0,
        jobsAddedToday: todayJobsRes.count ?? 0,
        completedJobsTotal: completedJobsRes.count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error('[Admin] getAdminMetrics error:', err);
    return { data: null, error: 'Failed to load metrics' };
  }
}

function formatIndianNumber(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  // Last 3 digits, then groups of 2
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const groups = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return groups + ',' + last3;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. All jobs with filtering
// ─────────────────────────────────────────────────────────────────────────────

export interface JobFilters {
  status?: string;      // job current_state
  search?: string;      // booking_reference or customer/pro name
  limit?: number;
  offset?: number;
}

/**
 * Returns a paginated, filterable list of all jobs for the admin jobs page.
 */
export async function getAllJobs(filters: JobFilters = {}): Promise<{
  data: AdminJob[];
  total: number;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], total: 0, error: auth.error };

  try {
    const admin = await createTypedAdminClient();
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = admin.from('jobs')
      .select(`
        id, current_state, created_at, completed_at,
        bookings!inner (
          booking_reference, quoted_or_base_amount,
          services!inner (name)
        ),
        profiles!jobs_customer_id_fkey (full_name, email),
        professional_profiles!jobs_professional_id_fkey (
          display_name,
          profiles!professional_profiles_user_id_fkey (email)
        ),
        properties!jobs_property_id_fkey (name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status && filters.status !== 'all') {
      query = query.eq('current_state', filters.status);
    }

    const { data: raw, error, count } = await query;

    if (error) {
      console.error('[Admin] getAllJobs error:', error);
      return { data: [], total: 0, error: error.message };
    }

    const jobs: AdminJob[] = (raw ?? []).map((j) => ({
      id: j.id,
      current_state: j.current_state,
      created_at: j.created_at,
      completed_at: j.completed_at,
      customer_name: j.profiles?.full_name ?? null,
      customer_email: j.profiles?.email ?? null,
      professional_name: j.professional_profiles?.display_name ?? null,
      professional_email: j.professional_profiles?.profiles?.email ?? null,
      service_name: j.bookings?.services?.name ?? null,
      property_name: j.properties?.name ?? null,
      booking_reference: j.bookings?.booking_reference ?? null,
      amount: j.bookings?.quoted_or_base_amount ? Number(j.bookings.quoted_or_base_amount) : null,
    }));

    // Client-side search filter (booking_ref, customer name, pro name)
    // For MVP this is fine; a production implementation would use full-text search
    const filtered = filters.search
      ? jobs.filter((j) => {
          const q = filters.search!.toLowerCase();
          return (
            (j.booking_reference ?? '').toLowerCase().includes(q) ||
            (j.customer_name ?? '').toLowerCase().includes(q) ||
            (j.professional_name ?? '').toLowerCase().includes(q) ||
            (j.service_name ?? '').toLowerCase().includes(q)
          );
        })
      : jobs;

    return { data: filtered, total: count ?? 0, error: null };
  } catch (err) {
    console.error('[Admin] getAllJobs error:', err);
    return { data: [], total: 0, error: 'Failed to load jobs' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. All professionals (for admin management page)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all professional profiles including verified ones.
 * Used for the broader professionals management page (not just the verification queue).
 */
export async function getAllProfessionals(): Promise<{
  data: AdminProfessional[];
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  try {
    const admin = await createTypedAdminClient();

    const { data: raw, error } = await admin.from('professional_profiles')
      .select(`
        user_id, display_name, verification_status,
        rating_average, completed_jobs_count, is_available, created_at,
        profiles!professional_profiles_user_id_fkey (full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin] getAllProfessionals error:', error);
      return { data: [], error: error.message };
    }

    const professionals: AdminProfessional[] = (raw ?? []).map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      full_name: p.profiles?.full_name ?? null,
      email: p.profiles?.email ?? null,
      verification_status: p.verification_status,
      rating_average: Number(p.rating_average ?? 0),
      completed_jobs_count: Number(p.completed_jobs_count ?? 0),
      is_available: p.is_available ?? false,
      created_at: p.created_at,
    }));

    return { data: professionals, error: null };
  } catch (err) {
    console.error('[Admin] getAllProfessionals error:', err);
    return { data: [], error: 'Failed to load professionals' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Recent payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the 20 most recent payments for the admin overview / payments panel.
 */
export async function getRecentPayments(limit = 20): Promise<{
  data: AdminPayment[];
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  try {
    const admin = await createTypedAdminClient();

    const { data: raw, error } = await admin.from('payments')
      .select(`
        id, amount, currency, status, payment_type, provider, created_at, paid_at,
        profiles!payments_customer_id_fkey (full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Admin] getRecentPayments error:', error);
      return { data: [], error: error.message };
    }

    const payments: AdminPayment[] = (raw ?? []).map((p) => ({
      id: p.id,
      customer_name: p.profiles?.full_name ?? null,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      payment_type: p.payment_type,
      provider: p.provider,
      created_at: p.created_at,
      paid_at: p.paid_at,
    }));

    return { data: payments, error: null };
  } catch (err) {
    console.error('[Admin] getRecentPayments error:', err);
    return { data: [], error: 'Failed to load payments' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Customers Directory
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  properties_count: number;
  bookings_count: number;
}

export async function getAllCustomers(): Promise<{
  data: AdminCustomer[];
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  try {
    const admin = await createTypedAdminClient();

    const { data: profilesRaw, error: profileErr } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, created_at')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });

    if (profileErr) {
      console.error('[Admin] getAllCustomers error:', profileErr);
      return { data: [], error: profileErr.message };
    }

    const profiles = profilesRaw ?? [];
    if (profiles.length === 0) return { data: [], error: null };

    const customerIds = profiles.map((p) => p.id);

    // Count properties & bookings per customer
    const [propsRes, bookingsRes] = await Promise.all([
      admin
        .from('properties')
        .select('owner_customer_id')
        .in('owner_customer_id', customerIds),
      admin
        .from('bookings')
        .select('customer_id')
        .in('customer_id', customerIds),
    ]);

    const propCounts = new Map<string, number>();
    for (const p of (propsRes.data ?? [])) {
      propCounts.set(p.owner_customer_id, (propCounts.get(p.owner_customer_id) ?? 0) + 1);
    }

    const bookingCounts = new Map<string, number>();
    for (const b of (bookingsRes.data ?? [])) {
      bookingCounts.set(b.customer_id, (bookingCounts.get(b.customer_id) ?? 0) + 1);
    }

    const customers: AdminCustomer[] = profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      created_at: p.created_at,
      properties_count: propCounts.get(p.id) ?? 0,
      bookings_count: bookingCounts.get(p.id) ?? 0,
    }));

    return { data: customers, error: null };
  } catch (err) {
    console.error('[Admin] getAllCustomers error:', err);
    return { data: [], error: 'Failed to load customers' };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Unmatched bookings (matching v2)
// ─────────────────────────────────────────────────────────────────────────────

export interface UnmatchedBooking {
  id: string;
  reference: string;
  scheduledStart: string;
  /** overdue: start passed with no professional confirmed; unmatched: nobody eligible yet. */
  reason: 'overdue' | 'unmatched';
  unmatchedSince: string | null;
  serviceName: string;
  city: string | null;
  /** Offers that were declined or expired (booking_assignment_attempts). */
  attempts: number;
}

const jobStateSchema = z.object({ current_state: z.string() });

const unmatchedRowSchema = z.object({
  id: z.string(),
  booking_reference: z.string(),
  booking_status: z.string(),
  scheduled_start: z.string(),
  unmatched_since: z.string().nullable(),
  service: z.object({ name: z.string() }).nullable(),
  property: z.object({ address: z.object({ city: z.string().nullable() }).nullable() }).nullable(),
  // jobs.booking_id is unique, but PostgREST may still return the embed as a list.
  job: z.union([jobStateSchema, z.array(jobStateSchema)]).nullable(),
  attempts: z.array(z.object({ count: z.number() })),
});

/**
 * Open bookings with no confirmed professional: the matcher found nobody (unmatched_since),
 * or the start time passed first. Oldest start first. Admins have no RLS read on bookings,
 * so this uses the service-role client after the role check.
 */
export async function getUnmatchedBookings(): Promise<{ data: UnmatchedBooking[]; error: string | null }> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  const admin = await createTypedAdminClient();
  const { data, error } = await admin
    .from('bookings')
    .select(
      `id, booking_reference, booking_status, scheduled_start, unmatched_since,
       service:services!bookings_service_id_fkey ( name ),
       property:properties!bookings_property_id_fkey ( address:addresses ( city ) ),
       job:jobs!jobs_booking_id_fkey ( current_state ),
       attempts:booking_assignment_attempts ( count )`,
    )
    .or(`unmatched_since.not.is.null,scheduled_start.lt.${new Date().toISOString()}`)
    .not('booking_status', 'in', '("cancelled","completed")')
    .order('scheduled_start', { ascending: true })
    .limit(200);

  if (error) {
    console.error('getUnmatchedBookings:', error.message);
    return { data: [], error: 'Could not load unmatched bookings.' };
  }

  const parsed = z.array(unmatchedRowSchema).safeParse(data);
  if (!parsed.success) {
    console.error('getUnmatchedBookings: unexpected shape', parsed.error.issues[0]?.message);
    return { data: [], error: 'Could not read unmatched bookings.' };
  }

  const now = new Date();
  return {
    data: parsed.data.flatMap((row) => {
      const job = Array.isArray(row.job) ? row.job[0] : row.job;
      const reason = missingProfessional({
        bookingStatus: row.booking_status,
        jobState: job?.current_state ?? null,
        unmatchedSince: row.unmatched_since,
        startPassed: new Date(row.scheduled_start) < now,
      });
      if (!reason) return [];
      return [
        {
          id: row.id,
          reference: row.booking_reference,
          scheduledStart: row.scheduled_start,
          reason,
          unmatchedSince: row.unmatched_since,
          serviceName: row.service?.name ?? 'Service',
          city: row.property?.address?.city ?? null,
          attempts: row.attempts[0]?.count ?? 0,
        },
      ];
    }),
    error: null,
  };
}

export interface AssignmentQueueStatus {
  scheduled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  failures24h: number;
}

const queueStatusSchema = z.object({
  scheduled: z.boolean(),
  last_run_at: z.string().nullable(),
  last_status: z.string().nullable(),
  failures_24h: z.number(),
});

/** Health of the pg_cron job that runs process_assignment_queue, from cron.job_run_details. */
export async function getAssignmentQueueStatus(): Promise<AssignmentQueueStatus | null> {
  const auth = await requireAdmin();
  if ('error' in auth) return null;

  const admin = await createTypedAdminClient();
  const { data, error } = await admin.rpc('get_assignment_queue_status');
  if (error) {
    console.error('getAssignmentQueueStatus:', error.message);
    return null;
  }
  const parsed = queueStatusSchema.safeParse(data);
  if (!parsed.success) {
    console.error('getAssignmentQueueStatus: unexpected shape', parsed.error.issues[0]?.message);
    return null;
  }
  return {
    scheduled: parsed.data.scheduled,
    lastRunAt: parsed.data.last_run_at,
    lastStatus: parsed.data.last_status,
    failures24h: parsed.data.failures_24h,
  };
}
