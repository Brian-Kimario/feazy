/**
 * Help centre content. Each answer describes what the app does today. Do not add promises
 * (fees, payout schedules, response times, compensation) that no table, query or config row backs.
 */
export type HelpAudience = 'customer' | 'professional';

export interface HelpCategory {
  id: string;
  label: string;
}

export interface HelpFaq {
  id: string;
  audience: HelpAudience;
  category: string;
  question: string;
  answer: string;
  /** An in-app page that does the thing the answer describes. */
  action?: { label: string; href: string };
}

export const HELP_CATEGORIES: Record<HelpAudience, readonly HelpCategory[]> = {
  customer: [
    { id: 'booking', label: 'Booking' },
    { id: 'job', label: 'During the job' },
    { id: 'quotes-payment', label: 'Quotes and payment' },
    { id: 'safety', label: 'Safety' },
  ],
  professional: [
    { id: 'requests', label: 'Requests' },
    { id: 'job', label: 'On the job' },
    { id: 'payment', label: 'Getting paid' },
    { id: 'account', label: 'Your account' },
  ],
};

export const HELP_FAQS: readonly HelpFaq[] = [
  // Customers
  {
    id: 'c-book',
    audience: 'customer',
    category: 'booking',
    question: 'How do I book a repair?',
    answer:
      'Start a booking from your dashboard, choose the service and a time, and confirm. We offer the job to an available professional automatically; you will see their name once they accept.',
    action: { label: 'Book a repair', href: '/customer' },
  },
  {
    id: 'c-service',
    audience: 'customer',
    category: 'booking',
    question: 'Do I need to know which service I need?',
    answer: 'No. You can describe the problem in your own words and pick the closest category.',
  },
  {
    id: 'c-track',
    audience: 'customer',
    category: 'job',
    question: 'How do I track my job?',
    answer:
      'Your dashboard shows the current status of each active job, from assigned through to completed. The booking page also shows the arrival window the professional shares and a timeline of what has happened.',
    action: { label: 'My bookings', href: '/customer/bookings' },
  },
  {
    id: 'c-message',
    audience: 'customer',
    category: 'job',
    question: 'How do I contact my professional?',
    answer:
      'Use Messages on the booking page. Messages are open from when the professional accepts until the job ends, and the professional sees them on their job.',
  },
  {
    id: 'c-codes',
    audience: 'customer',
    category: 'job',
    question: 'What are the start and finish codes?',
    answer:
      'Your booking page shows a code when the professional arrives, and another before the work is marked complete. Give a code only to the professional in person. If a code is lost or locked after wrong attempts, you can get a new one from the booking page.',
  },
  {
    id: 'c-noshow',
    audience: 'customer',
    category: 'job',
    question: 'The professional has not arrived. What can I do?',
    answer:
      'Check the arrival window and Messages first. If they have not arrived 30 minutes after the scheduled start, you can report it from the booking page and the team will review it.',
  },
  {
    id: 'c-extra',
    audience: 'customer',
    category: 'quotes-payment',
    question: 'What if the professional finds more work?',
    answer:
      'They send you a quote from the job. You can approve or decline it on your dashboard. Nothing extra is charged unless you approve.',
  },
  {
    id: 'c-pay',
    audience: 'customer',
    category: 'quotes-payment',
    question: 'When and how do I pay?',
    answer:
      'After the professional marks the job completed, you can pay by UPI from the booking page. The amount is your approved quote, or the booking price if there was no quote.',
  },
  {
    id: 'c-emergency',
    audience: 'customer',
    category: 'safety',
    question: 'What if it is an emergency?',
    answer:
      'For a gas leak, exposed wiring or flooding, leave the area and call 112. Do not wait for a booking.',
  },
  // Professionals
  {
    id: 'p-none',
    audience: 'professional',
    category: 'requests',
    question: 'Why am I not getting any requests?',
    answer:
      'Requests only reach professionals who are verified, online and have a skill in the booking’s category. Check the availability switch at the top of the screen and the skills on your profile.',
    action: { label: 'Edit profile', href: '/professional/profile/edit' },
  },
  {
    id: 'p-offers',
    audience: 'professional',
    category: 'requests',
    question: 'How do offers work?',
    answer:
      'Each booking is offered to one professional at a time. The request shows how long you have to respond. If the time runs out, or you decline, it moves on to the next matching professional.',
  },
  {
    id: 'p-contact',
    audience: 'professional',
    category: 'requests',
    question: 'When can I see the customer’s phone and address?',
    answer:
      'Once you accept. Before that, the request shows the job without contact details. After you accept, the job page shows the customer’s name, phone (if they added one) and full address with any access notes.',
  },
  {
    id: 'p-eta',
    audience: 'professional',
    category: 'job',
    question: 'How do I tell the customer when I will arrive?',
    answer:
      'On the job page, share an arrival window before you get there. You can update it, or mark that you are running late, until you arrive.',
  },
  {
    id: 'p-codes',
    audience: 'professional',
    category: 'job',
    question: 'How do I use the codes on site?',
    answer:
      'When you arrive, ask the customer for the start code and enter it on the job page before you begin. Do the same with the finish code before you complete the job. After several wrong attempts the code locks and the customer can issue a new one.',
  },
  {
    id: 'p-photos',
    audience: 'professional',
    category: 'job',
    question: 'Can I add photos?',
    answer:
      'Yes. From the time you arrive until the job is completed you can add JPG, PNG or WebP photos, or a PDF, to the job. Before-and-after photos help if a question comes up later.',
  },
  {
    id: 'p-extra',
    audience: 'professional',
    category: 'job',
    question: 'The job needs more work than was booked. What do I do?',
    answer:
      'Record what you found in the inspection, then send a quote with line items for the extra labour and parts. The job waits while the customer approves or declines it. No platform fee or tax is added; the total is the sum of your line items.',
  },
  {
    id: 'p-pay',
    audience: 'professional',
    category: 'payment',
    question: 'When does the customer pay, and how is the amount decided?',
    answer:
      'After you mark the job completed, the customer can pay by UPI from their booking page. The amount is their most recent approved quote, or the booked price if there was no quote.',
    action: { label: 'See earnings', href: '/professional/earnings' },
  },
  {
    id: 'p-verify',
    audience: 'professional',
    category: 'account',
    question: 'How does verification work?',
    answer:
      'Upload your documents in Verification. An admin reviews them. Until you are verified you cannot go online or receive requests. If verification is not approved, the reason appears on your profile.',
    action: { label: 'Open verification', href: '/professional/onboarding' },
  },
  {
    id: 'p-safety',
    audience: 'professional',
    category: 'account',
    question: 'What if I feel unsafe at a site?',
    answer:
      'If you find a gas leak, exposed live wiring or flooding, or you feel unsafe, leave and call 112. Do not continue the job. Message the customer from the job page once you are safe.',
  },
];

/** FAQs for one audience, optionally narrowed to a category and a search phrase (all words must match). */
export function filterFaqs(
  faqs: readonly HelpFaq[],
  options: { audience: HelpAudience; category?: string | null; query?: string },
): HelpFaq[] {
  const words = (options.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return faqs.filter((faq) => {
    if (faq.audience !== options.audience) return false;
    // A search looks across every category so a typo in the chip choice never hides an answer.
    if (words.length === 0 && options.category && faq.category !== options.category) return false;
    const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
