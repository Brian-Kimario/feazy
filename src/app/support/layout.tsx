import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOutAction } from '@/app/auth/signout-action';

export const metadata: Metadata = {
  title: 'Support console | Feazy',
  robots: { index: false, follow: false },
};

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/support');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'support') redirect('/');

  async function signOut() {
    'use server';
    await signOutAction();
  }

  return (
    <div className="min-h-screen bg-porcelain text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">Feazy support</p>
            <p className="mt-1 text-sm font-semibold">{profile.full_name || user.email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-xl border border-line px-4 text-xs font-semibold text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
