import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const metadata = { title: 'Payment — Feazy' };

// Razorpay redirects here via callback_url after the UPI app completes or fails.
// We read status from the database — never from redirect query params, which are
// client-controlled and must not be trusted for any business decision.

interface PaymentResultPageProps {
  params: Promise<{ paymentId: string }>;
}

export default async function PaymentResultPage({ params }: PaymentResultPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login');

  const { paymentId } = await params;
  const supabase = await createClient();

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, status, amount, currency, paid_at, job_id')
    .eq('id', paymentId)
    .eq('customer_id', user.id)   // RLS + explicit ownership: customer can only see own
    .maybeSingle();

  if (error || !payment) notFound();

  const paymentData = payment as { status: string; amount: number; currency: string; paid_at: string | null; job_id: string | null; id: string };
  const isPaid    = paymentData.status === 'paid';
  const isFailed  = paymentData.status === 'failed';
  const isPending = !isPaid && !isFailed;

  const formattedAmount = Number(paymentData.amount).toLocaleString('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  });

  return (
    <div className="min-h-screen bg-[#F7F4EC] flex items-start justify-center px-4 pt-16 pb-24">
      <div className="w-full max-w-md space-y-6">

        {/* Status icon */}
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isPaid   ? 'bg-[#E3F0E8]' :
            isFailed ? 'bg-[#F5E6E6]' :
                       'bg-[#FFF4E0]'
          }`}>
            {isPaid ? (
              <svg className="w-8 h-8 text-[#2F7D5B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : isFailed ? (
              <svg className="w-8 h-8 text-[#9B3535]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6"  y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-[#9B6700]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
        </div>

        {/* Heading + detail */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-[#18211F]">
            {isPaid    ? 'Payment successful!'  :
             isFailed  ? 'Payment failed'       :
                         'Verifying payment…'}
          </h1>

          {isPaid && (
            <p className="text-sm text-[#5A6661]">
              {formattedAmount} paid. Your invoice will be available in your bookings shortly.
            </p>
          )}

          {isFailed && (
            <p className="text-sm text-[#5A6661]">
              Your payment could not be processed. No amount has been deducted. Please try again.
            </p>
          )}

          {isPending && (
            <p className="text-sm text-[#5A6661]">
              Your payment is being verified — this usually takes under a minute.
              Refresh this page or check your dashboard for the updated status.
            </p>
          )}
        </div>

        {/* Payment reference */}
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl px-5 py-4 text-xs text-[#7C8681] space-y-1">
          <p>
            Reference:{' '}
            <span className="font-mono text-[#5A6661]">{paymentData.id.slice(0, 8)}…</span>
          </p>
          {isPaid && paymentData.paid_at && (
            <p>
              Paid at:{' '}
              {new Date(paymentData.paid_at).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Retry button for failed payments — links back to the booking */}
          {isFailed && paymentData.job_id && (
            <RetryLink jobId={paymentData.job_id} />
          )}

          <Link
            href="/customer"
            className="block text-center w-full px-5 py-3 border border-[#D9DED8] text-[#5A6661] font-bold text-sm rounded-xl hover:bg-[#F4F5F3] transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Retry helper — needs a server query to get the booking_id from job_id ─────

async function RetryLink({ jobId }: { jobId: string }) {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from('jobs')
    .select('booking_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job?.booking_id) return null;

  return (
    <Link
      href={`/customer/bookings/${job.booking_id}`}
      className="block text-center w-full px-5 py-3 bg-[#176B5B] text-white font-bold text-sm rounded-xl hover:bg-[#0D5144] transition"
    >
      Retry Payment
    </Link>
  );
}
