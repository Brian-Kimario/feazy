import type { BookingMaterials } from '@/lib/services/materials';
import { formatCurrency } from '@/lib/currency';

const label = (m: { brand: string | null; name: string }) => `${m.brand ? `${m.brand} ` : ''}${m.name}`;

/**
 * Read-only materials summary. Preferences are what the customer asked for; confirmed items are
 * what the inspector says the job needs. Neither is a price: the approved quotation fixes cost and sourcing.
 */
export function MaterialsPanel({ materials, audience }: { materials: BookingMaterials; audience: 'customer' | 'professional' | 'inspector' }) {
  const { preferences, confirmed } = materials;
  if (preferences.length === 0 && confirmed.length === 0) return null;
  return (
    <section aria-labelledby="materials-heading" className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-2">
      <h2 id="materials-heading" className="mb-3 font-bold text-ink">Materials</h2>
      {preferences.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-ink-4">
            {audience === 'customer' ? 'You asked for' : 'Customer preference'}
          </h3>
          <ul className="mt-1.5 space-y-1">
            {preferences.map((m) => (
              <li key={m.material_id}>
                {label(m)}
                {m.indicative_price != null && (
                  <span className="text-ink-3"> · guide about {formatCurrency(m.indicative_price, { minimumFractionDigits: 0 })} per {m.price_unit ?? m.unit}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmed.length > 0 && (
        <div className={preferences.length > 0 ? 'mt-4' : ''}>
          <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Confirmed after inspection</h3>
          <ul className="mt-1.5 space-y-1">
            {confirmed.map((m) => (
              <li key={m.material_id}>
                <span className="font-medium text-ink">{label(m)}</span> · {m.quantity} {m.unit} ·{' '}
                {m.sourcing === 'customer' ? 'customer supplies' : 'Feazy / professional arranges'}
                {m.note && <span className="block text-ink-3">{m.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-4">
        {audience === 'professional'
          ? 'Not a price. Cost and sourcing are final only in the quotation the customer approves.'
          : 'Final cost and sourcing are confirmed in the quotation you approve before any work starts.'}
      </p>
    </section>
  );
}
