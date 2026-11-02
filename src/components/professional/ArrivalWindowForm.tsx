'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reportEtaAction } from '@/app/professional/actions';
import { ARRIVAL_WINDOWS, type ArrivalWindowId } from '@/validators';

/**
 * Share an arrival window on the way, or say you are running late. The window is stored by
 * report_job_eta and shown to the customer as the professional's own estimate.
 */
export function ArrivalWindowForm({
  jobId,
  state,
  hasWindow,
}: {
  jobId: string;
  state: string;
  hasWindow: boolean;
}) {
  const router = useRouter();
  const groupId = useId();
  const [pending, startTransition] = useTransition();
  const [windowId, setWindowId] = useState<ArrivalWindowId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Before setting off, the only update is a late notice; on the way, the first window is a plain estimate.
  const runningLate = state === 'accepted' || hasWindow;
  const heading = runningLate ? 'Running late?' : 'Share when you expect to arrive';
  const button = runningLate ? 'Tell the customer' : 'Share arrival time';

  function submit() {
    if (!windowId) {
      setError('Choose when you expect to arrive.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reportEtaAction({ jobId, windowId, runningLate });
      if (result.success === false) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setWindowId(null);
      router.refresh();
    });
  }

  return (
    <div>
      <p id={groupId} className="text-sm font-semibold text-ink">
        {heading}
      </p>
      <p className="mt-0.5 text-xs text-ink-3">
        {runningLate ? 'Pick a new arrival window. ' : ''}The customer sees this as your estimate. Feazy does not
        track your location.
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="mt-3 flex flex-wrap gap-2">
        {ARRIVAL_WINDOWS.map((w) => {
          const selected = windowId === w.id;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => {
                setWindowId(w.id);
                setSaved(false);
              }}
              className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50 ${
                selected ? 'border-teal bg-teal-soft font-semibold text-teal-deep' : 'border-line bg-paper text-ink-2 hover:border-line-strong'
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-busy={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal px-4 text-sm font-semibold text-teal transition-colors hover:bg-teal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
        >
          {pending ? 'Sending…' : button}
        </button>
        {saved && !pending && (
          <p role="status" className="text-sm text-success">
            Sent to the customer.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
