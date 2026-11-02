import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCustomerShell } from '@/lib/services/shell';
import { getNotificationFeed } from '@/lib/services/notifications';
import { getUnreadMessageCount } from '@/lib/services/messages';
import { stateLabel } from '@/lib/jobs/states';
import { initialsOf } from '@/lib/shell/rules';
import { RoleShell } from '@/components/shell/RoleShell';
import { UserMenu } from '@/components/shell/UserMenu';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { ActiveJobChip, ActiveJobStrip, type ActiveJob } from '@/components/shell/ActiveJobChip';
import { LinkButton } from '@/components/shell/primitives';
import type { NavItem } from '@/components/shell/nav';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Dashboard — Feazy',
  description: 'Book repairs, track professionals and manage your properties',
};

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
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
  if (!profile || profile.role !== 'customer') redirect('/');

  const [shell, feed, unreadMessages] = await Promise.all([
    getCustomerShell(user.id),
    getNotificationFeed(),
    getUnreadMessageCount(),
  ]);
  const displayName = profile.full_name?.trim() || user.email?.split('@')[0] || 'Customer';

  const activeCount = shell.bookings.filter((b) => b.tab === 'active').length;

  const messagesItem: NavItem = {
    href: '/customer/messages',
    label: 'Messages',
    icon: 'messages',
    count: unreadMessages ?? 0,
    countLabel: 'unread',
  };

  const topItems: NavItem[] = [
    { href: '/customer', label: 'Home', icon: 'home', exact: true },
    { href: '/customer/bookings', label: 'Bookings', icon: 'bookings', count: activeCount, countLabel: 'active' },
    { href: '/customer/properties', label: 'Properties', icon: 'properties' },
    messagesItem,
  ];
  // Two items either side keep the Book button centred. Account lives in the header's user menu.
  const bottomItems: NavItem[] = [
    { href: '/customer', label: 'Home', icon: 'home', exact: true },
    { href: '/customer/bookings', label: 'Bookings', icon: 'bookings', count: activeCount, countLabel: 'active' },
    { href: '/customer/bookings/new', label: 'Book a service', icon: 'book', primary: true },
    { href: '/customer/properties', label: 'Properties', icon: 'properties' },
    messagesItem,
  ];

  const first = shell.activeJobs[0];
  const activeJob: ActiveJob | null = first?.job
    ? {
        href: `/customer/bookings/${first.id}`,
        title: first.serviceName,
        status: stateLabel(first.job.state),
        more: shell.activeJobs.length - 1,
      }
    : null;

  return (
    <RoleShell
      homeHref="/customer"
      navLabel="Customer navigation"
      topItems={topItems}
      bottomItems={bottomItems}
      strip={activeJob && <ActiveJobStrip job={activeJob} />}
      actions={
        <>
          {activeJob && <ActiveJobChip job={activeJob} />}
          {/* The mobile tab bar has its own Book button. */}
          <div className="hidden md:block">
            <LinkButton href="/customer/bookings/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Book a service
            </LinkButton>
          </div>
          <NotificationBell items={feed.items} unread={feed.unread} failed={feed.failed} />
          <UserMenu
            displayName={displayName}
            email={user.email ?? null}
            initials={initialsOf(displayName)}
            roleLabel="Customer"
            links={[
              { label: 'Profile', href: '/customer/profile' },
              { label: 'Settings', href: '/customer/settings' },
              { label: 'Help & support', href: '/customer/support' },
            ]}
          />
        </>
      }
    >
      {children}
    </RoleShell>
  );
}
