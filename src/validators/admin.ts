import { z } from 'zod';
import { uuid } from './common';

/** Reasons are stored in audit_logs and shown to admins, so they must say something. */
export const adminReason = z
  .string()
  .trim()
  .min(5, 'Please give a reason (at least 5 characters)')
  .max(500, 'Reason must be 500 characters or fewer');

/** States a review decision can be taken from; the database enforces the same set. */
export const reviewableStatus = z.enum(['pending', 'documents_submitted', 'under_review']);

export const approveProfessionalInput = z.object({
  professionalId: uuid,
  /** The status the admin saw. A stale screen is refused rather than silently applied. */
  expectedStatus: reviewableStatus,
});

export const rejectProfessionalInput = z.object({
  professionalId: uuid,
  expectedStatus: reviewableStatus,
  reason: adminReason,
});

export const suspendProfessionalInput = z.object({ professionalId: uuid, reason: adminReason });

export const reactivateProfessionalInput = z.object({ professionalId: uuid, reason: adminReason });

/** Verification documents live at `<owner uid>/<file>`; refuse traversal and absolute paths. */
export const verificationDocumentPath = z
  .string()
  .min(3)
  .max(300)
  .refine(
    (p) => !p.startsWith('/') && !p.split('/').some((seg) => seg === '..' || seg === '.' || seg === ''),
    'Invalid document path',
  );

/** Customer-facing reason categories for an admin cancellation. The database enforces the same set. */
export const CANCEL_CUSTOMER_REASONS = [
  { value: 'professional_unavailable', label: 'Professional unavailable' },
  { value: 'scheduling_issue', label: 'Scheduling issue' },
  { value: 'service_not_fulfillable', label: 'Service could not be fulfilled' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'safety_or_operational', label: 'Safety or operational concern' },
  { value: 'other', label: 'Other' },
] as const;

export const cancelJobInput = z.object({
  jobId: uuid,
  /** The state the admin was looking at; a changed job is refused rather than cancelled blindly. */
  expectedState: z.enum(['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending']),
  /** Internal and private: stored for admins only, never shown to the customer or professional. */
  reason: adminReason,
  customerReasonCategory: z.enum([
    'professional_unavailable',
    'scheduling_issue',
    'service_not_fulfillable',
    'customer_request',
    'safety_or_operational',
    'other',
  ]),
});

export type CancelJobResult = {
  job_id: string;
  booking_id: string;
  from_state: string;
  to_state: string;
  offer_withdrawn: boolean;
  payment_review_required: boolean;
  paid_payment_count: number;
  pending_payment_count: number;
};

/**
 * Reconcile a live job whose booking was already cancelled. Only an unmatched or offered job
 * (`assigned`) is auto-repairable; anything further along needs a human decision (cancellation).
 */
export const reconcileJobInput = z.object({
  jobId: uuid,
  expectedState: z.literal('assigned'),
  /** Internal and private: stored for admins only. */
  reason: adminReason,
});

export type ReconcileJobResult = {
  ok: true;
  job_id: string;
  booking_id: string;
  from_state: string;
  to_state: string;
  offer_withdrawn: boolean;
};

/** Refusal returned by `admin_reconcile_job` as a value (not a thrown error). */
export type ReconcileJobRefusal = { ok: false; code: 'STALE_STATE' | 'NOT_ELIGIBLE'; message: string };
