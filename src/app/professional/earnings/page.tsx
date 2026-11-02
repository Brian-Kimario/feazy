import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Hourglass,
  Info,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getProfessionalEarnings, type EarningsBucket, type EarningsJob } from '@/lib/services/earnings';
import { formatCurrency } from '@/lib/currency';
import { STATE_META } from '@/lib/jobs/states';
import { PLATFORM_TIME_ZONE } from '@/lib/shell/rules';
import { EmptyState, PageContainer, PageHeader, Panel, StatusPill } from '@/components/shell/primitives';

export const metadata = {
  title: 'Earnings — Feazy Professional',
};

const VIEWS = ['all', 'paid', 'awaiting_payment', 'in_hand'] as const;
type View = (typeof VIEWS)[number];

const searchParamsSchema = z.object({ view: z.enum(VIEWS).optional() });

const VIEW_LABEL: Record<View, string> = {
  all: 'All',
  paid: 'Paid',
  awaiting_payment: 'Payment due',
  in_hand: 'In hand',
};

const VIEW_EMPTY: Record<View, string> = {
  all: 'Jobs you accept show up here with their agreed price.',
  paid: 'Jobs the customer has paid for through the app show up here.',
  awaiting_payment: 'Finished jobs waiting for the customer to pay show up here.',
  in_hand: 'Accepted jobs you have not finished yet show up here.',
};

