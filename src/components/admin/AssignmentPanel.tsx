'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminFailure } from '@/lib/admin/result';
import { adminAssignProfessional, adminReassignJob, adminWithdrawOffer } from '@/lib/services/admin-assignment';

export interface AssignmentCandidate {
  userId: string;
  name: string;
}

type Mode = 'assign' | 'reassign' | 'withdraw';

/**
 * Assign, reassign or withdraw an offer. The server decides whether the change is allowed: it is refused
 * if the job moved on since this page loaded, or the professional is not eligible or has an overlapping visit.
 * One request id is kept per attempt so a retry after a network error cannot apply the change twice.
 */
export function AssignmentPanel({
  bookingId,
  jobId,
  jobState,
  currentProfessionalId,
  candidates,
}: {
  bookingId: string;
  jobId: string | null;
  jobState: string | null;
  currentProfessionalId: string | null;
  candidates: AssignmentCandidate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const requestId = useRef<string | null>(null);
  const [professionalId, setProfessionalId] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const mode: Mode | null =
    !currentProfessionalId && (!jobState || jobState === 'matching' || jobState === 'unassigned')
      ? 'assign'
      : currentProfessionalId && (jobState === 'assigned' || jobState === 'accepted')
        ? 'reassign'
        : null;
  const canWithdraw = Boolean(jobId && currentProfessionalId && jobState === 'assigned');
  const [action, setAction] = useState<Mode | null>(mode);

  if (done) {
    return (
      <p role="status" className="rounded-lg border border-success/25 bg-success-soft p-3 text-sm text-success">
        {done}
      </p>
    );
  }
  if (!mode || !action) {
    return <p className="text-sm text-ink-3">No assignment change is available in this job state.</p>;
  }

  const choices = candidates.filter((c) => c.userId !== currentProfessionalId);
  const needsPro = action !== 'withdraw';
  const valid = reason.trim().length >= 10 && (!needsPro || professionalId !== '');

  function submit() {
    setError(null);
    requestId.current ??= crypto.randomUUID();
    const rid = requestId.current;
    start(async () => {
      try {
        let r;
        if (action === 'assign') {
          r = await adminAssignProfessional({
            bookingId,
            professionalId,
            expectedState: 'none',
            expectedProfessionalId: null,
            reason,
            requestId: rid,
          });
        } else if (action === 'reassign') {
          r = await adminReassignJob({
            jobId,
            expectedState: jobState,
            expectedProfessionalId: currentProfessionalId,
            newProfessionalId: professionalId,
            reason,
            requestId: rid,
          });
        } else {
          r = await adminWithdrawOffer({
            jobId,
            expectedProfessionalId: currentProfessionalId,
            reason,
            requestId: rid,
          });
        }
        if (isAdminFailure(r)) {
          setError(r.error);
          setConfirming(false);
          // A refusal is final for this attempt; a new attempt gets a new key.
          requestId.current = null;
          return;
        }
        setDone(
          action === 'assign'
            ? 'Offer sent to the professional.'
            : action === 'reassign'
              ? 'Job reassigned.'
              : 'Offer withdrawn. The job returns to matching.',
        );
        router.refresh();
      } catch {
        // Unknown outcome: keep the request id so a retry replays instead of repeating.
        setError('Something went wrong and the result is unknown. Press confirm again to retry safely, or reload.');
      }
    });
  }

  return (
    <section className="space-y-3">
      {canWithdraw && mode === 'reassign' && (
        <div role="tablist" className="flex gap-2 text-xs font-semibold">
          {(['reassign', 'withdraw'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={action === m}
              disabled={pending}
              onClick={() => {
                setAction(m);
                setConfirming(false);
                setError(null);
                requestId.current = null;
              }}
              className={`min-h-11 rounded-lg border px-3 ${action === m ? 'border-primary text-ink' : 'border-line text-ink-3'}`}
            >
              {m === 'reassign' ? 'Reassign' : 'Withdraw offer'}
            </button>
          ))}
        </div>
      )}

      {needsPro && (
        <div>
          <label htmlFor="assign-pro" className="block text-xs font-bold text-ink">
            {action === 'assign' ? 'Professional' : 'New professional'}
          </label>
          <select
            id="assign-pro"
            value={professionalId}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              requestId.current = null;
            }}
            disabled={pending}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper p-2 text-sm"
          >
            <option value="">Select…</option>
            {choices.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="assign-reason" className="block text-xs font-bold text-ink">
          Internal reason (admins only)
        </label>
        <textarea
          id="assign-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            requestId.current = null;
          }}
          rows={2}
          maxLength={500}
          disabled={pending}
          placeholder="At least 10 characters."
          className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
        />
      </div>

      {action === 'reassign' && jobState === 'accepted' && (
        <p className="text-xs text-warning">
          The customer already saw this professional accepted. They are told their professional has changed.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
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
              {pending ? 'Saving…' : 'Confirm'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!valid}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {action === 'assign' ? 'Assign' : action === 'reassign' ? 'Reassign' : 'Withdraw offer'}
          </button>
        )}
      </div>
    </section>
  );
}
