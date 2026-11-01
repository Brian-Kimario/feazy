import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfessionalAccount, type ProfessionalJobRow } from '@/lib/services/admin-professional-account';
import { isAdminFailure } from '@/lib/admin/result';
import { formatDateTime } from '@/lib/admin/format';
import { ProfessionalStatusActions } from '@/components/admin/ProfessionalStatusActions';

export const metadata = {
  title: 'Professional account — Feasy Admin',
};

export const dynamic = 'force-dynamic';

const words = (v: string | null | undefined): string => (v ? v.replace(/_/g, ' ') : '—');
const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)}%`);

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="text-xl font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-3">{label}</div>
    </div>
  );
}

function JobList({ title, rows, empty }: { title: string; rows: ProfessionalJobRow[]; empty: string }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-5">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.jobId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/admin/jobs/${r.bookingId}`} className="min-h-11 content-center font-semibold text-teal-deep hover:underline">
                {r.reference ?? r.bookingId.slice(0, 8)}
              </Link>
              <span className="capitalize text-ink-2">{words(r.state)}</span>
              <span className="text-xs text-ink-3">{r.scheduledStart ? formatDateTime(r.scheduledStart) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ProfessionalAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getProfessionalAccount(id);
  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load this professional</h1>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }
  const p = result.data;
  if (!p) notFound();
  const m = p.metrics;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <div>
        <Link href="/admin/professionals" className="text-xs font-semibold text-teal-deep hover:underline">
          ← Professionals
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink md:text-3xl">{p.name}</h1>
        <p className="mt-1 text-sm text-ink-3">
          <span className="font-semibold capitalize text-ink">{words(p.verificationStatus)}</span> ·{' '}
          {p.isAvailable ? 'Available for work' : 'Not available'} · joined {formatDateTime(p.joinedAt)}
          {p.yearsExperience !== null ? ` · ${p.yearsExperience} yrs experience` : ''}
        </p>
      </div>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="mb-2 text-sm font-bold text-ink">Account status</h2>
        <ProfessionalStatusActions professionalId={p.userId} status={p.verificationStatus} />
      </section>

      <section aria-label="Performance">
        {m ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Jobs completed" value={m.jobsCompleted} />
            <Stat label="Acceptance rate" value={pct(m.acceptanceRate)} />
            <Stat label="Completion rate" value={pct(m.completionRate)} />
            <Stat label="Cancel rate" value={pct(m.cancelRate)} />
            <Stat label="Offers accepted" value={m.offersAccepted} />
            <Stat label="Offers declined / expired" value={`${m.offersDeclined} / ${m.offersExpired}`} />
            <Stat label="Rating" value={m.ratingAverage === null ? '—' : `${m.ratingAverage.toFixed(1)} (${m.ratingCount})`} />
            <Stat label="Median response" value={m.medianResponseSeconds === null ? '—' : `${Math.round(m.medianResponseSeconds / 60)} min`} />
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-3">No performance data recorded yet.</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <JobList title="Pending offers" rows={p.pendingOffers} empty="No pending offers." />
        <JobList title="Active assignments" rows={p.activeJobs} empty="No active assignments." />
      </div>
      <JobList title="Job history" rows={p.recentJobs} empty="No past jobs." />

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Complaints and exceptions</h2>
        {p.complaints.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">None on record.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {p.complaints.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="capitalize text-ink">{words(c.kind)}</span>
                <span className="capitalize text-ink-2">{words(c.status)}</span>
                <span className="text-xs text-ink-3">{formatDateTime(c.reportedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-sm font-bold text-ink">Verification and admin history</h2>
        {p.history.length === 0 && p.adminActivity.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">No history yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {p.history.map((h) => (
              <li key={h.id} className="py-2">
                <span className="font-semibold capitalize text-ink">{words(h.action)}</span>{' '}
                <span className="text-ink-3">
                  ({words(h.from)} → {words(h.to)}) · {formatDateTime(h.at)}
                </span>
                <p className="text-ink-2">{h.reason}</p>
              </li>
            ))}
            {p.adminActivity.map((a) => (
              <li key={a.id} className="py-2 text-ink-2">
                {a.action} <span className="text-xs text-ink-3">· {formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
