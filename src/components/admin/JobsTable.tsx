'use client';

/**
 * AdminJobsClient — interactive jobs table for /admin/jobs
 *
 * Features:
 * - Status filter tabs
 * - Free-text search (booking ref, customer, professional, service)
 * - Per-row Cancel action (admin only, calls adminCancelJob server action)
 * - Pagination (50 per page)
 */

import { useState, useTransition, useMemo } from 'react';
import type { AdminJob } from '@/lib/services/admin';
import { adminCancelJob } from '@/lib/services/admin';
import JobDetailModal from '@/components/admin/JobDetailModal';
import CancelJobDialog from '@/components/admin/CancelJobDialog';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_STATES = [
  'all',
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'quote_pending',
  'completed',
  'cancelled',
];

const STATE_LABELS: Record<string, string> = {
  all: 'All',
  assigned: 'Assigned',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  quote_pending: 'Quote pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATE_BADGE: Record<string, string> = {
  assigned: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]',
  accepted: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  on_the_way: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  arrived: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  in_progress: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
  quote_pending: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
  completed: 'bg-[#C7DCCF] text-[#1C5E41] border-[#C7DCCF]',
  cancelled: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]',
  closed: 'bg-[#D9DED8] text-[#5A6661] border-[#C5CBC4]',
};

