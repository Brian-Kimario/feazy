'use client';

/**
 * OperationsQueue — the exception list and a read-only case drawer. The list is computed on the
 * server (getOperationsQueue); this component only renders it and loads case detail on demand.
 * The only state-changing action is the guarded repair for a cancelled booking with a leftover assigned job.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isAdminFailure } from '@/lib/admin/result';
import { loadOperationsCaseDetail } from '@/app/admin/actions';
import { ReconcileJobPanel } from '@/components/admin/ReconcileJobPanel';
import type { OpsCaseDetail } from '@/lib/services/admin-operations';
import { OPS_TYPE_LABELS, formatDuration, type OpsCase, type OpsSeverity } from '@/lib/admin/operations';

const SEVERITY_STYLE: Record<OpsSeverity, string> = {
  high: 'bg-clay-soft text-clay border-clay/30',
  medium: 'bg-warning-soft text-warning border-warning/30',
  low: 'bg-info-soft text-info border-info/30',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function label(value: string | null): string {
  return value ? value.replace(/_/g, ' ') : '—';
}

function SeverityBadge({ severity }: { severity: OpsSeverity }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: OpsCaseDetail };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">{title}</h3>
      {children}
    </section>
  );
}

function DetailBody({ item, detail }: { item: OpsCase; detail: OpsCaseDetail }) {
  const b = detail.booking;
  return (
    <div className="space-y-5 text-sm text-ink-2">
      {detail.current == null && (
        <p className="rounded-lg border border-line bg-paper-2 p-3 text-ink-3">
          This case no longer meets its alert rule. It will leave the queue on the next refresh.
        </p>
      )}
      <Section title="Why it was flagged">
        <p>{(detail.current ?? item).reason}</p>
        <p className="mt-2 text-ink-3">Available today: {(detail.current ?? item).nextStep}</p>
      </Section>

      {b && (
        <Section title="Booking and job">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
            <dt className="text-ink-4">Reference</dt>
            <dd className="font-mono text-xs">{b.reference}</dd>
            <dt className="text-ink-4">Service</dt>
            <dd>{b.serviceName}{b.city ? ` · ${b.city}` : ''}</dd>
            <dt className="text-ink-4">Booking status</dt>
            <dd className="capitalize">{label(b.status)}</dd>
            <dt className="text-ink-4">Job state</dt>
            <dd className="capitalize">{detail.job ? label(detail.job.state) : 'No job'}</dd>
            <dt className="text-ink-4">Professional</dt>
            <dd>{detail.job?.professionalName ?? 'None assigned'}</dd>
            <dt className="text-ink-4">Scheduled start</dt>
            <dd>{when(b.scheduledStart)}</dd>
            <dt className="text-ink-4">Created</dt>
            <dd>{when(b.createdAt)}</dd>
            {b.unmatchedSince && (
              <>
                <dt className="text-ink-4">Unmatched since</dt>
                <dd>{when(b.unmatchedSince)}</dd>
              </>
            )}
          </dl>
        </Section>
      )}

      {detail.verification && (
        <Section title="Verification">
          <p>
            {detail.verification.displayName} · {label(detail.verification.status)} · submitted {when(detail.verification.submittedAt)}
          </p>
          <Link href="/admin/professionals" className="mt-2 inline-block font-semibold text-teal hover:underline">
            Review documents →
          </Link>
        </Section>
      )}

      {b && (
        <Section title="Assignment history">
          {detail.attempts.length === 0 && detail.decisions.length === 0 ? (
            <p className="text-ink-3">No matching decisions or offer attempts recorded.</p>
          ) : (
            <ul className="space-y-1">
              {detail.decisions.map((d, i) => (
                <li key={`d${i}`}>
                  {when(d.at)} · matcher: <span className="capitalize">{label(d.kind)}</span> (pool {d.poolSize})
                  {d.professionalName ? ` · ${d.professionalName}` : ''}
                </li>
              ))}
              {detail.attempts.map((a, i) => (
                <li key={`a${i}`}>
                  {when(a.at)} · offer <span className="capitalize">{label(a.outcome)}</span>
                  {a.reasonCode ? ` (${label(a.reasonCode)})` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {b && (
        <Section title="Job history">
          {detail.events.length === 0 ? (
            <p className="text-ink-3">No job events recorded.</p>
          ) : (
            <ul className="space-y-1">
              {detail.events.map((e, i) => (
                <li key={i}>
                  {when(e.at)} · {e.actor} · <span className="capitalize">{label(e.kind)}</span>
                  {e.toState ? ` (${label(e.fromState)} → ${label(e.toState)})` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {b && (
        <Section title="Payments">
          {detail.payments.length === 0 ? (
            <p className="text-ink-3">No payments recorded for this booking.</p>
          ) : (
            <ul className="space-y-1">
              {detail.payments.map((p, i) => (
                <li key={i}>
                  <span className="capitalize">{label(p.type)}</span> · ₹{p.amount.toLocaleString('en-IN')} · {p.status}
                  {p.paidAt ? ` · paid ${when(p.paidAt)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function CaseDrawer({ item, onClose }: { item: OpsCase; onClose: () => void }) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadOperationsCaseDetail({ type: item.type, id: item.subjectId })
      .then((r) => {
        if (cancelled) return;
        setState(isAdminFailure(r) ? { status: 'error', message: r.error } : { status: 'ready', detail: r.data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Could not load case details.' });
      });
    return () => {
      cancelled = true;
    };
  }, [item.type, item.subjectId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${item.reference} — ${item.title}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-paper shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">{OPS_TYPE_LABELS[item.type]}</p>
            <h2 className="text-lg font-bold text-ink">{item.title}</h2>
            <p className="mt-1 font-mono text-xs text-ink-3">{item.reference}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg text-sm font-semibold text-ink-3 hover:bg-paper-2"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {state.status === 'loading' && <p className="text-sm text-ink-3">Loading case details…</p>}
          {state.status === 'error' && (
            <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft p-3 text-sm text-danger">
              {state.message}
            </p>
          )}
          {state.status === 'ready' && <DetailBody item={item} detail={state.detail} />}
          {state.status === 'ready' && item.type === 'state_mismatch' && item.jobId && item.jobState === 'assigned' && (
            <div className="mt-5">
              <ReconcileJobPanel jobId={item.jobId} reference={item.reference} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function OperationsQueue({ cases, generatedAt }: { cases: OpsCase[]; generatedAt: string }) {
  const [selected, setSelected] = useState<OpsCase | null>(null);
  const now = new Date(generatedAt).getTime();
  const age = (iso: string) => formatDuration(now - new Date(iso).getTime());

  if (cases.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-center">
        <p className="font-bold text-ink">No exceptions match these filters</p>
        <p className="mt-1 text-sm text-ink-3">The queue loaded successfully and nothing currently meets an alert rule.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
        {cases.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full min-h-11 flex-col gap-2 p-4 text-left hover:bg-paper-2 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex items-center gap-2 md:w-44 md:shrink-0">
                <SeverityBadge severity={c.severity} />
                <span className="text-xs font-semibold text-ink-3">{OPS_TYPE_LABELS[c.type]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{c.title}</p>
                <p className="mt-0.5 text-sm text-ink-3">{c.reason}</p>
                <p className="mt-1 font-mono text-xs text-ink-4">
                  {c.reference}
                  {c.serviceName ? ` · ${c.serviceName}` : ''}
                  {c.city ? ` · ${c.city}` : ''}
                  {c.jobState ? ` · job ${label(c.jobState)}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-xs text-ink-3 md:text-right">
                <p className="font-semibold text-ink-2">{age(c.since)} ago</p>
                <p>since {when(c.since)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selected && <CaseDrawer item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
