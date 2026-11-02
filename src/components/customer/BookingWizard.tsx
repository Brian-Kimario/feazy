'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  Clock,
  FileCheck2,
  Hammer,
  Home,
  IndianRupee,
  Lightbulb,
  Loader2,
  Paintbrush,
  Plug,
  ScanSearch,
  Sparkles,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createBookingAction } from '@/app/customer/bookings/new/actions';
import { SuccessState } from '@/components/ui/SuccessState';
import { formatCurrency } from '@/lib/currency';
import { propertyTypeLabel } from '@/lib/shell/rules';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_key: string | null;
}

export interface WizardOptionValue {
  id: string;
  label: string;
  value: string;
  price_modifier: number | null;
  sort_order: number;
}

export interface WizardOption {
  id: string;
  name: string;
  option_type: string;
  is_required: boolean;
  sort_order: number;
  values: WizardOptionValue[];
}

export interface WizardMaterial {
  id: string;
  name: string;
  brand: string | null;
  specification: string | null;
  unit: string;
  /** Guide price set by an admin; null means the price is confirmed in the quotation. */
  indicativePrice: number | null;
  priceUnit: string | null;
}

export interface WizardService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricing_model: 'fixed' | 'inspection' | 'quote_after_inspection';
  base_price: number | null;
  inspection_fee: number | null;
  estimated_duration_minutes: number | null;
  options: WizardOption[];
  materials?: WizardMaterial[];
}

export interface WizardProperty {
  id: string;
  name: string;
  property_type: string;
  address: { address_line_1: string; city: string } | null;
}

interface BookingWizardProps {
  categories: WizardCategory[];
  servicesByCategory: Record<string, WizardService[]>;
  properties: WizardProperty[];
  /** Pre-select a service (from ?service= query param) */
  preselectedServiceId?: string;
  preselectedCategoryId?: string;
  preselectedPropertyId?: string;
  initialProblemNotes?: string;
}

// ── Pricing ───────────────────────────────────────────────────────────────────
// Mirrors create_booking: the booked amount is base_price (fixed), inspection_fee (inspection)
// or nothing (quote_after_inspection). Option price modifiers are not charged, so they are not
// shown. On site the professional can send a quote with a reason while the job is in progress;
// the customer approves or declines it, and payment uses the newest approved quote, else the
// booked amount.

const MATERIALS_MAX = 200;

/** Customer material requests travel with the problem text; they never affect price or the quote. */
function composeSummary(problem: string, materials: string): string | undefined {
  const m = materials.trim();
  const suffix = m ? `Materials requested: ${m}` : '';
  const p = problem.trim().slice(0, 1000 - (suffix ? suffix.length + 2 : 0));
  return [p, suffix].filter(Boolean).join('\n\n') || undefined;
}

interface PriceInfo {
  /** The amount create_booking will store, or null when it stores none. */
  amount: number | null;
  /** Short label next to the amount. */
  label: string;
  /** What the amount covers and how it can change. */
  explainer: string;
}

function priceInfo(service: WizardService): PriceInfo {
  if (service.pricing_model === 'fixed') {
    return {
      amount: service.base_price,
      label: 'Booked price',
      explainer:
        'This is the price for the job as described. If the professional finds more work than booked, they send a revised price with a reason, and it only applies if you approve it.',
    };
  }
  if (service.pricing_model === 'inspection') {
    return {
      amount: service.inspection_fee,
      label: 'Visit & diagnosis',
      explainer:
        'This covers the visit and diagnosis. If a repair is needed, the professional sends a quote for it with a reason, and it only applies if you approve it.',
    };
  }
  return {
    amount: null,
    label: 'Priced after inspection',
    explainer:
      'No price is set when you book. The professional inspects the job and sends a quote with a breakdown. Nothing is charged unless you approve a quote.',
  };
}

const money = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0 });

