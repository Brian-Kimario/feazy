import { getProfessionalJobs } from '@/app/professional/actions';
import { JobsFilterClient } from '@/components/professional/JobsFilterClient';

export const metadata = {
  title: 'My Jobs — Feazy Professional',
};

export default async function JobsPage() {
  let jobs = [];
  let fetchError: string | null = null;

  try {
    jobs = await getProfessionalJobs();
  } catch (err) {
    jobs = [];
    fetchError = err instanceof Error ? err.message : 'Failed to load jobs.';
  }

  return (
    <div className="pb-24 md:pb-12 px-4 md:px-6 pt-6 md:pt-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-1">
            OPERATIONS · WORK ORDERS
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-1">
            My Jobs
          </h1>
          <p className="text-xs md:text-sm text-[#5A6661] max-w-2xl">
            View assigned repair work, filter active and completed jobs, or update field status in real time.
          </p>
        </div>

      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-start gap-3 px-4 py-3 bg-[#F5E6E6] border border-[#DFC0C0] rounded-xl text-sm text-[#9B3535]">
          <svg
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{fetchError}</span>
        </div>
      )}

      {/* Interactive Filter Client */}
      <JobsFilterClient initialJobs={jobs} />
    </div>
  );
}
