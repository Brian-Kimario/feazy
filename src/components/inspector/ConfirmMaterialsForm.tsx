'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isInspectionFailure } from '@/lib/inspections/errors';
import { confirmInspectionMaterials } from '@/lib/services/inspection-actions';
import type { ConfirmedMaterial, MaterialRef } from '@/lib/services/materials';

interface Row {
  checked: boolean;
  quantity: string;
  sourcing: 'customer' | 'feazy';
  note: string;
}

const label = (m: { brand: string | null; name: string }) => `${m.brand ? `${m.brand} ` : ''}${m.name}`;

export function ConfirmMaterialsForm({
  visitId,
  options,
  preferenceIds,
  confirmed,
}: {
  visitId: string;
  options: MaterialRef[];
  preferenceIds: string[];
  confirmed: ConfirmedMaterial[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const initial: Record<string, Row> = {};
    for (const o of options) {
      const c = confirmed.find((x) => x.material_id === o.material_id);
      initial[o.material_id] = {
        // Start from what is already confirmed; on a first visit, from the customer's preferences.
        checked: confirmed.length > 0 ? Boolean(c) : preferenceIds.includes(o.material_id),
        quantity: String(c?.quantity ?? 1),
        sourcing: c?.sourcing ?? 'feazy',
        note: c?.note ?? '',
      };
    }
    return initial;
  });

  if (options.length === 0) return null;

  const update = (id: string, patch: Partial<Row>) => {
    setSaved(false);
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  };

  function save() {
    setError(null);
    const items = options
      .filter((o) => rows[o.material_id]?.checked)
      .map((o) => {
        const r = rows[o.material_id];
        return { materialId: o.material_id, quantity: Number(r.quantity), sourcing: r.sourcing, note: r.note || undefined };
      });
    if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0)) {
      return setError('Enter a quantity above 0 for every selected material.');
    }
    start(async () => {
      try {
        const r = await confirmInspectionMaterials({ visitId, items });
        if (isInspectionFailure(r)) return setError(r.error);
        setSaved(true);
        router.refresh();
      } catch {
        setError('Something went wrong. Reload and check whether the materials were saved.');
      }
    });
  }

  return (
    <section aria-labelledby="confirm-materials" className="mt-6 rounded-xl border border-line bg-paper p-5">
      <h2 id="confirm-materials" className="font-bold text-ink">Confirm materials needed</h2>
      <p className="mt-1 text-sm text-ink-3">
        Tick what the job needs, set the quantity and who arranges it. This is not a price: the quotation fixes cost and the customer approves it.
      </p>
      <ul className="mt-4 space-y-3">
        {options.map((o) => {
          const r = rows[o.material_id];
          const wanted = preferenceIds.includes(o.material_id);
          return (
            <li key={o.material_id} className="rounded-lg border border-line p-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) => update(o.material_id, { checked: e.target.checked })}
                  className="h-4 w-4 accent-teal"
                />
                <span className="font-medium text-ink">{label(o)}</span>
                {wanted && <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal-deep">Customer asked</span>}
              </label>
              {r.checked && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                  <label className="text-xs text-ink-3">
                    Quantity ({o.unit})
                    <input
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(e) => update(o.material_id, { quantity: e.target.value })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm text-ink"
                    />
                  </label>
                  <label className="text-xs text-ink-3">
                    Arranged by
                    <select
                      value={r.sourcing}
                      onChange={(e) => update(o.material_id, { sourcing: e.target.value as Row['sourcing'] })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm text-ink"
                    >
                      <option value="feazy">Feazy / professional</option>
                      <option value="customer">Customer supplies</option>
                    </select>
                  </label>
                  <label className="text-xs text-ink-3">
                    Note (optional)
                    <input
                      value={r.note}
                      maxLength={200}
                      onChange={(e) => update(o.material_id, { note: e.target.value })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm text-ink"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      {saved && !error && <p role="status" className="mt-3 text-sm font-medium text-teal-deep">Materials saved.</p>}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-ink px-5 text-sm font-semibold text-porcelain hover:bg-teal-deep disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save materials'}
      </button>
    </section>
  );
}
