import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarClock,
  CircleAlert,
  Inbox,
  Lock,
  Radio,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getProfessionalCompletedCount,
  getProfessionalCompletedSince,
  getProfessionalShell,
  type ProJob,
} from '@/lib/services/shell';
import { formatCurrency } from '@/lib/currency';
import { getGreeting } from '@/lib/greeting';
import { STATE_META, isJobState } from '@/lib/jobs/states';
import {
  PLATFORM_TIME_ZONE,
  formatLongDate,
  formatSlot,
  formatTime,
  isLiveState,
  isTodayIST,
  propertyTypeLabel,
  startOfWeekIST,
  verificationNotice,
  type VerificationNotice,
} from '@/lib/shell/rules';
import { AvailabilitySwitch } from '@/components/shell/AvailabilitySwitch';
import {
  EmptyState,
  JobProgress,
  LinkButton,
  PageContainer,
  PageHeader,
  Section,
  StatTile,
  StatusPill,
} from '@/components/shell/primitives';
import { RequestCard } from '@/components/professional/RequestCard';

export const metadata = { title: 'Today — Feazy' };

const money = (amount: number) => formatCurrency(amount, { minimumFractionDigits: 0 });

function valueHint(unpriced: number) {
  const base = 'Approved quote, or booking amount, for each job completed. Gross value, not your payout.';
  if (unpriced === 0) return base;
  return `${base} ${unpriced} ${unpriced === 1 ? 'job has' : 'jobs have'} no amount recorded and ${unpriced === 1 ? 'isn’t' : 'aren’t'} counted.`;
}

const dayLabel = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: PLATFORM_TIME_ZONE,
});

