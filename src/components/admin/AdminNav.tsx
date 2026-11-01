'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { NAV_ICONS, activeNavHref } from '@/components/shell/nav';
import { ADMIN_NAV, ADMIN_NAV_ITEMS } from './admin-nav';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const current = activeNavHref(usePathname() ?? '', ADMIN_NAV_ITEMS);

  return (
    <div className="space-y-5">
      {ADMIN_NAV.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-ink-3">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.href === current;
              const Icon = NAV_ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                      active ? 'bg-teal-soft text-teal-deep' : 'text-ink-3 hover:bg-paper-2 hover:text-ink',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Fixed sidebar from the md breakpoint up. */
export function AdminSidebar() {
  return (
    <nav aria-label="Admin" className="hidden w-60 shrink-0 border-r border-line bg-paper px-3 py-5 md:block">
      <div className="sticky top-[5.25rem]">
        <NavList />
      </div>
    </nav>
  );
}

/** Menu button plus slide-over navigation for narrow screens. */
export function AdminMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  // Close after any navigation, including browser back/forward.
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open navigation menu</span>
      </button>
      {open && (
        <Dialog title="Admin menu" placement="left" closeLabel="Close navigation menu" onClose={() => setOpen(false)}>
          <nav aria-label="Admin">
            <NavList onNavigate={() => setOpen(false)} />
          </nav>
        </Dialog>
      )}
    </div>
  );
}
