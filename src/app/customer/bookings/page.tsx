import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowLeft,
  CalendarPlus,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Home,
  Inbox,
  IndianRupee,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCustomerDashboardExtras, getCustomerShell, type CustomerBooking } from '@/lib/services/shell';
import { formatCurrency } from '@/lib/currency';
import { STATE_META, isJobState } from '@/lib/jobs/states';
import {
  BOOKING_TABS,
  PLATFORM_TIME_ZONE,
  bookingStatusDisplay,
  formatTime,
  isBookingTab,
  type BookingTab,
} from '@/lib/shell/rules';
import { EmptyState, JobProgress, LinkButton, PageContainer, StatusPill } from '@/components/shell/primitives';

export const metadata = {
  title: 'Bookings — Feazy',
};

const searchParamsSchema = z.object({
  tab: z.string().optional(),
  property_id: z.string().uuid().optional(),
});

const TAB_LABEL: Record<BookingTab, string> = {
  active: 'In progress',
  upcoming: 'Upcoming',
  past: 'History',
};

const TAB_EMPTY: Record<BookingTab, { title: string; body: string }> = {
  active: { title: 'Nothing in progress', body: 'Bookings a professional is working on show up here.' },
  upcoming: { title: 'Nothing scheduled', body: 'Bookings with a future time slot show up here.' },
  past: { title: 'No history yet', body: 'Finished and cancelled bookings show up here.' },
};

const money = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0 });

