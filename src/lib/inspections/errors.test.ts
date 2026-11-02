import { describe, expect, it } from 'vitest';
import { mapInspectionError, rpcFailureMessage } from './errors';

describe('mapInspectionError', () => {
  it('never leaks raw database text', () => {
    expect(mapInspectionError({ code: 'XX000', message: 'relation "secret" does not exist' })).not.toContain('secret');
  });
  it('maps known codes', () => {
    expect(mapInspectionError({ code: '42501' })).toMatch(/not allowed/);
    expect(mapInspectionError({ code: 'P0002' })).toMatch(/not be found/);
  });
});

describe('rpcFailureMessage', () => {
  it('returns the message of an ok:false body only', () => {
    expect(rpcFailureMessage({ ok: false, code: 'x', message: 'Closed' })).toBe('Closed');
    expect(rpcFailureMessage({ ok: true })).toBeNull();
    expect(rpcFailureMessage(null)).toBeNull();
  });
});
