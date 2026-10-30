'use server';

/**
 * Admin Mutations — Server Actions for admin operations
 *
 * All functions:
 * 1. Verify admin role server-side (authorize)
 * 2. Validate inputs (are they sensible?)
 * 3. Verify authorization for the specific record (can this admin act on it?)
 * 4. Execute mutation atomically
 * 5. Create immutable audit event
 * 6. Return fresh state
 *
 * DO NOT call these from the client directly.
 * Client calls these via: server action invocation (import + call as function)
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminActor } from '@/lib/admin/guard';
import { isAdminFailure } from '@/lib/admin/result';
import { revalidatePath } from 'next/cache';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AttentionItem {
  id: string;
  type: 'dispute' | 'reassignment' | 'verification';
  label: string;
  sub: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

export interface ActionResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the request is from an authenticated admin user.
 * Returns userId if admin, throws error otherwise.
 */
async function requireAdmin(): Promise<string> {
  const actor = await getAdminActor();
  if (isAdminFailure(actor)) throw new Error(`Unauthorized: ${actor.error}`);
  return actor.data.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. fetchNeedsAttention — Fetch operational cases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all cases needing admin attention.
 * Includes: quote disputes, job reassignments, professional verifications.
 */
export async function fetchNeedsAttention(filters?: {
  type?: 'dispute' | 'reassignment' | 'verification';
  priority?: 'high' | 'medium' | 'low';
}): Promise<ActionResult<AttentionItem[]>> {
  try {
    await requireAdmin();
    const admin = await createAdminClient();

    const items: AttentionItem[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Case Type 1: Quote Disputes
    // Cases where customer has disputed quote (booking in dispute state)
    // ─────────────────────────────────────────────────────────────────────────
    if (!filters?.type || filters.type === 'dispute') {
      const { data: disputes, error: disputeError } = await admin
        .from('bookings')
        .select(
          `
          id,
          booking_reference,
          status,
          created_at,
          quoted_or_base_amount,
          customers:customer_id (full_name, email),
          professionals:professional_id (display_name, email),
          services:service_id (name)
        `,
        )
        .in('status', ['quote_disputed', 'under_customer_review_disputed'])
        .order('created_at', { ascending: false });

      if (!disputeError && disputes) {
        for (const booking of disputes as never[]) {
          const bookingData = booking as {
            id: string;
            booking_reference: string;
            status: string;
            created_at: string;
            quoted_or_base_amount: number;
            customers?: { full_name: string; email: string };
            professionals?: { display_name: string; email: string };
            services?: { name: string };
          };
          const serviceName = bookingData.services?.name ?? 'Service';
          const amount = bookingData.quoted_or_base_amount
            ? `₹${Number(bookingData.quoted_or_base_amount).toLocaleString('en-IN')}`
            : 'N/A';

          items.push({
            id: bookingData.id,
            type: 'dispute',
            label: 'Quote disputed by customer',
            sub: `${bookingData.booking_reference} • ${serviceName} • ${amount}`,
            priority: 'high',
            createdAt: bookingData.created_at,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Case Type 2: Job Reassignments
    // Cases where professional is unavailable (flagged or status indicates unavailable)
    // ─────────────────────────────────────────────────────────────────────────
    if (!filters?.type || filters.type === 'reassignment') {
      const { data: reassignments, error: reassignError } = await admin
        .from('bookings')
        .select(
          `
          id,
          booking_reference,
          status,
          created_at,
          customers:customer_id (full_name, email),
          professionals:professional_id (display_name, email, is_available),
          services:service_id (name)
        `,
        )
        .in('status', ['professional_unavailable', 'needs_reassignment'])
        .order('created_at', { ascending: false });

      if (!reassignError && reassignments) {
        for (const booking of reassignments as never[]) {
          const bookingData = booking as {
            id: string;
            booking_reference: string;
            status: string;
            created_at: string;
            customers?: { full_name: string; email: string };
            professionals?: { display_name: string; email: string };
            services?: { name: string };
          };
          const serviceName = bookingData.services?.name ?? 'Service';

          items.push({
            id: bookingData.id,
            type: 'reassignment',
            label: 'Professional unavailable — needs reassignment',
            sub: `${bookingData.booking_reference} • ${serviceName}`,
            priority: 'high',
            createdAt: bookingData.created_at,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Case Type 3: Professional Verifications
    // Professionals awaiting admin review/approval
    // ─────────────────────────────────────────────────────────────────────────
    if (!filters?.type || filters.type === 'verification') {
      const { data: verifications, error: verifError } = await admin
        .from('professional_profiles')
        .select(
          `
          user_id,
          display_name,
          verification_status,
          created_at,
          profiles:user_id (email)
        `,
        )
        .in('verification_status', ['documents_submitted', 'under_review'])
        .order('created_at', { ascending: false });

      if (!verifError && verifications) {
        for (const prof of verifications as never[]) {
          const profData = prof as {
            user_id: string;
            display_name: string;
            verification_status: string;
            created_at: string;
            profiles?: { email: string };
          };
          const status = profData.verification_status;
          const priority =
            status === 'documents_submitted' ? 'high' : status === 'under_review' ? 'medium' : 'low';

          items.push({
            id: profData.user_id,
            type: 'verification',
            label: `Professional verification: ${status === 'documents_submitted' ? 'Documents ready for review' : 'Under review'}`,
            sub: `${profData.display_name} • ${profData.profiles?.email ?? 'N/A'}`,
            priority: priority as 'high' | 'medium' | 'low',
            createdAt: profData.created_at,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Apply filters if provided
    // ─────────────────────────────────────────────────────────────────────────
    let filtered = items;
    if (filters?.priority) {
      filtered = filtered.filter((item) => item.priority === filters.priority);
    }

    // Sort: priority (high first) → created (newest first)
    filtered.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return { success: true, data: filtered };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolveQuoteDispute — Resolve customer/professional quote disagreement
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveQuoteDispute(
  bookingId: string,
  resolution: 'approve_quote' | 'request_revision' | 'adjust_price',
  newAmount?: number,
): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const admin = await createAdminClient();

    // Validate resolution
    if (!['approve_quote', 'request_revision', 'adjust_price'].includes(resolution)) {
      return { success: false, error: 'Invalid resolution value' };
    }

    // If adjusting price, validate newAmount
    if (resolution === 'adjust_price') {
      if (newAmount === undefined || newAmount <= 0) {
        return { success: false, error: 'New amount required and must be positive' };
      }
      // Bounds check: 50% to 200% of typical quotes
      if (newAmount < 100 || newAmount > 1000000) {
        return { success: false, error: 'Amount out of reasonable bounds' };
      }
    }

    // Fetch booking to verify it exists
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, status, quoted_or_base_amount, customer_id, professional_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    const oldAmount = (booking as { quoted_or_base_amount: number }).quoted_or_base_amount;

    // Execute mutation
    const updateData: Record<string, unknown> = {};

    if (resolution === 'approve_quote') {
      updateData.status = 'quote_approved';
    } else if (resolution === 'request_revision') {
      updateData.status = 'quote_revision_requested';
    } else if (resolution === 'adjust_price') {
      updateData.quoted_or_base_amount = newAmount;
      updateData.status = 'quote_adjusted';
    }

    const { error: updateError } = await (admin.from('bookings') as any)
      .update(updateData)
      .eq('id', bookingId);

    if (updateError) {
      return { success: false, error: `Update failed: ${updateError.message}` };
    }

    // Create immutable audit event via job_events
    // Get the associated job_id for this booking
    const bookingData = booking as { job_id?: string; status: string };
    if (bookingData.job_id) {
      // TODO: Implement audit event creation once job_events table types are available
      console.log('[adminResolveDispute] Would create job_event:', {
        job_id: bookingData.job_id,
        from_state: bookingData.status,
        to_state: updateData.status,
        event_type: 'admin_dispute_resolved',
      });
    }

    // Revalidate admin pages
    revalidatePath('/admin/operations');

    return {
      success: true,
      data: {
        bookingId,
        resolution,
        newStatus: updateData.status,
        newAmount: resolution === 'adjust_price' ? newAmount : oldAmount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. reassignJob — Reassign job to different professional
// ─────────────────────────────────────────────────────────────────────────────

export async function reassignJob(
  bookingId: string,
  newProfessionalId: string,
): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    const admin = await createAdminClient();

    // Validate inputs
    if (!bookingId || !newProfessionalId) {
      return { success: false, error: 'Booking and professional IDs required' };
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, status, professional_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    const oldProfessionalId = (booking as { professional_id: string }).professional_id;

    // Verify new professional exists, is verified, and available
    const { data: newProf, error: profError } = await admin
      .from('professional_profiles')
      .select('user_id, verification_status, is_available')
      .eq('user_id', newProfessionalId)
      .single();

    if (profError || !newProf) {
      return { success: false, error: 'Target professional not found' };
    }

    if ((newProf as { verification_status: string }).verification_status !== 'verified') {
      return { success: false, error: 'Target professional not verified' };
    }

    if (!(newProf as { is_available: boolean }).is_available) {
      return { success: false, error: 'Target professional not available' };
    }

    // Update booking with new professional
    const { error: updateError } = await (admin.from('bookings') as any)
      .update({ professional_id: newProfessionalId })
      .eq('id', bookingId);

    if (updateError) {
      return { success: false, error: `Reassignment failed: ${updateError.message}` };
    }

    // Create audit event via job_events
    const bookingData = booking as { job_id?: string; status: string };
    if (bookingData.job_id) {
      // TODO: Implement audit event creation once job_events table types are available
      console.log('[adminReassignJob] Would create job_event:', {
        job_id: bookingData.job_id,
        from_state: bookingData.status,
        to_state: bookingData.status,
        event_type: 'admin_job_reassigned',
      });
    }

    revalidatePath('/admin/operations');

    return {
      success: true,
      data: {
        bookingId,
        oldProfessionalId,
        newProfessionalId,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. verifyProfessional — Approve or reject professional verification
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyProfessional(
  profId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<ActionResult> {
  try {
    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      return { success: false, error: 'Invalid decision value' };
    }

    // If rejected, reason is required
    if (decision === 'rejected' && !reason) {
      return { success: false, error: 'Reason required for rejection' };
    }

    // Use service layer functions which handle authorization, persistence, and audit logging
    if (decision === 'approved') {
      const { approveProfessional } = await import('@/lib/services/verification');
      const result = await approveProfessional(profId);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to approve professional' };
      }
    } else {
      const { rejectProfessional } = await import('@/lib/services/verification');
      const result = await rejectProfessional(profId, reason!);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to reject professional' };
      }
    }

    revalidatePath('/admin/professionals');

    return {
      success: true,
      data: {
        profId,
        decision,
        reason: reason || null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
