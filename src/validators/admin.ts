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
