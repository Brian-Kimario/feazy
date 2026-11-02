'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminFailure, type AdminResult } from '@/lib/admin/result';
import { adminAssignInspector, adminRecordInspectionCost, adminRegisterInspector } from '@/lib/services/inspection-actions';

const field = 'mt-1 min-h-11 w-full rounded-lg border border-line bg-paper p-2 text-sm font-normal';
const btn = 'min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-porcelain disabled:opacity-50';

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  function run(fn: () => Promise<AdminResult<null>>) {
    setError(null);
    setDone(false);
    start(async () => {
      try {
        const r = await fn();
        if (isAdminFailure(r)) return setError(r.error);
        setDone(true);
        router.refresh();
      } catch {
        setError('Something went wrong. Reload and check before retrying.');
      }
    });
  }
  return { pending, error, done, run };
}

export function RegisterInspectorForm() {
  const { pending, error, done, run } = useRun();
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-ink">
        Account id (a professional-role account)
        <input value={userId} onChange={(e) => setUserId(e.target.value)} className={field} />
      </label>
      <label className="block text-xs font-bold text-ink">
        Name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} className={field} />
      </label>
      <label className="block text-xs font-bold text-ink">
        Phone (optional)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} className={field} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {done && <p role="status" className="text-sm text-success">Saved.</p>}
      <button type="button" disabled={pending || !userId || !displayName} className={btn}
        onClick={() => run(() => adminRegisterInspector({ userId, displayName, phone: phone || undefined, active: true }))}>
        {pending ? 'Saving…' : 'Register inspector'}
      </button>
    </div>
  );
}

export function AssignInspectorForm({
  visitId,
  inspectors,
}: {
  visitId: string;
  inspectors: { userId: string; displayName: string }[];
}) {
  const { pending, error, done, run } = useRun();
  const [inspectorId, setInspectorId] = useState('');
  const [when, setWhen] = useState('');
  function submit() {
    // datetime-local has no offset; interpret it in the admin's timezone and send an ISO instant.
    run(() => adminAssignInspector({ visitId, inspectorId, scheduledStart: new Date(when).toISOString() }));
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-xs font-bold text-ink">
        Inspector
        <select value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} className={field}>
          <option value="">Choose…</option>
          {inspectors.map((i) => (
            <option key={i.userId} value={i.userId}>{i.displayName}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold text-ink">
        Visit time
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
      </label>
      <button type="button" disabled={pending || !inspectorId || !when} onClick={submit} className={btn}>
        {pending ? 'Saving…' : 'Assign'}
      </button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-3">{error}</p>}
      {done && <p role="status" className="text-sm text-success sm:col-span-3">Assigned.</p>}
    </div>
  );
}

export function RecordCostForm({ visitId }: { visitId: string }) {
  const { pending, error, done, run } = useRun();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const n = Number(amount);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
      <label className="text-xs font-bold text-ink">
        Actual cost (₹)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
      </label>
      <label className="text-xs font-bold text-ink">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={field} />
      </label>
      <button type="button" disabled={pending || amount === '' || !Number.isFinite(n)} className={btn}
        onClick={() => run(() => adminRecordInspectionCost({ visitId, amount: n, note: note || undefined }))}>
        {pending ? 'Saving…' : 'Record'}
      </button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-3">{error}</p>}
      {done && <p role="status" className="text-sm text-success sm:col-span-3">Recorded.</p>}
    </div>
  );
}
