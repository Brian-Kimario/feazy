import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SignOutMenu } from '@/components/shared/SignOutMenu';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: 'Admin Console — Feasy',
  description: 'Feasy operations and admin panel',
};

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/');

  const displayName = profile.full_name || user.email?.split('@')[0] || 'Admin';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();


  return (
    <AdminShell
      actions={<SignOutMenu user={user} displayName={displayName} initials={initials} role="admin" />}
    >
      <ToastProvider>{children}</ToastProvider>
    </AdminShell>
  );
}
