import Link from 'next/link';
import { Suspense } from 'react';
import { getAdminMetrics, getAssignmentQueueStatus } from '@/lib/services/admin-reads';
import { getOperationsQueue } from '@/lib/services/admin-operations';
import { getRecentAdminActivity } from '@/lib/services/admin-overview';
import { getUnverifiedProfessionals } from '@/lib/services/verification-queue';
import { isAdminFailure } from '@/lib/admin/result';
import { OPS_TYPE_LABELS, formatDuration, type OpsCase } from '@/lib/admin/operations';
import { formatDateTime } from '@/lib/admin/format';
import { AssignmentQueueBanner } from '@/components/admin/AssignmentQueueBanner';
import { SkeletonDashboard } from '@/components/ui/SkeletonDashboard';

export const metadata = {
  title: 'Command Center — Feasy Admin',
};

// Operational figures must not be served stale.
export const dynamic = 'force-dynamic';

const QUEUE_PREVIEW = 8;

const SEVERITY: Record<OpsCase['severity'], { label: string; cls: string }> = {
  high: { label: 'High', cls: 'border-danger/25 bg-danger-soft text-danger' },
  medium: { label: 'Medium', cls: 'border-warning/25 bg-warning-soft text-warning' },
  low: { label: 'Low', cls: 'border-info/25 bg-info-soft text-info' },
};

function caseHref(c: OpsCase): string {
  return c.type === 'verification' || !c.bookingId ? '/admin/professionals' : `/admin/jobs/${c.bookingId}`;
}

function Panel({ title, kicker, aside, children }: { title: string; kicker: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">{kicker}</p>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
        </div>
        {aside && <div className="shrink-0 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="alert" className="px-5 py-8 text-center">
      <p className="font-bold text-danger">{title}</p>
      <p className="text-sm text-ink-3">{detail}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  href,
  failed,
}: {
  label: string;
  value: string | number | null;
  note?: string;
  href: string;
  failed: boolean;
}) {
  return (
    <Link
      href={href}
      className="block min-h-11 rounded-lg border border-line bg-paper p-4 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal md:p-5"
    >
      {failed ? (
        <>
          <div className="text-lg font-bold text-danger">Unavailable</div>
          <div className="mt-1 text-xs text-ink-3 md:text-sm">{label}</div>
          <div className="mt-2 text-xs font-semibold text-danger">Could not load. Not zero.</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-ink md:text-3xl">{value}</div>
          <div className="mt-1 text-xs text-ink-3 md:text-sm">{label}</div>
          {note && <div className="mt-2 text-xs font-semibold text-ink-4">{note}</div>}
        </>
      )}
    </Link>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<SkeletonDashboard variant="admin" className="p-6 md:p-8" />}>
      <CommandCenter />
    </Suspense>
  );
}

