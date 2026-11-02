import Link from 'next/link';
import { listProfessionals } from '@/lib/services/admin-professional-directory';
import { PRO_STATUSES, PRO_STATUS_LABELS, professionalDirectoryInput } from '@/lib/admin/professional-directory';
import { isAdminFailure } from '@/lib/admin/result';

export const metadata = { title: 'Professionals — Feazy Admin' };
export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const words = (v: string) => v.replace(/_/g, ' ');
const sel = 'mt-1 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal';

export default async function AdminProfessionalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = { q: first(sp.q), status: first(sp.status), availability: first(sp.availability), workload: first(sp.workload), page: first(sp.page) };
  const input = professionalDirectoryInput.parse(raw);
  const result = await listProfessionals(raw);
  const href = (page: number) => {
    const p = new URLSearchParams();
    if (input.q) p.set('q', input.q);
    if (input.status !== 'all') p.set('status', input.status);
    if (input.availability !== 'all') p.set('availability', input.availability);
    if (input.workload !== 'all') p.set('workload', input.workload);
    p.set('page', String(page));
    return `/admin/professionals?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-3">Admin · Professionals</div>
          <h1 className="text-3xl font-bold text-ink md:text-4xl">Professionals</h1>
          <p className="mt-1 text-ink-2">Search the roster, filter by standing and workload, and open an account.</p>
        </div>
        <Link href="/admin/professionals/verification" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">Verification queue →</Link>
      </div>

      <form method="get" className="mb-5 grid gap-3 rounded-xl border border-line bg-paper p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="block text-xs font-bold text-ink">
          Search name or email
          <input name="q" defaultValue={input.q ?? ''} className={sel} />
        </label>
        <label className="block text-xs font-bold text-ink">
          Status
          <select name="status" defaultValue={input.status} className={sel}>
            {PRO_STATUSES.map((s) => <option key={s} value={s}>{PRO_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-ink">
          Availability
          <select name="availability" defaultValue={input.availability} className={sel}>
            <option value="all">Any</option>
            <option value="available">Available</option>
            <option value="unavailable">Not available</option>
          </select>
        </label>
        <label className="block text-xs font-bold text-ink">
          Workload
          <select name="workload" defaultValue={input.workload} className={sel}>
            <option value="all">Any</option>
            <option value="with_active">Has active work</option>
            <option value="none_active">No active work</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Apply</button>
          <Link href="/admin/professionals" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal-deep hover:underline">Reset</Link>
        </div>
      </form>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load professionals</p>
          <p className="text-sm">{result.error} This is not an empty list.</p>
        </div>
      ) : result.data.rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="font-bold text-ink">No professionals match</p>
          <p className="text-sm text-ink-3">Change the filters or reset them.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3" role="status">
            {result.data.total} {result.data.total === 1 ? 'professional' : 'professionals'} · page {result.data.page} of {result.data.pageCount}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {result.data.rows.map((p) => (
              <li key={p.userId}>
                <Link href={`/admin/professionals/${p.userId}`} className="grid gap-2 px-4 py-4 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:grid-cols-[1.6fr_1fr_1fr_1fr_auto] md:items-center">
                  <span>
                    <span className="block text-sm font-bold text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-3">{p.email ?? 'No email'}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${p.status === 'suspended' || p.status === 'rejected' ? 'bg-danger-soft text-danger' : p.status === 'verified' ? 'bg-paper-2 text-ink' : 'bg-warning-soft text-warning'}`}>{words(p.status)}</span>
                  </span>
                  <span className="text-xs text-ink-2">{p.isAvailable ? 'Available' : 'Not available'}</span>
                  <span className="text-xs text-ink-3">
                    {p.completedJobs} completed{p.rating !== null && p.rating > 0 ? ` · ${p.rating.toFixed(1)}★` : ''}
                  </span>
                  <span className={`text-xs ${p.activeJobs > 0 ? 'font-bold text-ink' : 'text-ink-3'}`}>{p.activeJobs} active</span>
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
