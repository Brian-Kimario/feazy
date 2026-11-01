import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCaseWorkspace, type CaseParty } from '@/lib/services/admin-case';
import { isAdminFailure } from '@/lib/admin/result';
import { buildCaseTimeline } from '@/lib/admin/case-timeline';
import { OPS_TYPE_LABELS, formatDuration } from '@/lib/admin/operations';
import { formatDateTime } from '@/lib/admin/format';

export const metadata = {
  title: 'Case — Feasy Admin',
};

export const dynamic = 'force-dynamic';

const words = (v: string | null | undefined): string => (v ? v.replace(/_/g, ' ') : '—');

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1 text-xs font-semibold text-ink-2">
      <span className="text-ink-4">{label}</span>
      <span className="capitalize">{value}</span>
    </span>
  );
}

function Party({ role, party }: { role: string; party: CaseParty | null }) {
  return (
    <div>
      <dt className="text-ink-4">{role}</dt>
      <dd className="font-semibold text-ink">
        {party ? party.name : 'None'}
        {party?.email && <span className="block break-all text-xs font-normal text-ink-3">{party.email}</span>}
        {party?.phone && <span className="block text-xs font-normal text-ink-3">{party.phone}</span>}
      </dd>
    </div>
  );
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCaseWorkspace(id);

  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load this case</h1>
          <p className="mt-1 text-sm">{result.error} This is not a missing case. Reload to try again.</p>
        </div>
        <Link href="/admin/operations" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">
          ← Back to Operations
        </Link>
      </div>
    );
  }
  const w = result.data;
  if (!w || !w.detail.booking) notFound();

  const b = w.detail.booking;
  const flagged = w.detail.current;
  const timeline = buildCaseTimeline(w);
  const caseKey = flagged ? flagged.key : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <Link href="/admin/operations" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">
        ← Operations
      </Link>

      <header className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Case</p>
        <h1 className="mb-1 text-2xl font-bold text-ink md:text-3xl">
          <span className="font-mono">{b.reference}</span> · {b.serviceName}
        </h1>
        <p className="mb-3 text-sm text-ink-3">{b.city ?? 'City not recorded'} · scheduled {formatDateTime(b.scheduledStart)}</p>
        <div className="flex flex-wrap gap-2">
          <Chip label="Booking" value={words(b.status)} />
          <Chip label="Job" value={w.detail.job ? words(w.detail.job.state) : 'none'} />
          <Chip label="Urgency" value={words(w.urgency)} />
        </div>
      </header>

      <section
        aria-labelledby="issue-heading"
        className={`mb-6 rounded-xl border p-5 ${flagged ? 'border-warning/30 bg-warning-soft' : 'border-line bg-paper'}`}
      >
        <h2 id="issue-heading" className="mb-1 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">
          Issue
        </h2>
        {flagged ? (
          <>
            <p className="font-bold text-ink">
              {OPS_TYPE_LABELS[flagged.type]} · {flagged.severity} priority
            </p>
            <p className="mt-1 text-sm text-ink-2">{flagged.reason}</p>
            <p className="mt-1 text-xs text-ink-3">
              Since {formatDateTime(flagged.since)} ({formatDuration(new Date(w.generatedAt).getTime() - new Date(flagged.since).getTime())})
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-2">This booking does not currently meet any alert rule.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Timeline">
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing has been recorded for this case yet.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((t) => (
                  <li key={t.key} className="flex gap-3 text-sm">
                    <time dateTime={t.at} className="w-28 shrink-0 text-xs text-ink-4">
                      {formatDateTime(t.at)}
                    </time>
                    <span className={t.tone === 'problem' ? 'font-semibold text-danger' : 'text-ink-2'}>
                      <span className="mr-2 rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-ink-3">{t.source}</span>
                      {t.text}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-xs text-ink-4">
              Newest first. Job events, matcher decisions and offers are capped at 30 rows each.
            </p>
          </Card>

          {w.problemSummary && (
            <Card title="Customer's description">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{w.problemSummary}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Actions">
            <p className="text-sm text-ink-2">
              This page is read-only. {flagged ? flagged.nextStep : 'No action is suggested.'}
            </p>
            <div className="mt-3 flex flex-col gap-2 text-sm font-semibold">
              {caseKey && (
                <Link href={`/admin/operations?case=${encodeURIComponent(caseKey)}`} className="inline-flex min-h-11 items-center text-teal-deep hover:underline">
                  Act on it in Operations →
                </Link>
              )}
              <Link href="/admin/jobs" className="inline-flex min-h-11 items-center text-teal-deep hover:underline">
                Jobs directory →
              </Link>
            </div>
          </Card>

          <Card title="People">
            <dl className="space-y-3 text-sm">
              <Party role="Customer" party={w.customer} />
              <Party role="Professional" party={w.professional} />
            </dl>
          </Card>

          <Card title="Money">
            <dl className="mb-3 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-ink-4">Pricing</dt>
              <dd className="capitalize">{words(w.pricingModel)}</dd>
              <dt className="text-ink-4">Base/quoted</dt>
              <dd>{w.amount == null ? '—' : `₹${w.amount.toLocaleString('en-IN')}`}</dd>
            </dl>
            <h3 className="mb-1 text-xs font-bold text-ink-3">Payments</h3>
            {w.detail.payments.length === 0 ? (
              <p className="text-sm text-ink-3">No payments recorded.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {w.detail.payments.map((p, i) => (
                  <li key={i}>
                    <span className="capitalize">{words(p.type)}</span> · ₹{p.amount.toLocaleString('en-IN')} · {p.status}
                    {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mb-1 mt-3 text-xs font-bold text-ink-3">Quotes</h3>
            {w.quotes.length === 0 ? (
              <p className="text-sm text-ink-3">No quotes.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {w.quotes.map((q, i) => (
                  <li key={i}>
                    ₹{q.total.toLocaleString('en-IN')} · <span className="capitalize">{words(q.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Customer reports">
            {w.exceptions.length === 0 ? (
              <p className="text-sm text-ink-3">No reports.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {w.exceptions.map((x, i) => (
                  <li key={i}>
                    <span className="capitalize">{words(x.kind)}</span> · {x.status} · {formatDateTime(x.reportedAt)}
                    {x.resolutionNote && <span className="block text-xs text-ink-3">{x.resolutionNote}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
