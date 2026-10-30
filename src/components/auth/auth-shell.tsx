import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { Symbol } from '@/components/brand/Symbol';

export type AuthAudience = 'customer' | 'professional';

export const AUDIENCE_PANEL: Record<
  AuthAudience,
  { kicker: string; heading: string; points: readonly string[]; foot: string }
> = {
  customer: {
    kicker: 'For customers',
    heading: 'Your home, looked after and written down.',
    points: ['Track every job from request to payment', 'Approve itemised quotes before work starts', 'Keep invoices and warranties on file'],
    foot: 'Quoted in rupees. Paid by UPI. Kept on record.',
  },
  professional: {
    kicker: 'For professionals',
    heading: 'Your jobs, quotes and earnings in one place.',
    points: ['See new requests near you', 'Send itemised quotes from your phone', 'Get paid by UPI when the job is done'],
    foot: 'Professionals are verified before they can accept jobs.',
  },
};

export const authInput =
  'mt-2 block min-h-12 w-full rounded-base border bg-paper px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:opacity-60';

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * Shared frame for login and both sign-up pages. The audience decides the
 * surface (paper/teal for customers, dark ink for professionals) so each door
 * is recognisable on desktop (side panel) and on phones (top band).
 */
export function AuthShell({
  audience,
  children,
  backHref = '/',
  backLabel = 'Back to home',
}: {
  audience: AuthAudience;
  children: ReactNode;
  /** The page this screen belongs to. Sign-in related screens point it back at sign-in. */
  backHref?: string;
  backLabel?: string;
}) {
  const isPro = audience === 'professional';
  const panel = AUDIENCE_PANEL[audience];
  const accent = isPro ? 'text-[#7FC4B1]' : 'text-teal';

  return (
    <main id="main-content" className="grid min-h-dvh w-full bg-porcelain font-sans text-ink lg:grid-cols-[1fr_minmax(520px,1fr)]">
      <aside className={`relative hidden flex-col justify-between overflow-hidden p-10 lg:flex ${isPro ? 'bg-ink text-porcelain' : 'bg-teal-wash text-ink'}`}>
        <div
          aria-hidden="true"
          className={`absolute inset-0 [background-size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] ${
            isPro
              ? '[background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]'
              : '[background-image:linear-gradient(rgba(23,107,91,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(23,107,91,0.08)_1px,transparent_1px)]'
          }`}
        />
        <Link href="/" className="relative inline-flex w-fit items-center gap-2.5 font-editorial text-[26px] tracking-[-0.02em]">
          <Symbol size="md" className={`size-[30px] ${accent}`} />
          Feasy
        </Link>
        <div className="relative max-w-[30rem]">
          <p className={`text-[12px] font-semibold uppercase tracking-[0.16em] ${accent}`}>{panel.kicker}</p>
          <h2 className="mt-4 font-editorial text-[clamp(38px,4vw,56px)] font-normal leading-[1.04] tracking-[-0.02em]">{panel.heading}</h2>
          <ul className="mt-8 space-y-3.5">
            {panel.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15.5px]">
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${isPro ? 'bg-[#7FC4B1] text-ink' : 'bg-teal text-paper'}`}>
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                </span>
                <span className={isPro ? 'text-porcelain/80' : 'text-ink-2'}>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className={`relative text-[13px] ${isPro ? 'text-porcelain/55' : 'text-ink-3'}`}>{panel.foot}</p>
      </aside>

      <section className="flex min-w-0 flex-col">
        {/* Phone/tablet band: carries the audience theme where the side panel is hidden */}
        <div className={`flex items-center justify-between px-5 py-4 sm:px-10 lg:hidden ${isPro ? 'bg-ink text-porcelain' : 'bg-teal-wash text-ink'}`}>
          <Link href="/" className="inline-flex items-center gap-2 font-editorial text-[22px] tracking-[-0.02em]">
            <Symbol size="md" className={`size-[26px] ${accent}`} />
            Feasy
          </Link>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${isPro ? 'bg-porcelain/10 text-[#7FC4B1]' : 'bg-teal/10 text-teal-deep'}`}>
            {panel.kicker}
          </span>
        </div>

        <div className="flex flex-1 flex-col px-5 pb-6 pt-5 sm:px-10 lg:px-14 lg:pt-6">
          <Link href={backHref} className="inline-flex min-h-11 w-fit items-center gap-2 text-[14px] text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft size={16} aria-hidden="true" /> {backLabel}
          </Link>
          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
