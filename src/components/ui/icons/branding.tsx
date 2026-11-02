'use client';

/**
 * Arrow - Right arrow icon with hover animation
 * Used in links and CTAs throughout the app
 */
import { Symbol } from '@/components/brand/Symbol';

export function Arrow() {
  return (
    <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
      →
    </span>
  );
}

/**
 * BrandMark - Feazy logo mark/icon
 * House icon in teal color
 * Used in header and footer
 */
export function BrandMark() {
  return <Symbol size="md" className="h-9 w-9" />;
}

/**
 * BrandMarkSmall - Smaller variant of BrandMark
 * For use in compact spaces
 */
export function BrandMarkSmall() {
  return <Symbol size="sm" className="h-7 w-7" />;
}
