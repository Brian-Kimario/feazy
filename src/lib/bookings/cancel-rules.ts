/**
 * Whether the booking page offers "Cancel booking". Mirrors customer_cancel_booking(), which stays the
 * authority: it refuses in_progress and finished work, and a stale state. This only decides what to show.
 */
const NOT_CANCELLABLE_JOB_STATES = ['in_progress', 'completed', 'closed', 'cancelled'];

export type CancelOffer = 'offer' | 'contact_support' | 'none';

export function cancelOffer(bookingStatus: string, jobState: string | null): CancelOffer {
  if (bookingStatus === 'cancelled' || bookingStatus === 'completed') return 'none';
  if (jobState === 'in_progress') return 'contact_support';
  if (jobState && NOT_CANCELLABLE_JOB_STATES.includes(jobState)) return 'none';
  return 'offer';
}

/** The value customer_cancel_booking() compares against: the job state shown, or 'no_job'. */
export function expectedCancelState(jobState: string | null): string {
  return jobState ?? 'no_job';
}
