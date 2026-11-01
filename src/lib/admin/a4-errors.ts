import { A4_ERROR_CODES, type A4ErrorCode } from '@/validators/assignment';

/** Plain-language text for each stable A4 code. Shown to admins and professionals as-is. */
const A4_MESSAGES: Record<A4ErrorCode, string> = {
  STALE_STATE: 'This job changed while you were looking at it. Reload and check its current state.',
  STALE_PROFESSIONAL: 'A different professional now holds this job. Reload and check before acting.',
  BOOKING_NOT_ASSIGNABLE: 'This booking can no longer be assigned (it may be cancelled, completed or already under way).',
  PROFESSIONAL_INELIGIBLE: 'That professional is not eligible for this job (not verified, unavailable, or not skilled for it).',
  SCHEDULE_CONFLICT: 'That professional already has a job within two hours of this visit.',
  NEEDS_CUSTOMER_CONSENT: 'A quote already exists on this job, so the customer must agree to a change of professional first.',
  NEEDS_ADMIN_REVIEW: 'The visit start has passed. This needs a case review rather than a reassignment.',
  RESOLUTION_MISMATCH: 'That outcome does not fit this kind of case, or the evidence on file does not support it.',
  EDGE_NOT_PERMITTED: 'That change is only allowed through the assignment tools.',
  READ_COMMITTED_REQUIRED: 'The database session is not in the required isolation mode. Try again.',
  IDEMPOTENCY_KEY_REUSED: 'This request id was already used for a different action. Reload the page and try again.',
  IDEMPOTENCY_IN_PROGRESS: 'This action is already being processed. Wait a moment and reload.',
  RESCHEDULE_BLOCKED: 'This booking has a live job, so it cannot be rescheduled directly.',
};

export interface A4Failure {
  code: A4ErrorCode | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'UNKNOWN';
  message: string;
  /** True when retrying the same request id after a reload may succeed. */
  retryable: boolean;
}

interface PgLikeError {
  code?: string;
  message?: string;
}

/**
 * Map a PostgREST/Postgres error from an A4 RPC to a typed failure. Only text from the fixed table
 * above (or the safe built-ins) is returned; raw database messages are never passed through.
 */
export function mapA4Error(error: PgLikeError | null | undefined): A4Failure {
  const message = error?.message ?? '';
  const named = A4_ERROR_CODES.find((c) => message.startsWith(c));
  if (named) {
    return { code: named, message: A4_MESSAGES[named], retryable: named === 'IDEMPOTENCY_IN_PROGRESS' || named === 'READ_COMMITTED_REQUIRED' };
  }
  switch (error?.code) {
    case '42501':
      return { code: 'FORBIDDEN', message: 'You are not allowed to do this.', retryable: false };
    case 'P0002':
      return { code: 'NOT_FOUND', message: 'That job could not be found.', retryable: false };
    case '22023':
      return { code: 'INVALID', message: 'The request was not accepted. Check the details and try again.', retryable: false };
    case '40001':
      return { code: 'STALE_STATE', message: A4_MESSAGES.STALE_STATE, retryable: false };
    case '23P01':
      return { code: 'SCHEDULE_CONFLICT', message: A4_MESSAGES.SCHEDULE_CONFLICT, retryable: false };
    default:
      return { code: 'UNKNOWN', message: 'The change could not be completed. Please try again.', retryable: true };
  }
}
