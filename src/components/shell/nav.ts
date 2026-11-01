import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  House,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Users,
  IndianRupee,
  Inbox,
  MessageSquare,
  Plus,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

/** Icons are named so nav items stay plain data across the server/client boundary. */
export const NAV_ICONS = {
  home: House,
  bookings: CalendarDays,
  properties: Building2,
  book: Plus,
  account: UserRound,
  today: Sun,
  requests: Inbox,
  jobs: BriefcaseBusiness,
  earnings: IndianRupee,
  messages: MessageSquare,
  overview: LayoutDashboard,
  operations: LifeBuoy,
  verification: ShieldCheck,
  people: Users,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Match the path exactly (for role home pages) instead of by prefix. */
  exact?: boolean;
  /** Count shown as a badge; omitted or 0 hides it. Always from a query. */
  count?: number;
  /** Read after the count by screen readers, for example "active" or "waiting". */
  countLabel?: string;
  /** Shown muted with a lock; the page itself explains why. */
  locked?: boolean;
  /** Raised centre button on the mobile bar. */
  primary?: boolean;
}

export function isNavActive(pathname: string, item: Pick<NavItem, 'href' | 'exact'>): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The single item to mark current: the longest matching href, so `/customer/bookings/new`
 * highlights "Book" rather than both "Book" and "Bookings".
 */
export function activeNavHref(pathname: string, items: readonly Pick<NavItem, 'href' | 'exact'>[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (isNavActive(pathname, item) && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}
