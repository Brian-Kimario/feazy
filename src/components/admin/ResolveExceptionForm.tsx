'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminFailure } from '@/lib/admin/result';
import { adminResolveException } from '@/lib/services/admin-assignment';

type Finding = 'confirmed' | 'not_confirmed' | 'inconclusive';

const FINDINGS: { value: Finding; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'not_confirmed', label: 'Not confirmed' },
  { value: 'inconclusive', label: 'Inconclusive (keeps the case open)' },
];

const RESOLUTIONS = [
  { value: 'reassigned', label: 'Reassigned' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'customer_declined', label: 'Customer declined' },
  { value: 'no_action', label: 'No action' },
] as const;

/** An inconclusive finding is recorded but never closes the case; the server enforces this too. */
export function ResolveExceptionForm({ exceptionId }: { exceptionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const requestId = useRef<string | null>(null);
  const [finding, setFinding] = useState<Finding>('confirmed');
  const [resolution, setResolution] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inconclusive = finding === 'inconclusive';
  const valid = note.trim().length >= 10 && (inconclusive || resolution !== '');

  function submit() {
    setError(null);
    requestId.current ??= crypto.randomUUID();
    const rid = requestId.current;
    start(async () => {
      try {
        const r = await adminResolveException({
          exceptionId,
          expectedStatus: 'open',
          finding,
          resolution: inconclusive ? null : resolution,
          note,
          requestId: rid,
        });
        if (isAdminFailure(r)) {
          setError(r.error);
          requestId.current = null;
          return;
        }
        setDone(inconclusive ? 'Recorded. The case stays open.' : 'Case closed.');
        router.refresh();
      } catch {
        setError('Something went wrong and the result is unknown. Press save again to retry safely, or reload.');
      }
    });
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-success">
        {done}
      </p>
    );
  }

  const reset = () => {
    requestId.current = null;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs font-bold text-ink">
          Finding
          <select
            value={finding}
            onChange={(e) => {
              setFinding(e.target.value as Finding);
              reset();
            }}
            disabled={pending}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper p-2 text-sm font-normal"
          >
            {FINDINGS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-ink">
          Outcome
          <select
            value={inconclusive ? '' : resolution}
            onChange={(e) => {
              setResolution(e.target.value);
              reset();
            }}
            disabled={pending || inconclusive}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper p-2 text-sm font-normal disabled:opacity-50"
          >
            <option value="">{inconclusive ? 'Not applicable' : 'Select…'}</option>
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-bold text-ink">
        Note (what you checked)
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            reset();
          }}
          rows={2}
          maxLength={1000}
          disabled={pending}
          placeholder="At least 10 characters."
          className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!valid || pending}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save finding'}
        </button>
      </div>
    </div>
  );
}
