import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfessionalShell } from '@/lib/services/shell';
import { getNotificationFeed } from '@/lib/services/notifications';
import { getUnreadMessageCount } from '@/lib/services/messages';
import { stateLabel } from '@/lib/jobs/states';
import { initialsOf, isLiveState, verificationNotice } from '@/lib/shell/rules';
import { RoleShell } from '@/components/shell/RoleShell';
import { UserMenu } from '@/components/shell/UserMenu';
import { NotificationBell } from '@/components/shell/NotificationBell';
import { ActiveJobChip, ActiveJobStrip, type ActiveJob } from '@/components/shell/ActiveJobChip';
import { AvailabilitySwitch } from '@/components/shell/AvailabilitySwitch';
import { VerificationBanner } from '@/components/shell/primitives';
import type { NavItem } from '@/components/shell/nav';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Professional Dashboard — Feazy',
  description: 'Manage your requests, jobs and earnings',
};

export default async function ProLayout({ children }: { children: React.ReactNode }) {
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
  if (!profile || profile.role !== 'professional') redirect('/customer');

  const [shell, feed, unreadMessages] = await Promise.all([
    getProfessionalShell(user.id),
    getNotificationFeed(),
    getUnreadMessageCount(),
  ]);
  const displayName =
    shell.displayName?.trim() || profile.full_name?.trim() || user.email?.split('@')[0] || 'Professional';

  const notice = verificationNotice(shell.verificationStatus, shell.rejectionReason);
  const locked = notice !== null;
  const requestCount = locked ? 0 : shell.requests.length;

  const requestsItem: NavItem = {
    href: '/professional/requests',
    label: 'Requests',
    icon: 'requests',
    count: requestCount,
    countLabel: 'waiting',
    locked,
  };
  const topItems: NavItem[] = [
    { href: '/professional', label: 'Today', icon: 'today', exact: true },
    requestsItem,
    { href: '/professional/jobs', label: 'Jobs', icon: 'jobs' },
    { href: '/professional/messages', label: 'Messages', icon: 'messages', count: unreadMessages ?? 0, countLabel: 'unread' },
    { href: '/professional/earnings', label: 'Earnings', icon: 'earnings' },
  ];
  const bottomItems: NavItem[] = [...topItems, { href: '/professional/profile', label: 'Account', icon: 'account' }];

  const live = shell.liveJob;
  const liveCount = shell.upcoming.filter((j) => isLiveState(j.state)).length;
  const activeJob: ActiveJob | null = live
    ? {
        href: `/professional/jobs/${live.id}`,
        title: live.serviceName,
        status: stateLabel(live.state),
        more: Math.max(0, liveCount - 1),
      }
    : null;

  return (
    <RoleShell
      homeHref="/professional"
      navLabel="Professional navigation"
      topItems={topItems}
      bottomItems={bottomItems}
      strip={activeJob && <ActiveJobStrip job={activeJob} />}
      banner={notice && <VerificationBanner notice={notice} />}
      actions={
        <>
          {activeJob && <ActiveJobChip job={activeJob} />}
          <AvailabilitySwitch initial={shell.isAvailable} lockedReason={notice?.title ?? null} compact />
          <NotificationBell items={feed.items} unread={feed.unread} failed={feed.failed} />
          <UserMenu
            displayName={displayName}
            email={user.email ?? null}
            initials={initialsOf(displayName)}
            roleLabel="Professional"
            links={[
              { label: 'Profile', href: '/professional/profile' },
              { label: 'Help & support', href: '/professional/support' },
            ]}
          />
        </>
      }
    >
      {children}
    </RoleShell>
  );
}
