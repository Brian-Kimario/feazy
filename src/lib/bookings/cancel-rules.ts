/**
 * Whether the booking page offers "Cancel booking", and whether that cancels at once or asks Feazy to review.
 * Mirrors customer_cancel_booking(), which stays the authority: from arrival onward it opens a review request
 * instead of cancelling, and it refuses finished work and a stale state. This only decides what to show.
 */
const REVIEW_JOB_STATES = ['arrived', 'assessing', 'quote_pending', 'in_progress'];
const FINISHED_JOB_STATES = ['completed', 'closed', 'cancelled'];

export type CancelOffer = 'offer' | 'request_review' | 'none';

export function cancelOffer(bookingStatus: string, jobState: string | null): CancelOffer {
  if (bookingStatus === 'cancelled' || bookingStatus === 'completed') return 'none';
  if (jobState && FINISHED_JOB_STATES.includes(jobState)) return 'none';
  if (jobState && REVIEW_JOB_STATES.includes(jobState)) return 'request_review';
  return 'offer';
}

/** The value customer_cancel_booking() compares against: the job state shown, or 'no_job'. */
export function expectedCancelState(jobState: string | null): string {
  return jobState ?? 'no_job';
}
