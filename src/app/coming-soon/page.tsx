import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusPage, statusBtnGhost, statusBtnPrimary } from '@/components/marketing/status-page';

export const metadata: Metadata = {
  title: 'Coming soon | Feazy',
  robots: { index: false, follow: false },
};

const LABEL = /^[\p{L}\p{N} .,&'’+/-]{1,48}$/u;

export default async function ComingSoonPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const name = page && LABEL.test(page) ? page : null;
  return (
    <StatusPage
      kicker="Coming soon"
      title={name ? `${name} isn’t ready yet.` : 'This isn’t ready yet.'}
      actions={
        <>
          <Link href="/" className={statusBtnPrimary}>Back to home</Link>
          <Link href="/contact" className={statusBtnGhost}>Tell us what you need</Link>
        </>
      }
    >
      <p>We’re still building this part of Feazy. Booking a repair and applying as a professional both work today.</p>
    </StatusPage>
  );
}
