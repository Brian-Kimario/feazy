import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyVisit } from '@/lib/services/inspections';
import { formatDateTime } from '@/lib/admin/format';
import { InspectionReportForm } from '@/components/inspector/InspectionReportForm';

export const dynamic = 'force-dynamic';

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');
  const item = await getMyVisit(user.id, id);
  if (!item) notFound();
  const { visit, site } = item;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Inspection visit</p>
      <h1 className="text-2xl font-bold text-ink md:text-3xl">{site?.service_name ?? 'Inspection'}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {visit.scheduled_start ? formatDateTime(visit.scheduled_start) : 'Time to be confirmed'} ·{' '}
        <span className="capitalize">{visit.status}</span>
      </p>

      {site && (
        <section className="mt-6 rounded-xl border border-line bg-paper p-5 text-sm text-ink-2">
          <h2 className="mb-2 font-bold text-ink">Site</h2>
          <p>{[site.address_line_1, site.address_line_2, site.area, site.city, site.postal_code].filter(Boolean).join(', ')}</p>
          {site.access_notes && <p className="mt-2">Access: {site.access_notes}</p>}
          <p className="mt-2">
            Customer: {site.customer_name ?? '—'}
            {site.customer_phone ? ` · ${site.customer_phone}` : ''}
          </p>
          {site.problem_summary && <p className="mt-2 whitespace-pre-wrap">Problem: {site.problem_summary}</p>}
        </section>
      )}

      {visit.status === 'completed' ? (
        <section className="mt-6 rounded-xl border border-line bg-paper p-5 text-sm text-ink-2">
          <h2 className="mb-2 font-bold text-ink">Your report</h2>
          <p className="capitalize">{visit.outcome?.replace(/_/g, ' ')}</p>
          <p className="mt-2 whitespace-pre-wrap">{visit.findings}</p>
          {visit.recommendation && <p className="mt-2 whitespace-pre-wrap">Recommendation: {visit.recommendation}</p>}
        </section>
      ) : visit.status === 'scheduled' ? (
        <InspectionReportForm visitId={visit.id} />
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-paper p-5 text-sm text-ink-3">
          This visit is {visit.status}. {visit.missed_reason ?? ''}
        </p>
      )}
    </div>
  );
}