async function CommandCenter() {
  // The layout has already enforced the admin role; every service below re-checks it.
  const [metricsResult, queueResult, matcher, verifResult, activityResult] = await Promise.all([
    getAdminMetrics(),
    getOperationsQueue(),
    getAssignmentQueueStatus(),
    getUnverifiedProfessionals(),
    getRecentAdminActivity(),
  ]);

  const metrics = metricsResult.data;
  const metricsFailed = !metrics || !!metricsResult.error;
  const queueFailure = isAdminFailure(queueResult);
  const queue = isAdminFailure(queueResult) ? null : queueResult.data;
  const cases = queue?.cases ?? [];
  const high = cases.filter((c) => c.severity === 'high').length;
  const noShows = cases.filter((c) => c.type === 'possible_no_show').length;
  const verifFailed = !!verifResult.error;
  const verifQueue = verifResult.data.slice(0, 5);
  const activity = isAdminFailure(activityResult) ? null : activityResult.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Command Center</p>
        <h1 className="mb-2 text-3xl font-bold text-ink md:text-4xl">What needs a decision?</h1>
        <p className="max-w-2xl text-ink-3">
          Open a case from the list below to investigate it. Every figure here is read live; if one cannot be read it says so
          rather than showing zero.
        </p>
      </div>

      <AssignmentQueueBanner queue={matcher} className="mb-6" />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Tile
          label="Open jobs"
          value={metrics?.openJobs ?? null}
          note={metrics ? `${metrics.jobsAddedToday} added today` : undefined}
          href="/admin/jobs"
          failed={metricsFailed}
        />
        <Tile
          label="Cases needing a person"
          value={cases.length}
          note={`${high} high priority${queue?.truncated ? ' · list may be incomplete' : ''}`}
          href="/admin/operations"
          failed={queueFailure}
        />
        <Tile
          label="Payments captured"
          value={metrics?.revenueFormatted ?? null}
          note={metrics ? `${metrics.paidPaymentsCount} paid ${metrics.paidPaymentsCount === 1 ? 'payment' : 'payments'}` : undefined}
          href="/admin/jobs"
          failed={metricsFailed}
        />
        <Tile
          label="Possible no-shows"
          value={noShows}
          note={metrics ? `${metrics.openNoShowReports} open no-show reports` : undefined}
          href="/admin/operations?type=possible_no_show"
          failed={queueFailure}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            kicker="Needs attention"
            title="Priority queue"
            aside={queueFailure ? 'Unavailable' : `${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`}
          >
            {queueFailure ? (
              <ErrorNote title="Could not load the priority queue" detail="This is not an empty queue. Reload, or open Operations." />
            ) : cases.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="font-bold text-ink">All clear</p>
                <p className="text-sm text-ink-3">No cases need attention right now.</p>
              </div>
            ) : (
              <>
                {queue?.truncated && (
                  <p role="status" className="border-b border-line bg-warning-soft px-5 py-2 text-xs font-semibold text-warning">
                    A query hit its row limit, so this list may be incomplete. Open Operations for the full view.
                  </p>
                )}
                <ul className="divide-y divide-line">
                  {cases.slice(0, QUEUE_PREVIEW).map((c) => {
                    const sev = SEVERITY[c.severity];
                    return (
                      <li key={c.key}>
                        <Link
                          href={caseHref(c)}
                          className="flex min-h-11 items-start justify-between gap-4 px-5 py-4 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-ink md:text-base">
                              {OPS_TYPE_LABELS[c.type]}: {c.title}
                            </span>
                            <span className="mt-1 block text-xs text-ink-3">
                              {c.reference} · {c.reason}
                              {c.since && queue ? ` · ${formatDuration(new Date(queue.generatedAt).getTime() - new Date(c.since).getTime())}` : ''}
                            </span>
                          </span>
                          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-bold ${sev.cls}`}>
                            {sev.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="border-t border-line bg-paper-2 px-5 py-3">
              <Link href="/admin/operations" className="inline-flex min-h-11 items-center text-xs font-bold text-teal-deep hover:underline">
                {cases.length > QUEUE_PREVIEW ? `All ${cases.length} cases in Operations →` : 'Open Operations →'}
              </Link>
            </div>
          </Panel>
        </div>

        <Panel kicker="Verification" title="Professional files" aside={verifFailed ? 'Unavailable' : `${verifResult.data.length} pending`}>
          {verifFailed ? (
            <ErrorNote title="Could not load verification files" detail="This is not an empty queue." />
          ) : verifQueue.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-ink-3">No pending verifications.</p>
          ) : (
            <ul className="divide-y divide-line">
              {verifQueue.map((pro) => (
                <li key={pro.user_id}>
                  <Link
                    href="/admin/professionals"
                    className="block min-h-11 px-5 py-3 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
                  >
                    <span className="block truncate text-sm font-bold text-ink">{pro.full_name || pro.display_name}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {pro.documents.length} {pro.documents.length === 1 ? 'document' : 'documents'}
                      {pro.submitted_at ? ` · submitted ${formatDateTime(pro.submitted_at)}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line bg-paper-2 px-5 py-3">
            <Link href="/admin/professionals" className="inline-flex min-h-11 items-center text-xs font-bold text-teal-deep hover:underline">
              Open verification queue →
            </Link>
          </div>
        </Panel>
      </div>

      <Panel kicker="Audit" title="Recent admin activity" aside={activity ? `${activity.length} latest` : 'Unavailable'}>
        {!activity ? (
          <ErrorNote title="Could not load recent activity" detail="The audit log could not be read. This is not an empty log." />
        ) : activity.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-3">No admin actions have been recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {a.label}
                    {a.outcome === 'failed' && <span className="ml-2 text-xs font-bold text-danger">Failed</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {a.actorName}
                    {a.reason ? ` · ${a.reason}` : ''}
                  </p>
                </div>
                <time dateTime={a.at} className="shrink-0 text-xs text-ink-4">
                  {formatDateTime(a.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
