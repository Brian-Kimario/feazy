import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomerAccount } from '@/lib/services/admin-customers';
import { isAdminFailure } from '@/lib/admin/result';
import { formatDateTime } from '@/lib/admin/format';

export const metadata = { title: 'Customer account — Feasy Admin' };
export const dynamic = 'force-dynamic';

const words = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ') : '—');

export default async function CustomerAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCustomerAccount(id);
  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load this customer</h1>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }
  const c = result.data;
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div>
        <Link href="/admin/customers" className="text-xs font-semibold text-teal-deep hover:underline">← Customers</Link>
        <h1 className="mt-2 text-2xl font-bold text-ink md:text-3xl">{c.name}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {c.email ?? 'No email'} · {c.phone ?? 'No phone'} · joined {formatDateTime(c.joinedAt)}
        </p>
      </div>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Properties</h2>
        {c.properties.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No properties on file.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {c.properties.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span className="text-ink">{p.name}</span>
                <span className="capitalize text-ink-3">{words(p.type)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Bookings{c.bookingCount > c.bookings.length ? ` (latest ${c.bookings.length} of ${c.bookingCount})` : ` (${c.bookingCount})`}</h2>
        {c.bookings.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No bookings yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {c.bookings.map((b) => (
              <li key={b.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/admin/jobs/${b.bookingId}`} className="min-h-11 content-center font-semibold text-teal-deep hover:underline">{b.reference}</Link>
                <span className="text-ink-2">{b.service}</span>
                <span className="capitalize text-ink-2">{words(b.jobState ?? b.bookingStatus)}</span>
                <span className="text-xs text-ink-3">{formatDateTime(b.scheduledStart)}{b.amount !== null ? ` · ₹${b.amount}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Complaints and exceptions</h2>
        {c.exceptions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">None on record.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {c.exceptions.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="capitalize text-ink">{words(e.kind)}</span>
                <span className="capitalize text-ink-2">{words(e.status)}</span>
                <span className="text-xs text-ink-3">{formatDateTime(e.reportedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Account activity</h2>
        {c.adminActivity.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No account activity recorded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {c.adminActivity.map((a) => (
              <li key={a.id} className="py-2 text-ink-2">{a.action} <span className="text-xs text-ink-3">· {formatDateTime(a.at)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
