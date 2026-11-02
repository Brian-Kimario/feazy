'use client';

import { useState, useTransition } from 'react';
import { cancelBookingAction } from '@/app/customer/actions';
import { CUSTOMER_CANCEL_REASONS } from '@/validators/booking';
import type { CancelBookingOutcome } from '@/lib/services/bookings';

type ReasonValue = (typeof CUSTOMER_CANCEL_REASONS)[number]['value'];

/**
 * "Cancel booking" for the booking owner. The database decides: it checks ownership and that the booking
 * is still in the state shown here, so a stale page gets a refusal rather than a surprise cancel.
 * Nothing is refunded by cancelling; the confirmation says so when a payment exists.
 */
export function CancelBookingButton({
  bookingId,
  expectedState,
  professionalAssigned,
  needsReview = false,
}: {
  bookingId: string;
  expectedState: string;
  /** A professional has been offered or accepted, so they will be told. */
  professionalAssigned: boolean;
  /** From arrival onward the request goes to Feazy for review instead of cancelling at once. */
  needsReview?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonValue | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CancelBookingOutcome | null>(null);

  if (done?.outcome === 'review_requested') {
    return (
      <div role="status" className="rounded-2xl border border-line bg-paper p-5 text-sm">
        <p className="font-semibold text-ink">Cancellation under review</p>
        <p className="mt-1 text-ink-2">
          The work has already begun, so Feazy will review your request and contact you. Your booking stays active
          until then.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-paper p-5 text-sm">
        <p className="font-semibold text-ink">Booking cancelled</p>
        {done.paymentReviewRequired && (
          <p className="mt-1 text-ink-2">
            You have already paid for this booking. Cancelling does not refund it automatically. Feazy support will
            review it and contact you.
          </p>
        )}
      </div>
    );
  }

  function submit() {
    if (!reason) {
      setError('Choose a reason');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAction({
        bookingId,
        expectedState,
        reasonCategory: reason,
        note: note || undefined,
      });
      if (result.success === false) setError(result.error);
      else setDone(result.data);
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 text-sm">
      <p className="font-semibold text-ink">Need to cancel?</p>
      {!open ? (
        <>
          <p className="mt-1 text-ink-2">
            {needsReview
              ? 'The work has begun, so Feazy reviews cancellation requests.'
              : 'You can cancel until your professional arrives.'}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-porcelain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {needsReview ? 'Request cancellation' : 'Cancel booking'}
          </button>
        </>
      ) : (
        <fieldset className="mt-1" disabled={pending}>
          <legend className="text-ink-2">
            {professionalAssigned
              ? 'Your professional will be told. Why are you cancelling?'
              : 'Why are you cancelling?'}
          </legend>
          {CUSTOMER_CANCEL_REASONS.map((r) => (
            <label key={r.value} className="mt-1 flex min-h-11 items-center gap-2 text-ink">
              <input type="radio" name="cancel-reason" checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
          <label className="mt-3 block text-xs text-ink-3" htmlFor="cancel-note">
            Anything else we should know? (optional)
          </label>
          <textarea
            id="cancel-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            className="mt-1 w-full rounded-xl border border-line bg-paper p-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
          <p className="mt-2 text-xs text-ink-3">
            If you have already paid, cancelling does not refund it automatically. Support reviews it first.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submit}
              aria-busy={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-danger px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
            >
              {pending ? 'Sending…' : needsReview ? 'Send request' : 'Confirm cancellation'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-ink-3 hover:text-ink">
              Keep booking
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
