import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listMyVisits, type InspectorVisit } from '@/lib/services/inspections';
import { formatDateTime } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

function VisitRow({ item }: { item: InspectorVisit }) {
  const { visit, site } = item;
  return (
    <li>
      <Link
        href={`/inspector/visits/${visit.id}`}
        className="block rounded-xl border border-line bg-paper p-4 transition-colors hover:border-ink-3"
      >
        <p className="font-bold text-ink">{site?.service_name ?? 'Inspection'}</p>
        <p className="mt-1 text-sm text-ink-2">
          {[site?.area, site?.city].filter(Boolean).join(', ') || 'Address on the visit page'}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {visit.scheduled_start ? formatDateTime(visit.scheduled_start) : 'Time to be confirmed'} ·{' '}
          <span className="capitalize">{visit.status}</span>
        </p>
      </Link>
    </li>
  );
}

export default async function InspectorHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');
  const { open, recent } = await listMyVisits(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink md:text-3xl">Your inspection visits</h1>
      {open.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-3">No visits are scheduled for you right now.</p>
      ) : (
        <ul className="space-y-3">{open.map((v) => <VisitRow key={v.visit.id} item={v} />)}</ul>
      )}
      {recent.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-bold text-ink">Recent</h2>
          <ul className="space-y-3">{recent.map((v) => <VisitRow key={v.visit.id} item={v} />)}</ul>
        </>
      )}
    </div>
  );
}
