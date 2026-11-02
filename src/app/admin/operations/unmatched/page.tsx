import Link from 'next/link';
import { getAssignmentQueueStatus, getUnmatchedBookings } from '@/lib/services/admin-reads';

export const metadata = {
  title: 'Unmatched bookings — Feazy Admin',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Open bookings with no confirmed professional, and the health of the scheduled
 * assignment queue. Read-only: there is no admin assign action yet.
 */
export default async function UnmatchedBookingsPage() {
  const [{ data: bookings, error }, queue] = await Promise.all([getUnmatchedBookings(), getAssignmentQueueStatus()]);
  const queueFailing = queue != null && (!queue.scheduled || queue.lastStatus === 'failed' || queue.failures24h > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <Link href="/admin/operations" className="text-sm text-ink-3 hover:text-teal">
        ← Operations
      </Link>
      <div className="mb-6 mt-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Operations</p>
        <h1 className="mb-2 text-3xl font-bold text-ink">Unmatched bookings</h1>
        <p className="text-ink-3">
          Open bookings with no confirmed professional, earliest start first. The assignment queue
          retries unmatched bookings and expires unanswered offers every minute until the start time.
        </p>
      </div>

      <div
        role={queueFailing ? 'alert' : undefined}
        className={`mb-6 rounded-xl border p-4 text-sm ${
          queue == null || queueFailing ? 'border-danger/25 bg-danger-soft text-danger' : 'border-line bg-paper text-ink-2'
        }`}
      >
        {queue == null ? (
          'Could not read the assignment queue status.'
        ) : !queue.scheduled ? (
          'The assignment queue is not scheduled. Offers will not expire or be retried.'
        ) : (
          <>
            Assignment queue{' '}
            {queue.lastRunAt ? `last ran ${formatDateTime(queue.lastRunAt)} (${queue.lastStatus ?? 'unknown'})` : 'has not run yet'}
            {' · '}
            {queue.failures24h === 1 ? '1 failed run' : `${queue.failures24h} failed runs`} in the last 24 hours
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </p>
      ) : bookings.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper p-6 text-sm text-ink-3">
          No unmatched bookings right now.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {bookings.map((booking) => (
            <li key={booking.id} className="grid gap-1 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="font-bold text-ink">
                  {booking.serviceName}
                  {booking.city && <span className="font-normal text-ink-3"> · {booking.city}</span>}
                </p>
                <p className="font-mono text-xs text-ink-4">{booking.reference}</p>
                <p className={`mt-1 text-xs font-semibold ${booking.reason === 'overdue' ? 'text-danger' : 'text-ochre'}`}>
                  {booking.reason === 'overdue' ? 'Start passed, no professional' : 'No eligible professional'}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-xs sm:text-right">
                <div>
                  <dt className="text-ink-4">Scheduled</dt>
                  <dd className="text-ink-2">{formatDateTime(booking.scheduledStart)}</dd>
                </div>
                <div>
                  <dt className="text-ink-4">Unmatched since</dt>
                  <dd className="text-ink-2">
                    {booking.unmatchedSince ? formatDateTime(booking.unmatchedSince) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-4">Declined or expired</dt>
                  <dd className="text-ink-2">{booking.attempts}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
