'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import {
  createUPIIntentPayment,
  type UPIIntentPaymentCreated,
} from '@/lib/payments/createUPIIntentPayment';

// ── Razorpay window type ──────────────────────────────────────────────────────
// Declared locally to avoid shipping @types/razorpay in the client bundle.
declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => { open(): void };
  }
}

interface RazorpayCheckoutOptions {
  key:          string;
  order_id:     string;
  amount:       number;
  currency:     string;
  name:         string;
  description:  string;
  prefill?:     { name?: string; contact?: string };
  method?:      { upi?: boolean; card?: boolean; netbanking?: boolean; wallet?: boolean };
  theme?:       { color?: string };
  timeout?:     number;
  redirect?:    boolean;
  callback_url?: string;
  modal?:       { escape?: boolean; ondismiss?: () => void };
}

// ── State machine ─────────────────────────────────────────────────────────────

type CheckoutPhase =
  | { phase: 'idle' }
  | { phase: 'loading_sdk' }
  | { phase: 'creating_order' }
  | { phase: 'awaiting_payment' }
  | { phase: 'dismissed' }                    // user closed the modal
  | { phase: 'error'; message: string };

// ── Props ─────────────────────────────────────────────────────────────────────

interface UPIIntentCheckoutProps {
  jobId: string;
  /** Displayed to the user while the order is being prepared. In rupees. */
  displayAmountRupees: number;
}

// ── SDK loader ────────────────────────────────────────────────────────────────

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && typeof window.Razorpay === 'function') {
      resolve();
      return;
    }
    const SCRIPT_ID = 'razorpay-checkout-js';
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // Script is already in the DOM (injected by a previous render); wait for it
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay SDK failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id  = SCRIPT_ID;
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment SDK. Please check your connection and try again.'));
    document.head.appendChild(script);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * UPIIntentCheckout
 *
 * Renders a "Pay via UPI" button. On click:
 *  1. Calls createUPIIntentPayment() server action to create a Razorpay order.
 *  2. Opens Razorpay's hosted checkout in UPI-only mode.
 *  3. On payment completion, Razorpay redirects to /customer/payments/result/[id].
 *  4. On dismiss, shows a retry button that reopens the same order (no new server call).
 *
 * The Razorpay SDK script is pre-loaded on mount to reduce latency at tap time.
 */
export function UPIIntentCheckout({ jobId, displayAmountRupees }: UPIIntentCheckoutProps) {
  const [state, setState] = useState<CheckoutPhase>({ phase: 'idle' });
  const [isPending, startTransition] = useTransition();
  // Keep the last successful order so retry can reopen without a new server call
  const orderRef = useRef<UPIIntentPaymentCreated | null>(null);

  // Pre-load Razorpay script on mount (non-blocking; errors are swallowed here
  // and retried on the actual click)
  useEffect(() => {
    loadRazorpayScript().catch(() => { /* retried on click */ });
  }, []);

  // ── Open Razorpay modal ────────────────────────────────────────────────────

  function openCheckout(order: UPIIntentPaymentCreated) {
    orderRef.current = order;
    setState({ phase: 'awaiting_payment' });

    const options: RazorpayCheckoutOptions = {
      key:         order.key_id,
      order_id:    order.order_id,
      amount:      order.amount,
      currency:    order.currency,
      name:        'Feazy',
      description: `Service payment — Job #${jobId.slice(0, 8)}`,
      prefill: {
        name:    order.customer_name,
        contact: order.customer_phone ?? undefined,
      },
      // UPI-only — no cards, netbanking, wallets in Sprint 1
      method: { upi: true, card: false, netbanking: false, wallet: false },
      theme:   { color: '#176B5B' },
      timeout: 300,    // 5 min — UPI Intent needs time for app redirect + PIN
      redirect: true,
      // Razorpay redirects here after payment (success or failure)
      callback_url: `/customer/payments/result/${order.payment_db_id}`,
      modal: {
        escape: true,
        ondismiss: () => setState({ phase: 'dismissed' }),
      },
    };

    try {
      new window.Razorpay(options).open();
    } catch {
      setState({ phase: 'error', message: 'Could not open the payment screen. Please try again.' });
    }
  }

  // ── Primary click handler ──────────────────────────────────────────────────

  async function handlePayNow() {
    setState({ phase: 'loading_sdk' });

    try {
      await loadRazorpayScript();
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Payment SDK unavailable.',
      });
      return;
    }

    setState({ phase: 'creating_order' });

    startTransition(async () => {
      const result = await createUPIIntentPayment(jobId);

      if (!result.success) {
        setState({ phase: 'error', message: 'error' in result ? result.error : 'Payment initialization failed.' });
        return;
      }

      openCheckout(result);
    });
  }

  // ── Retry: reopen the same order without a new server call ─────────────────

  function handleRetry() {
    if (orderRef.current) {
      openCheckout(orderRef.current);
    } else {
      setState({ phase: 'idle' });
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const formattedAmount = displayAmountRupees.toLocaleString('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  });

  const isLoading =
    state.phase === 'loading_sdk' ||
    state.phase === 'creating_order' ||
    state.phase === 'awaiting_payment' ||
    isPending;

  const loadingLabel =
    state.phase === 'loading_sdk'     ? 'Loading…' :
    state.phase === 'creating_order'  ? 'Creating order…' :
    state.phase === 'awaiting_payment'? 'Waiting for payment…' :
    'Processing…';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Error banner */}
      {state.phase === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 bg-[#F5E6E6] border border-[#DFC0C0] rounded-xl text-sm text-[#9B3535]"
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{state.message}</span>
        </div>
      )}

      {/* Dismissed banner */}
      {state.phase === 'dismissed' && (
        <div
          role="status"
          className="flex items-start gap-2.5 px-4 py-3 bg-[#FFF4E0] border border-[#E8D5A3] rounded-xl text-sm text-[#9B6700]"
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Payment was not completed. Tap the button below to try again.
        </div>
      )}

      {/* CTA button */}
      {state.phase === 'dismissed' ? (
        <button
          type="button"
          onClick={handleRetry}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-[#176B5B] hover:bg-[#0D5144] text-white font-bold text-sm rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176B5B] focus-visible:ring-offset-2"
        >
          Try Again — {formattedAmount}
        </button>
      ) : (
        <button
          type="button"
          disabled={isLoading}
          onClick={handlePayNow}
          aria-busy={isLoading}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-[#176B5B] hover:bg-[#0D5144] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176B5B] focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <>
              <Spinner />
              {loadingLabel}
            </>
          ) : (
            <>
              <UPIBadge />
              Pay {formattedAmount}
            </>
          )}
        </button>
      )}

      <p className="text-xs text-[#7C8681] text-center">
        You will be redirected to your UPI app (GPay, PhonePe, Paytm&hellip;) to authenticate with your PIN.
      </p>
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path className="opacity-25" d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      <path className="opacity-75" d="M12 2a10 10 0 0 0-10 10" strokeLinecap="round" />
    </svg>
  );
}

function UPIBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-extrabold tracking-wider">
      UPI
    </span>
  );
}
