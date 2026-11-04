/**
 * Customer preferences that travel with a booking request: materials, quantities, a rough budget
 * and a free-text note. None of them is a price. create_booking never reads them, so they can
 * change what the professional is asked to look at but never what the customer is charged.
 */

export const MATERIAL_QUANTITY_MIN = 1;
export const MATERIAL_QUANTITY_MAX = 10;
export const BUDGET_MIN = 500;
export const BUDGET_MAX = 20000;
export const BUDGET_STEP = 500;
/** Matches the server's problem summary limit (createBookingSchema). */
const SUMMARY_MAX = 1000;

export interface MaterialPreference {
  name: string;
  brand: string | null;
  quantity: number;
}

export function clampQuantity(value: number): number {
  return Math.min(MATERIAL_QUANTITY_MAX, Math.max(MATERIAL_QUANTITY_MIN, Math.round(value)));
}

/** Lines the professional reads before accepting. The budget line says plainly that it is not a price. */
export function preferenceLines({
  materials,
  note,
  budget,
}: {
  materials: MaterialPreference[];
  note: string;
  budget: number | null;
}): string[] {
  const lines: string[] = [];
  if (materials.length > 0) {
    const list = materials
      .map((m) => `${m.brand ? `${m.brand} ` : ''}${m.name} × ${clampQuantity(m.quantity)}`)
      .join(', ');
    lines.push(`Preferred materials: ${list}`);
  }
  const trimmed = note.trim();
  if (trimmed) lines.push(`Materials requested: ${trimmed}`);
  if (budget != null) {
    lines.push(
      `Budget preference: about ₹${budget.toLocaleString('en-IN')}. This is not a price; the approved quotation sets the cost.`,
    );
  }
  return lines;
}

/** Problem text first, then the preference lines. Trims the problem text so the whole fits the server limit. */
export function composeSummary(problem: string, lines: string[]): string | undefined {
  const suffix = lines.join('\n').slice(0, SUMMARY_MAX);
  const room = SUMMARY_MAX - (suffix ? suffix.length + 2 : 0);
  const p = problem.trim().slice(0, Math.max(0, room));
  return [p, suffix].filter(Boolean).join('\n\n') || undefined;
}
