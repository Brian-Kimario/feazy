/** Shape the estimate needs; a subset of the wizard's material record. */
export interface EstimatableMaterial {
  id: string;
  unit: string;
  indicativePrice: number | null;
  priceUnit: string | null;
}

/**
 * Indicative total for the selected materials. Display only: the server prices the booking from the
 * database, and the itemised quotation is confirmed by the professional and approved by the customer.
 * A guide price is multiplied by quantity only when it is quoted per the same unit as the quantity.
 */
export function estimateMaterials(
  chosen: readonly EstimatableMaterial[],
  quantities: Readonly<Record<string, number>>,
  minQuantity: number,
): { estimate: number; pricedCount: number; unpricedCount: number } {
  let estimate = 0;
  let pricedCount = 0;
  for (const m of chosen) {
    const comparable = m.indicativePrice != null && (m.priceUnit == null || m.priceUnit === m.unit);
    if (!comparable || m.indicativePrice == null) continue;
    pricedCount += 1;
    estimate += m.indicativePrice * (quantities[m.id] ?? minQuantity);
  }
  return { estimate, pricedCount, unpricedCount: chosen.length - pricedCount };
}
