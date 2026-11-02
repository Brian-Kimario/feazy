import { loadInspectionQueue } from '@/lib/services/admin-inspection-reads';
import { isAdminFailure } from '@/lib/admin/result';
import { formatDateTime } from '@/lib/admin/format';
import { AssignInspectorForm, RecordCostForm, RegisterInspectorForm } from '@/components/admin/InspectionAdminForms';

export const metadata = { title: 'Inspections — Feazy Admin' };
export const dynamic = 'force-dynamic';

const num = (m: Record<string, unknown> | null, k: string): number => {
  const v = m?.[k];
  return typeof v === 'number' ? v : 0;
};

export default async function InspectionsPage() {
  const result = await loadInspectionQueue();
  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load inspections</h1>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }
  const { visits, inspectors, metrics } = result.data;
  const activeInspectors = inspectors.filter((i) => i.isActive);
  const needsAction = visits.filter((v) => v.status === 'requested' || v.status === 'missed');
  const upcoming = visits.filter((v) => v.status === 'scheduled');
  const done = visits.filter((v) => v.status === 'completed' || v.status === 'cancelled');

  const stats: [string, string][] = [
    ['Requested', String(num(metrics, 'requested'))],
    ['Unassigned', String(num(metrics, 'unassigned'))],
    ['Completed', String(num(metrics, 'completed'))],
    ['Missed visits', String(num(metrics, 'missed_visits'))],
    ['Repair needed', `${num(metrics, 'repair_needed')} (${num(metrics, 'repair_completed')} completed)`],
    ['Actual cost recorded', `₹${num(metrics, 'cost_total')} on ${num(metrics, 'cost_recorded_visits')} visits`],
    ['Completed, cost not recorded', String(num(metrics, 'completed_without_cost'))],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Inspections</p>
      <h1 className="mb-6 text-2xl font-bold text-ink md:text-3xl">Free inspections</h1>

      <dl className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-paper p-4">
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="mt-1 font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-8 text-xs text-ink-3">Costs are what you record after the fact; nothing here is estimated.</p>

      <Section title={`Needs action (${needsAction.length})`}>
        {needsAction.map((v) => (
          <li key={v.id} className="rounded-xl border border-line bg-paper p-5">
            <p className="font-bold text-ink">{v.serviceName ?? 'Inspection'} <span className="text-xs font-normal capitalize text-ink-3">· {v.status}</span></p>
            {v.problemSummary && <p className="mt-1 text-sm text-ink-2">{v.problemSummary}</p>}
            {v.missed_reason && <p className="mt-1 text-xs text-warning">Missed: {v.missed_reason}</p>}
            <div className="mt-3"><AssignInspectorForm visitId={v.id} inspectors={activeInspectors} /></div>
          </li>
        ))}
      </Section>

      <Section title={`Scheduled (${upcoming.length})`}>
        {upcoming.map((v) => (
          <li key={v.id} className="rounded-xl border border-line bg-paper p-5 text-sm">
            <p className="font-bold text-ink">{v.serviceName ?? 'Inspection'}</p>
            <p className="text-ink-3">
              {v.inspectorName ?? '—'} · {v.scheduled_start ? formatDateTime(v.scheduled_start) : '—'}
            </p>
          </li>
        ))}
      </Section>

      <Section title={`Completed and closed (${done.length})`}>
        {done.map((v) => (
          <li key={v.id} className="rounded-xl border border-line bg-paper p-5 text-sm">
            <p className="font-bold text-ink">{v.serviceName ?? 'Inspection'} <span className="text-xs font-normal capitalize text-ink-3">· {v.status}{v.outcome ? ` · ${v.outcome.replace(/_/g, ' ')}` : ''}</span></p>
            <p className="text-ink-3">{v.inspectorName ?? '—'}</p>
            {v.findings && <p className="mt-2 whitespace-pre-wrap text-ink-2">{v.findings}</p>}
            {v.status === 'completed' && (
              <div className="mt-3">
                {v.cost !== null ? <p className="text-xs text-ink-3">Recorded cost: ₹{v.cost}</p> : <RecordCostForm visitId={v.id} />}
              </div>
            )}
          </li>
        ))}
      </Section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-ink">Inspectors</h2>
        <ul className="mb-4 space-y-2 text-sm text-ink-2">
          {inspectors.length === 0 && <li className="text-ink-3">No inspectors registered yet.</li>}
          {inspectors.map((i) => (
            <li key={i.userId}>{i.displayName}{i.phone ? ` · ${i.phone}` : ''}{i.isActive ? '' : ' (inactive)'}</li>
          ))}
        </ul>
        <div className="rounded-xl border border-line bg-paper p-5"><RegisterInspectorForm /></div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2>
      {items.length === 0 ? <p className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-3">Nothing here.</p> : <ul className="space-y-3">{children}</ul>}
    </section>
  );
}
