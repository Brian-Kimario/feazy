import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Cpu,
  Drill,
  Hammer,
  Home,
  Lightbulb,
  MapPin,
  Paintbrush,
  ShieldCheck,
  Sparkles,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getCustomerDashboardExtras,
  getCustomerShell,
  getQuoteForReview,
  type CustomerBooking,
  type DashboardCategory,
  type DashboardProperty,
} from '@/lib/services/shell';
import { getGreeting } from '@/lib/greeting';
import { formatCurrency } from '@/lib/currency';
import { STATE_META, isJobState } from '@/lib/jobs/states';
import { bookingStatusDisplay, formatLongDate, formatSlot, propertyTypeLabel } from '@/lib/shell/rules';
import {
  EmptyState,
  JobProgress,
  LinkButton,
  PageContainer,
  PageHeader,
  Panel,
  Section,
  StatusPill,
} from '@/components/shell/primitives';
import { QuoteDrawer } from '@/components/customer/QuoteDrawer';
import { toPanelQuote } from '@/lib/quotes/panel';

export const metadata = {
  title: 'Home — Feazy',
  description: 'Your bookings, quotes and payments in one place.',
};

const searchParamsSchema = z.object({ quote: z.string().uuid().optional() });

/** Lucide icons for `service_categories.icon_key`. Unknown keys fall back to a wrench. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  wrench: Wrench,
  wind: Wind,
  cpu: Cpu,
  paintbrush: Paintbrush,
  hammer: Hammer,
  sparkles: Sparkles,
  home: Home,
  drill: Drill,
  bike: Bike,
};

const money = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0 });

export default async function CustomerHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const parsedParams = searchParamsSchema.safeParse(await searchParams);
  const quoteId = parsedParams.success ? parsedParams.data.quote : undefined;
  const quoteParamInvalid = !parsedParams.success;

  const [shell, extras, profileResult, quote] = await Promise.all([
    getCustomerShell(user.id),
    getCustomerDashboardExtras(user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    quoteId ? getQuoteForReview(user.id, quoteId) : Promise.resolve(null),
  ]);

  const now = new Date();
  const firstName = profileResult.data?.full_name?.trim().split(/\s+/)[0] || null;

  const activeIds = new Set(shell.activeJobs.map((b) => b.id));
  const inProgress = shell.activeJobs;
  // Active-tab bookings without a running job (for example, the slot time has passed but no pro accepted yet).
  const otherActive = shell.bookings.filter((b) => b.tab === 'active' && !activeIds.has(b.id));
  const upcoming = shell.bookings
    .filter((b) => b.tab === 'upcoming')
    .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
  const recentPast = shell.bookings.filter((b) => b.tab === 'past').slice(0, 3);
  const hasBookings = shell.bookings.length > 0;

  const quoteNotice: string | null = quoteParamInvalid
    ? 'That quote link is not valid.'
    : quoteId && !quote
      ? 'We could not find that quote. It may belong to another account.'
      : quote && !quote.awaitingCustomer
        ? 'This quote has already been answered or is no longer open.'
        : null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={firstName ? `${getGreeting(now)}, ${firstName}` : getGreeting(now)}
        description={summaryLine(shell.inbox.length, inProgress.length, upcoming.length, hasBookings)}
      />

      {shell.error && (
        <Notice tone="danger">We couldn’t load your bookings just now. Refresh the page to try again.</Notice>
      )}
      {quoteNotice && (
        <Notice tone="ochre">
          {quoteNotice}{' '}
          {quote?.bookingId && (
            <Link href={`/customer/bookings/${quote.bookingId}`} className="font-semibold underline underline-offset-2">
              Open the booking
            </Link>
          )}
        </Notice>
      )}

      {!hasBookings && !shell.error ? (
        <FirstBooking categories={extras.categories} hasProperty={extras.properties.length > 0} />
      ) : (
        <div className="space-y-10">
          <Section title="Book a service" description="Choose a service to start a new booking.">
            <CategoryGrid categories={extras.categories} large />
          </Section>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <div className="min-w-0 space-y-10">
            <Section
              title="Active"
              description={otherActive.length > 0 ? 'Work under way, and bookings whose time has passed.' : undefined}
              count={inProgress.length + otherActive.length}
              link={{ href: '/customer/bookings?tab=active', label: 'All active' }}
            >
              {inProgress.length + otherActive.length === 0 ? (
                <EmptyState
                  compact
                  icon={Wrench}
                  title="No work in progress"
                  body="When a professional accepts one of your bookings, you can follow it here step by step."
                />
              ) : (
                <ul className="space-y-3">
                  {inProgress.map((b) => (
                    <li key={b.id}>
                      <ActiveJobCard booking={b} />
                    </li>
                  ))}
                  {otherActive.map((b) => (
                    <li key={b.id}>
                      <BookingRow booking={b} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Upcoming"
              count={upcoming.length}
              link={upcoming.length > 0 ? { href: '/customer/bookings?tab=upcoming', label: 'See all' } : undefined}
            >
              {upcoming.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarClock}
                  title="Nothing scheduled"
                  body="Book a service and pick a time that suits you."
                  action={{ href: '/customer/bookings/new', label: 'Book a service' }}
                />
              ) : (
                <Panel className="divide-y divide-line">
                  {upcoming.slice(0, 4).map((b) => (
                    <UpcomingRow key={b.id} booking={b} />
                  ))}
                </Panel>
              )}
            </Section>

            {recentPast.length > 0 && (
              <Section title="Recently finished" link={{ href: '/customer/bookings?tab=past', label: 'History' }}>
                <Panel className="divide-y divide-line">
                  {recentPast.map((b) => (
                    <UpcomingRow key={b.id} booking={b} past />
                  ))}
                </Panel>
              </Section>
            )}
          </div>

          <aside className="min-w-0 space-y-10" aria-label="Shortcuts">
            <Section
              title="Your properties"
              count={extras.properties.length}
              link={{ href: '/customer/properties', label: 'Manage' }}
            >
              <PropertyList properties={extras.properties} />
            </Section>
          </aside>
          </div>
        </div>
      )}

      {quote && quote.awaitingCustomer && <QuoteDrawer quote={toPanelQuote(quote)} />}
    </PageContainer>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function summaryLine(waiting: number, live: number, upcoming: number, hasBookings: boolean): string {
  if (!hasBookings) return 'Book trusted, verified professionals for repairs around your home.';
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? 'thing needs' : 'things need'} your attention`);
  if (live > 0) parts.push(`${live} ${live === 1 ? 'job' : 'jobs'} in progress`);
  if (upcoming > 0) parts.push(`${upcoming} upcoming`);
  return parts.length > 0 ? `${parts.join(' · ')}.` : 'You’re all caught up.';
}

function Notice({ tone, children }: { tone: 'danger' | 'ochre'; children: ReactNode }) {
  const box = tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-ochre/30 bg-ochre-soft text-ink-2';
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${box}`}>
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function ActiveJobCard({ booking }: { booking: CustomerBooking }) {
  const state = booking.job?.state ?? null;
  const status = bookingStatusDisplay({ bookingStatus: booking.bookingStatus, jobState: state, unmatchedSince: booking.unmatchedSince, startPassed: booking.startPassed });
  const copy = state && isJobState(state) ? STATE_META[state].customerCopy : null;
  const slot = formatSlot(booking.scheduledStart);

  return (
    <Panel className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-4">
            {booking.reference}
            {booking.categoryName ? ` · ${booking.categoryName}` : ''}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-ink">{booking.serviceName}</h3>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>

      {copy && <p className="mt-2 text-sm text-ink-2">{copy}</p>}

      <div className="mt-4">{state && <JobProgress state={state} />}</div>

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
          {slot && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Scheduled</dt>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              <dd>{slot}</dd>
            </div>
          )}
          {booking.propertyName && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Property</dt>
              <Home className="h-4 w-4" aria-hidden="true" />
              <dd>{booking.propertyName}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {booking.pendingQuote && (
            <LinkButton href={`/customer?quote=${booking.pendingQuote.id}`} variant="secondary">
              Review quote · {money(booking.pendingQuote.total)}
            </LinkButton>
          )}
          <LinkButton href={`/customer/bookings/${booking.id}`} variant={booking.pendingQuote ? 'quiet' : 'secondary'}>
            Track job
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}

function BookingRow({ booking }: { booking: CustomerBooking }) {
  const status = bookingStatusDisplay({ bookingStatus: booking.bookingStatus, jobState: booking.job?.state ?? null, unmatchedSince: booking.unmatchedSince, startPassed: booking.startPassed });
  const slot = formatSlot(booking.scheduledStart);
  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-4 transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{booking.serviceName}</p>
        <p className="mt-0.5 truncate text-sm text-ink-3">
          {[booking.reference, slot, booking.propertyName].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </Link>
  );
}

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' });
const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });

function UpcomingRow({ booking, past = false }: { booking: CustomerBooking; past?: boolean }) {
  const status = bookingStatusDisplay({ bookingStatus: booking.bookingStatus, jobState: booking.job?.state ?? null, unmatchedSince: booking.unmatchedSince, startPassed: booking.startPassed });
  const date = booking.scheduledStart ? new Date(booking.scheduledStart) : null;
  const slot = formatSlot(booking.scheduledStart);
  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className="flex items-center gap-4 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
    >
      <span
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
          past ? 'bg-paper-2 text-ink-3' : 'bg-teal-wash text-teal-deep'
        }`}
        aria-hidden="true"
      >
        {date ? (
          <>
            <span className="text-base font-bold leading-none">{dayFormat.format(date)}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{monthFormat.format(date)}</span>
          </>
        ) : (
          <CalendarClock className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{booking.serviceName}</p>
        <p className="mt-0.5 truncate text-sm text-ink-3">
          {[slot ?? 'Time not set', booking.propertyName].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </Link>
  );
}

function CategoryGrid({ categories, large = false }: { categories: DashboardCategory[]; large?: boolean }) {
  if (categories.length === 0) {
    return (
      <EmptyState
        compact
        icon={Wrench}
        title="Services are unavailable"
        body="We couldn’t load the service list. You can still start a booking."
        action={{ href: '/customer/bookings/new', label: 'Start a booking' }}
      />
    );
  }
  return (
    <ul className={`grid gap-2 ${large ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
      {categories.map((c) => {
        const Icon = CATEGORY_ICONS[c.iconKey ?? ''] ?? Wrench;
        return (
          <li key={c.id}>
            <Link
              href={`/customer/bookings/new?category=${c.id}`}
              className="flex h-full min-h-11 items-center gap-2.5 rounded-xl border border-line bg-paper px-3 py-3 text-sm font-medium text-ink transition-colors hover:border-teal/40 hover:bg-teal-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-deep">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-5">{c.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PropertyList({ properties }: { properties: DashboardProperty[] }) {
  if (properties.length === 0) {
    return (
      <EmptyState
        compact
        icon={Home}
        title="No properties yet"
        body="Save your home once and pick it in seconds when you book."
        action={{ href: '/customer/properties', label: 'Add a property' }}
      />
    );
  }
  return (
    <Panel className="divide-y divide-line">
      {properties.slice(0, 3).map((p) => (
        <Link
          key={p.id}
          href="/customer/properties"
          className="flex items-center gap-3 p-3.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-2 text-ink-3">
            <Home className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-ink-3">
              {propertyTypeLabel(p.propertyType)}
              {(p.area || p.city) && (
                <>
                  <MapPin className="ml-1 h-3 w-3 shrink-0" aria-hidden="true" />
                  {[p.area, p.city].filter(Boolean).join(', ')}
                </>
              )}
            </p>
          </div>
        </Link>
      ))}
    </Panel>
  );
}

const FIRST_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Wrench, title: 'Pick a service', body: 'Choose what needs fixing and describe the problem.' },
  { icon: CalendarClock, title: 'Choose a time and place', body: 'Select a slot and the property the work is for.' },
  {
    icon: ShieldCheck,
    title: 'A verified professional takes it',
    body: 'Follow the job here, approve any extra work and pay when it’s done.',
  },
];

function FirstBooking({ categories, hasProperty }: { categories: DashboardCategory[]; hasProperty: boolean }) {
  return (
    <div className="space-y-10">
      <Panel className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="bg-teal-wash p-6 md:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal text-paper">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-editorial text-2xl font-semibold tracking-[-0.02em] text-ink">
              Your first booking takes a few minutes
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              Tell us what’s wrong, pick a time, and we’ll handle the rest.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <LinkButton href="/customer/bookings/new">Book a service</LinkButton>
              {!hasProperty && (
                <LinkButton href="/customer/properties" variant="secondary">
                  Add a property
                </LinkButton>
              )}
            </div>
          </div>
          <ol className="divide-y divide-line">
            {FIRST_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 p-5 md:px-8">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink-2">
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    <step.icon className="h-4 w-4 text-teal" aria-hidden="true" />
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-ink-3">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Panel>

      <Section title="What do you need help with?">
        <CategoryGrid categories={categories} large />
      </Section>
    </div>
  );
}
