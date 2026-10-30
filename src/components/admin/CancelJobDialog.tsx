'use client';

import { useState } from 'react';
import { CANCEL_CUSTOMER_REASONS } from '@/validators/admin';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-job-title">
      <div className="absolute inset-0 bg-[#18211F]/40" onClick={pending ? undefined : onClose} />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#FFFEFA] p-5 space-y-3">
        <h3 id="cancel-job-title" className="font-bold text-[#18211F]">
          Cancel {reference ?? 'this job'}
        </h3>
        <p className="text-xs text-[#5A6661]">
          The customer {hasProfessional ? 'and the assigned professional are' : 'is'} notified. Payments are not changed
          and nothing is refunded automatically; a paid booking is flagged for financial review.
        </p>

        <label className="block text-xs font-bold text-[#18211F]" htmlFor="cancel-category">
          Reason shown to the customer <span className="text-[#A9523D]">*</span>
        </label>
        <select
          id="cancel-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl border border-[#D9DED8] bg-white p-3 text-sm"
        >
          <option value="">Choose a reason…</option>
          {CANCEL_CUSTOMER_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <label className="block text-xs font-bold text-[#18211F]" htmlFor="cancel-reason">
          Internal reason (admins only) <span className="text-[#A9523D]">*</span>
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="At least 5 characters. Not shown to the customer or professional."
          className="w-full rounded-xl border border-[#D9DED8] p-3 text-sm"
        />

        <p className="text-[11px] text-[#7C8681]">Job is currently: {state.replace(/_/g, ' ')}. If it has changed, the cancellation is refused.</p>
        {error && <p role="alert" className="text-xs text-[#A9523D]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm font-bold rounded-xl border border-[#D9DED8] disabled:opacity-50">
            Keep job
          </button>
          <button
            disabled={!valid || pending}
            onClick={() => onConfirm(category, reason.trim())}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-[#A9523D] text-white disabled:opacity-50"
          >
            {pending ? 'Cancelling…' : 'Cancel job'}
          </button>
        </div>
      </div>
    </div>
  );
}
