import { z } from 'zod';

export const CONTACT_TOPICS = ['booking', 'payment', 'professional', 'account', 'partnership', 'other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const contactMessageSchema = z.object({
  topic: z.enum(CONTACT_TOPICS, { message: 'Choose what your message is about.' }),
  name: z.string().trim().min(1, 'Enter your name.').max(100, 'Keep your name under 100 characters.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email so we can reply.')
    .max(254, 'That email address is too long.')
    .pipe(z.email('Enter a valid email address, like you@example.com.')),
  bookingRef: z
    .string()
    .trim()
    .max(60, 'That reference is too long.')
    .optional()
    .transform((value) => value || undefined),
  message: z
    .string()
    .trim()
    .min(10, 'Tell us a little more, at least 10 characters.')
    .max(3000, 'Keep your message under 3,000 characters.'),
  /** Honeypot: real visitors never see or fill this. */
  website: z.string().max(500).optional(),
});

export type ContactMessageInput = z.input<typeof contactMessageSchema>;
