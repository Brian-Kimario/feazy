'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { JobTicket } from './job-ticket';
import { TAGLINES, inspectionLabel } from '@/lib/brand';
import { bookingHref, professionalHref, type ViewerRole } from '@/lib/marketing-links';
import type { HomeCategory } from './sections';

export function Hero({ role, categories }: { role: ViewerRole; categories: HomeCategory[] }) {
  const [service, setService] = useState<string | undefined>();
  const isPro = role === 'professional';
  const href = bookingHref(role, service);
  const cta = !role || role === 'customer' ? (service ? 'Book this service' : 'Book a service') : 'Open your dashboard';

  return (
    <section className="relative overflow-hidden pt-[68px] sm:pt-[76px]">
      {/* Faint blueprint grid: a nod to measured work, kept quiet */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,rgba(24,33,31,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,33,31,0.045)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      <div className="relative mx-auto grid w-[min(1240px,calc(100%-36px))] items-center gap-12 pb-16 pt-10 sm:w-[min(1240px,calc(100%-48px))] sm:pb-20 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-20">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">
            Home repairs across India
          </p>
          <h1 className="mt-4 font-editorial text-[clamp(40px,7.4vw,76px)] font-normal leading-[1.02] tracking-[-0.025em] text-ink">
            {TAGLINES.homeHeadline} <em className="italic text-teal-deep">{TAGLINES.homeHeadlineEmphasis}</em>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            {TAGLINES.homeSub}
          </p>

          {!isPro && (
            <div className="mt-8 rounded-2xl border border-line-strong bg-paper/80 p-4 shadow-[0_18px_40px_-26px_rgba(24,33,31,0.3)] sm:p-5">
              <p id="hero-service-label" className="text-[13px] font-semibold text-ink">
                What needs fixing?
              </p>
              <div role="radiogroup" aria-labelledby="hero-service-label" className="mt-3 flex flex-wrap gap-2">
                {categories.map((s) => {
                  const on = service === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setService(on ? undefined : s.id)}
                      className={`min-h-11 cursor-pointer rounded-xl border px-4 text-[14px] font-medium transition-colors ${
                        on
                          ? 'border-teal bg-teal text-paper'
                          : 'border-line-strong bg-paper text-ink-2 hover:border-ink-3 hover:text-ink'
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <Link
                href={href}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep sm:w-auto"
              >
                {cta} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <p className="mt-3 text-[13px] text-ink-3">
                {inspectionLabel('Get')}, then approve a clear quotation before any work starts.
              </p>
            </div>
          )}

          {isPro && (
            <Link
              href="/professional"
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-porcelain hover:bg-teal-deep"
            >
              Open your workspace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}

          <p className="mt-5 text-[14px] text-ink-3">
            {isPro ? (
              <>Looking for work? Your jobs and quotes are in your workspace.</>
            ) : (
              <>
                Fix things for a living?{' '}
                <Link
                  href={professionalHref(role)}
                  className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
                >
                  Join as a professional
                </Link>
              </>
            )}
          </p>
        </div>

        <JobTicket />
      </div>
    </section>
  );
}
