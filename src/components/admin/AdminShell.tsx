import Link from 'next/link';
import type { ReactNode } from 'react';
import { Symbol } from '@/components/brand/Symbol';
import { AdminMobileMenu, AdminSidebar } from './AdminNav';

/**
 * Frame for every /admin page (the skip link comes from the root layout): sticky top bar (menu button on narrow screens, brand,
 * account actions), a desktop sidebar, and `<main id="main-content">`. Pages keep their own
 * content width; the shell only provides navigation and landmarks.
 */
export function AdminShell({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-porcelain font-sans text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="flex h-16 items-center gap-2 px-3 md:px-6">
          <AdminMobileMenu />
          <Link
            href="/admin"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg pr-1 text-[17px] font-bold tracking-[-0.035em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <Symbol size="sm" className="h-7 w-7" />
            <span>Feazy</span>
            <span className="ml-1 rounded-md bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-3">
              Admin
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">{actions}</div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-12 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
