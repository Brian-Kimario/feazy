'use client';

import { useState } from 'react';
import { CANCEL_CUSTOMER_REASONS } from '@/validators/admin';
import { Dialog } from '@/components/ui/Dialog';

interface CancelJobDialogProps {
  reference: string | null;
  state: string;
  hasProfessional: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: (customerReasonCategory: string, reason: string) => void;
  onClose: () => void;
}

/**
 * Collects the two reasons an admin cancellation needs: the customer-facing category (shown to the
 * customer in plain language) and the internal reason (stored for admins only, never shown to them).
 */
export default function CancelJobDialog({
  reference,
  state,
  hasProfessional,
  pending,
  error,
  onConfirm,
  onClose,
}: CancelJobDialogProps) {
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const valid = category !== '' && reason.trim().length >= 5;

  return (
    <Dialog
      title={`Cancel ${reference ?? 'this job'}`}
      onClose={onClose}
      dismissible={!pending}
      description={`The customer ${hasProfessional ? 'and the assigned professional are' : 'is'} notified. Payments are not changed and nothing is refunded automatically; a paid booking is flagged for financial review.`}
      closeLabel="Close cancellation dialog"
    >
      <div className="space-y-3">
        <label className="block text-xs font-bold text-ink" htmlFor="cancel-category">
          Reason shown to the customer <span className="text-clay">*</span>
        </label>
        <select
          id="cancel-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl border border-line bg-white p-3 text-sm"
        >
          <option value="">Choose a reason…</option>
          {CANCEL_CUSTOMER_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <label className="block text-xs font-bold text-ink" htmlFor="cancel-reason">
          Internal reason (admins only) <span className="text-clay">*</span>
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="At least 5 characters. Not shown to the customer or professional."
          className="w-full rounded-xl border border-line p-3 text-sm"
        />

        <p className="text-[11px] text-ink-3">Job is currently: {state.replace(/_/g, ' ')}. If it has changed, the cancellation is refused.</p>
        {error && <p role="alert" className="text-xs text-clay">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl border border-line disabled:opacity-50">
            Keep job
          </button>
          <button
            disabled={!valid || pending}
            onClick={() => onConfirm(category, reason.trim())}
            className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl bg-clay text-white disabled:opacity-50"
          >
            {pending ? 'Cancelling…' : 'Cancel job'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
