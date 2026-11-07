import { describe, expect, it } from 'vitest';
import { estimateMaterials } from './material-estimate';

const tap = { id: 'a', unit: 'piece', indicativePrice: 450, priceUnit: null };
const pipe = { id: 'b', unit: 'metre', indicativePrice: 120, priceUnit: 'metre' };
const cable = { id: 'c', unit: 'metre', indicativePrice: 80, priceUnit: 'roll' };
const unpriced = { id: 'd', unit: 'piece', indicativePrice: null, priceUnit: null };

describe('estimateMaterials', () => {
  it('multiplies guide price by chosen quantity', () => {
    const r = estimateMaterials([tap, pipe], { a: 2, b: 5 }, 1);
    expect(r).toEqual({ estimate: 900 + 600, pricedCount: 2, unpricedCount: 0 });
  });

  it('uses the minimum quantity when none is recorded', () => {
    expect(estimateMaterials([tap], {}, 1).estimate).toBe(450);
  });

  it('excludes prices quoted per a different unit from the total', () => {
    const r = estimateMaterials([cable, pipe], { c: 3, b: 2 }, 1);
    expect(r).toEqual({ estimate: 240, pricedCount: 1, unpricedCount: 1 });
  });

  it('counts materials without a guide price as unpriced', () => {
    expect(estimateMaterials([unpriced], { d: 1 }, 1)).toEqual({ estimate: 0, pricedCount: 0, unpricedCount: 1 });
  });
});
