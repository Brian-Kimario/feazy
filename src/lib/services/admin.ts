'use server';

/**
 * Admin Service — central data layer for the admin panel.
 *
 * All exported functions require admin role (verified server-side).
 * Uses the admin (service-role) Supabase client so RLS does not block
 * cross-user reads.
 *
 * NOTE: @ts-ignore comments suppress Supabase SDK "never" type errors caused
 * by the absence of generated database types — consistent with the rest of
 * the codebase (see admin.ts, verification.ts).
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { adminTransition } from './verification-transition';
import { missingProfessional } from '@/lib/shell/rules';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  openJobs: number;
  pendingVerifications: number;
  totalRevenuePaise: number;       // sum of paid payments (stored in smallest unit)
  revenueFormatted: string;        // e.g. "₹1,23,456"
  activeDisputes: number;          // placeholder — complaints table not in MVP schema
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

export interface AttentionItem {
  id: string;
  label: string;
  sub: string;
  priority: 'high' | 'medium' | 'low';
  link: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile as any).role !== 'admin') return { error: 'Not authorised' };
  return { userId: user.id };
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
    const admin = await createAdminClient();

    // Parallel fetches to minimise latency
    const [
      openJobsRes,
      pendingVerifRes,
      paidPaymentsRes,
      completedJobsRes,
      todayJobsRes,
    ] = await Promise.all([
      // Open (non-terminal) jobs
      // @ts-ignore
      (admin as any).from('jobs')
        .select('id', { count: 'exact', head: true })
        .not('current_state', 'in', '("completed","cancelled","closed")'),

      // Professionals pending verification
      // @ts-ignore
      (admin as any).from('professional_profiles')
        .select('user_id', { count: 'exact', head: true })
        .not('verification_status', 'in', '("verified","suspended","rejected")'),

      // Sum of paid payments
      // @ts-ignore
      (admin as any).from('payments')
        .select('amount')
        .eq('status', 'paid'),

      // Completed jobs total
      // @ts-ignore
      (admin as any).from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('current_state', 'completed'),

      // Jobs created today
      // @ts-ignore
      (admin as any).from('jobs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

    // Revenue: sum amounts from paid payments
    const totalAmount: number = ((paidPaymentsRes.data as any[]) ?? []).reduce(
      (sum: number, p: any) => sum + Number(p.amount ?? 0),
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
        activeDisputes: 0, // complaints table not in MVP schema
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
// 2. Attention queue — jobs that need admin action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns up to 10 jobs needing admin attention:
 * - Jobs stuck in assigned/accepted for > 2 hours (professional unresponsive)
 * - Jobs with pending quotes older than 12 hours (customer hasn't approved)
 * - Recently cancelled jobs
 */
