import Link from 'next/link';
import type { ReactNode } from 'react';
import { Symbol } from '@/components/brand/Symbol';
import { BottomNavLinks, TopNavLinks } from './NavLinks';
import type { NavItem } from './nav';

/**
 * Frame shared by the customer and professional areas: skip link, sticky top bar with
 * desktop nav and a right-hand action cluster, optional strip and banner under the bar,
 * and a mobile tab bar. Pages render inside `<main id="main-content">`.
 */
export function RoleShell({
  homeHref,
  navLabel,
  topItems,
  bottomItems,
  actions,
  strip,
  banner,
  children,
}: {
  homeHref: string;
  navLabel: string;
  topItems: NavItem[];
  bottomItems: NavItem[];
  actions: ReactNode;
  strip?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-porcelain font-sans text-ink">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
          <Link
            href={homeHref}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg pr-1 text-[17px] font-bold tracking-[-0.035em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <Symbol size="sm" className="h-7 w-7" />
            <span>Feazy</span>
          </Link>

          <div className="ml-2 hidden md:block">
            <TopNavLinks items={topItems} label={navLabel} />
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">{actions}</div>
        </div>
        {strip}
      </header>

      {banner}

      <main id="main-content" tabIndex={-1} className="pb-28 focus:outline-none md:pb-12">
        {children}
      </main>

      <BottomNavLinks items={bottomItems} label={navLabel} />
    </div>
  );
}
