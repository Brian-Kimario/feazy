import Link from 'next/link';
import { Symbol } from '@/components/brand/Symbol';
import { comingSoon } from '@/lib/marketing-links';

const COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<readonly [string, string]> }> = [
  {
    title: 'Customers',
    links: [
      ['Book a repair', '/auth/login?as=customer&next=%2Fcustomer'],
      ['How it works', '/#how'],
      ['Services', '/#services'],
      ['Property record', '/#property'],
      ['Customer sign in', '/auth/login?as=customer'],
    ],
  },
  {
    title: 'Professionals',
    links: [
      ['Apply to join', '/auth/register?as=professional'],
      ['Professional sign in', '/auth/login?as=professional'],
      ['Verification', '/#professionals'],
      ['Pro app', comingSoon('Professional app')],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Help centre', '/help'],
      ['Contact us', '/contact'],
      ['About Feazy', comingSoon('About Feazy')],
      ['Careers', comingSoon('Careers')],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Terms of service', '/terms'],
      ['Privacy policy', '/privacy'],
      ['Cookie policy', '/cookies'],
      ['Refund policy', '/refund-policy'],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer id="footer" className="bg-ink text-porcelain">
      <div className="mx-auto w-[min(1240px,calc(100%-36px))] py-16 sm:w-[min(1240px,calc(100%-48px))] sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2.7fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 font-editorial text-[26px] tracking-[-0.02em]">
              <Symbol size="md" className="size-[30px] text-[#7FC4B1]" />
              Feazy
            </Link>
            <p className="mt-4 max-w-[34ch] text-[14.5px] leading-relaxed text-porcelain/60">
              Verified home repair professionals, itemised quotes, UPI payment and a record of every job.
            </p>
            <a
              href="mailto:support@feasy.com"
              className="mt-5 inline-block text-[14px] text-[#7FC4B1] underline decoration-[#7FC4B1]/30 underline-offset-4 hover:decoration-[#7FC4B1]"
            >
              support@feasy.com
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-porcelain/45">{col.title}</p>
                <ul className="mt-4 space-y-1">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="inline-block min-h-8 py-1 text-[14px] text-porcelain/80 transition-colors hover:text-white"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-porcelain/15 pt-6 text-[12.5px] text-porcelain/50 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Feazy Technologies. Made in India.</span>
          <span>Payments by UPI and Razorpay.</span>
        </div>
      </div>
    </footer>
  );
}
