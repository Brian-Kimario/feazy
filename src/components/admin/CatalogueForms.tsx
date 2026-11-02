'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isAdminFailure, type AdminResult } from '@/lib/admin/result';
import {
  adminSetCategoryAvailability,
  adminSetMaterialPrice,
  adminSetMaterialServices,
  adminUpsertMaterial,
} from '@/lib/services/inspection-actions';
import type { CatalogueMaterial } from '@/lib/services/admin-catalogue-reads';

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

function Status({ error, done }: { error: string | null; done: boolean }) {
  if (error) return <p role="alert" className="text-xs text-danger">{error}</p>;
  return done ? <p role="status" className="text-xs text-ink-3">Saved.</p> : null;
}

export function CategoryAvailabilityForm({ categoryId, availability }: { categoryId: string; availability: string }) {
  const { pending, error, done, run } = useRun();
  const [value, setValue] = useState(availability);
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <label className="text-xs font-bold text-ink">
          Availability
          <select value={value} onChange={(e) => setValue(e.target.value)} className={field}>
            <option value="bookable">Bookable</option>
            <option value="manual_assignment">Manual assignment</option>
            <option value="coming_soon">Coming soon</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending || value === availability}
          onClick={() => run(() => adminSetCategoryAvailability({ categoryId, availability: value }))}
          className={btn}
        >
          Save
        </button>
      </div>
      <Status error={error} done={done} />
    </div>
  );
}

export function MaterialEditor({
  material,
  services,
}: {
  material: CatalogueMaterial | null;
  services: { id: string; name: string }[];
}) {
  const { pending, error, done, run } = useRun();
  const [name, setName] = useState(material?.name ?? '');
  const [brand, setBrand] = useState(material?.brand ?? '');
  const [specification, setSpecification] = useState(material?.specification ?? '');
  const [unit, setUnit] = useState(material?.unit ?? 'piece');
  const [isActive, setIsActive] = useState(material?.isActive ?? true);
  const [price, setPrice] = useState(material?.indicativePrice != null ? String(material.indicativePrice) : '');
  const [priceUnit, setPriceUnit] = useState(material?.priceUnit ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(material?.serviceIds ?? []);

  function save() {
    run(async () => {
      const r = await adminUpsertMaterial({
        id: material?.id,
        name,
        brand,
        specification,
        unit,
        isActive,
      });
      if (isAdminFailure(r) || !material) return r;
      const priceRes = await adminSetMaterialPrice({
        materialId: material.id,
        price: price.trim() === '' ? null : Number(price),
        unit: priceUnit,
      });
      if (isAdminFailure(priceRes)) return priceRes;
      return adminSetMaterialServices({ materialId: material.id, serviceIds });
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-ink">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={field} />
        </label>
        <label className="text-xs font-bold text-ink">
          Brand (optional)
          <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} className={field} />
        </label>
        <label className="text-xs font-bold text-ink">
          Specification (optional)
          <input value={specification} onChange={(e) => setSpecification(e.target.value)} maxLength={300} className={field} />
        </label>
        <label className="text-xs font-bold text-ink">
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} className={field} />
        </label>
        {material && (
          <>
            <label className="text-xs font-bold text-ink">
              Guide price, ₹ (blank = confirmed in quotation)
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={field} />
            </label>
            <label className="text-xs font-bold text-ink">
              Price per
              <input value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)} maxLength={30} className={field} />
            </label>
          </>
        )}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
      </label>
      {material && (
        <fieldset>
          <legend className="text-xs font-bold text-ink">Offered for these services</legend>
          <div className="mt-1 grid gap-1 md:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  onChange={(e) =>
                    setServiceIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button type="button" disabled={pending} onClick={save} className={btn}>
        {material ? 'Save material' : 'Add material'}
      </button>
      <Status error={error} done={done} />
    </div>
  );
}
