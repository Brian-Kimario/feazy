'use server';

/**
 * Admin assignment actions (A4). Each export is a client-callable endpoint and runs through
 * runAdminAction: role check, Zod validation, audit rows. The RPCs re-check the admin themselves,
 * lock booking -> job -> professional in a fixed order, and are idempotent on the request id.
 * They run on the user-scoped client so auth.uid() is the admin.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { runAdminAction } from '@/lib/admin/action';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { mapA4Error } from '@/lib/admin/a4-errors';
import {
  adminAssignProfessionalInput,
  adminReassignJobInput,
  adminRecoverSuspendedInput,
  adminResolveExceptionInput,
  adminWithdrawOfferInput,
  type RecoverSuspendedResult,
} from '@/validators/assignment';

/** Result body of the assignment RPCs; the shape is owned by the SQL, so only the common fields are named. */
export type AssignmentRpcResult = { outcome?: string; job_id?: string; booking_id?: string; [k: string]: unknown };

function refresh(): void {
  revalidatePath('/admin/operations');
  revalidatePath('/admin/jobs');
  revalidatePath('/admin/exceptions');
}

export async function adminAssignProfessional(input: unknown): Promise<AdminResult<AssignmentRpcResult>> {
  return runAdminAction({
    name: 'admin.assignment.assign',
    schema: adminAssignProfessionalInput,
    input,
    targetType: 'booking',
    targetId: (i) => i.bookingId,
    subjectUserId: (i) => i.professionalId,
    reason: (i) => i.reason,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_assign_professional', {
        p_booking_id: i.bookingId,
        p_professional_id: i.professionalId,
        p_expected_state: i.expectedState,
        p_expected_professional_id: i.expectedProfessionalId ?? null,
        p_reason: i.reason,
        p_request_id: i.requestId,
      });
      if (error) return adminFailure('FAILED', mapA4Error(error).message);
      refresh();
      return { ok: true, data: (data ?? {}) as AssignmentRpcResult };
    },
  });
}

export async function adminWithdrawOffer(input: unknown): Promise<AdminResult<AssignmentRpcResult>> {
  return runAdminAction({
    name: 'admin.assignment.withdraw_offer',
    schema: adminWithdrawOfferInput,
    input,
    targetType: 'job',
    targetId: (i) => i.jobId,
    subjectUserId: (i) => i.expectedProfessionalId,
    reason: (i) => i.reason,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_withdraw_offer', {
        p_job_id: i.jobId,
        p_expected_professional_id: i.expectedProfessionalId,
        p_reason: i.reason,
        p_request_id: i.requestId,
      });
      if (error) return adminFailure('FAILED', mapA4Error(error).message);
      refresh();
      return { ok: true, data: (data ?? {}) as AssignmentRpcResult };
    },
  });
}

export async function adminReassignJob(input: unknown): Promise<AdminResult<AssignmentRpcResult>> {
  return runAdminAction({
    name: 'admin.assignment.reassign',
    schema: adminReassignJobInput,
    input,
    targetType: 'job',
    targetId: (i) => i.jobId,
    subjectUserId: (i) => i.newProfessionalId,
    reason: (i) => i.reason,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_reassign_job', {
        p_job_id: i.jobId,
        p_expected_state: i.expectedState,
        p_expected_professional_id: i.expectedProfessionalId,
        p_new_professional_id: i.newProfessionalId,
        p_reason: i.reason,
        p_request_id: i.requestId,
      });
      if (error) return adminFailure('FAILED', mapA4Error(error).message);
      refresh();
      return { ok: true, data: (data ?? {}) as AssignmentRpcResult };
    },
  });
}

export async function adminResolveException(input: unknown): Promise<AdminResult<AssignmentRpcResult>> {
  return runAdminAction({
    name: 'admin.exception.resolve',
    schema: adminResolveExceptionInput,
    input,
    targetType: 'job_exception',
    targetId: (i) => i.exceptionId,
    reason: (i) => i.note,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_resolve_exception', {
        p_exception_id: i.exceptionId,
        p_expected_status: i.expectedStatus,
        p_finding: i.finding,
        p_resolution: i.resolution ?? null,
        p_note: i.note,
        p_request_id: i.requestId,
      });
      if (error) return adminFailure('FAILED', mapA4Error(error).message);
      refresh();
      return { ok: true, data: (data ?? {}) as AssignmentRpcResult };
    },
  });
}

/**
 * Phase 2 of a suspension: release pending offers and flag active jobs in batches. One call handles
 * one batch; the caller repeats until `done` is true. Safe to repeat; each batch is its own transaction.
 */
export async function adminRecoverSuspendedProfessional(input: unknown): Promise<AdminResult<RecoverSuspendedResult>> {
  return runAdminAction({
    name: 'admin.professional.recover_suspended',
    schema: adminRecoverSuspendedInput,
    input,
    targetType: 'professional',
    targetId: (i) => i.professionalId,
    subjectUserId: (i) => i.professionalId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_recover_suspended_professional', {
        p_professional_id: i.professionalId,
        p_limit: i.limit,
      });
      if (error) return adminFailure('FAILED', mapA4Error(error).message);
      refresh();
      revalidatePath('/admin/professionals');
      return { ok: true, data: data as unknown as RecoverSuspendedResult };
    },
  });
}
