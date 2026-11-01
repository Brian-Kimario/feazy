import type { CaseWorkspace } from '@/lib/services/admin-case';

export type TimelineSource = 'job' | 'matcher' | 'offer' | 'admin' | 'report' | 'quote' | 'booking';

export interface TimelineEntry {
  key: string;
  at: string;
  source: TimelineSource;
  text: string;
  /** Failed admin actions and unresolved reports read as problems. */
  tone: 'normal' | 'problem';
}

const words = (v: string | null): string => (v ? v.replace(/_/g, ' ') : '');

/** One newest-first history merged from every record the workspace loaded. Pure, no clock. */
export function buildCaseTimeline(w: CaseWorkspace): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const b = w.detail.booking;
  if (b) out.push({ key: 'booking', at: b.createdAt, source: 'booking', text: `Booking ${b.reference} created`, tone: 'normal' });

  w.detail.events.forEach((e, i) =>
    out.push({
      key: `job${i}`,
      at: e.at,
      source: 'job',
      text: `${e.actor}: ${words(e.kind)}${e.toState ? ` (${words(e.fromState) || 'start'} → ${words(e.toState)})` : ''}`,
      tone: 'normal',
    }),
  );
  w.detail.decisions.forEach((d, i) =>
    out.push({
      key: `dec${i}`,
      at: d.at,
      source: 'matcher',
      text: `Matcher ${words(d.kind)} (pool of ${d.poolSize})${d.professionalName ? `: ${d.professionalName}` : ''}`,
      tone: 'normal',
    }),
  );
  w.detail.attempts.forEach((a, i) =>
    out.push({
      key: `att${i}`,
      at: a.at,
      source: 'offer',
      text: `Offer ${words(a.outcome)}${a.reasonCode ? ` (${words(a.reasonCode)})` : ''}`,
      tone: 'normal',
    }),
  );
  w.adminActions.forEach((a) =>
    out.push({
      key: `adm${a.id}`,
      at: a.at,
      source: 'admin',
      text: `${a.label}${a.outcome === 'failed' ? ' (failed)' : ''}${a.reason ? `: ${a.reason}` : ''}`,
      tone: a.outcome === 'failed' ? 'problem' : 'normal',
    }),
  );
  w.exceptions.forEach((x, i) => {
    out.push({ key: `exr${i}`, at: x.reportedAt, source: 'report', text: `Customer report: ${words(x.kind)}`, tone: x.resolvedAt ? 'normal' : 'problem' });
    if (x.resolvedAt) {
      out.push({ key: `exs${i}`, at: x.resolvedAt, source: 'report', text: `Report resolved${x.resolutionNote ? `: ${x.resolutionNote}` : ''}`, tone: 'normal' });
    }
  });
  w.quotes.forEach((q, i) => {
    if (q.createdAt) out.push({ key: `q${i}`, at: q.createdAt, source: 'quote', text: `Quote of ₹${q.total.toLocaleString('en-IN')} (${words(q.status)})`, tone: 'normal' });
  });

  return out.sort((a, b2) => new Date(b2.at).getTime() - new Date(a.at).getTime());
}
