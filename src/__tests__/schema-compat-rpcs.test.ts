import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
let profileRow: unknown = { verification_status: 'under_review' };
let jobRow: unknown = { current_state: 'assigned' };

const builder = (row: () => unknown) => {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.single = async () => ({ data: row(), error: null });
  b.maybeSingle = async () => ({ data: row(), error: null });
  return b;
};

const client = {
  rpc,
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) =>
    t === 'professional_profiles'
      ? builder(() => profileRow)
      : t === 'jobs'
        ? builder(() => jobRow)
        : builder(() => ({ id: 'b1', customer_id: 'u1', booking_status: 'confirmed' })),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

import { adminTransition } from '@/lib/services/verification-transition';
import { cancelBooking } from '@/lib/services/bookings';

beforeEach(() => {
  rpc.mockReset();
  profileRow = { verification_status: 'under_review' };
  jobRow = { current_state: 'assigned' };
});

describe('adminTransition', () => {
  it('calls the live RPC with the status just read', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const r = await adminTransition(client as never, 'p1', 'approve', 'looks good');
    expect(r.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('admin_transition_professional_verification', {
      p_professional_id: 'p1',
      p_action: 'approve',
      p_expected_status: 'under_review',
      p_reason: 'looks good',
      p_metadata: {},
    });
  });

  it('surfaces database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Stale request' } });
    expect((await adminTransition(client as never, 'p1', 'suspend', 'reason')).error?.message).toBe('Stale request');
  });

  it('errors when the professional is missing', async () => {
    profileRow = null;
    expect((await adminTransition(client as never, 'p1', 'suspend', 'reason')).error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cancelBooking', () => {
  it('uses customer_cancel_booking with the job state the customer saw', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await cancelBooking('b1');
    expect(rpc).toHaveBeenCalledWith('customer_cancel_booking', {
      p_booking_id: 'b1',
      p_expected_state: 'assigned',
      p_reason_category: 'other',
      p_note: null,
    });
  });

  it('uses no_job when no job exists', async () => {
    jobRow = null;
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await cancelBooking('b1');
    expect(rpc.mock.calls[0][1].p_expected_state).toBe('no_job');
  });

  it('throws on ok=false results', async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: 'STALE_STATE', message: 'changed' }, error: null });
    await expect(cancelBooking('b1')).rejects.toThrow('changed');
  });
});