const money = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const shortDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PLATFORM_TIME_ZONE }).format(
        new Date(iso),
      )
    : null;

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?next=/professional/earnings');

  const parsed = searchParamsSchema.safeParse(await searchParams);
  const view: View = (parsed.success && parsed.data.view) || 'all';

  const earnings = await getProfessionalEarnings(user.id);

  if (!earnings) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Earnings" title="Your job value" />
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>We couldn’t load your jobs just now. Refresh the page to try again.</p>
        </div>
      </PageContainer>
    );
  }

  const { paid, awaitingPayment, inHand, months, jobs } = earnings;
  const finished = { value: paid.value + awaitingPayment.value, count: paid.count + awaitingPayment.count };
  const paidShare = finished.value > 0 ? Math.round((paid.value / finished.value) * 100) : 0;
  const counts: Record<View, number> = {
    all: jobs.length,
    paid: paid.count,
    awaiting_payment: awaitingPayment.count,
    in_hand: inHand.count,
  };
  const list = view === 'all' ? jobs : jobs.filter((j) => j.bucket === view);
  const maxMonth = Math.max(...months.map((m) => m.value), 0);
  const thisMonth = months[months.length - 1];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Earnings"
        title="Your job value"
        description="The agreed price of every job you have taken on — the approved quote, or the booking price when there is none. These are job prices, not payouts."
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No jobs yet"
          body="Once you accept a job, its agreed price shows up here and follows it through to payment."
          action={{ href: '/professional/requests', label: 'See open requests' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Finished work hero */}
            <section
              aria-label="Finished work"
              className="relative overflow-hidden rounded-3xl bg-teal-deep p-6 text-paper lg:col-span-3 md:p-8"
            >
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal/40" />
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-teal/25" />
              <div className="relative">
                <p className="text-sm font-medium text-teal-soft">Finished work</p>
                <p className="mt-2 font-editorial text-4xl font-semibold tracking-[-0.02em] tabular-nums md:text-5xl">
                  {money(finished.value)}
                </p>
                <p className="mt-1 text-sm text-teal-soft">
                  {finished.count} {finished.count === 1 ? 'job' : 'jobs'} completed
                </p>

                {finished.value > 0 && (
                  <div className="mt-6">
                    <div
                      className="flex h-2.5 overflow-hidden rounded-full bg-paper/15"
                      role="img"
                      aria-label={`${paidShare}% of finished work has been paid through the app`}
                    >
                      <span className="h-full bg-paper" style={{ width: `${paidShare}%` }} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="flex items-center gap-1.5 text-teal-soft">
                          <span className="h-2 w-2 rounded-full bg-paper" aria-hidden="true" />
                          Paid through the app
                        </dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{money(paid.value)}</dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1.5 text-teal-soft">
                          <span className="h-2 w-2 rounded-full bg-paper/30" aria-hidden="true" />
                          Waiting on customer
                        </dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{money(awaitingPayment.value)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-1">
              <MetricCard
                icon={Hourglass}
                tone="ochre"
                label="Payment due"
                value={money(awaitingPayment.value)}
                hint={
                  awaitingPayment.count > 0
                    ? `${awaitingPayment.count} finished ${awaitingPayment.count === 1 ? 'job' : 'jobs'} waiting for the customer to pay`
                    : 'Nothing waiting on payment'
                }
              />
              <MetricCard
                icon={Briefcase}
                tone="blue"
                label="Work in hand"
                value={money(inHand.value)}
                hint={
                  inHand.count > 0
                    ? `${inHand.count} accepted ${inHand.count === 1 ? 'job' : 'jobs'} not finished yet`
                    : 'No open jobs right now'
                }
              />
            </div>
          </div>

          {/* Monthly chart */}
          <Panel className="mt-4 p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-ink">Finished work by month</h2>
                <p className="mt-0.5 text-sm text-ink-3">Agreed price of jobs completed in each of the last six months.</p>
              </div>
              <p className="text-sm text-ink-3">
                This month <span className="font-semibold tabular-nums text-ink">{money(thisMonth.value)}</span>
              </p>
            </div>

            <ol className="mt-6 grid h-48 grid-cols-6 items-end gap-2 sm:gap-4" aria-label="Finished work by month">
              {months.map((m, i) => {
                const height = maxMonth > 0 ? Math.max((m.value / maxMonth) * 100, m.value > 0 ? 6 : 0) : 0;
                const current = i === months.length - 1;
                return (
                  <li key={m.key} className="flex h-full flex-col items-center justify-end gap-2">
                    <span className="sr-only">
                      {m.label}: {money(m.value)} from {m.count} {m.count === 1 ? 'job' : 'jobs'}
                    </span>
                    <span aria-hidden="true" className="text-[11px] font-medium tabular-nums text-ink-3">
                      {m.value > 0 ? money(m.value) : ''}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`w-full max-w-14 rounded-t-lg ${current ? 'bg-teal' : 'bg-teal-soft'} ${m.value === 0 ? 'h-1 rounded-b-lg bg-paper-2' : ''}`}
                      style={m.value > 0 ? { height: `${height}%` } : undefined}
                    />
                    <span aria-hidden="true" className={`text-xs ${current ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                      {m.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>

          {/* Job ledger */}
          <section aria-labelledby="ledger-heading" className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 id="ledger-heading" className="text-base font-semibold text-ink">
                Jobs
              </h2>
            </div>

            <nav aria-label="Filter jobs" className="mb-4">
              <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {VIEWS.map((v) => {
                  const current = v === view;
                  return (
                    <li key={v}>
                      <Link
                        href={v === 'all' ? '/professional/earnings' : `/professional/earnings?view=${v}`}
                        scroll={false}
                        aria-current={current ? 'page' : undefined}
                        className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                          current ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink-2 hover:border-line-strong'
                        }`}
                      >
                        {VIEW_LABEL[v]}
                        <span
                          className={`rounded-full px-1.5 text-xs leading-5 tabular-nums ${current ? 'bg-paper/20' : 'bg-paper-2 text-ink-3'}`}
                        >
                          {counts[v]}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {list.length === 0 ? (
              <EmptyState compact icon={FileText} title={`No ${VIEW_LABEL[view].toLowerCase()} jobs`} body={VIEW_EMPTY[view]} />
            ) : (
              <Panel className="divide-y divide-line overflow-hidden">
                {list.map((job) => (
                  <LedgerRow key={job.id} job={job} />
                ))}
              </Panel>
            )}
          </section>

          {/* How it works */}
          <Panel className="mt-8 bg-paper-2/60 p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Info className="h-4 w-4 text-ink-3" aria-hidden="true" />
              How these numbers work
            </h2>
            <ul className="mt-3 grid gap-3 text-sm leading-6 text-ink-2 md:grid-cols-3">
              <li>
                <span className="font-semibold text-ink">Agreed price.</span> The latest quote the customer approved, or
                the booking price when you have not sent one. A quote still waiting for approval is not counted.
              </li>
              <li>
                <span className="font-semibold text-ink">Paid vs. payment due.</span> A job moves to paid once the customer
                pays through the app. Until then a finished job shows as payment due.
              </li>
              <li>
                <span className="font-semibold text-ink">Not a payout.</span> Platform fees and payouts are not tracked in
                the app yet, so these figures are job prices only.
              </li>
            </ul>
          </Panel>
        </>
      )}
    </PageContainer>
  );
}

const METRIC_TONE = {
  ochre: 'bg-ochre-soft text-ochre',
  blue: 'bg-blue-soft text-blue',
} as const;

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: keyof typeof METRIC_TONE;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Panel className="flex flex-col p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${METRIC_TONE[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="mt-4">
        <p className="text-sm text-ink-3">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
        <p className="mt-1 text-xs leading-5 text-ink-3">{hint}</p>
      </div>
    </Panel>
  );
}

const BUCKET_PILL: Record<Exclude<EarningsBucket, 'in_hand'>, { label: string; tone: 'success' | 'ochre' }> = {
  paid: { label: 'Paid', tone: 'success' },
  awaiting_payment: { label: 'Payment due', tone: 'ochre' },
};

const BUCKET_ICON: Record<EarningsBucket, { Icon: LucideIcon; box: string }> = {
  paid: { Icon: BadgeCheck, box: 'bg-success-soft text-success' },
  awaiting_payment: { Icon: Hourglass, box: 'bg-ochre-soft text-ochre' },
  in_hand: { Icon: Clock3, box: 'bg-blue-soft text-blue' },
};

function LedgerRow({ job }: { job: EarningsJob }) {
  const pill =
    job.bucket === 'in_hand'
      ? { label: STATE_META[job.state].label, tone: STATE_META[job.state].tone }
      : BUCKET_PILL[job.bucket];
  const { Icon, box } = BUCKET_ICON[job.bucket];
  const date = shortDate(job.date);
  const dateLabel = job.bucket === 'paid' ? 'Paid' : job.bucket === 'awaiting_payment' ? 'Finished' : 'Scheduled';

  return (
    <Link
      href={`/professional/jobs/${job.id}`}
      className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-paper-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:gap-4 md:px-5"
    >
      <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${box}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-semibold text-ink">{job.serviceName}</p>
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-3">
          {[job.categoryName, date ? `${dateLabel} ${date}` : null].filter(Boolean).join(' · ')}
        </p>
        {job.hasPendingQuote && (
          <p className="mt-1 text-xs font-medium text-clay">Revised quote waiting for the customer — not counted yet</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {job.basis === 'unpriced' ? (
          <p className="text-sm font-medium text-ink-3">No price set</p>
        ) : (
          <>
            <p className="font-semibold tabular-nums text-ink">{money(job.amount)}</p>
            <p className="text-xs text-ink-4">{job.basis === 'approved_quote' ? 'Approved quote' : 'Booking price'}</p>
          </>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
    </Link>
  );
}
