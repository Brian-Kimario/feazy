import Link from 'next/link';
import { listOpenExceptions } from '@/lib/services/admin-assignment-reads';
import { isAdminFailure } from '@/lib/admin/result';
import { formatDateTime } from '@/lib/admin/format';
import { ResolveExceptionForm } from '@/components/admin/ResolveExceptionForm';

export const metadata = {
  title: 'Exceptions — Feazy Admin',
};

export const dynamic = 'force-dynamic';

const words = (v: string | null | undefined): string => (v ? v.replace(/_/g, ' ') : '—');

export default async function ExceptionsPage() {
  const result = await listOpenExceptions();
  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load exceptions</h1>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }
  const { exceptions, drift } = result.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Exceptions</p>
      <h1 className="mb-6 text-2xl font-bold text-ink md:text-3xl">Open exceptions</h1>

      {exceptions.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-3">No open exceptions.</p>
      ) : (
        <ul className="space-y-4">
          {exceptions.map((x) => (
            <li key={x.id} className="rounded-xl border border-line bg-paper p-5">
              <p className="font-bold capitalize text-ink">{words(x.kind)}</p>
              <p className="mt-1 text-xs text-ink-3">
                Reported {formatDateTime(x.reportedAt)} · visit {formatDateTime(x.scheduledStart)} · reviewer: {x.preference}
              </p>
              {x.detail && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{x.detail}</p>}
              {x.finding === 'inconclusive' && (
                <p className="mt-2 text-xs font-semibold text-warning">Previously reviewed: inconclusive.</p>
              )}
              {x.bookingId && (
                <Link
                  href={`/admin/jobs/${x.bookingId}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline"
                >
                  Open case →
                </Link>
              )}
              <div className="mt-2 border-t border-line pt-3">
                <ResolveExceptionForm exceptionId={x.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Booking and job mismatches</h2>
      {drift.length === 0 ? (
        <p className="text-sm text-ink-3">None found.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {drift.map((d, i) => (
            <li key={`${d.bookingId}-${i}`} className="text-ink-2">
              <span className="capitalize">{words(d.driftKind)}</span> · booking {words(d.bookingStatus)} · job{' '}
              {words(d.jobState)}
              {d.bookingId && (
                <>
                  {' '}
                  <Link href={`/admin/jobs/${d.bookingId}`} className="font-semibold text-teal-deep hover:underline">
                    Open
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
