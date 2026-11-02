'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminFailure } from '@/lib/admin/result';
import { reconcileOperationsJob } from '@/app/admin/actions';

/**
 * Repairs a cancelled booking whose job is still open. It only closes the leftover job: the customer
 * is not messaged and payments are never changed. Anything beyond an unmatched or offered job is a
 * cancellation decision and is not offered here.
 */
export function ReconcileJobPanel({ jobId, reference }: { jobId: string; reference: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const valid = reason.trim().length >= 5;

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await reconcileOperationsJob({ jobId, expectedState: 'assigned', reason });
        if (isAdminFailure(r)) {
          setError(r.error);
          setConfirming(false);
          return;
        }
        setDone(r.data.offer_withdrawn ? 'Job closed and the outstanding offer was withdrawn.' : 'Job closed.');
        router.refresh();
      } catch {
        setError('Something went wrong. Nothing was changed; refresh and try again.');
        setConfirming(false);
      }
    });
  }

  if (done) {
    return (
      <p role="status" className="rounded-lg border border-success/25 bg-success-soft p-3 text-sm text-success">
        {done} {reference} will leave the queue on refresh.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-paper-2 p-4">
      <h3 className="text-sm font-bold text-ink">Repair this mismatch</h3>
      <p className="mt-1 text-xs text-ink-3">
        The booking is already cancelled, so the leftover job is closed. The customer is not messaged, payments are
        not changed and nothing is refunded. If the job has moved on since you opened this, the repair is refused.
      </p>
      <label htmlFor="reconcile-reason" className="mt-3 block text-xs font-bold text-ink">
        Internal reason (admins only)
      </label>
      <textarea
        id="reconcile-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        disabled={pending}
        placeholder="At least 5 characters."
        className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending ? 'Closing…' : 'Confirm: close job'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!valid}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Close leftover job
          </button>
        )}
      </div>
    </section>
  );
}
