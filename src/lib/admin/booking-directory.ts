import { z } from 'zod';

export const LIFECYCLES = ['all', 'unmatched', 'offered', 'accepted', 'active', 'completed', 'cancelled'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  all: 'All',
  unmatched: 'Unmatched',
  offered: 'Offer pending',
  accepted: 'Accepted',
  active: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Job states behind each lifecycle filter (`unmatched` is "no job at all"). */
export const LIFECYCLE_JOB_STATES: Record<Exclude<Lifecycle, 'all' | 'unmatched'>, string[]> = {
  offered: ['assigned'],
  accepted: ['accepted'],
  active: ['on_the_way', 'arrived', 'in_progress', 'quote_pending'],
  completed: ['completed', 'closed'],
  cancelled: ['cancelled'],
};

/** Whether the booking's job has a professional. Bookings with no job at all are the "Unmatched" lifecycle. */
export const ASSIGNMENTS = ['all', 'with_professional', 'no_professional'] as const;
export type Assignment = (typeof ASSIGNMENTS)[number];
export const ASSIGNMENT_LABELS: Record<Assignment, string> = {
  all: 'Any',
  with_professional: 'Professional assigned',
  no_professional: 'Job without professional',
};

export const PAGE_SIZE = 25;
export const SORTS = ['scheduled_desc', 'scheduled_asc', 'created_desc'] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Search text is limited to characters that cannot alter a PostgREST filter expression. */
export const directoryInput = z.object({
  q: z
    .string()
    .trim()
    .max(60)
    .regex(/^[\p{L}\p{N} @._-]*$/u)
    .optional()
    .catch(undefined),
  lifecycle: z.enum(LIFECYCLES).catch('all'),
  assignment: z.enum(ASSIGNMENTS).catch('all'),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  sort: z.enum(SORTS).catch('scheduled_desc'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type DirectoryInput = z.infer<typeof directoryInput>;

export function lifecycleOf(bookingStatus: string, jobState: string | null): Lifecycle {
  if (jobState) {
    for (const [k, states] of Object.entries(LIFECYCLE_JOB_STATES)) if (states.includes(jobState)) return k as Lifecycle;
  }
  if (bookingStatus === 'cancelled') return 'cancelled';
  return jobState ? 'active' : 'unmatched';
}
