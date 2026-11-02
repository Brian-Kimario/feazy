import { z } from 'zod';

/** Emails are compared case-insensitively, so store and send them trimmed and lowercased. */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter the email address on your account.')
    .max(254, 'That email address is too long.')
    .pipe(z.email('Enter a valid email address, like you@example.com.')),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
