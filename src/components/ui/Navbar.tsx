'use client';

import Link from 'next/link';
import { useState, ReactNode } from 'react';
import { BrandMark } from './icons/branding';

interface NavItem {
  label: string;
  href: string;
}

interface NavbarProps {
  logo?: string;
  logoHref?: string;
  items: NavItem[];
  actions?: ReactNode;
  mobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

/**
 * Navbar - Responsive navigation header
 * Includes mobile menu support
 */
export function Navbar({
  logo,
  logoHref = '/',
  items,
  actions,
  mobileMenuOpen: controlledOpen,
  onMobileMenuToggle,
}: NavbarProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggleMenu = () => {
    if (onMobileMenuToggle) {
      onMobileMenuToggle();
    } else {
      setInternalOpen(!internalOpen);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] w-[min(100%-36px,1320px)] items-center justify-between gap-6">
        {/* Logo */}
        <Link href={logoHref} className="flex items-center gap-2.5 shrink-0">
          {logo ? (
            <span className="font-display text-lg font-bold">{logo}</span>
          ) : (
            <>
              <BrandMark />
              <span className="hidden font-display text-xl font-bold sm:inline">Feazy</span>
            </>
          )}
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden flex-1 items-center gap-8 text-sm font-medium md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-2 transition hover:text-teal"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        {actions && <div className="hidden md:flex gap-3">{actions}</div>}

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={toggleMenu}
          className="grid h-11 w-11 place-items-center rounded-lg border border-line md:hidden"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {isOpen ? '×' : '≡'}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <nav
          id="mobile-nav"
          className="border-t border-line bg-porcelain px-4 py-4 md:hidden"
        >
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-paper"
                onClick={toggleMenu}
              >
                {item.label}
              </Link>
            ))}
            {actions && (
              <div className="mt-4 border-t border-line pt-4 flex flex-col gap-2">
                {actions}
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
