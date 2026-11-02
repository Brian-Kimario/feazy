import type { ReactNode } from 'react';
import Link from 'next/link';
import { Symbol } from '@/components/brand/Symbol';

interface StatusPageProps {
  kicker: string;
  title: string;
  children: ReactNode;
  /** Buttons and links under the copy. */
  actions: ReactNode;
  detail?: string;
}

const linkCls = 'font-medium text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal';
export const statusBtnPrimary =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-teal px-6 text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep';
export const statusBtnGhost =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-paper px-6 text-[15px] font-semibold text-ink transition-colors hover:border-ink-3';

/** Shared shell for 404, error and coming-soon pages so none of them is a dead end. */
export function StatusPage({ kicker, title, children, actions, detail }: StatusPageProps) {
  return (
    <main id="main-content" className="flex min-h-dvh flex-col bg-porcelain px-5 font-sans text-ink">
      <header className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Symbol size="md" className="size-[30px] text-teal" />
          <span className="font-editorial text-[24px] tracking-[-0.02em]">Feazy</span>
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center pb-24">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">{kicker}</p>
        <h1 className="mt-4 font-editorial text-[clamp(38px,7vw,60px)] font-normal leading-[1.03] tracking-[-0.02em]">{title}</h1>
        <div className="mt-5 text-[16px] leading-relaxed text-ink-3">{children}</div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>
        <p className="mt-10 text-[14px] text-ink-3">
          Need a hand? <Link href="/help" className={linkCls}>Visit the help centre</Link> or{' '}
          <Link href="/contact" className={linkCls}>contact us</Link>.
        </p>
        {detail && <p className="mt-6 font-mono text-[12px] text-ink-4">{detail}</p>}
      </div>
    </main>
  );
}
