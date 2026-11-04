import type { z } from 'zod';

/**
 * Result of a server action. Expected failures (bad input, not signed in, not allowed,
 * a rejected RPC) come back as `success: false`; actions do not throw for them.
 */
export type ActionErrorCode =
  | 'invalid_input'
  | 'unauthenticated'
  | 'not_found'
  | 'rejected'
  | 'failed'
  /** The price shown to the customer no longer matches the database. The customer must review it again. */
  | 'price_changed';

export interface ActionFailure {
  success: false;
  code: ActionErrorCode;
  error: string;
  /** Per-field messages when `code` is `invalid_input`. */
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T = undefined> = { success: true; data: T } | ActionFailure;

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { success: true, data };
}

export function fail(code: ActionErrorCode, error: string): ActionFailure {
  return { success: false, code, error };
}

/** Parse action input; on failure returns an `invalid_input` result to hand back as-is. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { success: true; data: z.infer<S> } | ActionFailure {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    success: false,
    code: 'invalid_input',
    error: parsed.error.issues[0]?.message ?? 'Invalid input',
    fieldErrors,
  };
}
