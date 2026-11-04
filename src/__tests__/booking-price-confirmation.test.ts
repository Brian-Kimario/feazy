import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: state.rpc,
  }),
}));

import { createBookingAction } from '@/app/customer/bookings/new/actions';
import { getFreeInspectionStatus } from '@/lib/services/booking-pricing';

const SERVICE = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const BOOKING = '33333333-3333-4333-8333-333333333333';

function bookingInput(expectedFreeInspection?: boolean) {
  return {
    serviceId: SERVICE,
    propertyId: PROPERTY,
    scheduledStart: new Date(Date.now() + 86_400_000).toISOString(),
    expectedFreeInspection,
  };
}

/** Answers the RPCs a booking touches. `freeInspection` is what the database says right now. */
function database(freeInspection: boolean | Error) {
  state.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_booking_free_inspection') {
      return freeInspection instanceof Error
        ? { data: null, error: { message: freeInspection.message } }
        : { data: freeInspection, error: null };
    }
    if (name === 'create_booking') {
      return { data: [{ booking_id: BOOKING, booking_reference: 'FX-1' }], error: null };
    }
    if (name === 'assign_booking') {
      return { data: { matched: false }, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
}

const callsTo = (name: string) => state.rpc.mock.calls.filter(([n]) => n === name).length;

beforeEach(() => {
  state.user = { id: 'u1' };
  state.rpc.mockReset();
});

describe('createBookingAction price confirmation', () => {
  it('books when the database still matches the price the customer saw', async () => {
    database(false);
    const result = await createBookingAction(bookingInput(false));
    expect(result.success).toBe(true);
    expect(callsTo('create_booking')).toBe(1);
  });

  it('refuses and books nothing when free inspection changed after the price was shown', async () => {
    database(true);
    const result = await createBookingAction(bookingInput(false));
    expect(result).toMatchObject({ success: false, code: 'price_changed' });
    expect(callsTo('create_booking')).toBe(0);
  });

  it('refuses when the current setting cannot be read rather than guessing', async () => {
    database(new Error('function get_booking_free_inspection does not exist'));
    const result = await createBookingAction(bookingInput(false));
    expect(result).toMatchObject({ success: false, code: 'failed' });
    expect(callsTo('create_booking')).toBe(0);
  });

  it('skips the check when the wizard sent no expected setting', async () => {
    database(true);
    const result = await createBookingAction(bookingInput(undefined));
    expect(result.success).toBe(true);
    expect(callsTo('get_booking_free_inspection')).toBe(0);
  });
});

describe('getFreeInspectionStatus', () => {
  const asClient = (rpc: typeof state.rpc) =>
    ({ rpc }) as unknown as Parameters<typeof getFreeInspectionStatus>[0];

  it('returns the database value', async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    await expect(getFreeInspectionStatus(asClient(state.rpc))).resolves.toBe(true);
  });

  it('returns null when the function is missing (migration 119 not applied)', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    await expect(getFreeInspectionStatus(asClient(state.rpc))).resolves.toBeNull();
  });
});
