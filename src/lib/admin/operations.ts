import type { OperationsThresholds } from './operations-config';

/**
 * Pure classification of bookings and jobs into Operations exceptions. No I/O: the service layer
 * loads rows and this decides what needs a person. Everything here is an *alert* for review. A
 * threshold passing is never proof of a no-show or abandonment, and never triggers a state change.
 */

export const OPS_CASE_TYPES = [
  'unmatched',
  'stale_pending',
  'overdue_offer',
  'possible_no_show',
  'stuck_in_progress',
  'stale_quote',
  'state_mismatch',
  'verification',
] as const;
export type OpsCaseType = (typeof OPS_CASE_TYPES)[number];

export const OPS_SEVERITIES = ['high', 'medium', 'low'] as const;
export type OpsSeverity = (typeof OPS_SEVERITIES)[number];

export const OPS_TYPE_LABELS: Record<OpsCaseType, string> = {
  unmatched: 'Unmatched',
  stale_pending: 'Start passed, unmatched',
  overdue_offer: 'Offer overdue',
  possible_no_show: 'Possible no-show',
  stuck_in_progress: 'Stuck in progress',
  stale_quote: 'Quote waiting',
  state_mismatch: 'Status mismatch',
  verification: 'Verification',
};

const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
const JOB_STATES = [
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'quote_pending',
  'completed',
  'cancelled',
  'closed',
] as const;
const LIVE_JOB_STATES = ['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'quote_pending'];

/** Job states the Operations loader fetches; anything else is history, not an exception candidate. */
export const OPS_LIVE_JOB_STATES = LIVE_JOB_STATES;

export interface OpsJobRow {
  id: string;
  state: string;
  professionalId: string | null;
  professionalName: string | null;
  offerExpiresAt: string | null;
  updatedAt: string;
  /** Latest job_events row for the job, if any. */
  lastEventAt: string | null;
  /** Latest job_messages row for the job, if any. */
  lastMessageAt: string | null;
}

export interface OpsBookingRow {
  id: string;
  reference: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  unmatchedSince: string | null;
  createdAt: string;
  serviceName: string;
  city: string | null;
  job: OpsJobRow | null;
}

export interface OpsVerificationRow {
  userId: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface OpsCase {
  /** Stable per exception: `${type}:${bookingId | userId}`. */
  key: string;
  type: OpsCaseType;
  severity: OpsSeverity;
  /** Booking id for booking/job cases, the professional's user id for verification. */
  subjectId: string;
  bookingId: string | null;
  jobId: string | null;
  reference: string;
  title: string;
  /** Why it was flagged, with the numbers that tripped it. */
  reason: string;
  /** When the triggering condition began. */
  since: string;
  bookingStatus: string | null;
  jobState: string | null;
  scheduledStart: string | null;
  serviceName: string | null;
  city: string | null;
  /** What an admin can do about it today. */
  nextStep: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "5 min", "3 h 10 min", "2 d 4 h". */
export function formatDuration(durationMs: number): string {
  const minutes = Math.max(0, Math.floor(durationMs / MIN));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * Whether booking and job statuses agree. `bookings.booking_status` is not advanced by the job
 * lifecycle (only cancellation and creation touch it; screens derive progress from the job), so
 * `pending`/`confirmed` beside any job state is expected and is NOT reported. Reported are the
 * combinations that cannot be explained by that design:
 *  - a cancelled booking whose job is still live,
 *  - a completed booking whose job is not completed or closed,
 *  - a status or state outside the known sets.
 */
export function bookingJobMismatch(bookingStatus: string, jobState: string | null): string | null {
  if (!(BOOKING_STATUSES as readonly string[]).includes(bookingStatus)) {
    return `Booking has an unrecognised status "${bookingStatus}".`;
  }
  if (jobState && !(JOB_STATES as readonly string[]).includes(jobState)) {
    return `Job has an unrecognised state "${jobState}".`;
  }
  if (bookingStatus === 'cancelled' && jobState && LIVE_JOB_STATES.includes(jobState)) {
    return `Booking is cancelled but its job is still "${jobState}".`;
  }
  if (bookingStatus === 'completed' && jobState !== 'completed' && jobState !== 'closed') {
    return `Booking is completed but its job is ${jobState ? `"${jobState}"` : 'missing'}.`;
  }
  return null;
}

function bookingCase(
  b: OpsBookingRow,
  type: OpsCaseType,
  severity: OpsSeverity,
  title: string,
  reason: string,
  since: string,
  nextStep: string,
): OpsCase {
  return {
    key: `${type}:${b.id}`,
    type,
    severity,
    subjectId: b.id,
    bookingId: b.id,
    jobId: b.job?.id ?? null,
    reference: b.reference,
    title,
    reason,
    since,
    bookingStatus: b.status,
    jobState: b.job?.state ?? null,
    scheduledStart: b.scheduledStart,
    serviceName: b.serviceName,
    city: b.city,
    nextStep,
  };
}

export function classifyBooking(b: OpsBookingRow, now: Date, t: OperationsThresholds): OpsCase | null {
  const nowMs = now.getTime();
  const job = b.job;

  const mismatch = bookingJobMismatch(b.status, job?.state ?? null);
  if (mismatch) {
    return bookingCase(
      b,
      'state_mismatch',
      'high',
      'Booking and job statuses disagree',
      mismatch,
      job?.updatedAt ?? b.createdAt,
      'Review the history. Reconciliation is added in the next recovery step; do not edit either record by hand.',
    );
  }
  if (b.status !== 'pending' && b.status !== 'confirmed') return null;

  const start = ms(b.scheduledStart);
  if (start === null) return null;
  const startPassed = start <= nowMs;

  const waiting = !job || (job.state === 'assigned' && !job.professionalId);
  if (waiting) {
    if (startPassed) {
      const past = nowMs - start;
      const stopped = past >= t.unmatchedStopMinutes * MIN;
      return bookingCase(
        b,
        'stale_pending',
        'high',
        stopped ? 'Unmatched, past start, needs a decision' : 'Reached its start time unmatched',
        `No professional was confirmed. The start time passed ${formatDuration(past)} ago and automatic matching does not offer a visit that has started.` +
          (stopped ? ' It needs a rescheduled time agreed with the customer, or an admin decision.' : ''),
        b.scheduledStart,
        'Review the assignment history. Rescheduling and cancellation need the customer; do not change this booking without an investigation.',
      );
    }
    const unmatchedSince = ms(b.unmatchedSince);
    if (unmatchedSince !== null) {
      const untilStart = start - nowMs;
      return bookingCase(
        b,
        'unmatched',
        untilStart <= HOUR ? 'high' : 'medium',
        'No eligible professional',
        `The matcher found nobody eligible ${formatDuration(nowMs - unmatchedSince)} ago and keeps retrying every minute. The visit starts in ${formatDuration(untilStart)}.`,
        b.unmatchedSince as string,
        'Watch the retries. If nobody is found before the start time it moves to "Start passed, unmatched".',
      );
    }
    const created = ms(b.createdAt);
    if (!job && created !== null && nowMs - created > t.newBookingGraceMinutes * MIN) {
      return bookingCase(
        b,
        'unmatched',
        'medium',
        'No offer has been made',
        `The booking is ${formatDuration(nowMs - created)} old with no job and no recorded matching result. The assignment worker may not have picked it up.`,
        b.createdAt,
        'Check the assignment queue health above; the worker retries every minute.',
      );
    }
    return null;
  }

  if (!job) return null;

  if (job.state === 'assigned' && job.professionalId) {
    const expires = ms(job.offerExpiresAt);
    if (expires !== null && nowMs > expires + t.offerOverdueGraceMinutes * MIN) {
      return bookingCase(
        b,
        'overdue_offer',
        startPassed ? 'high' : 'medium',
        'Offer expired but not processed',
        `The offer to ${job.professionalName ?? 'the professional'} expired ${formatDuration(nowMs - expires)} ago and the matching worker has not released it.`,
        job.offerExpiresAt as string,
        'Check the assignment queue health above; the worker releases expired offers every minute.',
      );
    }
    return null;
  }

  if (job.state === 'accepted' || job.state === 'on_the_way') {
    if (nowMs > start + t.noShowMinutes * MIN) {
      return bookingCase(
        b,
        'possible_no_show',
        'high',
        'Professional has not arrived',
        `${job.professionalName ?? 'The professional'} accepted but has not marked arrival ${formatDuration(nowMs - start)} after the scheduled start (job is "${job.state}"). This is an alert, not a confirmed no-show.`,
        b.scheduledStart,
        'Contact both parties before deciding anything. Cancellation is available from the Jobs page once you have confirmed what happened.',
      );
    }
    return null;
  }

  if (job.state === 'in_progress' || job.state === 'quote_pending') {
    const activity = Math.max(
      ms(job.lastEventAt) ?? 0,
      ms(job.lastMessageAt) ?? 0,
      ms(job.updatedAt) ?? 0,
      ms(b.scheduledEnd) ?? 0,
    );
    const idle = nowMs - activity;
    if (activity > 0 && idle > t.staleActivityHours * HOUR) {
      const isQuote = job.state === 'quote_pending';
      return bookingCase(
        b,
        isQuote ? 'stale_quote' : 'stuck_in_progress',
        'medium',
        isQuote ? 'Quote waiting a long time' : 'No activity on an in-progress job',
        `No job event or message, and past the scheduled end, for ${formatDuration(idle)}. Long jobs can be legitimate; this is a prompt to check in.`,
        new Date(activity).toISOString(),
        'Review the history and contact the parties if needed.',
      );
    }
  }
  return null;
}

export function classifyVerification(v: OpsVerificationRow): OpsCase {
  const ready = v.status === 'documents_submitted';
  return {
    key: `verification:${v.userId}`,
    type: 'verification',
    severity: ready ? 'high' : 'medium',
    subjectId: v.userId,
    bookingId: null,
    jobId: null,
    reference: v.displayName,
    title: ready ? 'Documents ready for review' : 'Verification under review',
    reason: ready
      ? 'The professional submitted documents and is waiting for an admin decision.'
      : 'The professional is marked under review and is waiting for an admin decision.',
    since: v.createdAt,
    bookingStatus: null,
    jobState: null,
    scheduledStart: null,
    serviceName: null,
    city: null,
    nextStep: 'Open the Verification page to review the documents and decide.',
  };
}

const SEVERITY_RANK: Record<OpsSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Most severe first; within a severity the longest-running first. */
export function sortCases(cases: OpsCase[]): OpsCase[] {
  return [...cases].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (ms(a.since) ?? 0) - (ms(b.since) ?? 0) ||
      a.key.localeCompare(b.key),
  );
}
