import Link from 'next/link';
import { listPayments } from '@/lib/services/admin-payments';
import { paymentDirectoryInput, PAYMENT_STATUSES, inr } from '@/lib/admin/finance-directory';
import { isAdminFailure } from '@/lib/admin/result';

export const metadata = { title: 'Finance — Feazy Admin' };
export const dynamic = 'force-dynamic';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const field = 'min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal';
const STATUS_STYLE: Record<string, string> = { paid: 'bg-success-soft text-success', failed: 'bg-danger-soft text-danger', pending: 'bg-paper-2 text-ink-3', refunded: 'bg-paper-2 text-ink-2' };

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Object.fromEntries(['status', 'from', 'to', 'page'].map((k) => [k, first(sp[k])]));
  const input = paymentDirectoryInput.parse(raw);
  const result = await listPayments(raw);
  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v !== undefined && k !== 'page') p.set(k, String(v));
    p.set('page', String(page));
    return `/admin/finance?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-3">Admin · Finance</div>
        <h1 className="text-3xl font-bold text-ink md:text-4xl">Payments</h1>
        <p className="mt-1 text-ink-2">Read-only view of customer payments. Refunds and payouts are not handled here yet.</p>
      </div>

      {!isAdminFailure(result) && (
        <dl className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['pending', 'paid', 'failed', 'refunded'] as const).map((s) => (
            <Link key={s} href={`/admin/finance?status=${s}`} className="rounded-xl border border-line bg-paper p-4 hover:bg-paper-2">
              <dt className="text-xs font-bold capitalize text-ink-3">{s}</dt>
              <dd className="text-2xl font-bold text-ink">{result.data.statusCounts[s] ?? 'Unavailable'}</dd>
            </Link>
          ))}
        </dl>
      )}

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-bold text-ink">Status
          <select name="status" defaultValue={input.status} className={field}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'Any status' : s}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-ink">From<input type="date" name="from" defaultValue={input.from ?? ''} className={field} /></label>
        <label className="text-xs font-bold text-ink">To<input type="date" name="to" defaultValue={input.to ?? ''} className={field} /></label>
        <div className="flex items-end gap-2">
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Apply</button>
          <Link href="/admin/finance" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal-deep hover:underline">Reset</Link>
        </div>
      </form>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load payments</p>
          <p className="text-sm">{result.error} This is not an empty list.</p>
        </div>
      ) : result.data.rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="font-bold text-ink">No payments match</p>
          <p className="text-sm text-ink-3">Change the filters or reset them.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3" role="status">{result.data.total} {result.data.total === 1 ? 'payment' : 'payments'} · page {result.data.page} of {result.data.pageCount}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {result.data.rows.map((p) => (
              <li key={p.id} className="grid gap-1 px-4 py-4 md:grid-cols-[1fr_1.2fr_1.2fr_auto] md:items-center">
                <span className="text-sm font-bold text-ink">
                  {p.currency === 'INR' ? inr(p.amount) : `${p.amount} ${p.currency}`}{' '}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[p.status] ?? 'bg-paper-2 text-ink-3'}`}>{p.status}</span>
                </span>
                <span className="text-xs text-ink-3">
                  <span className="block capitalize">{p.paymentType.replace(/_/g, ' ')} · {p.provider}</span>
                  <span className="block break-all">{p.providerReference}</span>
                </span>
                <span className="text-xs text-ink-3">
                  <Link href={`/admin/customers/${p.customerId}`} className="block font-semibold text-teal-deep hover:underline">{p.customerName ?? 'Customer'}</Link>
                  <span className="block">Created {when(p.createdAt)} · Paid {when(p.paidAt)}</span>
                </span>
                {p.bookingId ? <Link href={`/admin/jobs/${p.bookingId}`} className="text-sm font-semibold text-teal-deep hover:underline">Booking</Link> : <span className="text-xs text-ink-3">No booking</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            {result.data.page > 1 ? <Link href={href(result.data.page - 1)} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">← Previous</Link> : <span />}
            {result.data.page < result.data.pageCount ? <Link href={href(result.data.page + 1)} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">Next →</Link> : <span />}
          </div>
        </>
      )}
    </div>
  );
}
