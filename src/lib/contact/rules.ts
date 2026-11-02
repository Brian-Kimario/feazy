import type { ContactTopic } from '@/validators/contact';

/** Matches the generated `reference` column on contact_messages. */
export function referenceFor(id: string): string {
  return `FS-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export const TOPIC_COPY: Record<ContactTopic, { label: string; hint: string }> = {
  booking: { label: 'A booking', hint: 'Scheduling, status or a visit' },
  payment: { label: 'Payment', hint: 'UPI, quotes or invoices' },
  professional: { label: 'A professional', hint: 'Conduct or quality of work' },
  account: { label: 'My account', hint: 'Sign-in or profile' },
  partnership: { label: 'Partnership', hint: 'Business or press' },
  other: { label: 'Something else', hint: 'Anything not listed' },
};
