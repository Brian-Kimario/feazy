import Link from 'next/link';

// Each answer describes what the app does today. Do not add promises (fees, response times,
// compensation) that no table, query or config row backs.
const faqs = [
  {
    question: 'How do I book a service?',
    answer:
      'Start a booking from your dashboard, choose the service and a time, and confirm. We offer the job to an available professional automatically; you will see their name once they accept.',
  },
  {
    question: 'What happens if the professional finds more work?',
    answer:
      'They send you a quote from the job. You can approve or decline it on your dashboard. Nothing extra is charged unless you approve.',
  },
  {
    question: 'When do I pay?',
    answer:
      'After the professional marks the job completed, you can pay by UPI from the booking page. The amount is your approved quote, or the booking price if there was no quote.',
  },
  {
    question: 'How do I track my job?',
    answer:
      'Your dashboard shows the current status of each active job, from assigned through to completed.',
  },
];

export default function CustomerSupportPage() {
  return (
    <div className="pb-20 md:pb-0 min-h-screen bg-paper">
      <div className="px-4 md:px-6 py-8 md:py-12 bg-gradient-to-br from-teal-soft to-paper border-b border-line">
        <div className="max-w-4xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-[0.11em] text-teal mb-2">Help</div>
          <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2">How can we help?</h1>
          <p className="text-ink-3 max-w-2xl">Answers to common questions about booking with Feazy.</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-ink mb-6">Frequently asked questions</h2>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="bg-paper border-2 border-line rounded-lg p-4 hover:border-teal transition cursor-pointer group"
                >
                  <summary className="flex items-center justify-between font-semibold text-ink select-none text-sm md:text-base">
                    {faq.question}
                    <svg
                      className="w-5 h-5 text-ink-4 transition-transform group-open:rotate-180 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="text-ink-3 mt-3 text-sm">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="bg-porcelain border border-line rounded-lg p-6">
            <h2 className="font-bold text-ink mb-1">Still need help?</h2>
            <p className="text-sm text-ink-3">
              Email{' '}
              <a href="mailto:support@feasy.com" className="text-teal underline">
                support@feasy.com
              </a>{' '}
              and include your booking reference. You can find it on the{' '}
              <Link href="/customer/bookings" className="text-teal underline">
                bookings page
              </Link>
              .
            </p>
          </section>

          <section className="bg-yellow/10 border-2 border-yellow/30 rounded-lg p-5">
            <strong className="block text-sm text-ink">Emergencies</strong>
            <p className="text-xs text-ink-3 mt-1">
              For gas leaks, exposed wiring or flooding, leave the area and call 112. Do not wait for a booking.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
