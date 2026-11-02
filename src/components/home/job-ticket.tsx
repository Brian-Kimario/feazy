'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import { SERVICES } from '@/lib/marketing-links';

const STEPS = ['Requested', 'Quoted', 'On the way', 'Completed'] as const;
const TICK_MS = 1700;
const TICKS_PER_JOB = 7;

interface Sample {
  ref: string;
  title: string;
  where: string;
  pro: string;
  trade: string;
  lines: ReadonlyArray<readonly [string, number]>;
  note: string;
}

const SAMPLES: Record<(typeof SERVICES)[number]['slug'], Sample> = {
  plumbing: {
    ref: 'FS-2041',
    title: 'Kitchen tap dripping under the sink',
    where: 'Flat 4B, Indiranagar',
    pro: 'Ravi K.',
    trade: 'Plumber',
    lines: [['Cartridge replacement', 450], ['Labour', 350]],
    note: 'Seal checked, no leak after 20 min run.',
  },
  electrical: {
    ref: 'FS-2057',
    title: 'Bedroom socket sparks when plugged in',
    where: 'House 12, Koramangala',
    pro: 'Imran S.',
    trade: 'Electrician',
    lines: [['Socket and wiring check', 300], ['Replacement socket', 220], ['Labour', 280]],
    note: 'Earthing tested, circuit safe to use.',
  },
  'ac-cooling': {
    ref: 'FS-2063',
    title: 'Split AC running but not cooling',
    where: 'Flat 9A, HSR Layout',
    pro: 'Dinesh P.',
    trade: 'AC technician',
    lines: [['Gas pressure check and top-up', 900], ['Coil cleaning', 500]],
    note: 'Cooling restored, 8°C drop in 15 min.',
  },
  appliances: {
    ref: 'FS-2078',
    title: 'Washing machine stops mid-cycle',
    where: 'Flat 2C, Whitefield',
    pro: 'Salma B.',
    trade: 'Appliance repair',
    lines: [['Drain pump replacement', 1100], ['Labour', 400]],
    note: 'Full wash cycle completed on test.',
  },
};

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * A worked example of a Feazy job, cycling through the four trades. It replaces
 * the old photo slideshow: instead of stock imagery it shows the product itself.
 * Autoplay pauses on hover/focus, can be paused by hand, and never starts under
 * prefers-reduced-motion.
 */
export function JobTicket() {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const [hovering, setHovering] = useState(false);

  const running = !paused && !hovering && !reduced;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  const jobIndex = Math.floor(tick / TICKS_PER_JOB) % SERVICES.length;
  const step = reduced ? STEPS.length - 1 : Math.min((tick % TICKS_PER_JOB) + 0, STEPS.length - 1);
  const service = SERVICES[jobIndex];
  const sample = SAMPLES[service.slug];
  const total = sample.lines.reduce((sum, [, amount]) => sum + amount, 0);
  const showQuote = step >= 1;
  const done = step === STEPS.length - 1;

  const select = (i: number) => {
    setTick(i * TICKS_PER_JOB);
    setPaused(true);
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[440px]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
    >
      <div className="relative">
      {/* Cards peeking out behind, to read as a stack of jobs */}
      <div aria-hidden="true" className="absolute inset-x-5 top-3 h-full rounded-[18px] border border-line bg-paper-2 rotate-[2.4deg]" />
      <div aria-hidden="true" className="absolute inset-x-2.5 top-1.5 h-full rounded-[18px] border border-line bg-sand/60 -rotate-[1.4deg]" />

      <article
        aria-label={`Sample job: ${sample.title}`}
        className="relative rounded-[18px] border border-line-strong bg-paper shadow-[0_30px_60px_-28px_rgba(24,33,31,0.35)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-dashed border-line-strong px-5 pb-3.5 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-ink px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-porcelain">
              {sample.ref}
            </span>
            <span className="text-[12px] text-ink-3">Sample job</span>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-500 ${
              done ? 'bg-success-soft text-success' : 'bg-ochre-soft text-ochre'
            }`}
          >
            {STEPS[step]}
          </span>
        </header>

        <div className="px-5 pb-5 pt-4" aria-live="off">
          <h3 key={sample.ref} className="font-editorial text-[22px] leading-[1.15] tracking-[-0.01em] text-ink motion-safe:animate-[ticketIn_500ms_ease-out]">
            {sample.title}
          </h3>
          <p className="mt-1 text-[13px] text-ink-3">{sample.where}</p>

          {/* Progress rail */}
          <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Job progress">
            {STEPS.map((label, i) => {
              const reached = i <= step;
              return (
                <li key={label} className="min-w-0">
                  <div className={`h-1.5 rounded-full transition-colors duration-500 ${reached ? 'bg-teal' : 'bg-line'}`} />
                  <span className={`mt-1.5 block truncate text-[10.5px] font-medium ${reached ? 'text-ink' : 'text-ink-4'}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Professional */}
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-porcelain px-3.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal text-[13px] font-bold text-paper">
              {sample.pro[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-ink">{sample.pro}</p>
              <p className="truncate text-[12px] text-ink-3">{sample.trade}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-teal/25 bg-teal-wash px-2 py-1 text-[11px] font-semibold text-teal-deep">
              <Check size={12} strokeWidth={3} aria-hidden="true" /> Verified
            </span>
          </div>

          {/* Quote */}
          <div className={`mt-4 transition-all duration-500 ${showQuote ? 'opacity-100' : 'opacity-35'}`}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">Itemised quote</p>
            <ul className="mt-2 divide-y divide-line/70 text-[13px]">
              {sample.lines.map(([label, amount]) => (
                <li key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="text-ink-2">{label}</span>
                  <span className="tabular-nums text-ink">{showQuote ? rupee(amount) : '—'}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex items-baseline justify-between border-t border-ink/80 pt-2.5">
              <span className="text-[13px] font-semibold text-ink">Total</span>
              <span className="font-editorial text-[22px] tabular-nums text-ink">{showQuote ? rupee(total) : '—'}</span>
            </div>
          </div>

          <div
            className={`mt-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-[12.5px] transition-colors duration-500 ${
              done ? 'bg-teal text-paper' : 'bg-porcelain text-ink-3'
            }`}
          >
            {done ? (
              <>
                <Check size={15} strokeWidth={3} aria-hidden="true" />
                <span>
                  Paid by UPI. {sample.note} Saved to the property record.
                </span>
              </>
            ) : (
              <span>You approve the quote and pay by UPI only when the work is done.</span>
            )}
          </div>
        </div>
      </article>
      </div>

      {/* Trade selector + pause */}
      <div className="relative mt-7 flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Sample jobs" className="flex flex-wrap gap-1.5">
          {SERVICES.map((s, i) => (
            <button
              key={s.slug}
              role="tab"
              type="button"
              aria-selected={i === jobIndex}
              onClick={() => select(i)}
              className={`min-h-9 cursor-pointer rounded-full border px-3 text-[12px] font-medium transition-colors ${
                i === jobIndex
                  ? 'border-ink bg-ink text-porcelain'
                  : 'border-line-strong bg-paper/70 text-ink-2 hover:border-ink-3'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play sample jobs' : 'Pause sample jobs'}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-paper/70 text-ink-2 hover:border-ink-3"
          >
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}
