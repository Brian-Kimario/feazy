import Link from 'next/link';
import { z } from 'zod';
import { getAssignmentQueueStatus } from '@/lib/services/admin-reads';
import { getOperationsQueue } from '@/lib/services/admin-operations';
import { OPS_CASE_TYPES, OPS_SEVERITIES, OPS_TYPE_LABELS } from '@/lib/admin/operations';
import { isAdminFailure } from '@/lib/admin/result';
import { OperationsQueue } from '@/components/admin/OperationsQueue';
import { AssignmentQueueBanner } from '@/components/admin/AssignmentQueueBanner';
import { formatDateTime } from '@/lib/admin/format';

export const metadata = {
  title: 'Operations — Feazy Admin',
};

export const dynamic = 'force-dynamic';

const filters = z.object({
  type: z.enum(OPS_CASE_TYPES).optional().catch(undefined),
  severity: z.enum(OPS_SEVERITIES).optional().catch(undefined),
});

function href(type?: string, severity?: string): string {
  const q = new URLSearchParams();
  if (type) q.set('type', type);
  if (severity) q.set('severity', severity);
  const s = q.toString();
  return s ? `/admin/operations?${s}` : '/admin/operations';
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold ${
        active ? 'border-teal bg-teal-soft text-teal-deep' : 'border-line bg-paper text-ink-3 hover:bg-paper-2'
      }`}
    >
      {children}
    </Link>
  );
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { type, severity } = filters.parse({
    type: Array.isArray(raw.type) ? raw.type[0] : raw.type,
    severity: Array.isArray(raw.severity) ? raw.severity[0] : raw.severity,
  });

  const [result, queue] = await Promise.all([getOperationsQueue(), getAssignmentQueueStatus()]);

  const failure = isAdminFailure(result) ? result : null;
  const loaded = isAdminFailure(result) ? null : result.data;
  const all = loaded?.cases ?? [];
  const visible = all.filter((c) => (!type || c.type === type) && (!severity || c.severity === severity));
  const countOf = (t: string) => all.filter((c) => c.type === t).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Operations</p>
        <h1 className="mb-2 text-3xl font-bold text-ink md:text-4xl">Operations</h1>
        <p className="text-ink-3">
          Bookings, jobs and professionals that need a person. Flags are alerts for review, not automatic actions.
        </p>
        <Link href="/admin/operations/unmatched" className="mt-2 inline-block text-sm font-semibold text-teal hover:underline">
          Unmatched bookings →
        </Link>
      </div>

      <AssignmentQueueBanner queue={queue} className="mb-6" />

      {failure || !loaded ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-5 text-danger">
          <p className="font-bold">The Operations queue could not be loaded.</p>
          <p className="mt-1 text-sm">{failure?.error ?? 'Unknown error.'} Nothing is being shown, so this is not an empty queue. Reload to try again.</p>
        </div>
      ) : (
        <>
          {loaded.truncated && (
            <p role="status" className="mb-4 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              A query hit its row limit, so this list may be incomplete.
            </p>
          )}

          <nav aria-label="Filter by type" className="mb-3 flex flex-wrap gap-2">
            <Chip to={href(undefined, severity)} active={!type}>All ({all.length})</Chip>
            {OPS_CASE_TYPES.filter((t) => countOf(t) > 0 || t === type).map((t) => (
              <Chip key={t} to={href(t, severity)} active={type === t}>
                {OPS_TYPE_LABELS[t]} ({countOf(t)})
              </Chip>
            ))}
          </nav>
          <nav aria-label="Filter by severity" className="mb-6 flex flex-wrap gap-2">
            <Chip to={href(type)} active={!severity}>Any severity</Chip>
            {OPS_SEVERITIES.map((s) => (
              <Chip key={s} to={href(type, s)} active={severity === s}>
                <span className="capitalize">{s}</span>
              </Chip>
            ))}
          </nav>

          <OperationsQueue
            cases={visible}
            generatedAt={loaded.generatedAt}
            initialCaseKey={typeof raw.case === 'string' ? raw.case : undefined}
          />
          <p className="mt-4 text-xs text-ink-4">Generated {formatDateTime(loaded.generatedAt)}.</p>
        </>
      )}
    </div>
  );
}
