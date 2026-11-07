'use server';

import Razorpay from 'razorpay';
import type { Orders } from 'razorpay/dist/types/orders';
import { createClient } from '@/lib/supabase/server';

// ── SDK initialisation ────────────────────────────────────────────────────────
// Instantiated at module load so a missing secret fails at startup, not at
// the moment a customer tries to pay.
function getRazorpayClient() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      'Razorpay credentials are not configured. ' +
      'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.'
    );
  }
  return new Razorpay({ key_id, key_secret });
}

// ── Return types ──────────────────────────────────────────────────────────────

export interface UPIIntentPaymentCreated {
  success: true;
  order_id:       string;   // Razorpay order id
  amount:         number;   // paise
  currency:       'INR';
  key_id:         string;   // publishable key for checkout.js
  payment_db_id:  string;   // our payments.id — used for callback_url
  customer_name:  string;
  customer_phone: string | null;
}

export interface UPIIntentPaymentError {
  success: false;
  error: string;
}

export type CreateUPIIntentResult = UPIIntentPaymentCreated | UPIIntentPaymentError;

// ── Main server action ────────────────────────────────────────────────────────

/**
 * createUPIIntentPayment
 *
 * Creates a Razorpay order for a completed job and persists a pending
 * payment record. Returns the order details the client needs to open
 * Razorpay checkout.
 *
 * Security guarantees:
 *  - Amount computed in SQL (quote → booking) by job_payment_amount and re-checked by
 *    create_pending_payment, never taken from the client.
 *  - Ownership verified: job.customer_id must match authenticated user.
 *  - Job must be in `completed` state before payment is accepted.
 *  - Idempotent: reuses a pending Razorpay order if one already exists.
 *  - RBI limit (₹1,00,000 per transaction) enforced server-side.
 */
export async function createUPIIntentPayment(
  jobId: string,
): Promise<CreateUPIIntentResult> {
  const supabase = await createClient();

  // ── 1. Authenticate ─────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, error: 'Not authenticated. Please sign in.' };
  }

  // ── 2. Load job — verify ownership ─────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, current_state, customer_id, booking_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { success: false, error: 'Job not found or access denied.' };
  }
  if (job.customer_id !== user.id) {
    return { success: false, error: 'You are not authorised to pay for this job.' };
  }

  // ── 2b. Guard: test bookings never reach the payment provider ──────────────
  // Runs before any Razorpay call. Fails closed if the booking cannot be read.
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('is_test')
    .eq('id', job.booking_id)
    .maybeSingle();
  if (bookingErr || !booking || booking.is_test) {
    return { success: false, error: 'Payment is not available for this job.' };
  }

  // ── 3. Guard: only pay completed jobs ───────────────────────────────────────
  if (job.current_state !== 'completed') {
    return {
      success: false,
      error: `Payment is only available once the job is complete. Current status: ${job.current_state}.`,
    };
  }

  // ── 4. Idempotency — reuse existing pending order ───────────────────────────
  const { data: existing } = await supabase
    .from('payments')
    .select('id, status, provider_reference, amount')
    .eq('job_id', jobId)
    .in('status', ['pending', 'paid'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === 'paid') {
    return { success: false, error: 'This job has already been paid.' };
  }

  if (existing?.status === 'pending' && existing.provider_reference) {
    // Return existing order — safe for page refresh / back-button scenarios
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle();

    return {
      success:        true,
      order_id:       existing.provider_reference,
      amount:         Math.round(Number(existing.amount) * 100),
      currency:       'INR',
      key_id:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      payment_db_id:  existing.id,
      customer_name:  profile?.full_name  ?? 'Customer',
      customer_phone: profile?.phone      ?? null,
    };
  }

  // ── 5. Amount due, computed in SQL ──────────────────────────────────────────
  // job_payment_amount re-checks ownership and the completed state, then returns the latest
  // approved quote total, else the booking's base amount, in paise.
  const { data: amountPaise, error: amountErr } = await supabase.rpc('job_payment_amount', {
    p_job_id: job.id,
  });
  if (amountErr || amountPaise === null) {
    return {
      success: false,
      error: amountErr?.code === '22023'
        ? 'This job has no approved quote or booking price to pay yet.'
        : 'Could not determine the payment amount. Please try again.',
    };
  }

  // RBI per-transaction UPI ceiling: ₹1,00,000
  if (amountPaise > 100_000 * 100) {
    return {
      success: false,
      error: 'Amount exceeds the RBI per-transaction UPI limit of ₹1,00,000. Please contact support.',
    };
  }

  // ── 6. Load customer profile for Razorpay prefill ───────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  // ── 7. Create Razorpay order ─────────────────────────────────────────────────
  let razorpayOrder: Orders.RazorpayOrder;
  try {
    const rzp = getRazorpayClient();
    razorpayOrder = await rzp.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      // Capture automatically so the webhook receives payment.captured. An authorized but
      // uncaptured payment is not money received and is ignored by the webhook.
      payment_capture: true,
      // receipt must be ≤ 40 chars
      receipt:  `job_${jobId.replace(/-/g, '').slice(0, 30)}`,
      notes: {
        job_id:      jobId,
        customer_id: user.id,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown provider error';
    return { success: false, error: `Payment provider error: ${msg}` };
  }

  // ── 8. Persist pending payment record ───────────────────────────────────────
  // create_pending_payment recomputes the amount and refuses the insert if it no longer
  // matches the order, so the stored amount never comes from this process. provider_reference
  // (UNIQUE) holds the Razorpay order id; the webhook looks the payment up by it.
  const { data: paymentId, error: insertErr } = await supabase.rpc('create_pending_payment', {
    p_job_id:             job.id,
    p_provider_reference: razorpayOrder.id,
    p_amount_paise:       amountPaise,
  });

  if (insertErr || !paymentId) {
    return {
      success: false,
      error: insertErr?.code === '23505'
        ? 'A payment for this job is already in progress. Please refresh the page.'
        : insertErr?.code === '22023'
          ? 'The amount due changed. Please refresh the page and try again.'
          : 'Failed to record payment. Please try again.',
    };
  }

  return {
    success:        true,
    order_id:       razorpayOrder.id,
    amount:         amountPaise,
    currency:       'INR',
    key_id:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    payment_db_id:  paymentId,
    customer_name:  profile?.full_name  ?? 'Customer',
    customer_phone: profile?.phone      ?? null,
  };
}
