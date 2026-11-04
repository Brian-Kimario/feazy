// @vitest-environment node
import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from, auth: { getUser } }),
}));

const { createBookingAction } = await import('./actions');

const input = () => ({
  serviceId: randomUUID(),
  propertyId: randomUUID(),
  scheduledStart: new Date(Date.now() + 2 * 86_400_000).toISOString(),
});

describe('createBookingAction', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'cust-1' } }, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates the booking through the RPC and never inserts directly', async () => {
    const payload = input();
    rpc
      .mockResolvedValueOnce({ data: [{ booking_id: 'b-1', booking_reference: 'FX-1001' }], error: null })
      .mockResolvedValueOnce({ data: { matched: true }, error: null });

    const result = await createBookingAction(payload);

    expect(result).toEqual({
      success: true,
      data: { bookingId: 'b-1', bookingReference: 'FX-1001', matched: true },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'create_booking', {
      p_service_id: payload.serviceId,
      p_property_id: payload.propertyId,
      p_scheduled_start: payload.scheduledStart,
      p_problem_summary: undefined,
      p_options: {},
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'assign_booking', { p_booking_id: 'b-1' });
    expect(from).not.toHaveBeenCalled();
  });

  it('passes the problem summary and chosen options to the RPC', async () => {
    const optionId = randomUUID();
    rpc
      .mockResolvedValueOnce({ data: [{ booking_id: 'b-1', booking_reference: 'FX-1001' }], error: null })
      .mockResolvedValueOnce({ data: { matched: true }, error: null });

    await createBookingAction({
      ...input(),
      problemSummary: '  Tap drips constantly  ',
      selectedOptions: { [optionId]: 'kitchen' },
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_booking', expect.objectContaining({
      p_problem_summary: 'Tap drips constantly',
      p_options: { [optionId]: 'kitchen' },
    }));
  });

  it('explains a stale option instead of failing generically', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Unknown option for service' } });
    const result = await createBookingAction(input());
    expect(result).toMatchObject({ success: false, code: 'rejected' });
    if (result.success === false) expect(result.error).toMatch(/no longer available/);
  });

  it('keeps the booking when assignment fails', async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ booking_id: 'b-1', booking_reference: 'FX-1001' }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    const result = await createBookingAction(input());
    expect(result).toMatchObject({ success: true, data: { matched: false } });
  });

  it('rejects a past date before calling the database', async () => {
    const result = await createBookingAction({ ...input(), scheduledStart: '2020-01-01T00:00:00Z' });
    expect(result).toMatchObject({ success: false, code: 'invalid_input' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns unauthenticated without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await createBookingAction(input());
    expect(result).toMatchObject({ success: false, code: 'unauthenticated' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', 'not_found'],
    ['22023', 'rejected'],
    ['42501', 'rejected'],
    ['08006', 'failed'],
  ])('maps RPC error %s to %s', async (code, expected) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'x' } });
    const result = await createBookingAction(input());
    expect(result).toMatchObject({ success: false, code: expected });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // Customer-facing copy for each refusal the database can return. The wording is what the customer reads.
  it.each([
    ['P0008', 'rejected', /do not serve this area yet/],
    ['P0009', 'rejected', /refresh the page and book again/],
    ['P0005', 'rejected', /already have an inspection booked/],
    ['P0006', 'rejected', /No inspector is free/],
    ['P0007', 'rejected', /several booking requests in the last hour/],
    ['P0003', 'price_changed', /price for this service has changed/],
  ])('shows the copy for %s', async (code, expectedCode, copy) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'x' } });
    const result = await createBookingAction(input());
    expect(result).toMatchObject({ success: false, code: expectedCode });
    if (result.success === false) expect(result.error).toMatch(copy);
  });
});
