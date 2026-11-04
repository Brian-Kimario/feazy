/**
 * Job states — single source of truth for the app.
 *
 * `jobs.current_state` has no enum or CHECK constraint in the database, so these values
 * are taken from the live body of `transition_job_state()`. If that function changes,
 * update this file and `states.test.ts` together.
 */

export const JOB_STATES = [
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'assessing',
  'in_progress',
  'quote_pending',
  'completed',
  'cancelled',
  'closed',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/** Matches the `Badge` variants in `@/components/ui/Badge`. */
export type JobStateTone = 'neutral' | 'teal' | 'blue' | 'clay' | 'ochre' | 'success' | 'danger';

interface JobStateMeta {
  label: string;
  /** Short status line for the customer. */
  customerCopy: string;
  /** Short status line for the professional. */
  proCopy: string;
  tone: JobStateTone;
  /** Position on the progress rail (0-based). Null for states that sit off the rail. */
  step: number | null;
}

export const STATE_META: Record<JobState, JobStateMeta> = {
  assigned: {
    label: 'Assigned',
    customerCopy: 'Waiting for the professional to accept',
    proCopy: 'Accept or decline this job',
    tone: 'blue',
    step: 0,
  },
  accepted: {
    label: 'Accepted',
    customerCopy: 'Professional confirmed',
    proCopy: 'Head out when ready',
    tone: 'teal',
    step: 1,
  },
  on_the_way: {
    label: 'On the way',
    customerCopy: 'Professional is on the way',
    proCopy: 'Mark arrived when on site',
    tone: 'teal',
    step: 2,
  },
  arrived: {
    label: 'Arrived',
    customerCopy: 'Professional has arrived',
    proCopy: 'Start work when ready',
    tone: 'teal',
    step: 3,
  },
  assessing: {
    label: 'Assessing',
    customerCopy: 'Professional is assessing the repair',
    proCopy: 'Assess the problem, then send a repair quote',
    tone: 'ochre',
    step: 4,
  },
  in_progress: {
    label: 'In progress',
    customerCopy: 'Work underway',
    proCopy: 'Complete the job or send a quote',
    tone: 'ochre',
    step: 4,
  },
  quote_pending: {
    label: 'Quote pending',
    customerCopy: 'Quote waiting for your approval',
    proCopy: 'Waiting for the customer to approve your quote',
    tone: 'clay',
    step: 4,
  },
  completed: {
    label: 'Completed',
    customerCopy: 'Work completed',
    proCopy: 'Job complete',
    tone: 'success',
    step: 5,
  },
  cancelled: {
    label: 'Cancelled',
    customerCopy: 'This job was cancelled',
    proCopy: 'This job was cancelled',
    tone: 'danger',
    step: null,
  },
  closed: {
    label: 'Closed',
    customerCopy: 'Job closed',
    proCopy: 'Job closed',
    tone: 'neutral',
    step: 5,
  },
};

/** Rail shown to customers and professionals. Step indices match `STATE_META[*].step`. */
export const RAIL_STEPS: readonly { step: number; label: string }[] = [
  { step: 0, label: 'Assigned' },
  { step: 1, label: 'Accepted' },
  { step: 2, label: 'On the way' },
  { step: 3, label: 'Arrived' },
  { step: 4, label: 'Work' },
  { step: 5, label: 'Complete' },
];

/** Legal transitions, mirroring `transition_job_state()`. */
export const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  assigned: ['accepted', 'cancelled'],
  accepted: ['on_the_way', 'cancelled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['assessing', 'in_progress', 'cancelled'],
  assessing: ['quote_pending', 'cancelled'],
  in_progress: ['quote_pending', 'completed', 'cancelled'],
  quote_pending: ['assessing', 'in_progress', 'cancelled'],
  completed: ['closed'],
  cancelled: ['closed'],
  closed: [],
};

/** Work still to happen: shown as "active" on dashboards. */
export const ACTIVE_STATES = [
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'assessing',
  'in_progress',
  'quote_pending',
] as const satisfies readonly JobState[];

/** No further work by either party (closing after payment is not work). */
export const TERMINAL_STATES = ['completed', 'cancelled', 'closed'] as const satisfies readonly JobState[];

export function isJobState(value: unknown): value is JobState {
  return typeof value === 'string' && (JOB_STATES as readonly string[]).includes(value);
}

export function isActive(state: string): boolean {
  return (ACTIVE_STATES as readonly string[]).includes(state);
}

export function isTerminal(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransition(from: string, to: string): boolean {
  return isJobState(from) && isJobState(to) && TRANSITIONS[from].includes(to);
}

/** Label for any stored value; falls back to the raw value for unknown states. */
export function stateLabel(state: string): string {
  return isJobState(state) ? STATE_META[state].label : state;
}

export function stateTone(state: string): JobStateTone {
  return isJobState(state) ? STATE_META[state].tone : 'neutral';
}
