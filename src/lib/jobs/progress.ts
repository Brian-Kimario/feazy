import type { JobStateTone } from '@/lib/jobs/states';

/**
 * The case file shared by `/customer/bookings/[id]` and `/professional/jobs/[id]`: the
 * progress steps and the timeline. Pure, so both are unit-tested without a database.
 *
 * Every step and timeline row comes from a stored timestamp or a `job_events` row. Event
 * metadata is used only to classify an event; none of it is shown.
 */

export type CaseRole = 'customer' | 'professional';

export interface CaseEvent {
  id: string;
  fromState: string;
  toState: string;
  actorUserId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CaseParties {
  customerId: string;
  professionalId: string | null;
}

/**
 * What happened. Newer rows store it in `event_type`; older quote rows say
 * `state_transition` there and keep the real type in `metadata.event_type`.
 */
export function eventKind(event: Pick<CaseEvent, 'eventType' | 'metadata' | 'toState'>): string {
  if (event.eventType !== 'state_transition') return event.eventType;
  const fromMetadata = event.metadata.event_type;
  return typeof fromMetadata === 'string' && fromMetadata ? fromMetadata : event.toState;
}

function metadataString(event: CaseEvent, key: string): string | null {
  const value = event.metadata[key];
  return typeof value === 'string' && value ? value : null;
}

const ASSIGNMENT_KINDS = new Set(['assigned', 'reassigned', 'offered']);

/** job_media.kind, as a phrase: "a before photo". */
const MEDIA_KIND_PHRASE: Record<string, string> = {
  before: 'a before photo',
  after: 'an after photo',
  part: 'a photo of a part',
  receipt: 'a receipt',
};

/* ── Timeline ─────────────────────────────────────────────────────────────── */

export interface TimelineEntry {
  id: string;
  title: string;
  tone: JobStateTone;
  at: string;
}

/** One event as the viewer should read it, or null when it is not theirs to see. */
export function describeEvent(
  event: CaseEvent,
  role: CaseRole,
  viewerId: string,
  parties: CaseParties,
): { title: string; tone: JobStateTone } | null {
  const kind = eventKind(event);
  const customer = role === 'customer';

  if (ASSIGNMENT_KINDS.has(kind)) {
    const offeredTo = metadataString(event, 'professional_id');
    if (customer) {
      return kind === 'reassigned'
        ? { title: 'Offered to another professional', tone: 'blue' }
        : { title: 'Matched with a professional', tone: 'blue' };
    }
    // Offers made to other professionals are not this professional's business.
    return offeredTo === viewerId ? { title: 'Job offered to you', tone: 'blue' } : null;
  }

  switch (kind) {
    case 'unmatched':
      return customer ? { title: 'No professional available yet', tone: 'ochre' } : null;
    case 'accepted':
      return { title: customer ? 'Professional accepted' : 'You accepted the job', tone: 'teal' };
    case 'on_the_way':
      return { title: customer ? 'Professional is on the way' : 'You set off', tone: 'teal' };
    case 'arrived':
      return { title: customer ? 'Professional arrived' : 'You arrived', tone: 'teal' };
    case 'assessing':
      return { title: customer ? 'Professional is assessing the repair' : 'You started the assessment', tone: 'ochre' };
    case 'in_progress':
      return event.fromState === 'quote_pending'
        ? { title: 'Work resumed', tone: 'ochre' }
        : { title: 'Work started', tone: 'ochre' };
    case 'eta_shared':
      return { title: customer ? 'Professional shared an arrival time' : 'You shared an arrival time', tone: 'teal' };
    case 'running_late':
      return { title: customer ? 'Professional is running late' : 'You said you are running late', tone: 'ochre' };
    case 'media_added': {
      const phrase = MEDIA_KIND_PHRASE[metadataString(event, 'kind') ?? ''] ?? 'a file';
      return { title: customer ? `Professional added ${phrase}` : `You added ${phrase}`, tone: 'neutral' };
    }
    case 'inspection_submitted':
      return { title: customer ? 'Inspection notes added' : 'You added inspection notes', tone: 'neutral' };
    case 'quote_submitted':
    case 'quote_pending':
      return { title: customer ? 'Quote sent for your approval' : 'Quote sent to the customer', tone: 'clay' };
    case 'quote_approved':
      return { title: customer ? 'You approved the quote' : 'Customer approved the quote', tone: 'success' };
    case 'quote_declined':
      return { title: customer ? 'You declined the quote' : 'Customer declined the quote', tone: 'danger' };
    case 'completed':
      return { title: customer ? 'Work completed' : 'You marked the work complete', tone: 'success' };
    case 'cancelled': {
      if (event.actorUserId === viewerId) return { title: 'You cancelled the job', tone: 'danger' };
      if (event.actorUserId === parties.customerId) return { title: 'Cancelled by the customer', tone: 'danger' };
      if (parties.professionalId && event.actorUserId === parties.professionalId) {
        return { title: 'Cancelled by the professional', tone: 'danger' };
      }
      return { title: 'Job cancelled', tone: 'danger' };
    }
    case 'closed':
      return { title: 'Job closed', tone: 'neutral' };
    default:
      return null;
  }
}

/** Oldest first: the booking, every event the viewer may see, then the payment. */
export function buildTimeline(input: {
  role: CaseRole;
  viewerId: string;
  parties: CaseParties;
  bookingCreatedAt: string | null;
  events: readonly CaseEvent[];
  paidAt: string | null;
}): TimelineEntry[] {
  const customer = input.role === 'customer';
  const entries: TimelineEntry[] = [];
  if (input.bookingCreatedAt) {
    entries.push({
      id: 'booking',
      title: customer ? 'You booked this visit' : 'Customer booked this visit',
      tone: 'neutral',
      at: input.bookingCreatedAt,
    });
  }
  for (const event of input.events) {
    const described = describeEvent(event, input.role, input.viewerId, input.parties);
    if (described) entries.push({ id: event.id, ...described, at: event.createdAt });
  }
  if (input.paidAt) {
    entries.push({
      id: 'paid',
      title: customer ? 'You paid' : 'Customer paid',
      tone: 'success',
      at: input.paidAt,
    });
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at) || a.index - b.index)
    .map(({ entry }) => entry);
}

