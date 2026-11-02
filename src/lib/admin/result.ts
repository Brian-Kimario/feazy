export type AdminErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'AUDIT_UNAVAILABLE'
  | 'FAILED';

/**
 * Typed outcome of a privileged admin operation. Expected failures are values, never throws,
 * and a failure is never reported as `ok: true`.
 */
export interface AdminFailure {
  ok: false;
  code: AdminErrorCode;
  error: string;
  fieldErrors?: Record<string, string[]>;
}

export interface AdminSuccess<T> {
  ok: true;
  data: T;
  /** True when the action ran but its closing audit row could not be written. */
  auditIncomplete?: boolean;
}

export type AdminResult<T = null> = AdminSuccess<T> | AdminFailure;

/** Explicit guard: the project builds with strict off, where `ok` alone does not narrow. */
export function isAdminFailure<T>(r: AdminResult<T>): r is AdminFailure {
  return r.ok === false;
}

export function adminFailure(code: AdminErrorCode, error: string): AdminFailure {
  return { ok: false, code, error };
}