function formatDuration(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `About ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `About ${h} h ${m} min` : `About ${h} h`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** A datetime-local value in the browser's own time zone (toISOString would give UTC). */
function toLocalInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatChosenSlot(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Look ──────────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  wrench: Wrench,
  wind: Wind,
  cpu: Plug,
  paintbrush: Paintbrush,
  hammer: Hammer,
  sparkles: Sparkles,
};

const STEPS = ['Service', 'Details', 'When & where', 'Review'] as const;

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-paper px-5 text-sm font-semibold text-ink hover:bg-paper-2 disabled:opacity-50';
const inputClass =
  'block min-h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[15px] text-ink placeholder:text-ink-4 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25 aria-[invalid=true]:border-danger';
const choiceCard =
  'rounded-2xl border bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal';
const choiceOn = 'border-teal bg-teal-wash ring-1 ring-teal';
const choiceOff = 'border-line hover:border-line-strong';

function StepBar({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Booking steps">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label}>
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!done}
              aria-current={active ? 'step' : undefined}
              className="group w-full text-left disabled:cursor-default"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${done || active ? 'bg-teal' : 'bg-paper-2'}`}
                aria-hidden="true"
              />
              <span
                className={`mt-2 flex items-center gap-1 text-xs font-semibold ${
                  active ? 'text-ink' : done ? 'text-teal group-hover:text-teal-deep' : 'text-ink-4'
                }`}
              >
                {done && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {label === 'When & where' ? (
                  <>
                    {/* The full label doesn't fit a quarter of a phone screen. */}
                    <span className="truncate sm:hidden" aria-hidden="true">When</span>
                    <span className="sr-only sm:not-sr-only sm:truncate">{label}</span>
                  </>
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BookingWizard({
  categories,
  servicesByCategory,
  properties,
  preselectedServiceId,
  preselectedCategoryId,
  preselectedPropertyId,
  initialProblemNotes,
}: BookingWizardProps) {
  const router = useRouter();

  const initialService = (() => {
    if (!preselectedServiceId) return null;
    for (const svcs of Object.values(servicesByCategory)) {
      const found = svcs.find((s) => s.id === preselectedServiceId);
      if (found) return found;
    }
    return null;
  })();

  const [step, setStep] = useState<number>(initialService ? 1 : 0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    preselectedCategoryId ?? categories[0]?.id ?? ''
  );
  const [selectedService, setSelectedService] = useState<WizardService | null>(initialService);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [problemSummary, setProblemSummary] = useState<string>(initialProblemNotes ?? '');
  const [materialsNote, setMaterialsNote] = useState<string>('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [scheduledStart, setScheduledStart] = useState<string>('');
  const [minStart, setMinStart] = useState<string | undefined>(undefined);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    if (preselectedPropertyId && properties.some((p) => p.id === preselectedPropertyId)) {
      return preselectedPropertyId;
    }
    return properties.length === 1 ? properties[0].id : '';
  });
  const [stepError, setStepError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{ bookingId: string; matched: boolean } | null>(null);

  const currentCategory = categories.find((c) => c.id === selectedCategoryId);
  const servicesForCategory = selectedCategoryId ? (servicesByCategory[selectedCategoryId] ?? []) : [];
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const serviceCategory = selectedService
    ? categories.find((c) => (servicesByCategory[c.id] ?? []).some((s) => s.id === selectedService.id))
    : undefined;
  const missingOptions = (selectedService?.options ?? []).filter((o) => o.is_required && !selectedOptions[o.id]);
  const price = selectedService ? priceInfo(selectedService) : null;
  const materialChoices = selectedService?.materials ?? [];
  const chosenMaterials = materialChoices.filter((m) => materialIds.includes(m.id));

  function go(next: number) {
    setStepError(null);
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseService(svc: WizardService) {
    if (selectedService?.id !== svc.id) {
      setSelectedOptions({});
      setMaterialIds([]);
    }
    setSelectedService(svc);
  }

  function continueFromDetails() {
    if (missingOptions.length > 0) {
      setStepError(`Choose ${missingOptions.map((o) => o.name.toLowerCase()).join(', ')} to continue.`);
      return;
    }
    go(2);
  }

  function continueFromWhen() {
    const start = new Date(scheduledStart);
    if (!scheduledStart || Number.isNaN(start.getTime())) {
      setStepError('Pick a date and time for the visit.');
      return;
    }
    if (start <= new Date()) {
      setStepError('That time has already passed. Pick a time in the future.');
      return;
    }
    if (!selectedPropertyId) {
      setStepError('Choose which property the visit is for.');
      return;
    }
    go(3);
  }

  function submit() {
    if (!selectedService || !selectedPropertyId || !scheduledStart) return;
    setError(null);
    startTransition(async () => {
      const result = await createBookingAction({
        serviceId: selectedService.id,
        propertyId: selectedPropertyId,
        scheduledStart: new Date(scheduledStart).toISOString(),
        selectedOptions,
        problemSummary: composeSummary(problemSummary, materialsNote),
        materialIds: materialIds.length > 0 ? materialIds : undefined,
      });
      if (result.success === false) {
        setError(result.error);
        return;
      }
      setSuccess({ bookingId: result.data.bookingId, matched: result.data.matched });
    });
  }

  if (success) {
    return (
      <div className="rounded-3xl border border-line bg-paper p-6 md:p-10">
        <SuccessState
          title={success.matched ? 'Booking sent to a professional' : 'Booking received'}
          description={
            success.matched
              ? 'We’ve offered your job to a matching professional. If they can’t take it, it moves to the next one automatically.'
              : 'We’re finding a professional for your time slot. We’ll keep trying, and your booking page shows the latest status.'
          }
          action={{ label: 'View booking', onClick: () => router.push(`/customer/bookings/${success.bookingId}`) }}
          secondaryAction={{ label: 'Done', onClick: () => router.push('/customer/bookings') }}
        />
      </div>
    );
  }

  // ── Step 0: Service ─────────────────────────────────────────────────────────
  const serviceStep = (
    <div>
      <StepHeading title="What do you need?" body="Pick a category, then the service closest to your problem." />

      <div role="tablist" aria-label="Categories" className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon_key ?? ''] ?? Wrench;
          const on = cat.id === selectedCategoryId;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                on ? 'border-teal bg-teal text-paper' : 'border-line bg-paper text-ink-2 hover:border-line-strong'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {cat.name}
            </button>
          );
        })}
      </div>

      {currentCategory?.description && <p className="mt-4 text-sm text-ink-3">{currentCategory.description}</p>}

      {servicesForCategory.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-paper-2 p-5 text-sm text-ink-3">No services are available in this category right now.</p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {servicesForCategory.map((svc) => {
            const on = selectedService?.id === svc.id;
            const info = priceInfo(svc);
            const duration = formatDuration(svc.estimated_duration_minutes);
            return (
              <li key={svc.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseService(svc)}
                  className={`flex h-full w-full flex-col p-4 text-left ${choiceCard} ${on ? choiceOn : choiceOff}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">{svc.name}</span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        on ? 'border-teal bg-teal text-paper' : 'border-line-strong'
                      }`}
                      aria-hidden="true"
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                  </span>
                  {svc.description && <span className="mt-1 line-clamp-2 text-sm text-ink-3">{svc.description}</span>}
                  <span className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-4">
                    <span>
                      <span className="block text-xs text-ink-4">{info.label}</span>
                      <span className="block font-editorial text-lg font-semibold leading-tight text-ink">
                        {info.amount != null ? money(info.amount) : 'Quote on site'}
                      </span>
                    </span>
                    {duration && (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {duration}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <StepActions>
        <span />
        <button type="button" className={primaryButton} disabled={!selectedService} onClick={() => go(1)}>
          Continue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </StepActions>
    </div>
  );

  // ── Step 1: Details ─────────────────────────────────────────────────────────
  const detailsStep = selectedService && (
    <div>
      <StepHeading
        title="Tell us about the job"
        body="The professional reads this before accepting, so a clear description helps them come prepared."
      />

      {selectedService.options.length > 0 && (
        <div className="mt-6 space-y-5">
          {selectedService.options.map((opt) => (
            <fieldset key={opt.id}>
              <legend className="text-sm font-medium text-ink-2">
                {opt.name}
                {opt.is_required ? (
                  <span className="ml-1 text-danger" aria-hidden="true">
                    *
                  </span>
                ) : (
                  <span className="ml-1 font-normal text-ink-4">(optional)</span>
                )}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {opt.values.map((ov) => {
                  const on = selectedOptions[opt.id] === ov.value;
                  return (
                    <button
                      key={ov.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSelectedOptions((prev) => ({ ...prev, [opt.id]: ov.value }));
                        setStepError(null);
                      }}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
                        on ? 'border-teal bg-teal-wash text-teal' : 'border-line bg-paper text-ink-2 hover:border-line-strong'
                      }`}
                    >
                      {on && <Check className="h-4 w-4" aria-hidden="true" />}
                      {ov.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="problem_summary" className="text-sm font-medium text-ink-2">
            Describe the problem <span className="font-normal text-ink-4">(optional)</span>
          </label>
          <span className="text-xs tabular-nums text-ink-4">{problemSummary.length}/1000</span>
        </div>
        <textarea
          id="problem_summary"
          value={problemSummary}
          onChange={(e) => setProblemSummary(e.target.value)}
          rows={5}
          maxLength={1000}
          aria-describedby="problem_summary_hint"
          placeholder="What’s happening, since when, and anything you’ve already tried. E.g. Kitchen tap drips constantly, worse when the hot water is on."
          className={`${inputClass} mt-1.5 min-h-32 resize-y py-2.5`}
        />
        <p id="problem_summary_hint" className="mt-1 text-xs text-ink-4">
          Don’t include gate codes or access details here. The professional sees your address only after accepting.
        </p>
      </div>

      {materialChoices.length > 0 && (
        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-ink-2">
            Materials and brands you prefer <span className="font-normal text-ink-4">(optional)</span>
          </legend>
          <p className="mt-1 text-xs text-ink-4">
            Prices are a guide only. Our inspector confirms what the job needs, and the final price is in the quotation
            you approve. Nothing is charged for choosing here.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {materialChoices.map((m) => {
              const on = materialIds.includes(m.id);
              const atLimit = !on && materialIds.length >= 10;
              return (
                <label
                  key={m.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                    on ? 'border-teal bg-teal-soft' : 'border-line-strong bg-paper'
                  } ${atLimit ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={atLimit}
                    onChange={() =>
                      setMaterialIds((ids) => (on ? ids.filter((id) => id !== m.id) : [...ids, m.id]))
                    }
                    className="mt-0.5 h-4 w-4 accent-teal"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">
                      {m.brand ? `${m.brand} ` : ''}
                      {m.name}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {m.indicativePrice != null
                        ? `About ${money(m.indicativePrice)} per ${m.priceUnit ?? m.unit}`
                        : 'Price confirmed in your quotation'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="materials_note" className="text-sm font-medium text-ink-2">
            Other parts or brands <span className="font-normal text-ink-4">(optional)</span>
          </label>
          <span className="text-xs tabular-nums text-ink-4">{materialsNote.length}/{MATERIALS_MAX}</span>
        </div>
        <textarea
          id="materials_note"
          value={materialsNote}
          onChange={(e) => setMaterialsNote(e.target.value)}
          rows={2}
          maxLength={MATERIALS_MAX}
          aria-describedby="materials_note_hint"
          placeholder="E.g. a specific tap brand, or parts you already have."
          className={`${inputClass} mt-1.5 resize-y py-2.5`}
        />
        <p id="materials_note_hint" className="mt-1 text-xs text-ink-4">
          Shared with the professional as a request. Materials and their prices are confirmed in the itemised quotation, which you approve before any work starts.
        </p>
      </div>

      {stepError && <InlineError message={stepError} />}

      <StepActions>
        <button type="button" className={secondaryButton} onClick={() => go(0)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <button type="button" className={primaryButton} onClick={continueFromDetails}>
          Continue
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </StepActions>
    </div>
  );

  // ── Step 2: When & where ────────────────────────────────────────────────────
  const whenStep = (
    <div>
      <StepHeading title="When and where?" body="Choose a time that suits you. A professional is matched to that slot." />

      <div className="mt-6">
        <label htmlFor="scheduled_start" className="text-sm font-medium text-ink-2">
          Date and time
        </label>
        <div className="relative mt-1.5">
          <CalendarClock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4"
            aria-hidden="true"
          />
          <input
            id="scheduled_start"
            type="datetime-local"
            min={minStart}
            // Set on focus rather than during render so server and client markup match.
            onFocus={() => setMinStart(toLocalInput(new Date()))}
            value={scheduledStart}
            onChange={(e) => {
              setScheduledStart(e.target.value);
              setStepError(null);
            }}
            className={`${inputClass} pl-10`}
          />
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-ink-2">Property</legend>
        {properties.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-ochre/30 bg-ochre-soft p-4 text-sm text-ochre">
            You haven’t added a property yet.{' '}
            <Link href="/customer/properties" className="font-semibold underline underline-offset-2">
              Add a property
            </Link>{' '}
            to book a visit.
          </div>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {properties.map((prop) => {
              const on = selectedPropertyId === prop.id;
              return (
                <li key={prop.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSelectedPropertyId(prop.id);
                      setStepError(null);
                    }}
                    className={`flex h-full w-full items-start gap-3 p-4 text-left ${choiceCard} ${on ? choiceOn : choiceOff}`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        on ? 'bg-paper text-teal' : 'bg-paper-2 text-ink-3'
                      }`}
                    >
                      <Home className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{prop.name}</span>
                      {prop.address && (
                        <span className="block truncate text-sm text-ink-3">
                          {prop.address.address_line_1}, {prop.address.city}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-ink-4">{propertyTypeLabel(prop.property_type)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {stepError && <InlineError message={stepError} />}

      <StepActions>
        <button type="button" className={secondaryButton} onClick={() => go(1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <button type="button" className={primaryButton} onClick={continueFromWhen} disabled={properties.length === 0}>
          Review
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </StepActions>
    </div>
  );

  // ── Step 3: Review ──────────────────────────────────────────────────────────
  const chosenOptions = (selectedService?.options ?? [])
    .map((opt) => ({ name: opt.name, value: opt.values.find((v) => v.value === selectedOptions[opt.id])?.label }))
    .filter((o): o is { name: string; value: string } => Boolean(o.value));

  const reviewStep = selectedService && price && (
    <div>
      <StepHeading title="Review and book" body="Check the details. You can go back to change anything." />

      <dl className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <ReviewRow label="Service" onEdit={() => go(0)}>
          <span className="font-semibold text-ink">{selectedService.name}</span>
          {serviceCategory && <span className="block text-sm text-ink-3">{serviceCategory.name}</span>}
        </ReviewRow>
        {(chosenOptions.length > 0 || problemSummary.trim() || materialsNote.trim() || chosenMaterials.length > 0) && (
          <ReviewRow label="Details" onEdit={() => go(1)}>
            {chosenOptions.map((o) => (
              <span key={o.name} className="block text-sm text-ink-2">
                {o.name}: <span className="font-medium text-ink">{o.value}</span>
              </span>
            ))}
            {problemSummary.trim() && (
              <span className="mt-1 block whitespace-pre-line break-words text-sm text-ink-2">{problemSummary.trim()}</span>
            )}
            {chosenMaterials.length > 0 && (
              <span className="mt-1 block break-words text-sm text-ink-2">
                Preferred materials:{' '}
                <span className="font-medium text-ink">
                  {chosenMaterials.map((m) => `${m.brand ? `${m.brand} ` : ''}${m.name}`).join(', ')}
                </span>
              </span>
            )}
            {materialsNote.trim() && (
              <span className="mt-1 block break-words text-sm text-ink-2">
                Materials requested: <span className="font-medium text-ink">{materialsNote.trim()}</span>
              </span>
            )}
          </ReviewRow>
        )}
        <ReviewRow label="When" onEdit={() => go(2)}>
          <span className="font-semibold text-ink">{formatChosenSlot(scheduledStart) ?? '—'}</span>
        </ReviewRow>
        <ReviewRow label="Where" onEdit={() => go(2)}>
          <span className="font-semibold text-ink">{selectedProperty?.name}</span>
          {selectedProperty?.address && (
            <span className="block text-sm text-ink-3">
              {selectedProperty.address.address_line_1}, {selectedProperty.address.city}
            </span>
          )}
        </ReviewRow>
      </dl>

      <PriceCard service={selectedService} />

      {error && <InlineError message={error} />}

      <p className="mt-6 text-xs text-ink-4">
        By booking you agree to Feazy’s{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink-2">
          terms
        </Link>
        .
      </p>

      <StepActions>
        <button type="button" className={secondaryButton} onClick={() => go(2)} disabled={isPending}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <button type="button" className={primaryButton} onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? 'Booking…' : 'Confirm booking'}
        </button>
      </StepActions>
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="rounded-3xl border border-line bg-paper p-5 md:p-8">
        <StepBar current={step} onJump={(i) => i < step && go(i)} />
        <div className="mt-8">
          {step === 0 && serviceStep}
          {step === 1 && detailsStep}
          {step === 2 && whenStep}
          {step === 3 && reviewStep}
        </div>
      </div>

      <aside aria-label="Booking summary" className="hidden lg:sticky lg:top-24 lg:block">
        <div className="rounded-3xl border border-line bg-paper p-6">
          <h2 className="text-sm font-semibold text-ink">Your booking</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <SummaryItem icon={Wrench} label="Service" value={selectedService?.name} />
            <SummaryItem icon={CalendarClock} label="When" value={formatChosenSlot(scheduledStart)} />
            <SummaryItem icon={Home} label="Where" value={selectedProperty?.name} />
          </dl>
          {price && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-xs text-ink-4">{price.label}</p>
              <p className="font-editorial text-2xl font-semibold text-ink">
                {price.amount != null ? money(price.amount) : 'Quote on site'}
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-3">{price.explainer}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-editorial text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-3">{body}</p>
    </div>
  );
}

function StepActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">{children}</div>;
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 bg-paper px-4 py-3.5">
      <dt className="w-16 shrink-0 pt-0.5 text-xs font-medium text-ink-4">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-sm font-semibold text-teal hover:text-teal-deep"
        aria-label={`Change ${label.toLowerCase()}`}
      >
        Change
      </button>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-ink-4">{label}</dt>
        <dd className={value ? 'font-medium text-ink' : 'text-ink-4'}>{value ?? 'Not chosen yet'}</dd>
      </div>
    </div>
  );
}

/** How the price is set and can change. Every step maps to create_booking, create_quote and payment. */
function PriceCard({ service }: { service: WizardService }) {
  const info = priceInfo(service);
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    info.amount != null
      ? {
          icon: IndianRupee,
          title: `Booked at ${money(info.amount)}`,
          body: service.pricing_model === 'fixed' ? 'The price for the job as described.' : 'Covers the visit and diagnosis.',
        }
      : { icon: IndianRupee, title: 'No price yet', body: 'The professional prices the job after seeing it.' },
    {
      icon: ScanSearch,
      title: 'Checked on site',
      body: 'If the job needs more (or less) than booked, the professional sends a revised quote with a reason and a breakdown.',
    },
    {
      icon: FileCheck2,
      title: 'You decide',
      body: 'Approve or decline the quote from your booking page. Nothing extra is charged unless you approve.',
    },
    {
      icon: Check,
      title: 'Pay when it’s done',
      body:
        info.amount != null
          ? 'After the job is completed you pay by UPI: the approved quote, or the booked price if there was none.'
          : 'After the job is completed you pay the approved quote by UPI.',
    },
  ];

  return (
    <section aria-labelledby="price-title" className="mt-5 rounded-2xl bg-teal-wash p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-teal">{info.label}</p>
          <p id="price-title" className="font-editorial text-3xl font-semibold leading-tight text-ink">
            {info.amount != null ? money(info.amount) : 'Quote on site'}
          </p>
        </div>
        <p className="text-xs text-ink-3">How pricing works</p>
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-teal">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{title}</span>
              <span className="block text-sm text-ink-2">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