/* ── Progress ─────────────────────────────────────────────────────────────── */

export type StepStatus = 'done' | 'current' | 'upcoming';

export interface ProgressStep {
  key: string;
  label: string;
  /** When the step happened. Null for steps not reached, or reached without a stored time. */
  at: string | null;
  status: StepStatus;
  tone: JobStateTone;
}

export interface ProgressInput {
  role: CaseRole;
  bookingCreatedAt: string | null;
  bookingCancelled: boolean;
  /** Null while the booking has no job yet. */
  job: {
    state: string;
    professionalId: string | null;
    createdAt: string | null;
    acceptedAt: string | null;
    onTheWayAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  } | null;
  events: readonly CaseEvent[];
  /** The most recent inspection, if any. */
  inspection: { createdAt: string } | null;
  /** The most recent quote, if any. */
  quote: { id: string; status: string; createdAt: string; updatedAt: string | null } | null;
  paidAt: string | null;
}

type DraftStep = Omit<ProgressStep, 'status'>;

function firstEvent(events: readonly CaseEvent[], match: (e: CaseEvent) => boolean): CaseEvent | null {
  return events.find(match) ?? null;
}

function lastEvent(events: readonly CaseEvent[], match: (e: CaseEvent) => boolean): CaseEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) if (match(events[i])) return events[i];
  return null;
}

/**
 * The steps from booking to payment. A step is done once it, or any step after it, has
 * happened; the first step after that is current. Inspection and quote steps appear only
 * when there is one. There is no review step: reviews are not built yet.
 */
