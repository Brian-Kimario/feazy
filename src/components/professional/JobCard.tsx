import Link from 'next/link';
import type { Job } from '@/app/professional/types';

interface JobCardProps {
  job: Job;
}

const STATE_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  on_the_way: 'On the Way',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  quote_pending: 'Quote Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

const STATE_STYLES: Record<string, string> = {
  assigned: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]',
  accepted: 'bg-[#E2EEE9] text-[#176B5B] border-[#B8D5CB]',
  on_the_way: 'bg-[#E2EEE9] text-[#176B5B] border-[#B8D5CB]',
  arrived: 'bg-[#E2EEE9] text-[#176B5B] border-[#B8D5CB]',
  in_progress: 'bg-[#FFF4E0] text-[#9B6700] border-[#E8D5A3]',
  quote_pending: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]',
  completed: 'bg-[#E3F0E8] text-[#2F7D5B] border-[#C7DCCF]',
  cancelled: 'bg-[#F5E6E6] text-[#9B3535] border-[#DFC0C0]',
  closed: 'bg-[#F1EEE5] text-[#7C8681] border-[#D9DED8]',
};

const LIVE_STATES = new Set(['on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending']);

function formatScheduledDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * JobCard — Professional job list item
 * Shows service name, customer, property, status badge, and scheduled time.
 * Clicking the card navigates to /professional/jobs/[id].
 */
export function JobCard({ job }: JobCardProps) {
  const stateLabel = STATE_LABELS[job.current_state] ?? job.current_state;
  const stateStyle = STATE_STYLES[job.current_state] ?? STATE_STYLES['assigned'];
  const isLive = LIVE_STATES.has(job.current_state);

  const serviceName =
    (job.booking as { service?: { name?: string } })?.service?.name ?? 'Service';
  const categoryName =
    (job.booking as { service?: { category?: { name?: string } } })?.service?.category?.name ?? '';
  const customerName = job.customer?.full_name ?? 'Customer';
  const propertyName = job.property?.name ?? '';
  const city = (job.property as { address?: { city?: string } })?.address?.city ?? '';
  const scheduledStart = (job.booking as { scheduled_start?: string })?.scheduled_start;

  return (
    <Link href={`/professional/jobs/${job.id}`} className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176B5B] rounded-xl">
      <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 md:p-6 hover:border-[#176B5B] hover:shadow-sm transition-all duration-150 group-focus-visible:border-[#176B5B]">
        {/* Top row: service name + state badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base md:text-lg font-bold text-[#18211F] leading-snug truncate group-hover:text-[#176B5B] transition-colors">
              {serviceName}
            </h3>
            {categoryName && (
              <p className="text-xs text-[#7C8681] mt-0.5">{categoryName}</p>
            )}
          </div>
          <span
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${stateStyle}`}
          >
            {isLive && (
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
            )}
            {stateLabel}
          </span>
        </div>

        {/* Details row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-[#5A6661]">
          {/* Customer */}
          <div className="flex items-center gap-1.5 min-w-0">
            <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#7C8681]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="truncate">{customerName}</span>
          </div>

          {/* Property / Location */}
          {(propertyName || city) && (
            <div className="flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#7C8681]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">{propertyName || city}</span>
            </div>
          )}

          {/* Scheduled time */}
          {scheduledStart && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#7C8681]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-xs text-[#7C8681]">{formatScheduledDate(scheduledStart)}</span>
            </div>
          )}
        </div>

        {/* Footer: View arrow */}
        <div className="mt-4 flex items-center justify-end">
          <span className="text-xs font-semibold text-[#176B5B] flex items-center gap-1 group-hover:gap-2 transition-all">
            View job
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
