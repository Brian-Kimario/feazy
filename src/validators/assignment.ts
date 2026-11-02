import { z } from 'zod';
import { uuid } from './common';

/**
 * Inputs for the A4 assignment RPCs (migrations 111-116). Length bounds mirror the SQL checks so a
 * bad value is refused here with a readable message instead of as a database error.
 */

/** Admin-facing reason for an assignment change; the database requires at least 10 characters. */
export const assignmentReason = z
  .string()
  .trim()
  .min(10, 'Please give a reason (at least 10 characters)')
  .max(500, 'Reason must be 500 characters or fewer');

/**
 * Idempotency key. The form generates one per submission and reuses it on retry, so a double click
 * replays the stored result instead of acting twice.
 */
export const requestId = uuid;

export const adminAssignProfessionalInput = z.object({
  bookingId: uuid,
  professionalId: uuid,
  /** What the admin saw: no job yet, or an offer already out. A changed booking is refused. */
  expectedState: z.enum(['none', 'assigned']),
  expectedProfessionalId: uuid.nullable().optional(),
  reason: assignmentReason,
  requestId,
});

export const adminWithdrawOfferInput = z.object({
  jobId: uuid,
  expectedProfessionalId: uuid,
  reason: assignmentReason,
  requestId,
});

export const adminReassignJobInput = z.object({
  jobId: uuid,
  expectedState: z.enum(['assigned', 'accepted']),
  expectedProfessionalId: uuid,
  newProfessionalId: uuid,
  reason: assignmentReason,
  requestId,
});

export const adminRecoverSuspendedInput = z.object({
  professionalId: uuid,
  limit: z.number().int().min(1).max(50).default(25),
});

export const EXCEPTION_FINDINGS = ['confirmed', 'not_confirmed', 'inconclusive'] as const;
export const EXCEPTION_RESOLUTIONS = ['reassigned', 'cancelled', 'customer_declined', 'no_action'] as const;

export const adminResolveExceptionInput = z
  .object({
    exceptionId: uuid,
    expectedStatus: z.enum(['open']).default('open'),
    finding: z.enum(EXCEPTION_FINDINGS),
    /** Required for confirmed / not_confirmed; must be absent for inconclusive. */
    resolution: z.enum(EXCEPTION_RESOLUTIONS).nullish(),
    note: z.string().trim().min(10, 'Please explain the finding (at least 10 characters)').max(1000, 'Note must be 1000 characters or fewer'),
    requestId,
  })
  .refine((v) => (v.finding === 'inconclusive' ? v.resolution == null : v.resolution != null), {
    message: 'Choose an outcome, except for an inconclusive finding which keeps the case open',
    path: ['resolution'],
  });

/** Professional asks to step away from an accepted job. The database decides withdraw vs review by its own clock. */
export const professionalWithdrawInput = z.object({
  jobId: uuid,
  reason: z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(500, 'Reason must be 500 characters or fewer'),
});

export type AdminAssignProfessionalInput = z.infer<typeof adminAssignProfessionalInput>;
export type AdminWithdrawOfferInput = z.infer<typeof adminWithdrawOfferInput>;
export type AdminReassignJobInput = z.infer<typeof adminReassignJobInput>;
export type AdminResolveExceptionInput = z.infer<typeof adminResolveExceptionInput>;
export type ProfessionalWithdrawInput = z.infer<typeof professionalWithdrawInput>;

/** Stable codes the RPCs raise as the message prefix (`CODE: text`). */
export const A4_ERROR_CODES = [
  'STALE_STATE',
  'STALE_PROFESSIONAL',
  'BOOKING_NOT_ASSIGNABLE',
  'PROFESSIONAL_INELIGIBLE',
  'SCHEDULE_CONFLICT',
  'NEEDS_CUSTOMER_CONSENT',
  'NEEDS_ADMIN_REVIEW',
  'RESOLUTION_MISMATCH',
  'EDGE_NOT_PERMITTED',
  'READ_COMMITTED_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'RESCHEDULE_BLOCKED',
] as const;
export type A4ErrorCode = (typeof A4_ERROR_CODES)[number];

export interface RecoverSuspendedResult {
  done: boolean;
  offers_released: number;
  active_jobs_flagged: number;
  offers_remaining: number;
  active_unflagged_remaining: number;
}
