'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { adminRecoverSuspendedProfessional } from '@/lib/services/admin-assignment';
import { isAdminFailure } from '@/lib/admin/result';

const MAX_BATCHES = 20;

/**
 * Runs phase 2 of a suspension again: releases pending offers and flags active jobs for review, one batch per
 * call, until the server says it is done. Safe to repeat; each batch is its own transaction.
 */
export function RetryRecoveryButton({ professionalId }: { professionalId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    start(async () => {
      try {
        for (let i = 0; i < MAX_BATCHES; i++) {
          const r = await adminRecoverSuspendedProfessional({ professionalId, limit: 25 });
          if (isAdminFailure(r)) {
            setMessage(r.error);
            toast(r.error, 'error');
            return;
          }
          if (r.data.done) {
            const m = 'Recovery finished. Offers are released and active jobs are flagged for review.';
            setMessage(m);
            toast(m, 'success');
            router.refresh();
            return;
          }
        }
        const m = 'Recovery is still running. Run it again to continue.';
        setMessage(m);
        toast(m, 'error');
        router.refresh();
      } catch {
        setMessage('Something went wrong and the result is unknown. Reload to check before retrying.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="min-h-11 rounded-lg border border-line bg-paper px-4 text-sm font-semibold text-ink hover:bg-paper-2 disabled:opacity-60"
      >
        {pending ? 'Running recovery…' : 'Retry recovery'}
      </button>
      <p className="text-xs text-ink-3">Releases pending offers and flags active jobs for review. Safe to repeat.</p>
      {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
    </div>
  );
}
