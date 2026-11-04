import { describe, expect, it } from 'vitest';
import {
  clampQuantity,
  composeSummary,
  preferenceLines,
  MATERIAL_QUANTITY_MAX,
} from '@/lib/booking/booking-preferences';

describe('clampQuantity', () => {
  it('keeps quantities between 1 and the maximum, as whole numbers', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(2.4)).toBe(2);
    expect(clampQuantity(99)).toBe(MATERIAL_QUANTITY_MAX);
  });
});

describe('preferenceLines', () => {
  it('lists materials with brand and quantity', () => {
    const lines = preferenceLines({
      materials: [{ name: 'Mixer tap', brand: 'Jaquar', quantity: 2 }],
      note: '',
      budget: null,
    });
    expect(lines).toEqual(['Preferred materials: Jaquar Mixer tap × 2']);
  });

  it('states that the budget is not a price', () => {
    const [line] = preferenceLines({ materials: [], note: '', budget: 5000 });
    expect(line).toContain('about ₹5,000');
    expect(line).toContain('This is not a price');
  });

  it('returns nothing when there are no preferences', () => {
    expect(preferenceLines({ materials: [], note: '  ', budget: null })).toEqual([]);
  });
});

describe('composeSummary', () => {
  it('puts the problem first and the preference lines after', () => {
    expect(composeSummary(' Tap drips ', ['Budget preference: about ₹500.'])).toBe(
      'Tap drips\n\nBudget preference: about ₹500.',
    );
  });

  it('returns undefined when there is neither problem nor preferences', () => {
    expect(composeSummary('  ', [])).toBeUndefined();
  });

  it('never exceeds the 1000 character server limit', () => {
    const long = 'x'.repeat(2000);
    const summary = composeSummary(long, ['Materials requested: y'.repeat(100)]);
    expect(summary!.length).toBeLessThanOrEqual(1000);
    expect(summary).toContain('Materials requested:');
  });
});
