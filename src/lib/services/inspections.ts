/**
 * Inspection reads for the inspector workspace and the customer booking page. All use the
 * user-scoped client, so RLS decides what each caller sees; the site RPC adds the contact and
 * address fields an assigned inspector needs.
 */

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type VisitRow = Database['public']['Tables']['inspection_visits']['Row'];
type SiteRow = Database['public']['Functions']['get_inspection_visit_site']['Returns'][number];

export interface InspectorIdentity {
  userId: string;
  displayName: string;
}

export interface InspectorVisit {
  visit: VisitRow;
  site: SiteRow | null;
}

/** The caller's active inspector row, or null when they are not an active inspector. */
export async function getActiveInspector(userId: string): Promise<InspectorIdentity | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('inspectors')
    .select('user_id, display_name, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { userId: data.user_id, displayName: data.display_name };
}

async function withSite(visits: VisitRow[]): Promise<InspectorVisit[]> {
  const supabase = await createClient();
  return Promise.all(
    visits.map(async (visit) => {
      const { data } = await supabase.rpc('get_inspection_visit_site', { p_visit_id: visit.id });
      return { visit, site: data?.[0] ?? null };
    }),
  );
}

/** The inspector's own visits: open ones first by time, then recent history. */
export async function listMyVisits(inspectorId: string): Promise<{ open: InspectorVisit[]; recent: InspectorVisit[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inspection_visits')
    .select('*')
    .eq('inspector_id', inspectorId)
    .order('scheduled_start', { ascending: true })
    .limit(100);
  if (error) {
    console.error('listMyVisits:', error.message);
    return { open: [], recent: [] };
  }
  const rows = data ?? [];
  const [open, recent] = await Promise.all([
    withSite(rows.filter((v) => v.status === 'scheduled')),
    withSite(rows.filter((v) => v.status !== 'scheduled').reverse().slice(0, 20)),
  ]);
  return { open, recent };
}

export async function getMyVisit(inspectorId: string, visitId: string): Promise<InspectorVisit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('inspection_visits')
    .select('*')
    .eq('id', visitId)
    .eq('inspector_id', inspectorId)
    .maybeSingle();
  if (!data) return null;
  const [item] = await withSite([data]);
  return item ?? null;
}

export interface BookingInspection {
  status: string;
  scheduledStart: string | null;
  outcome: string | null;
  findings: string | null;
  recommendation: string | null;
}

/** The inspection on a booking, as the customer (or the job's professional) may see it. */
export async function getBookingInspection(bookingId: string): Promise<BookingInspection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('inspection_visits')
    .select('status, scheduled_start, outcome, findings, recommendation')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status,
    scheduledStart: data.scheduled_start,
    outcome: data.outcome,
    findings: data.findings,
    recommendation: data.recommendation,
  };
}
