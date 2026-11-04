/**
 * Pure rules for job messaging. The state list mirrors `send_job_message` in
 * `20261030_017_job_messages.sql`; the database is what actually enforces it.
 */
export const MESSAGING_OPEN_STATES: ReadonlySet<string> = new Set([
  'accepted',
  'on_the_way',
  'arrived',
  'assessing',
  'in_progress',
  'quote_pending',
]);

export type ThreadAvailability = 'not_open' | 'open' | 'read_only';

/** `not_open` before the professional accepts, `read_only` once the job has ended. */
export function threadAvailability(jobState: string): ThreadAvailability {
  if (MESSAGING_OPEN_STATES.has(jobState)) return 'open';
  return jobState === 'assigned' ? 'not_open' : 'read_only';
}

/** Conversations with the newest message first; open ones with no messages yet follow, newest job first. */
export function compareInbox(
  a: { lastMessageAt: string | null; jobCreatedAt: string },
  b: { lastMessageAt: string | null; jobCreatedAt: string },
): number {
  if (a.lastMessageAt && b.lastMessageAt) return Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
  if (a.lastMessageAt) return -1;
  if (b.lastMessageAt) return 1;
  return Date.parse(b.jobCreatedAt) - Date.parse(a.jobCreatedAt);
}
