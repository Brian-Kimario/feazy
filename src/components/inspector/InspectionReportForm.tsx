'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isInspectionFailure } from '@/lib/inspections/errors';
import { completeInspection, markInspectionMissed } from '@/lib/services/inspection-actions';

export function InspectionReportForm({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<'repair_needed' | 'no_repair_needed'>('repair_needed');
  const [findings, setFindings] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [missedReason, setMissedReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await completeInspection({ visitId, outcome, findings, recommendation: recommendation || undefined });
        if (isInspectionFailure(r)) return setError(r.error);
        router.refresh();
      } catch {
        setError('Something went wrong. Reload and check whether the report was saved.');
      }
    });
  }

  function missed() {
    setError(null);
    start(async () => {
      try {
        const r = await markInspectionMissed({ visitId, reason: missedReason });
        if (isInspectionFailure(r)) return setError(r.error);
        router.refresh();
      } catch {
        setError('Something went wrong. Reload and try again.');
      }
    });
  }

  const field = 'mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm font-normal';
  return (
    <section className="mt-6 space-y-4 rounded-xl border border-line bg-paper p-5">
      <h2 className="font-bold text-ink">Report</h2>
      <label className="block text-xs font-bold text-ink">
        Outcome
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} disabled={pending} className={`${field} min-h-11`}>
          <option value="repair_needed">Repair needed</option>
          <option value="no_repair_needed">No repair needed (closes the booking)</option>
        </select>
      </label>
      <label className="block text-xs font-bold text-ink">
        Findings (what you saw, shown to the customer)
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={5} maxLength={2000} disabled={pending} className={field} />
      </label>
      <label className="block text-xs font-bold text-ink">
        Recommendation (optional)
        <textarea value={recommendation} onChange={(e) => setRecommendation(e.target.value)} rows={3} maxLength={1000} disabled={pending} className={field} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || findings.trim().length < 10}
        className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-porcelain disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Submit report'}
      </button>

      <div className="border-t border-line pt-4">
        <label className="block text-xs font-bold text-ink">
          Could not complete the visit? Say why
          <input value={missedReason} onChange={(e) => setMissedReason(e.target.value)} maxLength={300} disabled={pending} className={`${field} min-h-11`} />
        </label>
        <button
          type="button"
          onClick={missed}
          disabled={pending || missedReason.trim().length < 3}
          className="mt-2 min-h-11 rounded-xl border border-line-strong px-5 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Mark visit missed
        </button>
      </div>
    </section>
  );
}
