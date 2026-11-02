import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: state.rpc,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ clearSessionCookies: vi.fn() }));

import { cancelBooking } from '@/lib/services/bookings';
import { cancelBookingAction } from '@/app/customer/actions';
import { revalidatePath } from 'next/cache';
import { cancelBookingSchema, CUSTOMER_CANCEL_REASONS } from '@/validators/booking';

const BOOKING = '33333333-3333-4333-8333-333333333333';
const valid = { bookingId: BOOKING, expectedState: 'assigned', reasonCategory: 'changed_my_mind' as const };
const success = {
  ok: true, booking_id: BOOKING, job_id: '44444444-4444-4444-8444-444444444444', from_state: 'assigned',
  to_state: 'cancelled', offer_withdrawn: true, payment_review_required: false,
  paid_payment_count: 0, pending_payment_count: 0,
};

beforeEach(() => {
  state.user = { id: 'u1' };
  state.rpc.mockReset();
  vi.mocked(revalidatePath).mockClear();
});

describe('cancelBookingSchema', () => {
  it('trims the note and drops an empty one', () => {
    expect(cancelBookingSchema.safeParse({ ...valid, note: '  hi ' }).data?.note).toBe('hi');
    expect(cancelBookingSchema.safeParse({ ...valid, note: '   ' }).data?.note).toBeUndefined();
  });

  it.each([
    ['bad id', { ...valid, bookingId: 'x' }],
    ['missing state', { ...valid, expectedState: '' }],
    ['unknown reason', { ...valid, reasonCategory: 'because' }],
    ['missing reason', { ...valid, reasonCategory: undefined }],
    ['long note', { ...valid, note: 'a'.repeat(301) }],
  ])('rejects %s', (_n, input) => expect(cancelBookingSchema.safeParse(input).success).toBe(false));

  it('offers exactly the categories the database accepts', () => {
    expect(CUSTOMER_CANCEL_REASONS.map((r) => r.value).sort()).toEqual([
      'booked_by_mistake', 'changed_my_mind', 'found_other_help', 'other', 'price_concern', 'schedule_conflict',
    ]);
  });
});

describe('cancelBooking review outcome', () => {
  it('maps a review request and defaults old responses to cancelled', async () => {
    state.rpc.mockResolvedValueOnce({ data: { ...success, outcome: 'review_requested', from_state: 'in_progress', to_state: 'in_progress' }, error: null });
    const review = await cancelBooking({ ...valid, expectedState: 'in_progress' });
    expect(review.success && review.data.outcome).toBe('review_requested');
    state.rpc.mockResolvedValueOnce({ data: success, error: null });
    const legacy = await cancelBooking(valid);
    expect(legacy.success && legacy.data.outcome).toBe('cancelled');
  });
});

describe('cancelBooking service', () => {
  it('rejects invalid input without calling the database', async () => {
    const r = await cancelBooking({ ...valid, bookingId: 'x' });
    expect(r.success).toBe(false);
    expect(r.success === false && r.code).toBe('invalid_input');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    state.user = null;
    const r = await cancelBooking(valid);
    expect(r.success === false && r.code).toBe('unauthenticated');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('calls customer_cancel_booking with the validated arguments and returns the outcome', async () => {
    state.rpc.mockResolvedValue({ data: success, error: null });
    const r = await cancelBooking({ ...valid, note: ' later ' });
    expect(state.rpc).toHaveBeenCalledWith('customer_cancel_booking', {
      p_booking_id: BOOKING, p_expected_state: 'assigned', p_reason_category: 'changed_my_mind', p_note: 'later',
    });
    expect(r).toEqual({
      success: true,
      data: { outcome: 'cancelled', bookingId: BOOKING, jobId: success.job_id, fromState: 'assigned', offerWithdrawn: true, paymentReviewRequired: false },
    });
  });

  it('surfaces the payment review flag', async () => {
    state.rpc.mockResolvedValue({ data: { ...success, payment_review_required: true }, error: null });
    const r = await cancelBooking(valid);
    expect(r.success && r.data.paymentReviewRequired).toBe(true);
  });

  it.each(['STALE_STATE', 'NOT_ELIGIBLE', 'ALREADY_CANCELLED'])('turns refusal %s into a rejected result', async (code) => {
    state.rpc.mockResolvedValue({ data: { ok: false, code, message: 'Refused for a reason.' }, error: null });
    const r = await cancelBooking(valid);
    expect(r).toMatchObject({ success: false, code: 'rejected', error: 'Refused for a reason.' });
  });

  it.each([
    ['42501', 'unauthenticated'],
    ['P0002', 'not_found'],
    ['22023', 'invalid_input'],
    ['40P01', 'failed'],
    ['XX000', 'failed'],
  ])('maps database error %s to %s without leaking details', async (pgCode, code) => {
    state.rpc.mockResolvedValue({ data: null, error: { code: pgCode, message: 'secret internal detail' } });
    const r = await cancelBooking(valid);
    expect(r.success).toBe(false);
    expect(r.success === false && r.code).toBe(code);
    expect(JSON.stringify(r)).not.toContain('secret internal detail');
  });

  it('gives a retry message for a deadlock', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '40P01', message: 'deadlock detected' } });
    const r = await cancelBooking(valid);
    expect(r.success === false && r.error).toMatch(/try again/i);
  });

  it('never reports success for an unexpected RPC payload', async () => {
    state.rpc.mockResolvedValue({ data: { weird: true }, error: null });
    const r = await cancelBooking(valid);
    expect(r.success).toBe(false);
  });
});

describe('cancelBookingAction', () => {
  it('revalidates customer pages only on success', async () => {
    state.rpc.mockResolvedValue({ data: success, error: null });
    expect((await cancelBookingAction(valid)).success).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/customer', 'layout');

    vi.mocked(revalidatePath).mockClear();
    state.rpc.mockResolvedValue({ data: { ok: false, code: 'STALE_STATE', message: 'x' }, error: null });
    expect((await cancelBookingAction(valid)).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('customer cancel wiring (static)', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../lib/services/bookings.ts'), 'utf8');
  // Only the cancel section: the rest of the file predates this slice.
  const src = file.slice(file.indexOf('export interface CancelBookingOutcome'), file.indexOf('Get booking statistics'));
  it('uses the RPC, with no ts-ignore, console or direct status writes', () => {
    expect(src).toContain("rpc('customer_cancel_booking'");
    expect(src).not.toContain('@ts-ignore');
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/transition_booking_state/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/current_state:|booking_status:/);
  });
});
