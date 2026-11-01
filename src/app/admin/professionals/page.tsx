import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VerificationQueue from '@/components/admin/VerificationQueue';
import { getUnverifiedProfessionals } from '@/lib/services/verification-queue';
import { getAllProfessionals } from '@/lib/services/admin-reads';

export const metadata = {
  title: 'Professional Verification — Feasy Admin',
};

// Revalidate every 60 s so the list stays reasonably fresh without SSE
export const revalidate = 60;

export default async function AdminProfessionalsPage() {
  // ── Auth & role guard ────────────────────────────────────────────────────────
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

  // ── Fetch data in parallel ───────────────────────────────────────────────────
  const [unverifiedRes, allProsRes] = await Promise.all([
    getUnverifiedProfessionals(),
    getAllProfessionals(),
  ]);

  const professionals = unverifiedRes.data;
  const allProfessionals = allProsRes.data;
  const error = unverifiedRes.error || allProsRes.error;

  return (
    <div className="px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-2">
          ADMIN · VERIFICATION
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-2">
          Professional Verification
        </h1>
        <p className="text-[#5A6661] max-w-xl">
          Review submitted documents and approve or reject professionals before they can accept
          jobs on the platform.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-4">
          <div className="text-2xl font-bold text-[#18211F]">{professionals.length}</div>
          <div className="text-xs text-[#5A6661] mt-0.5">Pending review</div>
        </div>
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-4">
          <div className="text-2xl font-bold text-[#18211F]">
            {professionals.filter((p) => p.verification_status === 'documents_submitted').length}
          </div>
          <div className="text-xs text-[#5A6661] mt-0.5">Docs submitted</div>
        </div>
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-4">
          <div className="text-2xl font-bold text-[#18211F]">
            {professionals.filter((p) => p.documents.length > 0).length}
          </div>
          <div className="text-xs text-[#5A6661] mt-0.5">Have documents</div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 bg-[#F3E1DA] border border-[#DFC0B7] rounded-xl px-4 py-3 text-sm text-[#A9523D]">
          <strong>Failed to load queue:</strong> {error}
        </div>
      )}

      {/* Verification Queue & Directory */}
      <VerificationQueue
        professionals={professionals}
        allProfessionals={allProfessionals}
      />
    </div>
  );
}
