import { z } from 'zod';

export const CUSTOMER_PAGE_SIZE = 25;

/** Search text is limited to characters that cannot alter a PostgREST filter expression. */
export const customerDirectoryInput = z.object({
  q: z
    .string()
    .trim()
    .max(60)
    .regex(/^[\p{L}\p{N} @._+-]*$/u)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
