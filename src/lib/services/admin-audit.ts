/**
 * Read-only audit log for the admin console. Not a server-action module: the admin role is checked
 * before the service-role client exists. audit_logs is append-only and nothing here writes to it.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { AUDIT_PAGE_SIZE, auditInput } from '@/lib/admin/audit-directory';

export interface AuditRow {
  id: string;
  action: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  subjectId: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export async function listAuditLog(raw: unknown): Promise<AdminResult<AuditPage>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const input = auditInput.parse(raw ?? {});

  const a = await createTypedAdminClient();
  let q = a.from('audit_logs').select('id, action, changes, created_at, created_by, user_id', { count: 'exact' });
  if (input.scope === 'admin') q = q.like('action', 'admin.%');
  else if (input.scope === 'account') q = q.not('action', 'like', 'admin.%');
  if (input.area !== 'all') q = q.like('action', `admin.${input.area}.%`);
  if (input.outcome !== 'all') q = q.like('action', `%.${input.outcome}`);
  if (input.actor) q = q.eq('created_by', input.actor);
  if (input.target) q = q.eq('changes->>target_id', input.target);
  if (input.from) q = q.gte('created_at', `${input.from}T00:00:00+05:30`);
  if (input.to) q = q.lt('created_at', new Date(new Date(`${input.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString());

  const from = (input.page - 1) * AUDIT_PAGE_SIZE;
  const res = await q.order('created_at', { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1);
  if (res.error) {
    console.error('listAuditLog:', res.error.message);
    return adminFailure('FAILED', 'Could not load the audit log.');
  }
  const data = res.data ?? [];

  const actorIds = [...new Set(data.map((r) => r.created_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const p = await a.from('profiles').select('id, full_name, email').in('id', actorIds);
    if (!p.error) for (const r of p.data ?? []) names.set(r.id, r.full_name || r.email || r.id);
  }

  const total = res.count ?? 0;
  return {
    ok: true,
    data: {
      rows: data.map((r) => {
        const c = (r.changes && typeof r.changes === 'object' && !Array.isArray(r.changes) ? r.changes : {}) as Record<string, unknown>;
        return {
          id: r.id,
          action: r.action,
          at: r.created_at,
          actorId: r.created_by,
          actorName: r.created_by ? (names.get(r.created_by) ?? null) : null,
          subjectId: r.user_id,
          targetType: str(c.target_type),
          targetId: str(c.target_id),
          reason: str(c.reason),
        };
      }),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    },
  };
}
