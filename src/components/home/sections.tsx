import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { FREE_INSPECTION_PROMISED } from '@/lib/brand';
import {
  bookingHref,
  comingSoon,
  professionalHref,
  type ViewerRole,
} from '@/lib/marketing-links';

export type HomeCategory = { id: string; slug: string; name: string; description: string | null };

const wrap = 'mx-auto w-[min(1240px,calc(100%-36px))] sm:w-[min(1240px,calc(100%-48px))]';
const kicker = 'text-[12px] font-semibold uppercase tracking-[0.16em] text-teal';
const h2 = 'mt-3 font-editorial text-[clamp(32px,5vw,54px)] font-normal leading-[1.05] tracking-[-0.02em] text-ink';

/* ── Plain facts, not vanity numbers ───────────────────────────────────── */
const FACTS = [
  ['Verified professionals', 'Checked by our team before they can accept a single job.'],
  ['Clear quotations', 'Itemised, in rupees. Extra work needs your approval before it starts.'],
  ['Track every job', 'See each step from booking to completion in one place.'],
  ['Kept on record', 'Invoices and service notes stay with your property.'],
] as const;

export function FactsStrip() {
  return (
    <section aria-label="What you can rely on" className="border-y border-line bg-paper">
      <ul className={`${wrap} grid grid-cols-2 lg:grid-cols-4`}>
        {FACTS.map(([title, body], i) => (
          <li key={title} className={`border-line py-5 pr-4 sm:py-6 sm:pr-6 lg:border-t-0 ${i % 2 === 1 ? 'pl-4 border-l sm:pl-6' : ''} ${i > 1 ? 'border-t' : ''} ${i === 2 ? 'lg:border-l lg:pl-6' : ''} ${i === 3 ? 'lg:pl-6' : ''}`}>
            <p className="font-editorial text-[17px] text-ink sm:text-[19px]">{title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3 sm:text-[14px]">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── How it works ───────────────────────────────────────────────────────── */
const STEPS = [
  ['Choose your service', 'Pick what needs fixing and tell us the problem. Everyday words and a photo are enough.'],
  [
    FREE_INSPECTION_PROMISED ? 'Get a free inspection' : 'Get it inspected',
    'A verified professional visits, looks at the problem and confirms what needs to be done.',
  ],
  ['Get a clear quotation', 'You receive an itemised quote in rupees. You decide; nothing extra happens without your yes.'],
  ['Get the work done', 'The professional completes the job. Pay securely by UPI, and the invoice is saved to your property record.'],
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-28">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className={kicker}>How it works</p>
          <h2 className={h2}>From booking to fixed, in four simple steps.</h2>
          <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-ink-3">
            No phone tag, no cash-in-hand guesswork. Every step is visible to you and to the professional.
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 py-7 sm:gap-x-8 sm:py-9">
              <span className="font-editorial text-[44px] leading-none text-teal/70 sm:text-[56px]" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-editorial text-[24px] leading-tight text-ink sm:text-[28px]">{title}</h3>
                <p className="mt-2 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-3">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Services as an index, not a card grid ──────────────────────────────── */
export function ServicesIndex({ role, categories }: { role: ViewerRole; categories: HomeCategory[] }) {
  return (
    <section id="services" className="scroll-mt-20 bg-paper-2 py-20 sm:py-28">
      <div className={wrap}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className={kicker}>Services</p>
            <h2 className={h2}>What can we help you fix?</h2>
          </div>
          <Link
            href={bookingHref(role)}
            className="inline-flex items-center gap-2 text-[14px] font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
          >
            Not sure? Describe the problem <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-12 border-t border-ink/80">
          {categories.map((s, i) => (
            <li key={s.slug} className="border-b border-line-strong">
              <Link
                href={bookingHref(role, s.id)}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-5 py-6 sm:gap-x-10 sm:py-8"
              >
                <span className="font-mono text-[12px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="block font-editorial text-[clamp(26px,4.4vw,44px)] leading-none tracking-[-0.015em] text-ink transition-colors group-hover:text-teal">
                    {s.name}
                  </span>
                  <span className="mt-2 block max-w-[54ch] text-[14.5px] text-ink-3">{s.description}</span>
                </span>
                <span className="grid size-11 place-items-center rounded-full border border-line-strong text-ink transition-all group-hover:border-teal group-hover:bg-teal group-hover:text-paper">
                  <ArrowUpRight size={18} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── The property record, drawn as a ledger ─────────────────────────────── */
const LEDGER = [
  ['12 Aug', 'Plumbing', 'Kitchen tap cartridge replaced', '₹800', '90 days'],
  ['03 Jun', 'Electrical', 'Bedroom socket and wiring', '₹800', '90 days'],
  ['19 Apr', 'AC & cooling', 'Gas top-up, coil cleaning', '₹1,400', '30 days'],
  ['07 Feb', 'Appliances', 'Washing machine drain pump', '₹1,500', '60 days'],
] as const;

export function PropertyRecord({ role }: { role: ViewerRole }) {
  return (
    <section id="property" className="scroll-mt-20 py-20 sm:py-28">
      <div className={`${wrap} grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20`}>
        <div>
          <p className={kicker}>Property record</p>
          <h2 className={h2}>The next repair starts with the last one.</h2>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-ink-3">
            Every completed job is filed against your home: who did it, what it cost, what was replaced and
            how long it&rsquo;s covered. Useful when the same fault comes back, when you rent the place out,
            or when you sell it.
          </p>
          <ul className="mt-6 space-y-2.5 text-[15px] text-ink-2">
            {['Invoices and quotes in one place', 'Warranty dates at a glance', 'Shareable with a tenant or buyer'].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check size={17} className="mt-0.5 shrink-0 text-teal" strokeWidth={2.5} aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
          <Link
            href={bookingHref(role)}
            className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep"
          >
            Start your record <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line-strong bg-paper shadow-[0_30px_60px_-34px_rgba(24,33,31,0.35)]">
          <div className="flex items-center justify-between border-b border-line bg-paper-2 px-5 py-3.5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">Property record</p>
              <p className="font-editorial text-[19px] text-ink">Flat 4B, Indiranagar</p>
            </div>
            <span className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-semibold text-teal-deep">Sample</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">
                  <th className="px-4 py-3 font-semibold sm:px-5">Date</th>
                  <th className="py-3 font-semibold">Work</th>
                  <th className="py-3 pr-5 text-right font-semibold sm:pr-0">Cost</th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Warranty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {LEDGER.map(([date, trade, work, cost, warranty]) => (
                  <tr key={date}>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[12px] sm:px-5 text-ink-3">{date}</td>
                    <td className="py-3.5 pr-3">
                      <span className="block text-ink">{work}</span>
                      <span className="text-[12px] text-ink-4">{trade}<span className="sm:hidden"> · {warranty} cover</span></span>
                    </td>
                    <td className="py-3.5 pr-5 text-right tabular-nums text-ink sm:pr-0">{cost}</td>
                    <td className="hidden px-5 py-3.5 text-right text-teal-deep sm:table-cell">{warranty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Professionals ──────────────────────────────────────────────────────── */
const PRO_POINTS = [
  ['Job requests that fit', 'See the problem, photos and location before you say yes.'],
  ['Quote in the app', 'Send itemised quotes. Customers approve extra work in one tap.'],
  ['Get paid by UPI', 'Payment is tied to the completed job. No chasing.'],
  ['Build a reputation', 'Ratings and completed jobs follow you from one job to the next.'],
] as const;

export function ProfessionalSection({ role }: { role: ViewerRole }) {
  const signedInPro = role === 'professional';
  return (
    <section id="professionals" className="scroll-mt-20 bg-ink py-20 text-porcelain sm:py-28">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20`}>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#7FC4B1]">For professionals</p>
          <h2 className="mt-3 font-editorial text-[clamp(32px,5vw,54px)] font-normal leading-[1.05] tracking-[-0.02em]">
            Steady work for people who do it well.
          </h2>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-porcelain/70">
            Plumbers, electricians, AC and appliance technicians: get matched to jobs near you and run the
            whole job from your phone. You&rsquo;ll be verified before you can accept work, so customers
            know who&rsquo;s at the door.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={professionalHref(role)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-porcelain px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-white"
            >
              {signedInPro ? 'Open your workspace' : 'Apply as a professional'} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {!role && (
              <Link
                href="/auth/login?as=professional"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-porcelain/30 px-6 text-[15px] font-semibold text-porcelain transition-colors hover:border-porcelain/70"
              >
                Professional sign in
              </Link>
            )}
          </div>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-2xl bg-porcelain/15 sm:grid-cols-2">
          {PRO_POINTS.map(([title, body]) => (
            <li key={title} className="bg-ink p-6">
              <h3 className="font-editorial text-[21px] leading-tight">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-porcelain/65">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── FAQ: native details/summary, so it works without JS ────────────────── */
const FAQ = [
  ['How are professionals verified?', 'Every professional applies, completes onboarding and is reviewed by our team. They can’t accept jobs until they’re verified.'],
  ['What does it cost to request a service?', 'You pay for the work in the quote you approve. Nothing extra is added without your approval first.'],
  ['What if more work is needed on the day?', 'The professional sends a new itemised quote through the app. You approve or decline it. Work doesn’t continue until you say yes.'],
  ['How do I pay?', 'By UPI, once the job is marked complete. Your invoice is saved to your property record.'],
  ['Which cities do you cover?', 'We’re starting with a small set of cities and adding more. Create an account and we’ll tell you what’s available at your address.'],
] as const;

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
        <div>
          <p className={kicker}>Questions</p>
          <h2 className={h2}>Before you book.</h2>
          <p className="mt-5 text-[15px] text-ink-3">
            Something else?{' '}
            <Link href="/help" className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal">
              Visit the help centre
            </Link>{' '}
            or{' '}
            <Link href="/contact" className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal">
              contact us
            </Link>
            .
          </p>
        </div>
        <div className="border-t border-line-strong">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line-strong">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-[18px] leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-[60ch] pb-5 text-[15px] leading-relaxed text-ink-3">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Closing call to action ─────────────────────────────────────────────── */
export function ClosingCta({ role }: { role: ViewerRole }) {
  return (
    <section className="px-[18px] pb-20 sm:px-6 sm:pb-28">
      <div className="mx-auto max-w-[1240px] rounded-[28px] bg-teal px-6 py-16 text-center text-paper sm:px-12 sm:py-24">
        <h2 className="mx-auto max-w-[16ch] font-editorial text-[clamp(34px,6vw,68px)] font-normal leading-[1.02] tracking-[-0.02em]">
          Something broken at home?
        </h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-[16px] leading-relaxed text-paper/80">
          Tell us what&rsquo;s wrong. We&rsquo;ll find someone who can fix it, and keep the record.
        </p>
        <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href={bookingHref(role)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-paper px-7 text-[15px] font-semibold text-teal-deep transition-colors hover:bg-white"
          >
            Book a service <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href={comingSoon('Download the app')}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-paper/40 px-7 text-[15px] font-semibold text-paper transition-colors hover:border-paper"
          >
            Get the app
          </Link>
        </div>
      </div>
    </section>
  );
}
