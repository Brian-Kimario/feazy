'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Symbol } from '@/components/brand/Symbol';

interface SiteHeaderProps {
  /** Role of the signed-in user, if any. Swaps the sign-in actions for a dashboard link. */
  role?: string | null;
}

const LINKS: ReadonlyArray<readonly [string, string]> = [
  ['Services', '/#services'],
  ['How it works', '/#how'],
  ['Property record', '/#property'],
  ['For professionals', '/#professionals'],
  ['Help', '/help'],
];

const DASHBOARDS: Record<string, string> = {
  admin: '/admin',
  professional: '/professional',
  support: '/support',
};

const btnBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border px-4 text-[13px] font-semibold transition-colors';
const btnPrimary = `${btnBase} border-transparent bg-teal text-white shadow-[0_10px_24px_rgba(23,107,91,0.16)] hover:bg-teal-deep`;
const btnGhost = `${btnBase} border-line bg-paper/60 text-ink hover:bg-paper`;

export function SiteHeader({ role }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close on navigation, and keep the page behind the menu from scrolling.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (pathname?.startsWith('/auth')) return null;

  const signedIn = Boolean(role);
  const dashboard = DASHBOARDS[role ?? ''] ?? '/customer';
  const close = () => setOpen(false);

  return (
    <header
      id="siteHeader"
      className={`fixed inset-x-0 top-0 z-[100] border-b transition-[background,border-color,box-shadow] duration-200 ${
        open
          ? 'border-line bg-porcelain'
          : scrolled
            ? 'border-line/80 bg-porcelain/90 shadow-[0_8px_30px_rgba(24,33,31,0.05)] backdrop-blur-lg'
            : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto w-[min(1240px,calc(100%-36px))] sm:w-[min(1240px,calc(100%-48px))]">
        <div className="flex h-[68px] items-center gap-3 sm:h-[76px] sm:gap-6">
          <Link
            href="/"
            onClick={close}
            className="inline-flex shrink-0 items-center gap-2.5 text-ink"
          >
            <Symbol size="md" className="size-[31px] text-teal" />
            <span className="font-editorial text-[24px] font-normal tracking-[-0.02em]">Feazy</span>
          </Link>

          <nav aria-label="Primary" className="ml-auto hidden gap-7 lg:flex">
            {LINKS.map(([label, href]) => (
              <Link key={label} href={href} className="py-2 text-[13px] text-ink-3 transition-colors hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            {signedIn ? (
              <Link href={dashboard} className={btnPrimary}>
                Dashboard <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link href="/auth/login?as=professional" className={`${btnGhost} max-xl:hidden`}>
                  Professional sign in
                </Link>
                <Link href="/auth/login?as=customer" className={`${btnGhost} max-sm:hidden`}>
                  Sign in
                </Link>
                <Link href="/auth/register?as=customer" className={`${btnPrimary} whitespace-nowrap`}>
                  Get started <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[11px] border border-line bg-paper text-ink lg:hidden"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-line lg:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto flex w-[calc(100%-36px)] flex-col pb-6 pt-2 sm:w-[calc(100%-48px)]">
            {LINKS.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={close}
                className="flex items-center justify-between border-b border-line/60 py-4 text-[16px] text-ink"
              >
                {label}
                <ArrowUpRight size={16} className="text-ink-3" aria-hidden="true" />
              </Link>
            ))}
            {!signedIn && (
              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-line bg-paper p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">I need a repair</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <Link href="/auth/register?as=customer" onClick={close} className={`${btnPrimary} w-full`}>Get started</Link>
                    <Link href="/auth/login?as=customer" onClick={close} className={`${btnGhost} w-full`}>Sign in</Link>
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-ink p-4 text-porcelain">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-porcelain/55">I fix things for a living</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <Link href="/auth/register?as=professional" onClick={close} className={`${btnBase} w-full border-transparent bg-porcelain text-ink`}>Apply</Link>
                    <Link href="/auth/login?as=professional" onClick={close} className={`${btnBase} w-full border-porcelain/30 text-porcelain`}>Sign in</Link>
                  </div>
                </div>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
