import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveInspector } from '@/lib/services/inspections';
import { initialsOf } from '@/lib/shell/rules';
import { RoleShell } from '@/components/shell/RoleShell';
import { UserMenu } from '@/components/shell/UserMenu';
import type { NavItem } from '@/components/shell/nav';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Inspector — Feazy',
  description: 'Your scheduled inspection visits',
};

export default async function InspectorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect('/auth/login');

  const inspector = await getActiveInspector(user.id);
  if (!inspector) redirect('/professional');

  const items: NavItem[] = [{ href: '/inspector', label: 'Visits', icon: 'today', exact: true }];

  return (
    <RoleShell
      homeHref="/inspector"
      navLabel="Inspector navigation"
      topItems={items}
      bottomItems={items}
      actions={
        <UserMenu
          displayName={inspector.displayName}
          email={user.email ?? null}
          initials={initialsOf(inspector.displayName)}
          roleLabel="Inspector"
          links={[]}
        />
      }
    >
      {children}
    </RoleShell>
  );
}
