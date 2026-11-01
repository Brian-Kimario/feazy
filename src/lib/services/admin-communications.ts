/**
 * Read-only communications health for the admin console: notification delivery, delivery failures and
 * contact-form inbox metadata. Not a server-action module: the admin role is checked before the
 * service-role client exists. Message bodies and job chat are deliberately not read here; viewing
 * private content needs its own audited access path.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';

export interface NotificationRow { id: string; type: string; channel: string | null; status: string; at: string }
export interface FailureRow { id: string; source: string; code: string | null; attempts: number; at: string }
export interface ContactRow { id: string; reference: string; topic: string; name: string; status: string; at: string }

export interface Communications {
  statusCounts: Record<string, number>;
  notifications: NotificationRow[];
  openFailures: number;
  failures: FailureRow[];
  contacts: ContactRow[];
  contactTotal: number;
}

const LIMIT = 25;

export async function getCommunications(): Promise<AdminResult<Communications>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const a = await createTypedAdminClient();

  const [logs, all, fails, openF, contacts] = await Promise.all([
    a.from('notification_logs').select('id, notification_type, channel_attempted, status, created_at').order('created_at', { ascending: false }).limit(LIMIT),
    a.from('notification_logs').select('status').limit(5000),
    a.from('notification_failures').select('id, source_type, error_code, attempts, created_at').is('resolved_at', null).order('created_at', { ascending: false }).limit(LIMIT),
    a.from('notification_failures').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    a.from('contact_messages').select('id, reference, topic, name, status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  const err = logs.error ?? all.error ?? fails.error ?? openF.error ?? contacts.error;
  if (err) {
    console.error('getCommunications:', err.message);
    return adminFailure('FAILED', 'Could not load communications.');
  }
  const statusCounts: Record<string, number> = {};
  for (const r of all.data ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return {
    ok: true,
    data: {
      statusCounts,
      notifications: (logs.data ?? []).map((r) => ({ id: r.id, type: r.notification_type, channel: r.channel_attempted, status: r.status, at: r.created_at })),
      openFailures: openF.count ?? 0,
      failures: (fails.data ?? []).map((r) => ({ id: r.id, source: r.source_type, code: r.error_code, attempts: r.attempts, at: r.created_at })),
      contacts: (contacts.data ?? []).map((r) => ({ id: r.id, reference: r.reference, topic: r.topic, name: r.name, status: r.status, at: r.created_at })),
      contactTotal: contacts.count ?? 0,
    },
  };
}
