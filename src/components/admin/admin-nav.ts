import type { NavItem } from '@/components/shell/nav';

export interface AdminNavSection {
  /** Section heading. Sections with one item still show it so the six logical areas stay visible. */
  label: string;
  items: NavItem[];
}

/**
 * Admin navigation. Only routes that exist and have real content are listed; Finance and
 * Activity & Audit join when their pages ship. Order follows the working loop: look, act, find.
 */
export const ADMIN_NAV: AdminNavSection[] = [
  { label: 'Overview', items: [{ href: '/admin', label: 'Overview', icon: 'overview', exact: true }] },
  {
    label: 'Operations',
    items: [
      { href: '/admin/operations', label: 'Operations', icon: 'operations' },
      { href: '/admin/exceptions', label: 'Exceptions', icon: 'operations' },
    ],
  },
  { label: 'Jobs & Bookings', items: [{ href: '/admin/jobs', label: 'Jobs', icon: 'jobs' }] },
  {
    label: 'People',
    items: [
      { href: '/admin/professionals', label: 'Verification', icon: 'verification' },
      { href: '/admin/customers', label: 'Customers', icon: 'people' },
    ],
  },
];

export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV.flatMap((s) => s.items);
