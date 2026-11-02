'use server';

/**
 * Admin Service: client-callable job actions (reconcile, cancel) and the job detail inspector.
 *
 * Every export here is an endpoint, so each must be guarded in its own body (see
 * admin-authorization.test.ts). Page-only reads (metrics, lists, queue status) live in
 * admin-reads.ts, which is not a server-action module and cannot be called from the browser.
 */

import { createClient } from '@/lib/supabase/server';
import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, isAdminFailure, type AdminResult } from '@/lib/admin/result';
import { runAdminAction } from '@/lib/admin/action';
import {
  cancelJobInput,
  reconcileJobInput,
  type CancelJobResult,
  type ReconcileJobRefusal,
  type ReconcileJobResult,
} from '@/validators/admin';
import { revalidatePath } from 'next/cache';

export type {
  AdminMetrics,
  AdminJob,
  AdminProfessional,
  AdminPayment,
  JobFilters,
  AdminCustomer,
  UnmatchedBooking,
  AssignmentQueueStatus,
} from './admin-reads';

/**
 * Reconcile a job whose booking was already cancelled (admin only). The database function
 * re-verifies the admin, locks booking then job, rejects a stale or ineligible job as a typed value,
 * moves the job through `transition_job_state`, and never touches payments. It runs on the
 * user-scoped client so `auth.uid()` is the admin. The customer is not messaged.
 */
export async function adminReconcileJob(
  input: unknown,
): Promise<AdminResult<ReconcileJobResult>> {
  return runAdminAction({
    name: 'admin.job.reconcile',
    schema: reconcileJobInput,
    input,
    targetType: 'job',
    targetId: (i) => i.jobId,
    reason: (i) => i.reason,
    execute: async ({ input: i }): Promise<AdminResult<ReconcileJobResult>> => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_reconcile_job', {
        p_job_id: i.jobId,
        p_expected_state: i.expectedState,
        p_reason: i.reason,
      });
      if (error) {
        const actionable = ['22023', '42501', 'P0002'].includes(error.code);
        return adminFailure('FAILED', actionable ? error.message : 'The job could not be reconciled');
      }
      const result = data as unknown as ReconcileJobResult | ReconcileJobRefusal | null;
      if (!result || !result.ok) {
        const refusal = result as ReconcileJobRefusal | null;
        return adminFailure('FAILED', refusal?.message ?? 'The job could not be reconciled');
      }
      revalidatePath('/admin/operations');
      revalidatePath('/admin/jobs');
      return { ok: true, data: result as ReconcileJobResult };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Admin job actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel a job (admin only). Goes through `admin_cancel_job`, which locks the job, checks the
 * expected state, uses the canonical `transition_job_state`, records the admin on an immutable
 * job event, notifies the customer and the assigned professional, and leaves payments untouched.
 * The internal reason is private to admins; the customer only sees the chosen category.
 */
export async function adminCancelJob(
  jobId: string,
  expectedState: string,
  reason: string,
  customerReasonCategory: string,
): Promise<{ success: boolean; error: string | null; paymentReviewRequired?: boolean }> {
  const result = await runAdminAction({
    name: 'admin.job.cancel',
    schema: cancelJobInput,
    input: { jobId, expectedState, reason, customerReasonCategory },
    targetType: 'job',
    targetId: (i) => i.jobId,
    reason: (i) => i.reason,
    execute: async ({ input }): Promise<AdminResult<CancelJobResult>> => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_cancel_job', {
        p_job_id: input.jobId,
        p_expected_state: input.expectedState,
        p_reason: input.reason,
        p_customer_reason_category: input.customerReasonCategory,
      });
      if (error) {
        // 55000 stale or terminal state, 22023 bad input, 42501 not an admin: all safe to show.
        const actionable = ['55000', '22023', '42501', 'P0002'].includes(error.code);
        return adminFailure('FAILED', actionable ? error.message : 'The job could not be cancelled');
      }
      revalidatePath('/admin/jobs');
      return { ok: true, data: data as unknown as CancelJobResult };
    },
  });
  if (isAdminFailure(result)) return { success: false, error: result.error };
  return {
    success: true,
    error: null,
    paymentReviewRequired: result.data.payment_review_required,
  };
}

// 7. Suspend / reactivate professional: see suspendProfessional / reactivateProfessional in
//    services/verification.ts (state machine + audited runner).

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
    const admin = await createTypedAdminClient();

    // 1. Fetch core job record with relations
    const { data: jobRaw, error: jobError } = await admin
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
        properties!jobs_property_id_fkey (id, name, address:addresses (address_line_1, city, postal_code))
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !jobRaw) {
      console.error('[Admin] getAdminJobDetail job fetch error:', jobError);
      return { data: null, error: jobError?.message || 'Job not found' };
    }

    // 2. Fetch parallel sub-records: inspections, quotes with items, payments, events
    const [inspectionsRes, quotesRes, paymentsRes, eventsRes] = await Promise.all([
      admin
        .from('inspections')
        .select('id, findings, recommendation, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1),

      admin
        .from('quotes')
        .select(`
          id, subtotal, taxes_or_fees, discount, total, reason, status, created_at,
          quote_items (id, item_type, description, quantity, unit_price, line_total)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),

      admin
        .from('payments')
        .select('id, amount, currency, status, payment_type, provider, paid_at, created_at')
        .or(`job_id.eq.${jobId},booking_id.eq.${jobRaw.booking_id}`)
        .order('created_at', { ascending: false }),

      admin
        .from('job_events')
        .select(`
          id, from_state, to_state, event_type, created_at,
          profiles!job_events_actor_user_id_fkey (full_name)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true }),
    ]);

    const latestInspection = inspectionsRes.data?.[0] ?? null;

    const formattedQuotes = (quotesRes.data ?? []).map((q) => ({
      id: q.id,
      subtotal: Number(q.subtotal ?? 0),
      taxes_or_fees: Number(q.taxes_or_fees ?? 0),
      discount: Number(q.discount ?? 0),
      total: Number(q.total ?? 0),
      reason: q.reason ?? '',
      status: q.status,
      created_at: q.created_at,
      items: (q.quote_items ?? []).map((it) => ({
        id: it.id,
        item_type: it.item_type,
        description: it.description,
        quantity: Number(it.quantity ?? 1),
        unit_price: Number(it.unit_price ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    }));

    const formattedPayments = (paymentsRes.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      currency: p.currency ?? 'INR',
      status: p.status,
      payment_type: p.payment_type,
      provider: p.provider,
      paid_at: p.paid_at,
      created_at: p.created_at,
    }));

    const formattedEvents = (eventsRes.data ?? []).map((e) => ({
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
        address_line1: property?.address?.address_line_1 ?? 'Address not specified',
        city: property?.address?.city ?? 'Bengaluru',
        postal_code: property?.address?.postal_code ?? '—',
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
  } catch (err) {
    console.error('[Admin] getAdminJobDetail unexpected error:', err);
    return { data: null, error: err instanceof Error ? err.message : 'Failed to load job detail' };
  }
}