export function buildProgress(input: ProgressInput): ProgressStep[] {
  const customer = input.role === 'customer';
  const job = input.job;
  const events = [...input.events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const steps: DraftStep[] = [
    { key: 'requested', label: 'Requested', at: input.bookingCreatedAt, tone: 'neutral' },
  ];

  if (job) {
    const matched = lastEvent(
      events,
      (e) => ASSIGNMENT_KINDS.has(eventKind(e)) && metadataString(e, 'professional_id') === job.professionalId,
    );
    const started = firstEvent(events, (e) => eventKind(e) === 'in_progress' && e.fromState === 'arrived');
    const startedAt = started?.createdAt ?? job.startedAt;

    steps.push(
      { key: 'matched', label: 'Matched', at: job.professionalId ? (matched?.createdAt ?? job.createdAt) : null, tone: 'blue' },
      { key: 'accepted', label: 'Accepted', at: job.acceptedAt, tone: 'teal' },
      { key: 'on_the_way', label: 'On the way', at: job.onTheWayAt, tone: 'teal' },
      { key: 'arrived', label: 'Arrived', at: job.arrivedAt, tone: 'teal' },
    );

    const inspection: DraftStep | null = input.inspection
      ? { key: 'inspection', label: 'Inspection', at: input.inspection.createdAt, tone: 'neutral' }
      : null;
    const inspectedBeforeStart =
      inspection?.at != null && (startedAt == null || Date.parse(inspection.at) < Date.parse(startedAt));
    if (inspection && inspectedBeforeStart) steps.push(inspection);
    steps.push({ key: 'started', label: 'Work started', at: startedAt, tone: 'ochre' });
    if (inspection && !inspectedBeforeStart) steps.push(inspection);

    if (input.quote) {
      const quote = input.quote;
      steps.push({ key: 'quote_sent', label: 'Quote sent', at: quote.createdAt, tone: 'clay' });
      const answer = lastEvent(
        events,
        (e) =>
          (eventKind(e) === 'quote_approved' || eventKind(e) === 'quote_declined') &&
          metadataString(e, 'quote_id') === quote.id,
      );
      if (quote.status === 'pending_customer') {
        steps.push({
          key: 'quote_answer',
          label: customer ? 'Your approval' : 'Customer approval',
          at: null,
          tone: 'clay',
        });
      } else if (quote.status === 'approved' || quote.status === 'declined') {
        steps.push({
          key: 'quote_answer',
          label: quote.status === 'approved' ? 'Quote approved' : 'Quote declined',
          at: answer?.createdAt ?? quote.updatedAt,
          tone: quote.status === 'approved' ? 'success' : 'danger',
        });
      }
    }

    steps.push({ key: 'completed', label: 'Completed', at: job.completedAt, tone: 'success' });
    // A job closed without a payment on record has nothing to show for this step.
    if (input.paidAt || job.state !== 'closed') {
      steps.push({ key: 'paid', label: 'Paid', at: input.paidAt, tone: 'success' });
    }
  } else {
    steps.push({ key: 'matched', label: 'Matched', at: null, tone: 'blue' });
  }

  const cancelled = job ? job.state === 'cancelled' || job.cancelledAt != null : input.bookingCancelled;

  let lastReached = -1;
  steps.forEach((step, index) => {
    if (step.at) lastReached = index;
  });
  // A step without a time can still be behind the job's state (older rows missed a timestamp).
  if (job?.state === 'completed' || job?.state === 'closed') {
    lastReached = Math.max(lastReached, steps.findIndex((s) => s.key === 'completed'));
  }

  if (cancelled) {
    return [
      ...steps.slice(0, lastReached + 1).map((s): ProgressStep => ({ ...s, status: 'done' })),
      { key: 'cancelled', label: 'Cancelled', at: job?.cancelledAt ?? null, status: 'done', tone: 'danger' },
    ];
  }

  return steps.map((step, index): ProgressStep => ({
    ...step,
    status: index <= lastReached ? 'done' : index === lastReached + 1 ? 'current' : 'upcoming',
  }));
}
