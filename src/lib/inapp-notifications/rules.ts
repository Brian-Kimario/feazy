/**
 * Kinds of in-app notification written by the database; supabase/migrations/20261030_018_notifications.sql
 * owns the event mapping and the fixed text for each. (src/lib/notifications is the older external-delivery
 * module and is unrelated.)
 */
export const NOTIFICATION_KINDS = [
  'job_accepted',
  'eta_shared',
  'running_late',
  'pro_arrived',
  'quote_requested',
  'quote_approved',
  'quote_declined',
  'job_cancelled',
  'job_cancelled_by_admin',
  'job_completed',
  'new_message',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

const SAFE_LINK = /^\/(customer|professional)\/(bookings|jobs)\/[0-9a-f-]{36}$/;

/** The stored link is chosen by the database, but a link is only rendered if it is an in-app case path. */
export function safeNotificationLink(link: string): string | null {
  return SAFE_LINK.test(link) ? link : null;
}

/**
 * Short age for a notification: "Just now", "5 min ago", "3 h ago", then the date and time.
 * `absolute` formats anything older than a day (injected so this stays pure and testable).
 */
export function notificationAge(iso: string, now: Date, absolute: (iso: string) => string | null): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return absolute(iso) ?? '';
}

/** Where a notification opens: new messages land on the Messages card of the case page. */
export function notificationTarget(kind: NotificationKind, href: string | null): string | null {
  if (!href) return null;
  return kind === 'new_message' ? `${href}#messages` : href;
}
