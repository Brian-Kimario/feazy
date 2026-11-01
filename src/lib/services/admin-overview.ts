import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminActor } from '@/lib/admin/guard';
import { adminFailure, isAdminFailure, type AdminResult } from '@/lib/admin/result';
import { describeAdminAction, type AdminActionOutcome } from '@/lib/admin/activity';

export interface AdminActivityRow {
  id: string;
  label: string;
  outcome: AdminActionOutcome;
  actorName: string;
  at: string;
  reason: string | null;
}

const rowSchema = z.object({
  id: z.string(),
  action: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  changes: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * The latest completed admin actions (closing `succeeded`/`failed` rows only), newest first.
 * Read-only; plain server module reached from the Overview page, never an endpoint.
 */
export async function getRecentAdminActivity(limit = 8): Promise<AdminResult<AdminActivityRow[]>> {
  const actor = await getAdminActor();
  if (isAdminFailure(actor)) return actor;

  // The shared admin client is untyped; the schema types are applied here once.
  const admin = (await createAdminClient()) as unknown as SupabaseClient<Database>;
  const { data, error } = await admin
    .from('audit_logs')
    .select('id, action, created_at, created_by, changes')
    .like('action', 'admin.%')
    .or('action.like.%.succeeded,action.like.%.failed')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25));
  if (error) return adminFailure('FAILED', `Could not load recent activity: ${error.message}`);

  const rows = z.array(rowSchema).safeParse(data ?? []);
  if (!rows.success) return adminFailure('FAILED', 'Recent activity had an unexpected shape');

  const actorIds = [...new Set(rows.data.map((r) => r.created_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people, error: peopleError } = await admin.from('profiles').select('id, full_name').in('id', actorIds);
    if (peopleError) return adminFailure('FAILED', `Could not load admin names: ${peopleError.message}`);
    for (const p of people ?? []) names.set(p.id, p.full_name ?? 'Admin');
  }

  const out: AdminActivityRow[] = [];
  for (const r of rows.data) {
    const d = describeAdminAction(r.action);
    if (!d) continue;
    const reason = typeof r.changes?.reason === 'string' ? r.changes.reason : null;
    out.push({
      id: r.id,
      label: d.label,
      outcome: d.outcome,
      actorName: r.created_by ? (names.get(r.created_by) ?? 'Admin') : 'System',
      at: r.created_at,
      reason,
    });
  }
  return { ok: true, data: out };
}
