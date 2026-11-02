'use client';

import { useState, useTransition } from 'react';
import { reportNoShowAction } from '@/lib/job-codes/actions';
import { formatSlot } from '@/lib/shell/rules';

/**
 * "Professional didn't arrive". Offered 30 minutes after the booked time. The report goes to Feazy
 * for review; it changes nothing about the job, the professional's rating or any charge by itself.
 */
export function NoShowReport({ jobId, reportedAt }: { jobId: string; reportedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<'reassign' | 'support'>('reassign');
  const [error, setError] = useState<string | null>(null);

  if (reportedAt) {
    return (
      <div role="status" className="rounded-2xl border border-ochre/30 bg-ochre-soft p-5 text-sm">
        <p className="font-semibold text-ink">We have your report</p>
        <p className="mt-1 text-ink-2">
          You told us on {formatSlot(reportedAt)} that the professional did not arrive. Feazy support will review it
          and get in touch. Nothing has been charged or changed automatically.
        </p>
      </div>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await reportNoShowAction({ jobId, preference });
      if (result.success === false) setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 text-sm">
      <p className="font-semibold text-ink">Has the professional not turned up?</p>
      <p className="mt-1 text-ink-2">It is more than 30 minutes past the booked time and they have not marked arrival.</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-porcelain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          Professional didn&apos;t arrive
        </button>
      ) : (
        <fieldset className="mt-3" disabled={pending}>
          <legend className="text-xs text-ink-3">What would you like Feazy to try?</legend>
          {(
            [
              ['reassign', 'Find me another professional'],
              ['support', 'Have support contact me'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="mt-2 flex min-h-11 items-center gap-2 text-ink">
              <input type="radio" name="no-show-preference" checked={preference === value} onChange={() => setPreference(value)} />
              {label}
            </label>
          ))}
          <p className="mt-2 text-xs text-ink-3">
            This is a report for review, not a verdict. Support will check before anything changes.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submit}
              aria-busy={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal px-4 text-sm font-semibold text-teal transition-colors hover:bg-teal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
