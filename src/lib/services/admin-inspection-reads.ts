/**
 * Admin reads for the inspection queue. Not a server-action module. Each function checks the admin
 * role before it creates the service-role client. Joins are done in code: the hand-written table types
 * carry no relationships.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type VisitRow = Database['public']['Tables']['inspection_visits']['Row'];

export interface AdminVisit extends VisitRow {
  serviceName: string | null;
  problemSummary: string | null;
  inspectorName: string | null;
  cost: number | null;
}

export interface AdminInspector {
  userId: string;
  displayName: string;
  phone: string | null;
  isActive: boolean;
}

export interface InspectionQueue {
  visits: AdminVisit[];
  inspectors: AdminInspector[];
  metrics: Record<string, unknown> | null;
}

export async function loadInspectionQueue(): Promise<AdminResult<InspectionQueue>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);

  const admin = await createTypedAdminClient();
  const [visitsRes, inspectorsRes, costsRes] = await Promise.all([
    admin.from('inspection_visits').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('inspectors').select('user_id, display_name, phone, is_active').order('display_name'),
    admin.from('inspection_visit_costs').select('visit_id, amount').limit(500),
  ]);
  if (visitsRes.error || inspectorsRes.error) {
    console.error('loadInspectionQueue:', visitsRes.error?.message ?? inspectorsRes.error?.message);
    return adminFailure('FAILED', 'Could not load inspections. Reload to try again.');
  }
  const visits = visitsRes.data ?? [];
  const inspectors = inspectorsRes.data ?? [];
  const costs = new Map((costsRes.data ?? []).map((c) => [c.visit_id, Number(c.amount)]));

  const bookingIds = [...new Set(visits.map((v) => v.booking_id))];
  const bookingsRes = bookingIds.length
    ? await admin.from('bookings').select('id, service_id, problem_summary').in('id', bookingIds)
    : { data: [], error: null };
  const serviceIds = [...new Set((bookingsRes.data ?? []).map((b) => b.service_id))];
  const servicesRes = serviceIds.length
    ? await admin.from('services').select('id, name').in('id', serviceIds)
    : { data: [], error: null };
  const serviceName = new Map((servicesRes.data ?? []).map((s) => [s.id, s.name]));
  const booking = new Map((bookingsRes.data ?? []).map((b) => [b.id, b]));
  const inspectorName = new Map(inspectors.map((i) => [i.user_id, i.display_name]));

  // The metrics RPC checks admin via auth.uid(), so it needs the user-scoped client.
  const supabase = await createClient();
  const { data: metrics } = await supabase.rpc('admin_inspection_metrics', {});

  return {
    ok: true,
    data: {
      visits: visits.map((v) => {
        const b = booking.get(v.booking_id);
        return {
          ...v,
          serviceName: b ? (serviceName.get(b.service_id) ?? null) : null,
          problemSummary: b?.problem_summary ?? null,
          inspectorName: v.inspector_id ? (inspectorName.get(v.inspector_id) ?? null) : null,
          cost: costs.get(v.id) ?? null,
        };
      }),
      inspectors: inspectors.map((i) => ({
        userId: i.user_id,
        displayName: i.display_name,
        phone: i.phone,
        isActive: i.is_active,
      })),
      metrics: metrics && typeof metrics === 'object' && !Array.isArray(metrics) ? (metrics as Record<string, unknown>) : null,
    },
  };
}
