import type { AssignmentQueueStatus } from '@/lib/services/admin';
import { formatDateTime } from '@/lib/admin/format';

export function isQueueFailing(queue: AssignmentQueueStatus | null): boolean {
  return queue == null || !queue.scheduled || queue.lastStatus === 'failed' || queue.failures24h > 0;
}

/** Health of the assignment queue job. Unknown status is shown as a problem, never as healthy. */
export function AssignmentQueueBanner({ queue, className = '' }: { queue: AssignmentQueueStatus | null; className?: string }) {
  const failing = isQueueFailing(queue);
  return (
    <div
      role={failing ? 'alert' : undefined}
      className={`rounded-xl border p-4 text-sm ${
        failing ? 'border-danger/25 bg-danger-soft text-danger' : 'border-line bg-paper text-ink-2'
      } ${className}`}
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
  );
}
