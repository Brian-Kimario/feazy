import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAllJobs } from '@/lib/services/admin-reads';
import AdminJobsClient from '@/components/admin/JobsTable';

export const metadata = {
  title: 'All Jobs — Feasy Admin',
};

export const revalidate = 60;

interface AdminJobsPageProps {
  searchParams: Promise<{ id?: string; status?: string }>;
}

export default async function AdminJobsPage({ searchParams }: AdminJobsPageProps) {
  const params = await searchParams;
  const selectedJobId = params?.id || null;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/');

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: jobs, total, error } = await getAllJobs({ limit: 100 });

  return (
    <div className="px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-2">
          ADMIN · JOBS
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-2">All Jobs</h1>
        <p className="text-[#5A6661]">
          Filter, search, inspect, and take action on any job across the platform.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 bg-[#F3E1DA] border border-[#DFC0B7] rounded-xl px-4 py-3 text-sm text-[#A9523D]">
          <strong>Failed to load jobs:</strong> {error}
        </div>
      )}

      {/* Jobs client component with filtering, inspection and actions */}
      <AdminJobsClient initialJobs={jobs} total={total} initialSelectedId={selectedJobId} />
    </div>
  );
}
