import { describe, expect, it } from 'vitest';
import {
  assignInspectorInput,
  completeInspectionInput,
  confirmMaterialsInput,
  setMaterialPriceInput,
  markMissedInput,
  recordInspectionCostInput,
  registerInspectorInput,
  setCategoryAvailabilityInput,
  upsertMaterialInput,
  setMaterialServicesInput,
} from './inspection';

const id = '11111111-1111-4111-8111-111111111111';

describe('completeInspectionInput', () => {
  it('accepts a valid report and trims text', () => {
    const r = completeInspectionInput.parse({ visitId: id, outcome: 'repair_needed', findings: '  Pipe is corroded at joint.  ' });
    expect(r.findings).toBe('Pipe is corroded at joint.');
  });
  it('rejects short findings and unknown outcomes', () => {
    expect(completeInspectionInput.safeParse({ visitId: id, outcome: 'repair_needed', findings: 'short' }).success).toBe(false);
    expect(completeInspectionInput.safeParse({ visitId: id, outcome: 'free_repair', findings: 'long enough text' }).success).toBe(false);
  });
  it('rejects oversized findings', () => {
    expect(completeInspectionInput.safeParse({ visitId: id, outcome: 'no_repair_needed', findings: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('markMissedInput', () => {
  it('requires a reason', () => {
    expect(markMissedInput.safeParse({ visitId: id, reason: '' }).success).toBe(false);
    expect(markMissedInput.safeParse({ visitId: id, reason: 'Customer absent' }).success).toBe(true);
  });
});

describe('recordInspectionCostInput', () => {
  it('bounds the amount like the database', () => {
    expect(recordInspectionCostInput.safeParse({ visitId: id, amount: -1 }).success).toBe(false);
    expect(recordInspectionCostInput.safeParse({ visitId: id, amount: 100001 }).success).toBe(false);
    expect(recordInspectionCostInput.safeParse({ visitId: id, amount: 250.5 }).success).toBe(true);
  });
});

describe('assignInspectorInput', () => {
  it('requires an ISO instant', () => {
    expect(assignInspectorInput.safeParse({ visitId: id, inspectorId: id, scheduledStart: 'tomorrow' }).success).toBe(false);
    expect(assignInspectorInput.safeParse({ visitId: id, inspectorId: id, scheduledStart: '2026-11-05T10:00:00.000Z' }).success).toBe(true);
  });
});

describe('registerInspectorInput', () => {
  it('defaults to active and needs a name', () => {
    expect(registerInspectorInput.parse({ userId: id, displayName: 'Asha' }).active).toBe(true);
    expect(registerInspectorInput.safeParse({ userId: id, displayName: ' ' }).success).toBe(false);
  });
});

describe('material inputs', () => {
  it('validates confirmed material items', () => {
    const item = { materialId: id, quantity: 2, sourcing: 'feazy' as const };
    expect(confirmMaterialsInput.safeParse({ visitId: id, items: [item] }).success).toBe(true);
    expect(confirmMaterialsInput.safeParse({ visitId: id, items: [item, item] }).success).toBe(false);
    expect(confirmMaterialsInput.safeParse({ visitId: id, items: [{ ...item, quantity: 0 }] }).success).toBe(false);
    expect(confirmMaterialsInput.safeParse({ visitId: id, items: [{ ...item, sourcing: 'x' }] }).success).toBe(false);
  });
  it('accepts a null price to clear it but not a negative one', () => {
    expect(setMaterialPriceInput.safeParse({ materialId: id, price: null }).success).toBe(true);
    expect(setMaterialPriceInput.safeParse({ materialId: id, price: -1 }).success).toBe(false);
  });
});

describe('admin catalogue validators', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('accepts only known availabilities', () => {
    expect(setCategoryAvailabilityInput.safeParse({ categoryId: id, availability: 'coming_soon' }).success).toBe(true);
    expect(setCategoryAvailabilityInput.safeParse({ categoryId: id, availability: 'open' }).success).toBe(false);
    expect(setCategoryAvailabilityInput.safeParse({ categoryId: 'x', availability: 'bookable' }).success).toBe(false);
  });

  it('requires a name and unit for materials, with bounds', () => {
    const ok = { name: 'Tap', unit: 'piece', isActive: true };
    expect(upsertMaterialInput.safeParse(ok).success).toBe(true);
    expect(upsertMaterialInput.safeParse({ ...ok, name: '  ' }).success).toBe(false);
    expect(upsertMaterialInput.safeParse({ ...ok, unit: '' }).success).toBe(false);
    expect(upsertMaterialInput.safeParse({ ...ok, name: 'x'.repeat(121) }).success).toBe(false);
    expect(upsertMaterialInput.safeParse({ ...ok, id: 'nope' }).success).toBe(false);
  });

  it('accepts a service list that can be empty and rejects non-uuids', () => {
    expect(setMaterialServicesInput.safeParse({ materialId: id, serviceIds: [] }).success).toBe(true);
    expect(setMaterialServicesInput.safeParse({ materialId: id, serviceIds: [id] }).success).toBe(true);
    expect(setMaterialServicesInput.safeParse({ materialId: id, serviceIds: ['bad'] }).success).toBe(false);
  });
});
