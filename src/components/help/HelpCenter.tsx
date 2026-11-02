'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react';
import { Symbol } from '@/components/brand/Symbol';
import { HELP_CATEGORIES, HELP_FAQS, filterFaqs, type HelpAudience } from '@/lib/help/content';

const AUDIENCES: ReadonlyArray<{ id: HelpAudience; label: string }> = [
  { id: 'customer', label: 'I need a repair' },
  { id: 'professional', label: 'I’m a professional' },
];

const chip =
  'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[14px] font-medium transition-colors';

export function HelpCenter() {
  const [audience, setAudience] = useState<HelpAudience>('customer');
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const searchId = useId();

  const searching = query.trim().length > 0;
  const results = filterFaqs(HELP_FAQS, { audience, category, query });
  const categories = HELP_CATEGORIES[audience];

  function pickAudience(next: HelpAudience) {
    setAudience(next);
    setCategory(null);
    setOpenId(null);
  }

  return (
    <div className="min-h-screen bg-porcelain text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-editorial text-[20px]" aria-label="Feazy home">
            <Symbol size="sm" />
            Feazy
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-teal hover:text-teal-deep"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:pt-12">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">Help centre</p>
        <h1 className="mt-3 font-editorial text-[clamp(32px,6vw,48px)] font-normal leading-[1.05] tracking-[-0.02em]">
          How can we help?
        </h1>

        <div role="group" aria-label="Who is asking" className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-teal-wash p-1">
          {AUDIENCES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={audience === item.id}
              onClick={() => pickAudience(item.id)}
              className={`min-h-11 cursor-pointer rounded-xl px-3 text-[14px] font-semibold transition-colors ${
                audience === item.id ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <label htmlFor={searchId} className="sr-only">
            Search help
          </label>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            id={searchId}
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Search, e.g. payment or codes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-line-strong bg-paper pl-11 pr-11 text-[16px] outline-none transition-colors placeholder:text-ink-4 focus:border-teal"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center text-ink-3 hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {!searching && (
          <div role="group" aria-label="Topics" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
              className={`${chip} ${category === null ? 'border-teal bg-teal text-porcelain' : 'border-line-strong bg-paper text-ink-2 hover:border-ink-3'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`${chip} ${category === c.id ? 'border-teal bg-teal text-porcelain' : 'border-line-strong bg-paper text-ink-2 hover:border-ink-3'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <p role="status" className="mt-6 text-[13px] text-ink-3">
          {searching
            ? `${results.length} ${results.length === 1 ? 'answer' : 'answers'} for “${query.trim()}”`
            : `${results.length} ${results.length === 1 ? 'answer' : 'answers'}`}
        </p>

        {results.length > 0 ? (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {results.map((faq) => {
              const open = openId === faq.id;
              return (
                <li key={faq.id}>
                  <h2>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-${faq.id}`}
                      onClick={() => setOpenId(open ? null : faq.id)}
                      className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left text-[15px] font-semibold"
                    >
                      {faq.question}
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h2>
                  {open && (
                    <div id={`faq-${faq.id}`} className="px-4 pb-4 text-[14.5px] leading-relaxed text-ink-2">
                      <p>{faq.answer}</p>
                      {faq.action && (
                        <Link
                          href={faq.action.href}
                          className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-teal hover:text-teal-deep"
                        >
                          {faq.action.label}
                          <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-paper px-4 py-6 text-center text-[14.5px] text-ink-3">
            No answers match that. Try a shorter word, or ask us directly below.
          </p>
        )}

        <section className="mt-10 rounded-2xl bg-teal-wash p-5">
          <h2 className="font-editorial text-[22px]">Still stuck?</h2>
          <p className="mt-1 text-[14.5px] text-ink-2">Send us a message and a person will read it.</p>
          <Link
            href="/contact"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep sm:w-auto"
          >
            Contact support
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="mt-4 text-[13px] text-ink-3">In an emergency such as a gas leak, leave and call 112.</p>
        </section>
      </main>
    </div>
  );
}
