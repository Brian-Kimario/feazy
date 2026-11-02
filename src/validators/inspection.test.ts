import { describe, expect, it } from 'vitest';
import {
  assignInspectorInput,
  completeInspectionInput,
  confirmMaterialsInput,
  setMaterialPriceInput,
  markMissedInput,
  recordInspectionCostInput,
  registerInspectorInput,
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
  it('limits confirmed materials to 20 uuids', () => {
    expect(confirmMaterialsInput.safeParse({ visitId: id, materialIds: [id] }).success).toBe(true);
    expect(confirmMaterialsInput.safeParse({ visitId: id, materialIds: Array(21).fill(id) }).success).toBe(false);
    expect(confirmMaterialsInput.safeParse({ visitId: id, materialIds: ['x'] }).success).toBe(false);
  });
  it('accepts a null price to clear it but not a negative one', () => {
    expect(setMaterialPriceInput.safeParse({ materialId: id, price: null }).success).toBe(true);
    expect(setMaterialPriceInput.safeParse({ materialId: id, price: -1 }).success).toBe(false);
  });
});
