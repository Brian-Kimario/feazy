import type { z } from 'zod';
import { logAuditEvent, AuditSeverity, type AdminAuditAction } from '@/lib/audit';
import { getAdminActor } from './guard';
import { adminFailure, isAdminFailure, type AdminResult } from './result';

interface AdminActionSpec<S extends z.ZodType, T> {
  /** Audit action stem, for example `admin.professional.approve`. */
  name: AdminAuditAction;
  schema: S;
  input: unknown;
  /** The user the action is about, when there is one; the actor otherwise. Stored as audit user_id. */
  subjectUserId?: (input: z.output<S>) => string | undefined;
  targetType: string;
  targetId: (input: z.output<S>) => string;
  reason?: (input: z.output<S>) => string | undefined;
  execute: (ctx: { actorId: string; input: z.output<S> }) => Promise<AdminResult<T>>;
}

/**
 * Runs a privileged admin operation: authorise, validate, audit the request, execute, audit the
 * outcome. Order matters:
 *  1. Role check first, so callers who are not admins learn nothing about the input schema.
 *  2. Zod validation of the raw input.
 *  3. A `.requested` audit row is written before anything changes; if it cannot be written the
 *     action does not run (fail closed). audit_logs is append-only, so the outcome is a second row.
 *  4. `execute` runs; a throw becomes a typed failure, never a success.
 *  5. A `.succeeded` / `.failed` row closes the record. If that row cannot be written the result
 *     carries `auditIncomplete` rather than hiding the gap.
 * `execute` may use the service-role client: it only ever runs after step 1.
 */
export async function runAdminAction<S extends z.ZodType, T>(
  spec: AdminActionSpec<S, T>,
): Promise<AdminResult<T>> {
  const actor = await getAdminActor();
  if (isAdminFailure(actor)) return actor;
  const actorId = actor.data.userId;

  const parsed = spec.schema.safeParse(spec.input);
  if (!parsed.success) {
    const flat = parsed.error.flatten() as { fieldErrors: Record<string, string[]> };
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      fieldErrors: flat.fieldErrors,
    };
  }
  const input = parsed.data;

  const base = {
    target_type: spec.targetType,
    target_id: spec.targetId(input),
    reason: spec.reason?.(input) ?? null,
  };
  const userId = spec.subjectUserId?.(input) ?? actorId;

  const requested = await logAuditEvent({
    user_id: userId,
    created_by: actorId,
    action: `${spec.name}.requested`,
    severity: AuditSeverity.INFO,
    success: true,
    changes: base,
  });
  if (!requested.success) {
    return adminFailure('AUDIT_UNAVAILABLE', 'Could not record the audit trail, so the action was not run');
  }

  let result: AdminResult<T>;
  try {
    result = await spec.execute({ actorId, input });
  } catch (err) {
    result = adminFailure('FAILED', err instanceof Error ? err.message : 'Action failed');
  }

  const closing = await logAuditEvent({
    user_id: userId,
    created_by: actorId,
    action: `${spec.name}.${isAdminFailure(result) ? 'failed' : 'succeeded'}`,
    severity: isAdminFailure(result) ? AuditSeverity.WARNING : AuditSeverity.INFO,
    success: !isAdminFailure(result),
    changes: { ...base, ...(isAdminFailure(result) ? { code: result.code, error: result.error } : {}) },
  });

  if (!isAdminFailure(result) && !closing.success) return { ...result, auditIncomplete: true };
  return result;
}