const dayPart = (iso: string, part: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-IN', { ...part, timeZone: PLATFORM_TIME_ZONE }).format(new Date(iso));

const monthKey = (iso: string) => dayPart(iso, { month: 'long', year: 'numeric' });

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/customer/bookings');

  const parsed = searchParamsSchema.safeParse(await searchParams);
  const params = parsed.success ? parsed.data : {};

  const [shell, extras] = await Promise.all([getCustomerShell(user.id), getCustomerDashboardExtras(user.id)]);

  // The property list is already limited to the customer's own properties.
  const property = params.property_id ? extras.properties.find((p) => p.id === params.property_id) ?? null : null;
  const propertyMissing = Boolean(params.property_id) && !property && !extras.error;

  const scoped = property ? shell.bookings.filter((b) => b.propertyId === property.id) : shell.bookings;
  const byTab: Record<BookingTab, CustomerBooking[]> = {
    active: scoped.filter((b) => b.tab === 'active'),
    upcoming: scoped
      .filter((b) => b.tab === 'upcoming')
      .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? '')),
    past: scoped.filter((b) => b.tab === 'past'),
  };
  const needsYou = scoped.filter((b) => b.pendingQuote || b.paymentDue);

  // Without an explicit tab, open the first one that has something in it.
  const tab: BookingTab = isBookingTab(params.tab)
    ? params.tab
    : BOOKING_TABS.find((t) => byTab[t].length > 0) ?? 'active';
  const list = byTab[tab];

  const hrefFor = (t: BookingTab, propertyId: string | null = property?.id ?? null) => {
    const q = new URLSearchParams({ tab: t });
    if (propertyId) q.set('property_id', propertyId);
    return `/customer/bookings?${q.toString()}`;
  };

  // Only properties that have bookings are useful as filters.
  const propertyFilters = extras.properties.filter((p) => shell.bookings.some((b) => b.propertyId === p.id));

  return (
    <PageContainer>
      {property && (
        <Link
          href="/customer/bookings"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-deep"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All bookings
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-3">{property ? 'Property' : 'Your services'}</p>
          <h1 className="mt-1 font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-4xl">
            {property ? property.name : 'Bookings'}
          </h1>
          <p className="mt-2 max-w-xl text-ink-3">
            {property
              ? 'Every service booked for this property.'
              : 'Follow work in progress, see what’s coming up and look back at past jobs.'}
          </p>
        </div>
        {/* Unscoped, this repeats the header's Book button on desktop; scoped, it pre-selects the property. */}
        <LinkButton
          href={property ? `/customer/bookings/new?propertyId=${property.id}` : '/customer/bookings/new'}
          className={property ? '' : 'md:hidden'}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Book a service
        </LinkButton>
      </div>

      {(shell.error || propertyMissing) && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {shell.error
              ? 'We couldn’t load your bookings just now. Refresh the page to try again.'
              : 'That property isn’t on your account. Showing all bookings instead.'}
          </p>
        </div>
      )}

      {needsYou.length > 0 && (
        <section aria-labelledby="needs-you" className="mt-8">
          <h2 id="needs-you" className="text-sm font-semibold text-ink">
            Needs your attention
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {needsYou.map((b) => (
              <li key={b.id}>
                <AttentionCard booking={b} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Booking status">
          <ul className="inline-flex w-full rounded-2xl bg-paper-2 p-1 sm:w-auto">
            {BOOKING_TABS.map((t) => {
              const current = t === tab;
              return (
                <li key={t} className="flex-1 sm:flex-none">
                  <Link
                    href={hrefFor(t)}
                    aria-current={current ? 'page' : undefined}
                    scroll={false}
                    className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold sm:gap-2 sm:px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                      current ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    {TAB_LABEL[t]}
                    <span
                      className={`rounded-full px-1.5 text-xs leading-5 tabular-nums ${
                        current ? 'bg-teal-wash text-teal' : 'text-ink-4'
                      }`}
                    >
                      {byTab[t].length}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {propertyFilters.length > 1 && (
          <nav aria-label="Filter by property">
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
              <li>
                <FilterChip href={hrefFor(tab, null)} active={!property}>
                  All properties
                </FilterChip>
              </li>
              {propertyFilters.map((p) => (
                <li key={p.id}>
                  <FilterChip href={hrefFor(tab, p.id)} active={property?.id === p.id}>
                    <Home className="h-3.5 w-3.5" aria-hidden="true" />
                    {p.name}
                  </FilterChip>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="mt-6">
        {list.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={scoped.length === 0 ? 'No bookings yet' : TAB_EMPTY[tab].title}
            body={
              scoped.length === 0
                ? property
                  ? 'Services you book for this property will appear here.'
                  : 'Book your first service and follow it here from start to finish.'
                : TAB_EMPTY[tab].body
            }
            action={scoped.length === 0 ? { href: '/customer/bookings/new', label: 'Book a service' } : undefined}
          />
        ) : tab === 'active' ? (
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.map((b) => (
              <li key={b.id}>
                <LiveCard booking={b} showProperty={!property} />
              </li>
            ))}
          </ul>
        ) : tab === 'upcoming' ? (
          <ul className="space-y-3">
            {list.map((b) => (
              <li key={b.id}>
                <BookingRow booking={b} showProperty={!property} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-8">
            {groupByMonth(list).map(([month, rows]) => (
              <section key={month} aria-label={month}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-4">{month}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
                  {rows.map((b) => (
                    <li key={b.id}>
                      <BookingRow booking={b} showProperty={!property} flat />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

/** History groups by when the work finished, falling back to the slot, then when it was booked. */
function groupByMonth(rows: CustomerBooking[]): [string, CustomerBooking[]][] {
  const sorted = [...rows].sort((a, b) => historyDate(b).localeCompare(historyDate(a)));
  const groups = new Map<string, CustomerBooking[]>();
  for (const row of sorted) {
    const key = monthKey(historyDate(row));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups);
}

function historyDate(b: CustomerBooking): string {
  return b.job?.completedAt ?? b.scheduledStart ?? b.createdAt;
}

function status(booking: CustomerBooking) {
  return bookingStatusDisplay({
    bookingStatus: booking.bookingStatus,
    jobState: booking.job?.state ?? null,
    unmatchedSince: booking.unmatchedSince,
    startPassed: booking.startPassed,
  });
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
        active ? 'border-teal bg-teal-wash text-teal' : 'border-line bg-paper text-ink-2 hover:border-line-strong'
      }`}
    >
      {children}
    </Link>
  );
}

function AttentionCard({ booking }: { booking: CustomerBooking }) {
  const quote = booking.pendingQuote;
  const Icon = quote ? FileText : IndianRupee;
  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className={`flex items-center gap-4 rounded-2xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
        quote ? 'border-clay/30 bg-clay-soft hover:border-clay/60' : 'border-ochre/30 bg-ochre-soft hover:border-ochre/60'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper ${quote ? 'text-clay' : 'text-ochre'}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{booking.serviceName}</span>
        <span className="block text-sm text-ink-2">
          {quote ? `Quote waiting for your approval · ${money(quote.total)}` : 'Job completed · payment due'}
        </span>
      </span>
      <span className="hidden shrink-0 text-sm font-semibold text-ink sm:inline">{quote ? 'Review' : 'Pay'}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
    </Link>
  );
}

function DateTile({ iso, muted }: { iso: string | null; muted?: boolean }) {
  if (!iso) {
    return (
      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-paper-2 text-xs font-medium text-ink-4">
        No date
      </span>
    );
  }
  return (
    <span
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${
        muted ? 'bg-paper-2 text-ink-3' : 'bg-teal-wash text-teal'
      }`}
    >
      <span className="text-[11px] font-semibold uppercase leading-none tracking-wide">
        {dayPart(iso, { month: 'short' })}
      </span>
      <span className="mt-0.5 font-editorial text-xl font-semibold leading-none">{dayPart(iso, { day: 'numeric' })}</span>
    </span>
  );
}

function Meta({ booking, showProperty }: { booking: CustomerBooking; showProperty: boolean }) {
  const time = booking.scheduledStart
    ? `${dayPart(booking.scheduledStart, { weekday: 'short' })}, ${formatTime(booking.scheduledStart)}`
    : null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3">
      {time && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {time}
        </span>
      )}
      {showProperty && booking.propertyName && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{booking.propertyName}</span>
        </span>
      )}
    </span>
  );
}

function BookingRow({ booking, showProperty, flat }: { booking: CustomerBooking; showProperty: boolean; flat?: boolean }) {
  const s = status(booking);
  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className={`flex items-center gap-4 p-4 transition-colors hover:bg-paper-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal ${
        flat ? '' : 'rounded-2xl border border-line bg-paper hover:border-line-strong'
      }`}
    >
      <DateTile iso={booking.scheduledStart} muted={flat} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-ink-4">
          {booking.reference}
          {booking.categoryName ? ` · ${booking.categoryName}` : ''}
        </span>
        <span className="block truncate font-semibold text-ink">{booking.serviceName}</span>
        <Meta booking={booking} showProperty={showProperty} />
        <span className="mt-2 flex items-center gap-2 sm:hidden">
          <StatusPill tone={s.tone}>{s.label}</StatusPill>
          <RowAmount amount={booking.amount} />
        </span>
      </span>
      <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <StatusPill tone={s.tone}>{s.label}</StatusPill>
        <RowAmount amount={booking.amount} />
      </span>
    </Link>
  );
}

function RowAmount({ amount }: { amount: number | null }) {
  if (amount == null) return null;
  return (
    <span className="text-sm font-semibold tabular-nums text-ink">
      <span className="sr-only">Booking amount </span>
      {money(amount)}
    </span>
  );
}

function LiveCard({ booking, showProperty }: { booking: CustomerBooking; showProperty: boolean }) {
  const state = booking.job?.state ?? null;
  const s = status(booking);
  const copy = state && isJobState(state) ? STATE_META[state].customerCopy : null;

  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className="flex h-full flex-col rounded-3xl border border-line bg-paper p-5 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal md:p-6"
    >
      <span className="flex items-start gap-4">
        <DateTile iso={booking.scheduledStart} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-ink-4">
            {booking.reference}
            {booking.categoryName ? ` · ${booking.categoryName}` : ''}
          </span>
          <span className="block truncate text-lg font-semibold text-ink">{booking.serviceName}</span>
          <Meta booking={booking} showProperty={showProperty} />
        </span>
      </span>

      <span className="mt-4 flex items-center gap-2">
        <StatusPill tone={s.tone}>{s.label}</StatusPill>
        {booking.pendingQuote && <StatusPill tone="clay">Quote · {money(booking.pendingQuote.total)}</StatusPill>}
        {booking.paymentDue && <StatusPill tone="ochre">Payment due</StatusPill>}
      </span>
      {copy && <span className="mt-3 block text-sm text-ink-2">{copy}</span>}
      {state && (
        <span className="mt-5 block">
          <JobProgress state={state} />
        </span>
      )}

      <span className="mt-auto flex items-center justify-between border-t border-line pt-4 text-sm">
        <span className="font-semibold tabular-nums text-ink">
          {booking.amount != null ? (
            <>
              <span className="sr-only">Booking amount </span>
              {money(booking.amount)}
            </>
          ) : (
            <span className="font-normal text-ink-3">Price set by quote</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-teal">
          Open booking
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
