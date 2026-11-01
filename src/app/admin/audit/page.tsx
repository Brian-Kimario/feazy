import Link from 'next/link';
import { listAuditLog } from '@/lib/services/admin-audit';
import { auditInput, describeAction, AUDIT_SCOPES, AUDIT_SCOPE_LABELS, AUDIT_OUTCOMES, AUDIT_AREAS } from '@/lib/admin/audit-directory';
import { isAdminFailure } from '@/lib/admin/result';

export const metadata = { title: 'Activity & audit — Feasy Admin' };
export const dynamic = 'force-dynamic';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const field = 'min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal';
const OUTCOME_STYLE: Record<string, string> = {
  succeeded: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  requested: 'bg-paper-2 text-ink-3',
};

function targetHref(type: string | null, id: string | null): string | null {
  if (type === 'professional' && id) return `/admin/professionals/${id}`;
  return null;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Object.fromEntries(['scope', 'outcome', 'area', 'actor', 'target', 'from', 'to', 'page'].map((k) => [k, first(sp[k])]));
  const input = auditInput.parse(raw);
  const result = await listAuditLog(raw);
  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v !== undefined && k !== 'page') p.set(k, String(v));
    p.set('page', String(page));
    return `/admin/audit?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-3">Admin · Activity &amp; audit</div>
        <h1 className="text-3xl font-bold text-ink md:text-4xl">Activity &amp; audit</h1>
        <p className="mt-1 text-ink-2">A read-only record of what admins did and when. Each action has a request row and an outcome row. Entries cannot be edited or removed.</p>
      </div>

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-ink">Record type
          <select name="scope" defaultValue={input.scope} className={field}>
            {AUDIT_SCOPES.map((s) => <option key={s} value={s}>{AUDIT_SCOPE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-ink">Area
          <select name="area" defaultValue={input.area} className={field}>
            {AUDIT_AREAS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All areas' : s.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-ink">Outcome
          <select name="outcome" defaultValue={input.outcome} className={field}>
            {AUDIT_OUTCOMES.map((s) => <option key={s} value={s}>{s === 'all' ? 'Any outcome' : s}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-ink">Target ID
          <input name="target" defaultValue={input.target ?? ''} placeholder="Full id of a job, professional…" className={field} />
        </label>
        <label className="text-xs font-bold text-ink">Actor ID
          <input name="actor" defaultValue={input.actor ?? ''} placeholder="Admin user id" className={field} />
        </label>
        <label className="text-xs font-bold text-ink">From
          <input type="date" name="from" defaultValue={input.from ?? ''} className={field} />
        </label>
        <label className="text-xs font-bold text-ink">To
          <input type="date" name="to" defaultValue={input.to ?? ''} className={field} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Apply</button>
          <Link href="/admin/audit" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal-deep hover:underline">Reset</Link>
        </div>
      </form>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load the audit log</p>
          <p className="text-sm">{result.error} This is not an empty log.</p>
        </div>
      ) : result.data.rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="font-bold text-ink">No entries match</p>
          <p className="text-sm text-ink-3">Widen the filters or reset them.</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3" role="status">
            {result.data.total} {result.data.total === 1 ? 'entry' : 'entries'} · page {result.data.page} of {result.data.pageCount} · newest first
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
            {result.data.rows.map((r) => {
              const d = describeAction(r.action);
              const link = targetHref(r.targetType, r.targetId);
              return (
                <li key={r.id} className="grid gap-1 px-4 py-3 md:grid-cols-[11rem_1.4fr_1.2fr] md:items-start">
                  <span className="text-xs text-ink-3">{when(r.at)}</span>
                  <span className="text-sm text-ink">
                    <span className="font-bold capitalize">{d.area} · {d.verb}</span>{' '}
                    {d.outcome && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_STYLE[d.outcome] ?? ''}`}>{d.outcome}</span>}
                    {r.reason && <span className="mt-1 block text-xs text-ink-2">Reason: {r.reason}</span>}
                  </span>
                  <span className="break-all text-xs text-ink-3">
                    <span className="block">By {r.actorName ?? r.actorId ?? 'system'}</span>
                    {r.targetId && (
                      <span className="block">
                        {r.targetType ?? 'target'}:{' '}
                        {link ? <Link href={link} className="font-semibold text-teal-deep hover:underline">{r.targetId}</Link> : r.targetId}
                        {' '}<Link href={`/admin/audit?target=${r.targetId}&scope=all`} className="text-teal-deep hover:underline">history</Link>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
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