export default async function ProfessionalToday() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const now = new Date();
  const weekStart = startOfWeekIST(now);

  const [shell, week, completedCount] = await Promise.all([
    getProfessionalShell(user.id),
    getProfessionalCompletedSince(user.id, weekStart),
    getProfessionalCompletedCount(user.id),
  ]);

  const notice = verificationNotice(shell.verificationStatus, shell.rejectionReason);
  const firstName = shell.displayName?.trim().split(/\s+/)[0] || null;

  const nextJob = shell.liveJob ?? shell.upcoming[0] ?? null;
  const today = shell.upcoming.filter((j) => isTodayIST(j.scheduledStart, now));
  const later = shell.upcoming.filter((j) => j.id !== nextJob?.id && !isTodayIST(j.scheduledStart, now)).slice(0, 3);
  const requests = notice ? [] : shell.requests;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={firstName ? `${getGreeting(now)}, ${firstName}` : getGreeting(now)}
        description={summaryLine(requests.length, today.length, notice !== null)}
      />

      {shell.error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>We couldn’t load all of your jobs just now. Refresh the page to try again.</p>
        </div>
      )}

      <StatusStrip online={shell.isAvailable} notice={notice} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <Section title={nextJob && isLiveState(nextJob.state) ? 'Live now' : 'Next job'}>
            {nextJob ? (
              <NextJobCard job={nextJob} now={now} />
            ) : (
              <EmptyState
                compact
                icon={BriefcaseBusiness}
                title="No jobs lined up"
                body={
                  notice
                    ? 'Once you’re verified, jobs you accept will show up here.'
                    : 'Jobs you accept will show up here, soonest first.'
                }
              />
            )}
          </Section>

          <Section
            title="Requests"
            count={requests.length}
            description={requests.length > 0 ? 'Answer before the timer runs out.' : undefined}
            link={requests.length > 3 ? { href: '/professional/requests', label: 'All requests' } : undefined}
          >
            {notice ? (
              <EmptyState compact icon={Lock} title="Requests are locked" body={`${notice.title}. Requests open once you’re verified.`} />
            ) : requests.length === 0 ? (
              <EmptyState
                compact
                icon={Inbox}
                title="No requests right now"
                body={
                  shell.isAvailable
                    ? 'New offers that match your skills and working hours will appear here.'
                    : 'You’re offline. Go online to start receiving offers.'
                }
              />
            ) : (
              <ul className="space-y-3">
                {requests.slice(0, 3).map((job) => (
                  <li key={job.id}>
                    <RequestCard job={job} serverNow={now.getTime()} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Today’s schedule"
            count={today.length}
            link={{ href: '/professional/jobs', label: 'All jobs' }}
          >
            {today.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="Nothing scheduled today" body="Accepted jobs booked for today appear here in time order." />
            ) : (
              <ol className="relative space-y-2">
                {today.map((job) => (
                  <li key={job.id}>
                    <ScheduleRow job={job} isNext={job.id === nextJob?.id} />
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {later.length > 0 && (
            <Section title="Coming up" description="Accepted jobs after today.">
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
                {later.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/professional/jobs/${job.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-paper-2/60 focus-visible:bg-paper-2 focus-visible:outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{job.serviceName}</span>
                        <span className="block text-xs text-ink-3">{formatSlot(job.scheduledStart) ?? 'Time not set'}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-8" aria-label="Your numbers">
          <Section title="This week" description={`Since ${dayLabel.format(weekStart)}`}>
            {week.error ? (
              <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-3">
                We couldn’t load this week’s numbers.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <StatTile label="Jobs completed" value={String(week.completedCount)} />
                <StatTile
                  label="Completed job value"
                  value={week.unpricedCount === week.completedCount && week.completedCount > 0 ? '—' : money(week.jobValue)}
                  hint={valueHint(week.unpricedCount)}
                />
              </div>
            )}
          </Section>

          {completedCount !== null && completedCount > 0 && (
            <Section title="All time">
              <StatTile label="Jobs completed" value={String(completedCount)} />
            </Section>
          )}

          <LinkButton href="/professional/earnings" variant="secondary" className="w-full">
            Open earnings
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </LinkButton>
        </aside>
      </div>
    </PageContainer>
  );
}

function summaryLine(requests: number, today: number, locked: boolean): string {
  if (locked) return 'Your profile needs to be verified before you can take jobs.';
  const parts: string[] = [];
  if (requests > 0) parts.push(`${requests} ${requests === 1 ? 'request' : 'requests'} waiting`);
  parts.push(today === 0 ? 'nothing scheduled today' : `${today} ${today === 1 ? 'job' : 'jobs'} today`);
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

function StatusStrip({ online, notice }: { online: boolean; notice: VerificationNotice | null }) {
  const title = notice ? 'You can’t go online yet' : online ? 'You’re online' : 'You’re offline';
  const body = notice
    ? 'Going online unlocks after verification. The banner above explains where things stand.'
    : online
      ? 'New requests that match your skills and working hours can reach you.'
      : 'You won’t receive new requests. Jobs you’ve already accepted are not affected.';

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between md:p-5 ${
        online && !notice ? 'border-success/25 bg-success-soft/60' : 'border-line bg-paper'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            online && !notice ? 'bg-success text-paper' : 'bg-paper-2 text-ink-3'
          }`}
        >
          <Radio className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-sm leading-6 text-ink-3">{body}</p>
        </div>
      </div>
      <div className="shrink-0 self-start sm:self-center">
        <AvailabilitySwitch initial={online} lockedReason={notice?.title ?? null} />
      </div>
    </div>
  );
}

function NextJobCard({ job, now }: { job: ProJob; now: Date }) {
  const meta = isJobState(job.state) ? STATE_META[job.state] : null;
  const live = isLiveState(job.state);
  const time = formatTime(job.scheduledStart);
  const day = job.scheduledStart
    ? isTodayIST(job.scheduledStart, now)
      ? 'Today'
      : dayLabel.format(new Date(job.scheduledStart))
    : null;

  return (
    <article
      aria-label={`${live ? 'Live job' : 'Next job'}: ${job.serviceName}`}
      className={`overflow-hidden rounded-2xl border ${live ? 'border-teal/30 bg-teal-wash' : 'border-line bg-paper'}`}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row md:p-6">
        <div className="flex shrink-0 flex-row items-baseline gap-2 sm:w-28 sm:flex-col sm:gap-0">
          <span className="font-editorial text-3xl font-semibold leading-none tracking-tight text-ink tabular-nums">
            {time ?? '—'}
          </span>
          <span className="text-sm font-medium text-ink-3 sm:mt-1.5">{day ?? 'Time not set'}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-4">
                {job.categoryName ?? 'Service'}
                {job.reference ? ` · ${job.reference}` : ''}
              </p>
              <h3 className="mt-0.5 text-lg font-semibold leading-snug text-ink">{job.serviceName}</h3>
            </div>
            {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
          </div>

          {meta && <p className="mt-1.5 text-sm text-ink-2">{meta.proCopy}</p>}
          {job.propertyType && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-3">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {propertyTypeLabel(job.propertyType)}
            </p>
          )}

          <div className="mt-5">
            <JobProgress state={job.state} />
          </div>

          <div className="mt-5">
            <LinkButton href={`/professional/jobs/${job.id}`}>
              Open job
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </LinkButton>
          </div>
        </div>
      </div>
    </article>
  );
}

function ScheduleRow({ job, isNext }: { job: ProJob; isNext: boolean }) {
  const meta = isJobState(job.state) ? STATE_META[job.state] : null;
  const start = formatTime(job.scheduledStart);
  const end = formatTime(job.scheduledEnd);

  return (
    <Link
      href={`/professional/jobs/${job.id}`}
      className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-4 transition-colors hover:border-line-strong hover:bg-paper-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
    >
      <div className="w-20 shrink-0 text-sm tabular-nums">
        <p className="font-semibold text-ink">{start ?? '—'}</p>
        {end && <p className="text-xs text-ink-4">to {end}</p>}
      </div>
      <span className={`h-10 w-1 shrink-0 rounded-full ${isNext ? 'bg-teal' : 'bg-line'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{job.serviceName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {job.propertyType ? propertyTypeLabel(job.propertyType) : (job.categoryName ?? 'Service')}
          {isNext && <span className="font-semibold text-teal-deep">· Next</span>}
        </p>
      </div>
      {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
    </Link>
  );
}
