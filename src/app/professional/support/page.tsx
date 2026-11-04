import Link from 'next/link';
import {
  BadgeCheck,
  ChevronDown,
  ClipboardList,
  Inbox,
  IndianRupee,
  Mail,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { PageContainer } from '@/components/shell/primitives';

export const metadata = {
  title: 'Help & support — Feazy Professional',
};

interface Topic {
  id: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  faqs: { question: string; answer: React.ReactNode }[];
}

// Each answer describes what the app does today (matching, decline_job, report_job_eta,
// create_quote, job messages, payment amount). Do not add promises (fees, payout schedules,
// response times, compensation) that no table, query or config row backs.
const topics: Topic[] = [
  {
    id: 'requests',
    title: 'Getting requests',
    blurb: 'Offers, accepting and declining',
    Icon: Inbox,
    faqs: [
      {
        question: 'Why am I not getting any requests?',
        answer: (
          <>
            Requests only reach professionals who are verified, online and have a skill in the booking’s category. Check
            the availability switch at the top of the screen, and the skills on your{' '}
            <Link href="/professional/profile" className="font-semibold text-teal hover:text-teal-deep">
              profile
            </Link>
            .
          </>
        ),
      },
      {
        question: 'How do offers work?',
        answer:
          'Each booking is offered to one professional at a time. The request shows how long you have to respond. If the time runs out, or you decline, it moves on to the next matching professional.',
      },
      {
        question: 'Can I decline a request?',
        answer:
          'Yes. Pick a reason when you decline, and add a short note if you choose Other. The request is then offered to someone else.',
      },
      {
        question: 'When can I see the customer’s phone and address?',
        answer:
          'Once you accept. Before that, the request shows the job without the customer’s contact details. After you accept, the job page shows the customer’s name, phone (if they added one) and full address with any access notes.',
      },
    ],
  },
  {
    id: 'on-the-job',
    title: 'On the job',
    blurb: 'Arrival, photos, inspection and quotes',
    Icon: ClipboardList,
    faqs: [
      {
        question: 'How do I tell the customer when I’ll arrive?',
        answer:
          'On the job page, share an arrival window before you get there. You can update it, or mark that you’re running late, until you arrive.',
      },
      {
        question: 'How do I message the customer?',
        answer:
          'Use Messages on the job page. Messages are open from when you accept until the job ends, and the customer sees them in their own Messages. If the customer added no phone number, this is how to reach them.',
      },
      {
        question: 'Can I add photos?',
        answer:
          'Yes. From the time you arrive until the job is completed you can add JPG, PNG or WebP photos, or a PDF, to the job. Before-and-after photos help if a question comes up later.',
      },
      {
        question: 'The job needs more work than was booked. What do I do?',
        answer:
          'Record what you found in the inspection, then send a quote with line items for the extra labour and parts. The job waits while the customer approves or declines it. No platform fee or tax is added; the total is the sum of your line items. Nothing extra is charged unless the customer approves.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Getting paid',
    blurb: 'Completion and customer payment',
    Icon: IndianRupee,
    faqs: [
      {
        question: 'When does the customer pay?',
        answer:
          'After you mark the job completed, the customer can pay by UPI from their booking page.',
      },
      {
        question: 'How is the amount decided?',
        answer:
          'It is the customer’s most recent approved quote. If there was no approved quote, it is the price shown when they booked.',
      },
      {
        question: 'Where can I see what I’ve earned?',
        answer: (
          <>
            Your{' '}
            <Link href="/professional/earnings" className="font-semibold text-teal hover:text-teal-deep">
              Earnings
            </Link>{' '}
            page lists each completed job, its agreed amount and whether the customer has paid.
          </>
        ),
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    blurb: 'Verification, profile and skills',
    Icon: BadgeCheck,
    faqs: [
      {
        question: 'How does verification work?',
        answer: (
          <>
            Upload your documents in{' '}
            <Link href="/professional/onboarding" className="font-semibold text-teal hover:text-teal-deep">
              Verification
            </Link>
            . An admin reviews them. Until you are verified you can’t go online or receive requests. If verification is
            not approved, the reason appears on your profile.
          </>
        ),
      },
      {
        question: 'How do I change my skills or phone number?',
        answer: (
          <>
            Open{' '}
            <Link href="/professional/profile/edit" className="font-semibold text-teal hover:text-teal-deep">
              Edit profile
            </Link>
            . Your skills decide which bookings can be offered to you, and your phone is shared with customers once you
            accept their job.
          </>
        ),
      },
    ],
  },
];

export default function ProfessionalSupportPage() {
  return (
    <PageContainer className="max-w-4xl">
      <p className="text-sm font-medium text-ink-3">Help</p>
      <h1 className="mt-1 font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-4xl">
        How can we help?
      </h1>
      <p className="mt-2 max-w-xl text-ink-3">How requests, jobs and payments work on Feazy, and how to reach us.</p>

      <nav aria-label="Help topics" className="mt-8">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {topics.map(({ id, title, blurb, Icon }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-paper p-4 hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-wash text-teal">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">{blurb}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 space-y-10">
        {topics.map(({ id, title, faqs }) => (
          <section key={id} id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
            <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
              {faqs.map((faq) => (
                <details key={faq.question} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm font-semibold text-ink hover:bg-paper-2/60 md:text-base [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-ink-4 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-6 text-ink-2">{faq.answer}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-teal-wash p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper text-teal">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-semibold text-ink">Still need help?</h2>
          <p className="mt-1 text-sm text-ink-2">
            Email{' '}
            <a href="mailto:support@feazy.com" className="font-semibold text-teal hover:text-teal-deep">
              support@feazy.com
            </a>{' '}
            from the address you sign in with. For a job, include its ID: the last part of the job page’s web address.
          </p>
        </section>

        <section className="rounded-2xl border border-danger/30 bg-danger-soft p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper text-danger">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-semibold text-ink">Safety first</h2>
          <p className="mt-1 text-sm text-ink-2">
            If you find a gas leak, exposed live wiring or flooding, or you feel unsafe at a site, leave and call 112.
            Don’t continue the job. Message the customer from the job page once you’re safe.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
