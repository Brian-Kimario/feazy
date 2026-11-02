/** Seconds before another reset email can be requested from the same page. */
export const RESEND_COOLDOWN_SECONDS = 60;

export type ResetFailure = 'rate_limited' | 'network' | 'unknown';

/**
 * Maps a Supabase auth error to a failure we can explain. Unknown-account errors are never surfaced:
 * Supabase answers success for them, and the page must not reveal whether an email is registered.
 */
export function classifyResetError(error: { status?: number; code?: string; message?: string }): ResetFailure {
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || /rate limit/i.test(error.message ?? '')) {
    return 'rate_limited';
  }
  if (error.status === 0 || /failed to fetch|network/i.test(error.message ?? '')) return 'network';
  return 'unknown';
}

export const RESET_FAILURE_COPY: Record<ResetFailure, string> = {
  rate_limited: 'Too many reset emails were requested. Wait a few minutes and try again.',
  network: 'We could not reach Feazy. Check your connection and try again.',
  unknown: 'We could not send the reset link right now. Please try again.',
};

/** Whole seconds left before the cooldown ends, never negative. */
export function cooldownRemaining(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Hides most of the local part for display: jane.doe@example.com becomes j*****e@example.com. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const masked = local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local.at(-1)}`;
  return `${masked}${email.slice(at)}`;
}
