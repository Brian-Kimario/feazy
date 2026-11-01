'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { withdrawFromJobAction } from '@/app/professional/actions';

type Outcome = 'withdrawn' | 'review_requested';

/**
 * Withdrawal is the only way for a professional to step away from an accepted job. Before the visit starts
 * it releases them. At or after the start, or once work is under way, it only asks an admin to review, and
 * the professional stays on the job until that review is done.
 */
export function WithdrawFromJob({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const valid = reason.trim().length >= 5;

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await withdrawFromJobAction({ jobId, reason });
        if (r.success === false) {
          setError(r.error);
          return;
        }
        setOutcome(r.data.outcome);
        router.refresh();
      } catch {
        setError('Something went wrong. Nothing was changed; reload and try again.');
      }
    });
  }

  if (outcome === 'withdrawn') {
    return (
      <p role="status" className="rounded-lg border border-line bg-paper-2 p-3 text-sm text-ink">
        You have been released from this job. We will find the customer a replacement.
      </p>
    );
  }
  if (outcome === 'review_requested') {
    return (
      <p role="status" className="rounded-lg border border-line bg-paper-2 p-3 text-sm text-ink">
        Your request was sent to our team. You are <strong>not</strong> released yet: stay on this job until we
        confirm.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink"
      >
        Withdraw from job
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-paper-2 p-4">
      <h3 className="text-sm font-bold text-ink">Withdraw from this job</h3>
      <p className="mt-1 text-xs text-ink-3">
        Before the visit starts, you are released and the customer is told you can no longer attend. After it
        starts, our team reviews your request and you are not released until they confirm.
      </p>
      <label htmlFor="withdraw-reason" className="mt-3 block text-xs font-bold text-ink">
        Reason
      </label>
      <textarea
        id="withdraw-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
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
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || pending}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Confirm withdrawal'}
        </button>
      </div>
    </section>
  );
}
