import { z } from 'zod';

export const PAYMENT_PAGE_SIZE = 25;
export const PAYMENT_STATUSES = ['all', 'pending', 'paid', 'failed', 'refunded'] as const;

/** Filters from the query string; bad values fall back to defaults. */
export const paymentDirectoryInput = z.object({
  status: z.enum(PAYMENT_STATUSES).catch('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