export async function getAttentionQueue(): Promise<{
  data: AttentionItem[];
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  try {
    const admin = await createAdminClient();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [stuckAssignedRes, stuckQuoteRes, recentCancelledRes] = await Promise.all([
      // Jobs assigned but not accepted for > 2h
      // @ts-ignore
      (admin as any).from('jobs')
        .select(`
          id, current_state, created_at,
          bookings!inner (booking_reference),
          professional_profiles!jobs_professional_id_fkey (display_name),
          profiles!jobs_customer_id_fkey (full_name)
        `)
        .in('current_state', ['assigned'])
        .lt('created_at', twoHoursAgo)
        .order('created_at', { ascending: true })
        .limit(5),

      // Jobs with quotes pending > 12h
      // @ts-ignore
      (admin as any).from('quotes')
        .select(`
          id, created_at,
          jobs!inner (
            id, current_state,
            bookings!inner (booking_reference),
            profiles!jobs_customer_id_fkey (full_name)
          )
        `)
        .eq('status', 'pending_customer')
        .lt('created_at', twelveHoursAgo)
        .order('created_at', { ascending: true })
        .limit(5),

      // Recently cancelled jobs
      // @ts-ignore
      (admin as any).from('jobs')
        .select(`
          id, current_state, cancelled_at,
          bookings!inner (booking_reference),
          profiles!jobs_customer_id_fkey (full_name)
        `)
        .eq('current_state', 'cancelled')
        .gte('cancelled_at', oneDayAgo)
        .order('cancelled_at', { ascending: false })
        .limit(3),
    ]);

    const items: AttentionItem[] = [];

    // Stuck assigned jobs
    for (const job of (stuckAssignedRes.data as any[]) ?? []) {
      const ref = job.bookings?.booking_reference ?? job.id.slice(0, 8);
      const proName = job.professional_profiles?.display_name ?? 'Unknown pro';
      const hoursAgo = Math.round((Date.now() - new Date(job.created_at).getTime()) / 3600000);
      items.push({
        id: job.id,
        label: `Job unaccepted ${hoursAgo}h`,
        sub: `${ref} · ${proName} not yet accepted`,
        priority: hoursAgo > 6 ? 'high' : 'medium',
        link: `/admin/jobs?id=${job.id}`,
      });
    }

    // Pending quotes
    for (const quote of (stuckQuoteRes.data as any[]) ?? []) {
      const job = quote.jobs as any;
      if (!job) continue;
      const ref = job.bookings?.booking_reference ?? job.id?.slice(0, 8);
      const custName = job.profiles?.full_name ?? 'Customer';
      const hoursAgo = Math.round((Date.now() - new Date(quote.created_at).getTime()) / 3600000);
      items.push({
        id: quote.id,
        label: `Quote pending ${hoursAgo}h`,
        sub: `${ref} · ${custName} hasn't approved`,
        priority: hoursAgo > 24 ? 'high' : 'medium',
        link: `/admin/jobs?id=${job.id}`,
      });
    }

    // Cancelled jobs
    for (const job of (recentCancelledRes.data as any[]) ?? []) {
      const ref = job.bookings?.booking_reference ?? job.id.slice(0, 8);
      const custName = job.profiles?.full_name ?? 'Customer';
      items.push({
        id: job.id,
        label: 'Job cancelled',
        sub: `${ref} · ${custName}`,
        priority: 'low',
        link: `/admin/jobs?id=${job.id}`,
      });
    }

    // Sort by priority then deduplicate by id
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return { data: items.slice(0, 10), error: null };
  } catch (err) {
    console.error('[Admin] getAttentionQueue error:', err);
    return { data: [], error: 'Failed to load attention queue' };
  }
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
    const admin = await createAdminClient();
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    // @ts-ignore
    let query = (admin as any).from('jobs')
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
      return { data: [], total: 0, error: (error as any).message };
    }

    const jobs: AdminJob[] = ((raw as any[]) ?? []).map((j: any) => ({
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
    const admin = await createAdminClient();

    // @ts-ignore
    const { data: raw, error } = await (admin as any).from('professional_profiles')
      .select(`
        user_id, display_name, verification_status,
        rating_average, completed_jobs_count, is_available, created_at,
        profiles!professional_profiles_user_id_fkey (full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin] getAllProfessionals error:', error);
      return { data: [], error: (error as any).message };
    }

    const professionals: AdminProfessional[] = ((raw as any[]) ?? []).map((p: any) => ({
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
    const admin = await createAdminClient();

    // @ts-ignore
    const { data: raw, error } = await (admin as any).from('payments')
      .select(`
        id, amount, currency, status, payment_type, provider, created_at, paid_at,
        profiles!payments_customer_id_fkey (full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Admin] getRecentPayments error:', error);
      return { data: [], error: (error as any).message };
    }

    const payments: AdminPayment[] = ((raw as any[]) ?? []).map((p: any) => ({
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
// 6. Admin job actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel a job (admin only). Sets current_state → 'cancelled' via the state
 * machine function so the job_events log is written correctly.
 */
export async function adminCancelJob(jobId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('transition_job_state', {
      p_job_id: jobId,
      p_new_state: 'cancelled',
      p_actor_user_id: auth.userId,
    });

    if (error) {
      console.error('[Admin] adminCancelJob error:', error);
      return { success: false, error: (error as any).message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('[Admin] adminCancelJob error:', err);
    return { success: false, error: 'Failed to cancel job' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Suspend / reactivate professional
// ─────────────────────────────────────────────────────────────────────────────

export async function suspendProfessional(professionalId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    const supabase = await createClient();

    const { error } = await adminTransition(supabase, professionalId, 'suspend', 'Professional suspended by admin');

    if (error) return { success: false, error: (error as any).message };

    // Audit log
    const admin = await createAdminClient();
    // @ts-ignore
    await (admin as any).from('audit_logs').insert({
      user_id: professionalId,
      action: 'professional_suspended',
      changes: { verification_status: 'suspended' },
      created_by: auth.userId,
    });

    return { success: true, error: null };
  } catch (err) {
    console.error('[Admin] suspendProfessional error:', err);
    return { success: false, error: 'Failed to suspend professional' };
  }
}

export async function reactivateProfessional(professionalId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { success: false, error: auth.error };

  try {
    const supabase = await createClient();

    const { error } = await adminTransition(supabase, professionalId, 'reactivate', 'Professional reactivated by admin');

    if (error) return { success: false, error: (error as any).message };

    // Audit log
    const admin = await createAdminClient();
    // @ts-ignore
    await (admin as any).from('audit_logs').insert({
      user_id: professionalId,
      action: 'professional_reactivated',
      changes: { verification_status: 'verified' },
      created_by: auth.userId,
    });

    return { success: true, error: null };
  } catch (err) {
    console.error('[Admin] reactivateProfessional error:', err);
    return { success: false, error: 'Failed to reactivate professional' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Full Job Detail Inspector
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminJobDetail {
  id: string;
  booking_id: string;
  current_state: string;
  created_at: string;
  accepted_at: string | null;
  on_the_way_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  closed_at: string | null;

  booking: {
    reference: string;
    scheduled_start: string;
    scheduled_end: string | null;
    pricing_model: string;
    quoted_or_base_amount: number | null;
    status: string;
    service_name: string;
    service_category: string | null;
  };

  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  };

  professional: {
    id: string;
    display_name: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    verification_status: string;
    rating_average: number;
    completed_jobs_count: number;
  };

  property: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    postal_code: string;
  };

  inspection: {
    id: string;
    findings: string;
    recommendation: string | null;
    created_at: string;
  } | null;

  quotes: Array<{
    id: string;
    subtotal: number;
    taxes_or_fees: number;
    discount: number;
    total: number;
    reason: string;
    status: string;
    created_at: string;
    items: Array<{
      id: string;
      item_type: string;
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
  }>;

  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    payment_type: string;
    provider: string;
    paid_at: string | null;
    created_at: string;
  }>;

  events: Array<{
    id: string;
    from_state: string;
    to_state: string;
    event_type: string;
    created_at: string;
    actor_name: string | null;
  }>;
}

export async function getAdminJobDetail(jobId: string): Promise<{
  data: AdminJobDetail | null;
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: null, error: auth.error };

  try {
    const admin = await createAdminClient();

    // 1. Fetch core job record with relations
    // @ts-ignore
    const { data: jobRaw, error: jobError } = await (admin as any)
      .from('jobs')
      .select(`
        id, booking_id, current_state, created_at,
        accepted_at, on_the_way_at, arrived_at, started_at,
        completed_at, cancelled_at, closed_at,
        bookings!inner (
          id, booking_reference, scheduled_start, scheduled_end,
          pricing_model, quoted_or_base_amount, booking_status,
          services!inner (
            name,
            service_categories (name)
          )
        ),
        profiles!jobs_customer_id_fkey (id, full_name, email, phone),
        professional_profiles!jobs_professional_id_fkey (
          user_id, display_name, verification_status, rating_average, completed_jobs_count,
          profiles!professional_profiles_user_id_fkey (full_name, email, phone)
        ),
        properties!jobs_property_id_fkey (id, name, address_line1, city, postal_code)
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !jobRaw) {
      console.error('[Admin] getAdminJobDetail job fetch error:', jobError);
      return { data: null, error: jobError?.message || 'Job not found' };
    }

    // 2. Fetch parallel sub-records: inspections, quotes with items, payments, events
    const [inspectionsRes, quotesRes, paymentsRes, eventsRes] = await Promise.all([
      // @ts-ignore
      (admin as any)
        .from('inspections')
        .select('id, findings, recommendation, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1),

      // @ts-ignore
      (admin as any)
        .from('quotes')
        .select(`
          id, subtotal, taxes_or_fees, discount, total, reason, status, created_at,
          quote_items (id, item_type, description, quantity, unit_price, line_total)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),

      // @ts-ignore
      (admin as any)
        .from('payments')
        .select('id, amount, currency, status, payment_type, provider, paid_at, created_at')
        .or(`job_id.eq.${jobId},booking_id.eq.${jobRaw.booking_id}`)
        .order('created_at', { ascending: false }),

      // @ts-ignore
      (admin as any)
        .from('job_events')
        .select(`
          id, from_state, to_state, event_type, created_at,
          profiles!job_events_actor_user_id_fkey (full_name)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
    ]);

    const latestInspection = (inspectionsRes.data as any[])?.[0] ?? null;

    const formattedQuotes = ((quotesRes.data as any[]) ?? []).map((q: any) => ({
      id: q.id,
      subtotal: Number(q.subtotal ?? 0),
      taxes_or_fees: Number(q.taxes_or_fees ?? 0),
      discount: Number(q.discount ?? 0),
      total: Number(q.total ?? 0),
      reason: q.reason ?? '',
      status: q.status,
      created_at: q.created_at,
      items: ((q.quote_items as any[]) ?? []).map((it: any) => ({
        id: it.id,
        item_type: it.item_type,
        description: it.description,
        quantity: Number(it.quantity ?? 1),
        unit_price: Number(it.unit_price ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    }));

    const formattedPayments = ((paymentsRes.data as any[]) ?? []).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      currency: p.currency ?? 'INR',
      status: p.status,
      payment_type: p.payment_type,
      provider: p.provider,
      paid_at: p.paid_at,
      created_at: p.created_at,
    }));

    const formattedEvents = ((eventsRes.data as any[]) ?? []).map((e: any) => ({
      id: e.id,
      from_state: e.from_state,
      to_state: e.to_state,
      event_type: e.event_type,
      created_at: e.created_at,
      actor_name: e.profiles?.full_name ?? null,
    }));

    const booking = jobRaw.bookings;
    const customer = jobRaw.profiles;
    const proProfile = jobRaw.professional_profiles;
    const proUser = proProfile?.profiles;
    const property = jobRaw.properties;

    const detail: AdminJobDetail = {
      id: jobRaw.id,
      booking_id: jobRaw.booking_id,
      current_state: jobRaw.current_state,
      created_at: jobRaw.created_at,
      accepted_at: jobRaw.accepted_at,
      on_the_way_at: jobRaw.on_the_way_at,
      arrived_at: jobRaw.arrived_at,
      started_at: jobRaw.started_at,
      completed_at: jobRaw.completed_at,
      cancelled_at: jobRaw.cancelled_at,
      closed_at: jobRaw.closed_at,

      booking: {
        reference: booking?.booking_reference ?? '—',
        scheduled_start: booking?.scheduled_start ?? jobRaw.created_at,
        scheduled_end: booking?.scheduled_end ?? null,
        pricing_model: booking?.pricing_model ?? 'fixed',
        quoted_or_base_amount: booking?.quoted_or_base_amount ? Number(booking.quoted_or_base_amount) : null,
        status: booking?.booking_status ?? 'pending',
        service_name: booking?.services?.name ?? 'General Service',
        service_category: booking?.services?.service_categories?.name ?? null,
      },

      customer: {
        id: customer?.id ?? '',
        name: customer?.full_name ?? 'Anonymous Customer',
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
      },

      professional: {
        id: proProfile?.user_id ?? '',
        display_name: proProfile?.display_name ?? 'Unassigned',
        full_name: proUser?.full_name ?? null,
        email: proUser?.email ?? null,
        phone: proUser?.phone ?? null,
        verification_status: proProfile?.verification_status ?? 'pending',
        rating_average: Number(proProfile?.rating_average ?? 0),
        completed_jobs_count: Number(proProfile?.completed_jobs_count ?? 0),
      },

      property: {
        id: property?.id ?? '',
        name: property?.name ?? 'Default Property',
        address_line1: property?.address_line1 ?? 'Address not specified',
        city: property?.city ?? 'Bengaluru',
        postal_code: property?.postal_code ?? '—',
      },

      inspection: latestInspection
        ? {
            id: latestInspection.id,
            findings: latestInspection.findings,
            recommendation: latestInspection.recommendation,
            created_at: latestInspection.created_at,
          }
        : null,

      quotes: formattedQuotes,
      payments: formattedPayments,
      events: formattedEvents,
    };

    return { data: detail, error: null };
  } catch (err: any) {
    console.error('[Admin] getAdminJobDetail unexpected error:', err);
    return { data: null, error: err?.message || 'Failed to load job detail' };
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
    const admin = await createAdminClient();

    // @ts-ignore
    const { data: profilesRaw, error: profileErr } = await (admin as any)
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

    const customerIds = profiles.map((p: any) => p.id);

    // Count properties & bookings per customer
    const [propsRes, bookingsRes] = await Promise.all([
      // @ts-ignore
      (admin as any)
        .from('properties')
        .select('owner_id')
        .in('owner_id', customerIds),
      // @ts-ignore
      (admin as any)
        .from('bookings')
        .select('customer_id')
        .in('customer_id', customerIds),
    ]);

    const propCounts = new Map<string, number>();
    for (const p of (propsRes.data as any[]) ?? []) {
      propCounts.set(p.owner_id, (propCounts.get(p.owner_id) ?? 0) + 1);
    }

    const bookingCounts = new Map<string, number>();
    for (const b of (bookingsRes.data as any[]) ?? []) {
      bookingCounts.set(b.customer_id, (bookingCounts.get(b.customer_id) ?? 0) + 1);
    }

    const customers: AdminCustomer[] = profiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      created_at: p.created_at,
      properties_count: propCounts.get(p.id) ?? 0,
      bookings_count: bookingCounts.get(p.id) ?? 0,
    }));

    return { data: customers, error: null };
  } catch (err: any) {
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

  const admin = await createAdminClient();
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

  const admin = await createAdminClient();
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