function StateBadge({ state }: { state: string }) {
  const cls = STATE_BADGE[state] ?? 'bg-[#D9DED8] text-[#5A6661] border-[#C5CBC4]';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

function formatAmount(amount: number | null, currency = 'INR') {
  if (amount == null) return '—';
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  return `${currency} ${amount.toLocaleString()}`;
}

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface AdminJobsClientProps {
  initialJobs: AdminJob[];
  total: number;
  initialSelectedId?: string | null;
}

export default function AdminJobsClient({ initialJobs, total, initialSelectedId }: AdminJobsClientProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [inspectingJobId, setInspectingJobId] = useState<string | null>(initialSelectedId ?? null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const handleJobUpdated = (updated: { id: string; current_state: string }) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === updated.id ? { ...j, current_state: updated.current_state } : j))
    );
  };

  // Client-side search + filter (data already fetched server-side for current page)
  const filtered = useMemo(() => {
    let result = jobs;
    if (statusFilter !== 'all') {
      result = result.filter((j) => j.current_state === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          (j.booking_reference ?? '').toLowerCase().includes(q) ||
          (j.customer_name ?? '').toLowerCase().includes(q) ||
          (j.professional_name ?? '').toLowerCase().includes(q) ||
          (j.service_name ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [jobs, statusFilter, search]);

  const cancelTarget = jobs.find((j) => j.id === cancellingId) ?? null;

  const handleCancel = (jobId: string) => {
    setErrorMap((p) => { const n = { ...p }; delete n[jobId]; return n; });
    setCancellingId(jobId);
  };

  const confirmCancel = (category: string, reason: string) => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    startTransition(async () => {
      const result = await adminCancelJob(target.id, target.current_state, reason, category);
      if (result.success) {
        setJobs((prev) =>
          prev.map((j) => (j.id === target.id ? { ...j, current_state: 'cancelled' } : j)),
        );
        setCancellingId(null);
      } else {
        setErrorMap((p) => ({ ...p, [target.id]: result.error ?? 'Failed' }));
      }
    });
  };

  const activeCount = (s: string) =>
    s === 'all'
      ? jobs.length
      : jobs.filter((j) => j.current_state === s).length;

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <svg
            viewBox="0 0 24 24"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C8681]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, customer, professional…"
            className="w-full pl-9 pr-4 py-2 border border-[#D9DED8] rounded-xl bg-white text-sm text-[#18211F] placeholder-[#9BA5A0] focus:outline-none focus:border-[#5FE3B0] transition"
          />
        </div>

        <span className="text-xs text-[#7C8681] ml-auto">
          {filtered.length} of {total} jobs
        </span>
      </div>

      {/* ── Status filter tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
        {ALL_STATES.map((s) => {
          const cnt = activeCount(s);
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition',
                statusFilter === s
                  ? 'bg-[#18211F] text-white'
                  : 'bg-[#FFFEFA] border border-[#D9DED8] text-[#5A6661] hover:bg-[#F1EEE5]',
              ].join(' ')}
            >
              {STATE_LABELS[s]}
              {cnt > 0 && (
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                    statusFilter === s ? 'bg-white/20 text-white' : 'bg-[#D9DED8] text-[#5A6661]'
                  }`}
                >
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl px-6 py-12 text-center">
          <p className="font-bold text-[#18211F] mb-1">No jobs found</p>
          <p className="text-sm text-[#7C8681]">Try adjusting the status filter or search.</p>
        </div>
      ) : (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D9DED8] bg-[#F7F4EC]">
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Reference
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Service
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Professional
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DED8]">
                {filtered.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => setInspectingJobId(job.id)}
                    className="hover:bg-[#F7F4EC] transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-[#0D5144] font-bold whitespace-nowrap">
                      {job.booking_reference ?? job.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3.5 text-[#18211F] max-w-[140px] truncate font-medium">
                      {job.service_name ?? '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-[#18211F] font-medium truncate max-w-[130px]">
                        {job.customer_name || job.customer_email?.split('@')[0] || '—'}
                      </div>
                      {job.customer_email && (
                        <div className="text-[11px] text-[#7C8681] truncate max-w-[130px]">
                          {job.customer_email}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-[#18211F] font-medium truncate max-w-[130px]">
                        {job.professional_name ?? '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StateBadge state={job.current_state} />
                      {errorMap[job.id] && (
                        <div className="text-[11px] text-[#A9523D] mt-0.5">{errorMap[job.id]}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#18211F] whitespace-nowrap">
                      {formatAmount(job.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#7C8681] whitespace-nowrap">
                      {relativeDate(job.created_at)}
                    </td>
                    <td
                      className="px-5 py-3.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setInspectingJobId(job.id)}
                          className="px-3 py-1.5 border border-[#D9DED8] text-[#18211F] text-xs font-bold rounded-lg hover:bg-white transition"
                        >
                          Inspect
                        </button>
                        {!['completed', 'cancelled', 'closed'].includes(job.current_state) && (
                          <button
                            onClick={() => handleCancel(job.id)}
                            disabled={isPending}
                            className="px-3 py-1.5 border border-[#DFC0B7] text-[#A9523D] text-xs font-bold rounded-lg hover:bg-[#F3E1DA] transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[#D9DED8]">
            {filtered.map((job) => (
              <div
                key={job.id}
                onClick={() => setInspectingJobId(job.id)}
                className="px-4 py-4 cursor-pointer hover:bg-[#F7F4EC] transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-mono text-xs text-[#0D5144] font-bold">
                      {job.booking_reference ?? job.id.slice(0, 8)}
                    </div>
                    <div className="font-bold text-[#18211F] mt-0.5">
                      {job.service_name ?? '—'}
                    </div>
                  </div>
                  <StateBadge state={job.current_state} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#5A6661]">
                  <div>
                    <span className="text-[#7C8681]">Customer: </span>
                    {job.customer_name || job.customer_email?.split('@')[0] || '—'}
                  </div>
                  <div>
                    <span className="text-[#7C8681]">Pro: </span>
                    {job.professional_name ?? '—'}
                  </div>
                  <div>
                    <span className="text-[#7C8681]">Amount: </span>
                    {formatAmount(job.amount)}
                  </div>
                  <div>
                    <span className="text-[#7C8681]">Date: </span>
                    {relativeDate(job.created_at)}
                  </div>
                </div>
                {errorMap[job.id] && (
                  <p className="text-xs text-[#A9523D] mt-2">{errorMap[job.id]}</p>
                )}
                <div
                  className="mt-3 flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setInspectingJobId(job.id)}
                    className="flex-1 py-1.5 border border-[#D9DED8] text-[#18211F] text-xs font-bold rounded-lg hover:bg-white transition"
                  >
                    Inspect Details
                  </button>
                  {!['completed', 'cancelled', 'closed'].includes(job.current_state) && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      disabled={isPending}
                      className="py-1.5 px-3 border border-[#DFC0B7] text-[#A9523D] text-xs font-bold rounded-lg hover:bg-[#F3E1DA] transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cancelTarget && (
        <CancelJobDialog
          key={cancelTarget.id}
          reference={cancelTarget.booking_reference ?? null}
          state={cancelTarget.current_state}
          hasProfessional={!!cancelTarget.professional_name}
          pending={isPending}
          error={errorMap[cancelTarget.id] ?? null}
          onConfirm={confirmCancel}
          onClose={() => setCancellingId(null)}
        />
      )}

      {/* Full Job Details Inspector Modal */}
      <JobDetailModal
        jobId={inspectingJobId}
        isOpen={!!inspectingJobId}
        onClose={() => setInspectingJobId(null)}
        onJobUpdated={handleJobUpdated}
      />
    </div>
  );
}
