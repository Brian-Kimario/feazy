/**
 * Decides whether a failed send is worth retrying. Unknown errors retry (bounded by the attempt limit);
 * errors that cannot change on their own (no contact on file, provider rejected the request) do not.
 */
const TRANSIENT = /HTTP (408|425|429|5\d\d)|time(d)? ?out|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network|not configured/i;
const PERMANENT = /HTTP 4\d\d|no \w+ (number|address) on file|not found|invalid|not applicable/i;

export function isTransientError(error: string | undefined | null): boolean {
  if (!error) return true;
  if (TRANSIENT.test(error)) return true;
  return !PERMANENT.test(error);
}

/** Backoff before attempt n+1: 1, 2, 4, ... minutes, capped at 60. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(60 * 2 ** Math.max(attempts - 1, 0), 3600);
}
