import { z } from 'zod';

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_SCOPES = ['admin', 'all', 'account'] as const;
export const AUDIT_OUTCOMES = ['all', 'requested', 'succeeded', 'failed'] as const;
export const AUDIT_AREAS = ['all', 'professional', 'job', 'verification_document'] as const;

export const AUDIT_SCOPE_LABELS: Record<(typeof AUDIT_SCOPES)[number], string> = {
  admin: 'Admin actions',
  account: 'Account activity',
  all: 'Everything',
};

const uuid = z.string().uuid().optional().catch(undefined);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);

/** Filters from the query string. Bad values fall back to defaults; nothing here reaches a filter string unchecked. */
export const auditInput = z.object({
  scope: z.enum(AUDIT_SCOPES).catch('admin'),
  outcome: z.enum(AUDIT_OUTCOMES).catch('all'),
  area: z.enum(AUDIT_AREAS).catch('all'),
  actor: uuid,
  target: uuid,
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export type AuditInput = z.infer<typeof auditInput>;

/** Splits `admin.professional.approve.succeeded` into area/verb/outcome for display. */
export function describeAction(action: string): { area: string; verb: string; outcome: string | null } {
  const m = /^admin\.([a-z_]+)\.([a-z_.]+?)(?:\.(requested|succeeded|failed))?$/.exec(action);
  if (!m) return { area: 'account', verb: action.replace(/_/g, ' '), outcome: null };
  return { area: m[1].replace(/_/g, ' '), verb: m[2].replace(/[._]/g, ' '), outcome: m[3] ?? null };
}
