import Link from 'next/link';
import { listBookingDirectory } from '@/lib/services/admin-booking-directory';
import { isAdminFailure } from '@/lib/admin/result';
import { formatDateTime } from '@/lib/admin/format';
import { ASSIGNMENTS, ASSIGNMENT_LABELS, LIFECYCLES, LIFECYCLE_LABELS, directoryInput, type Lifecycle } from '@/lib/admin/booking-directory';

export const metadata = { title: 'Jobs & Bookings — Feasy Admin' };
export const dynamic = 'force-dynamic';

const TONE: Record<Lifecycle, string> = {
  all: 'bg-paper-2 text-ink-2',
  unmatched: 'bg-warning-soft text-warning',
  offered: 'bg-info-soft text-info',
  accepted: 'bg-teal-soft text-teal-deep',
  active: 'bg-teal-soft text-teal-deep',
  completed: 'bg-success-soft text-success',
  cancelled: 'bg-paper-2 text-ink-3',
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(p: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== 'all' && !(k === 'page' && v === 1)) u.set(k, String(v));
  const s = u.toString();
  return s ? `/admin/jobs?${s}` : '/admin/jobs';
}

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const input = directoryInput.parse({ q: one(sp.q), lifecycle: one(sp.lifecycle), assignment: one(sp.assignment), from: one(sp.from), to: one(sp.to), sort: one(sp.sort), page: one(sp.page) });
  const result = await listBookingDirectory(input);
  const base = { q: input.q, lifecycle: input.lifecycle, assignment: input.assignment, from: input.from, to: input.to, sort: input.sort };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Jobs & Bookings</p>
      <h1 className="mb-2 text-3xl font-bold text-ink md:text-4xl">Jobs & Bookings</h1>
      <p className="mb-6 max-w-2xl text-ink-3">Every booking with its current job. Open a row to investigate, assign, reassign or cancel.</p>

      <nav aria-label="Lifecycle" className="mb-4 flex flex-wrap gap-2">
        {LIFECYCLES.map((l) => (
          <Link
            key={l}
            href={href({ ...base, lifecycle: l })}
            aria-current={input.lifecycle === l ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${input.lifecycle === l ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink-2 hover:bg-paper-2'}`}
          >
            {LIFECYCLE_LABELS[l]}
          </Link>
        ))}
      </nav>

      <form method="get" action="/admin/jobs" className="mb-6 grid gap-3 rounded-xl border border-line bg-paper p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input type="hidden" name="lifecycle" value={input.lifecycle} />
        <label className="block text-xs font-bold text-ink">
          Search reference, customer or professional
          <input name="q" defaultValue={input.q ?? ''} maxLength={60} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal" />
        </label>
        <label className="block text-xs font-bold text-ink">
          Visit from
          <input type="date" name="from" defaultValue={input.from ?? ''} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal" />
        </label>
        <label className="block text-xs font-bold text-ink">
          Visit to
          <input type="date" name="to" defaultValue={input.to ?? ''} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal" />
        </label>
        <label className="block text-xs font-bold text-ink">
          Assignment
          <select name="assignment" defaultValue={input.assignment} disabled={input.lifecycle === 'unmatched'} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal disabled:opacity-60">
            {ASSIGNMENTS.map((a) => (
              <option key={a} value={a}>{ASSIGNMENT_LABELS[a]}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-ink">
          Sort
          <select name="sort" defaultValue={input.sort} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal">
            <option value="scheduled_desc">Visit: latest first</option>
            <option value="scheduled_asc">Visit: earliest first</option>
            <option value="created_desc">Newest booking</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Apply
          </button>
          <Link href="/admin/jobs" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal-deep hover:underline">
            Reset
          </Link>
        </div>
      </form>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load bookings</p>
          <p className="text-sm">{result.error} This is not an empty list.</p>
        </div>
      ) : result.data.rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="font-bold text-ink">No bookings match</p>
          <p className="text-sm text-ink-3">Change the filters or reset them.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3" role="status">
            {result.data.total} {result.data.total === 1 ? 'booking' : 'bookings'} · page {result.data.page} of {result.data.pageCount}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {result.data.rows.map((r) => (
              <li key={r.bookingId}>
                <Link href={`/admin/jobs/${r.bookingId}`} className="grid gap-2 px-4 py-4 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:grid-cols-[1.2fr_1.4fr_1.2fr_1fr_auto] md:items-center">
                  <span>
                    <span className="block text-sm font-bold text-ink">{r.reference}</span>
                    <span className="block text-xs text-ink-3">{r.service}</span>
                  </span>
                  <span className="text-sm text-ink-2">
                    <span className="block">{r.customerName}</span>
                    <span className="block text-xs text-ink-3">{r.professionalName ? `Pro: ${r.professionalName}` : r.jobState === 'assigned' ? 'Offer pending' : 'No professional'}</span>
                  </span>
                  <span className="text-xs text-ink-3">
                    <span className="block text-ink-2">{formatDateTime(r.scheduledStart)}</span>
                    {r.amount !== null && <span className="block">₹{r.amount}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${TONE[r.lifecycle]}`}>{LIFECYCLE_LABELS[r.lifecycle]}</span>
                    {r.jobState && <span className="inline-flex rounded-full bg-paper-2 px-2.5 py-1 text-xs text-ink-3">{r.jobState.replace(/_/g, ' ')}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.openExceptions > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">{r.openExceptions} open {r.openExceptions === 1 ? 'exception' : 'exceptions'}</span>}
                    {r.drift && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">Records disagree</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            {result.data.page > 1 ? (
              <Link href={href({ ...base, page: result.data.page - 1 })} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">← Previous</Link>
            ) : <span />}
            {result.data.page < result.data.pageCount ? (
              <Link href={href({ ...base, page: result.data.page + 1 })} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">Next →</Link>
            ) : <span />}
          </div>
        </>
      )}
    </div>
  );
}
