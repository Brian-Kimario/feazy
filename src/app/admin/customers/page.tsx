import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAllCustomers } from '@/lib/services/admin-reads';
import CustomersTable from '@/components/admin/CustomersTable';

export const metadata = {
  title: 'Customers Directory — Feasy Admin',
};

export const revalidate = 60;

export default async function AdminCustomersPage() {
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

  // ── Fetch Customers ─────────────────────────────────────────────────────────
  const { data: customers, error } = await getAllCustomers();

  return (
    <div className="px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-[0.11em] text-[#7C8681] mb-2">
          ADMIN · CUSTOMERS
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-2">
          Customer Directory
        </h1>
        <p className="text-[#5A6661]">
          View and search all registered homeowner and client accounts across the platform.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 bg-[#F3E1DA] border border-[#DFC0B7] rounded-xl px-4 py-3 text-sm text-[#A9523D]">
          <strong>Failed to load customers:</strong> {error}
        </div>
      )}

      {/* Customers Table Client Component */}
      <CustomersTable initialCustomers={customers} />
    </div>
  );
}
