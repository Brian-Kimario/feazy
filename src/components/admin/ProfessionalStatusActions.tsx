'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reactivateProfessional, suspendProfessional } from '@/lib/services/verification';

/**
 * Suspend (verified) or reactivate (suspended). Suspension withdraws pending offers and flags active jobs for
 * review; the server refuses if the status changed since this page loaded.
 */
export function ProfessionalStatusActions({
  professionalId,
  status,
}: {
  professionalId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const action = status === 'verified' ? 'suspend' : status === 'suspended' ? 'reactivate' : null;

  if (!action) {
    return <p className="text-sm text-ink-3">No suspend or reactivate action is available while the status is {status.replace(/_/g, ' ')}.</p>;
  }

  function submit() {
    setError(null);
    setNote(null);
    start(async () => {
      try {
        const r = await (action === 'suspend' ? suspendProfessional : reactivateProfessional)(professionalId, reason);
        if (r.success === false) {
          setError(r.error);
          return;
        }
        setNote(action === 'suspend' ? 'Professional suspended.' : 'Professional reactivated. They switch availability on themselves.');
        setReason('');
        router.refresh();
      } catch {
        setError('Something went wrong and the result is unknown. Reload to check the status before retrying.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="pro-status-reason" className="block text-xs font-bold text-ink">
        Reason (admins only, at least 5 characters)
      </label>
      <textarea
        id="pro-status-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        disabled={pending}
        className="w-full rounded-lg border border-line bg-paper p-2 text-sm"
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="text-xs text-success">
          {note}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending || reason.trim().length < 5}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? 'Saving…' : action === 'suspend' ? 'Suspend professional' : 'Reactivate professional'}
      </button>
    </div>
  );
}
