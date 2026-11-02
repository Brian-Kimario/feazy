import { z } from 'zod';

export const PRO_PAGE_SIZE = 25;
export const PRO_STATUSES = ['all', 'pending', 'documents_submitted', 'under_review', 'verified', 'rejected', 'suspended'] as const;
export const PRO_AVAILABILITY = ['all', 'available', 'unavailable'] as const;
export const PRO_WORKLOAD = ['all', 'with_active', 'none_active'] as const;

export const PRO_STATUS_LABELS: Record<(typeof PRO_STATUSES)[number], string> = {
  all: 'All statuses',
  pending: 'Pending',
  documents_submitted: 'Documents submitted',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

/** Search text is limited to characters that cannot alter a PostgREST filter expression. */
export const professionalDirectoryInput = z.object({
  q: z
    .string()
    .trim()
    .max(60)
    .regex(/^[\p{L}\p{N} @._+-]*$/u)
    .optional()
    .catch(undefined),
  status: z.enum(PRO_STATUSES).catch('all'),
  availability: z.enum(PRO_AVAILABILITY).catch('all'),
  workload: z.enum(PRO_WORKLOAD).catch('all'),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type ProfessionalDirectoryInput = z.infer<typeof professionalDirectoryInput>;
