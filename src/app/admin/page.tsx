import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  getAdminMetrics,
  getAttentionQueue,
} from '@/lib/services/admin';
import { getUnverifiedProfessionals as getVerifQueue } from '@/lib/services/verification';
import { SkeletonDashboard } from '@/components/ui/SkeletonDashboard';

export const metadata = {
  title: 'Admin Console — Feasy',
};

// Revalidate every 60s — this is an operations dashboard, not realtime
export const revalidate = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function priorityBadge(priority: 'high' | 'medium' | 'low') {
  const map = {
    high: { label: 'High', cls: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]' },
    medium: { label: 'Medium', cls: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]' },
    low: { label: 'Low', cls: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]' },
  };
  const { label, cls } = map[priority];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${cls}`}>
      {label}
    </span>
  );
}

function verifStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]' },
    documents_submitted: { label: 'Ready', cls: 'bg-[#C7DCCF] text-[#2F7D5B] border-[#C7DCCF]' },
    under_review: { label: 'Review', cls: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]' },
    rejected: { label: 'Rejected', cls: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-[#D9DED8] text-[#5A6661] border-[#C5CBC4]' };
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (d < 1) return 'just now';
  if (d < 24) return `${d}h ago`;
  return `${Math.floor(d / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  return (
    <Suspense fallback={<SkeletonDashboard variant="admin" className="p-6 md:p-8" />}>
      <AdminPageContent />
    </Suspense>
  );
}

async function AdminPageContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || (profile as any).role !== 'admin') redirect('/');

  // Parallel data fetch
  const [metricsResult, attentionResult, verifQueueResult] = await Promise.all([
    getAdminMetrics(),
    getAttentionQueue(),
    getVerifQueue(),
  ]);

  const metrics = metricsResult.data;
  const attentionItems = attentionResult.data;
  const verifQueue = verifQueueResult.data.slice(0, 5); // show top 5 in sidebar

  // Detect empty state
  const isEmpty = attentionItems.length === 0 && verifQueue.length === 0;

  return (
    <div className="px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-2">
          OPERATIONS
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-2">
          What needs a decision?
        </h1>
        <p className="text-[#5A6661] max-w-2xl">
          Review unresolved jobs, verification work, and system signals without turning operations
          into a generic analytics dashboard.
        </p>
      </div>

      {/* ── Metrics strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-[#18211F]">
            {metrics?.openJobs ?? '—'}
          </div>
          <div className="text-xs md:text-sm text-[#5A6661] mt-1">Open jobs</div>
          {metrics && (
            <div className="text-xs text-[#7C8681] mt-2 font-semibold">
              {metrics.jobsAddedToday} added today
            </div>
          )}
        </div>

        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-[#18211F]">
            {metrics?.pendingVerifications ?? '—'}
          </div>
          <div className="text-xs md:text-sm text-[#5A6661] mt-1">Awaiting approval</div>
          {metrics && metrics.pendingVerifications > 0 && (
            <div className="text-xs text-[#9B6A1E] mt-2 font-semibold">
              <Link href="/admin/professionals" className="hover:underline">
                Review →
              </Link>
            </div>
          )}
        </div>

        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-[#18211F]">
            {metrics?.revenueFormatted ?? '—'}
          </div>
          <div className="text-xs md:text-sm text-[#5A6661] mt-1">Payments received</div>
          {metrics && (
            <div className="text-xs text-[#176B5B] mt-2 font-semibold">
              {metrics.paidPaymentsCount} paid {metrics.paidPaymentsCount === 1 ? 'payment' : 'payments'}
            </div>
          )}
        </div>

        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-[#18211F]">
            {metrics?.openNoShowReports ?? '—'}
          </div>
          <div className="text-xs md:text-sm text-[#5A6661] mt-1">Open no-show reports</div>
        </div>
      </div>

      {/* ── Main two-column grid ──────────────────────────────────────── */}
      {isEmpty ? (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#E2EEE9] flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-[#176B5B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#18211F] mb-1">No unresolved items</h2>
          <p className="text-sm text-[#5A6661] max-w-sm mx-auto">
            Operations are currently clear. All pending verifications and escalations are resolved.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-24 md:mb-0">
        {/* Left: Attention Queue */}
        <div className="lg:col-span-2">
          <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden">
            <div className="px-5 md:px-6 py-4 md:py-5 border-b border-[#D9DED8] flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-1">
                  NEEDS ATTENTION
                </div>
                <h2 className="text-lg md:text-xl font-bold text-[#18211F]">
                  Resolve the next meaningful issue.
                </h2>
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mt-1 flex-shrink-0">
                {attentionItems.length} ITEM{attentionItems.length !== 1 ? 'S' : ''}
              </span>
            </div>

            {attentionItems.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="text-3xl mb-2">✓</div>
                <p className="font-bold text-[#18211F]">All clear</p>
                <p className="text-sm text-[#7C8681]">No items need attention right now.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#D9DED8]">
                {attentionItems.map((item) => (
                  <div key={item.id} className="px-5 md:px-6 py-4 hover:bg-[#F1EEE5] transition">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[#18211F] text-sm md:text-base">
                          {item.label}
                        </div>
                        <div className="text-xs text-[#5A6661] mt-1">{item.sub}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {priorityBadge(item.priority)}
                        <Link
                          href={item.link}
                          className="px-3 py-1.5 border border-[#D9DED8] rounded-lg text-xs font-semibold text-[#5A6661] hover:bg-[#F1EEE5] hover:text-[#0D5144] transition"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer quick links */}
            <div className="px-5 md:px-6 py-3 border-t border-[#D9DED8] bg-[#F7F4EC]">
              <Link
                href="/admin/jobs"
                className="text-xs font-bold text-[#0D5144] hover:underline"
              >
                View all jobs →
              </Link>
            </div>
          </div>
        </div>

        {/* Right: Verification panel + System health */}
        <div className="space-y-6 order-last md:order-none">
          {/* Verification panel (appears first on mobile, second on desktop via order) */}
          <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden md:order-first order-1">
            <div className="px-5 md:px-6 py-4 md:py-5 border-b border-[#D9DED8] flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-1">
                  VERIFICATION
                </div>
                <h2 className="text-base md:text-lg font-bold text-[#18211F]">Professional files</h2>
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mt-1 flex-shrink-0">
                {verifQueue.length} PENDING
              </span>
            </div>

            {verifQueue.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-[#7C8681]">
                No pending verifications.
              </div>
            ) : (
              <div className="divide-y divide-[#D9DED8]">
                {verifQueue.map((pro) => {
                  const name = pro.full_name || pro.display_name;
                  const hasAllDocs = pro.documents.length >= 2;
                  return (
                    <div
                      key={pro.user_id}
                      className={`px-5 md:px-6 py-3 md:py-4 hover:bg-[#F1EEE5] transition ${
                        hasAllDocs ? 'bg-[#E2EEE9] hover:bg-[#D2E8DF]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[#18211F] text-sm truncate">{name}</div>
                          <div className="text-xs text-[#5A6661] mt-0.5">
                            {pro.documents.length} doc{pro.documents.length !== 1 ? 's' : ''} ·{' '}
                            {timeAgo(pro.submitted_at)}
                          </div>
                        </div>
                        {verifStatusBadge(pro.verification_status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-5 py-3 border-t border-[#D9DED8] bg-[#F7F4EC]">
              <Link
                href="/admin/professionals"
                className="text-xs font-bold text-[#0D5144] hover:underline"
              >
                Open verification queue →
              </Link>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
