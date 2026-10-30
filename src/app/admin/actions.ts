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
import type { AdminResult } from '@/lib/admin/result';
import { getOperationsCaseDetail, type OpsCaseDetail } from '@/lib/services/admin-operations';
import { revalidatePath } from 'next/cache';

export interface ActionResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operations case detail (read-only). The queue itself is loaded by the Operations page through
// getOperationsQueue. The earlier queue, dispute and reassignment actions were removed because they
// wrote bookings directly, outside the state machine. Reassignment returns in A4.
// ─────────────────────────────────────────────────────────────────────────────

export async function loadOperationsCaseDetail(input: unknown): Promise<AdminResult<OpsCaseDetail>> {
  return getOperationsCaseDetail(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyProfessional — Approve or reject professional verification
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

    // The case drawer does not carry the status it was opened at, so read it here; the database
    // still locks the row and refuses the change if it moved in between.
    const supabase = await createClient();
    const { data: current } = await supabase
      .from('professional_profiles')
      .select('verification_status')
      .eq('user_id', profId)
      .maybeSingle();
    const expected = current?.verification_status ?? '';

    // Use service layer functions which handle authorization, persistence, and audit logging
    if (decision === 'approved') {
      const { approveProfessional } = await import('@/lib/services/verification');
      const result = await approveProfessional(profId, expected);
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to approve professional' };
      }
    } else {
      const { rejectProfessional } = await import('@/lib/services/verification');
      const result = await rejectProfessional(profId, expected, reason!);
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
