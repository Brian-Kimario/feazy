// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const tables: Record<string, { data: unknown; error: unknown }> = {};

// Chainable stand-in for supabase.from(table): every filter returns itself, and the
// terminal maybeSingle() resolves to whatever the test put in `tables[table]`.
function query(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
  chain.maybeSingle = async () => tables[table] ?? { data: null, error: null };
  chain.insert = () => {
    throw new Error(`unexpected insert into ${table}`);
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from: query, auth: { getUser } }),
}));

const ordersCreate = vi.fn();
vi.mock('razorpay', () => ({
  default: class {
    orders = { create: ordersCreate };
  },
}));

const { createUPIIntentPayment } = await import('./createUPIIntentPayment');

describe('createUPIIntentPayment', () => {
  beforeEach(() => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_key');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'not-a-real-secret');
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_test_key');
    rpc.mockReset();
    ordersCreate.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'cust-1' } }, error: null });
    tables.jobs = {
      data: { id: 'job-1', current_state: 'completed', customer_id: 'cust-1', booking_id: 'b-1' },
      error: null,
    };
    tables.payments = { data: null, error: null };
    tables.profiles = { data: { full_name: 'Asha', phone: null }, error: null };
    tables.bookings = { data: { is_test: false }, error: null };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('orders the SQL-computed amount and records it through create_pending_payment', async () => {
    rpc
      .mockResolvedValueOnce({ data: 49950, error: null })
      .mockResolvedValueOnce({ data: 'pay-1', error: null });
    ordersCreate.mockResolvedValue({ id: 'order_abc' });

    const result = await createUPIIntentPayment('job-1');

    expect(result).toMatchObject({ success: true, order_id: 'order_abc', amount: 49950, payment_db_id: 'pay-1' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'job_payment_amount', { p_job_id: 'job-1' });
    expect(ordersCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 49950, currency: 'INR' }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_pending_payment', {
      p_job_id: 'job-1',
      p_provider_reference: 'order_abc',
      p_amount_paise: 49950,
    });
  });

  it('does not create an order when there is no payable amount', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'No payable amount' } });
    const result = await createUPIIntentPayment('job-1');
    expect(result).toMatchObject({ success: false });
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('fails when the amount changed between the order and the insert', async () => {
    rpc
      .mockResolvedValueOnce({ data: 49950, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'does not match' } });
    ordersCreate.mockResolvedValue({ id: 'order_abc' });

    const result = await createUPIIntentPayment('job-1');
    expect(result).toEqual({ success: false, error: 'The amount due changed. Please refresh the page and try again.' });
  });

  it('reports a concurrent checkout instead of a second payment', async () => {
    rpc
      .mockResolvedValueOnce({ data: 49950, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'in progress' } });
    ordersCreate.mockResolvedValue({ id: 'order_abc' });

    const result = await createUPIIntentPayment('job-1');
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('already in progress') });
  });

  it('refuses a test booking before any RPC or provider call', async () => {
    tables.bookings = { data: { is_test: true }, error: null };
    rpc.mockResolvedValueOnce({ data: 49950, error: null });
    ordersCreate.mockResolvedValue({ id: 'order_should_not_exist' });

    const result = await createUPIIntentPayment('job-1');

    expect(result).toEqual({ success: false, error: 'Payment is not available for this job.' });
    expect(ordersCreate).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the booking cannot be read', async () => {
    tables.bookings = { data: null, error: { code: '42501', message: 'denied' } };
    const result = await createUPIIntentPayment('job-1');
    expect(result).toMatchObject({ success: false });
    expect(ordersCreate).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a job that is not completed before any RPC', async () => {
    tables.jobs = {
      data: { id: 'job-1', current_state: 'in_progress', customer_id: 'cust-1', booking_id: 'b-1' },
      error: null,
    };
    const result = await createUPIIntentPayment('job-1');
    expect(result).toMatchObject({ success: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
