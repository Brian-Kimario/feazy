import { ReactNode } from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default: 'primary' */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  /** Size. Default: 'md' */
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  /** Show spinner and disable button */
  isLoading?: boolean;
  /** Render as full-width block */
  fullWidth?: boolean;
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-teal text-paper hover:bg-teal-deep active:bg-teal-deep font-semibold',
  secondary:
    'bg-paper text-ink border border-line hover:bg-paper-2 active:bg-sand',
  outline:
    'border-2 border-teal text-teal bg-transparent hover:bg-teal-wash active:bg-teal-soft',
  ghost:
    'text-ink bg-transparent hover:bg-paper active:bg-paper-2',
  destructive:
    'bg-clay text-paper hover:bg-clay/90 active:bg-clay/80 font-semibold',
};

const focusRings: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:     'focus-visible:ring-teal focus-visible:ring-offset-porcelain',
  secondary:   'focus-visible:ring-ink focus-visible:ring-offset-paper',
  outline:     'focus-visible:ring-teal focus-visible:ring-offset-porcelain',
  ghost:       'focus-visible:ring-ink focus-visible:ring-offset-paper',
  destructive: 'focus-visible:ring-clay focus-visible:ring-offset-porcelain',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-base gap-2',
  lg: 'px-6 py-3 text-lg gap-2.5',
};

/**
 * Button — Feazy design-system button
 *
 * Variants: primary (teal), secondary (paper/border), outline (teal border),
 * ghost (text only), destructive (clay).
 *
 * @example
 * <Button variant="primary" onClick={handleSave}>Save changes</Button>
 * <Button variant="destructive" isLoading={deleting}>Delete</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  isLoading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center rounded-base font-medium',
        'transition-all duration-200 motion-reduce:transition-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variants[variant],
        focusRings[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="h-4 w-4 animate-spin shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
