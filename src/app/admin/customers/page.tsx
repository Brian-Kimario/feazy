import Link from 'next/link';
import { listCustomers } from '@/lib/services/admin-customers';
import { customerDirectoryInput } from '@/lib/admin/customer-directory';
import { isAdminFailure } from '@/lib/admin/result';

export const metadata = { title: 'Customers — Feasy Admin' };
export const dynamic = 'force-dynamic';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = { q: Array.isArray(sp.q) ? sp.q[0] : sp.q, page: Array.isArray(sp.page) ? sp.page[0] : sp.page };
  const input = customerDirectoryInput.parse(raw);
  const result = await listCustomers(raw);
  const href = (page: number) => `/admin/customers?${new URLSearchParams({ ...(input.q ? { q: input.q } : {}), page: String(page) })}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-3">Admin · Customers</div>
        <h1 className="text-3xl font-bold text-ink md:text-4xl">Customers</h1>
        <p className="mt-1 text-ink-2">Search customer accounts and open one to see their bookings and history.</p>
      </div>

      <form method="get" className="mb-5 flex gap-2">
        <label className="flex-1 text-xs font-bold text-ink">
          <span className="sr-only">Search name, email or phone</span>
          <input name="q" defaultValue={input.q ?? ''} placeholder="Search name, email or phone" className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
        {input.q && <Link href="/admin/customers" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal-deep hover:underline">Reset</Link>}
      </form>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load customers</p>
          <p className="text-sm">{result.error} This is not an empty list.</p>
        </div>
      ) : result.data.rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="font-bold text-ink">No customers match</p>
          <p className="text-sm text-ink-3">Change the search or reset it.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3" role="status">
            {result.data.total} {result.data.total === 1 ? 'customer' : 'customers'} · page {result.data.page} of {result.data.pageCount}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {result.data.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/customers/${c.id}`} className="grid gap-1 px-4 py-4 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:grid-cols-[1.4fr_1.6fr_1fr_auto] md:items-center">
                  <span className="text-sm font-bold text-ink">{c.name}</span>
                  <span className="text-xs text-ink-3">
                    <span className="block">{c.email ?? 'No email'}</span>
                    <span className="block">{c.phone ?? 'No phone'}</span>
                  </span>
                  <span className="text-xs text-ink-3">Joined {date(c.joinedAt)}</span>
                  <span className="text-xs text-ink-2">{c.bookings} {c.bookings === 1 ? 'booking' : 'bookings'} · {c.properties} {c.properties === 1 ? 'property' : 'properties'}</span>
                </Link>
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
