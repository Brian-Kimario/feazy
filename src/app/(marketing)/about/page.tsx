import { Metadata } from 'next';
import Link from 'next/link';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://feazy.in';

export const metadata: Metadata = {
  title: 'About Feazy',
  description:
    'Feazy connects homeowners with verified home-service professionals, with itemised quotes you approve before any work starts.',
  openGraph: {
    title: 'About Feazy',
    description: 'Verified home-service professionals, itemised quotes and tracked work.',
    url: `${siteUrl}/about`,
    type: 'website',
  },
  alternates: {
    canonical: `${siteUrl}/about`,
  },
};

const PRINCIPLES = [
  {
    title: 'Verified professionals',
    body: 'Every professional is checked by our team before they can accept a job.',
  },
  {
    title: 'Clear, itemised quotes',
    body: 'Labour, materials and any other charges are shown separately. Nothing extra starts without your approval.',
  },
  {
    title: 'Tracked from start to finish',
    body: 'You follow each step of a booking, and the work is recorded against your property.',
  },
];

export default function AboutPage() {
  return (
    <div className="bg-porcelain">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">About</p>
        <h1 className="mb-5 text-4xl font-bold tracking-tight text-ink sm:text-5xl">About Feazy</h1>
        <p className="text-lg leading-relaxed text-ink-2">
          Feazy is a home-services marketplace. We help customers book trusted professionals for repairs, maintenance
          and installation, and help professionals find work that fits their skills.
        </p>

        <div className="mt-12 space-y-8">
          {PRINCIPLES.map((p) => (
            <section key={p.title} className="border-t border-line pt-6">
              <h2 className="mb-2 text-xl font-semibold text-ink">{p.title}</h2>
              <p className="leading-relaxed text-ink-3">{p.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/contact" className="text-teal underline underline-offset-4">
            Contact us
          </Link>
          <Link href="/help" className="text-teal underline underline-offset-4">
            Help centre
          </Link>
        </div>
      </div>
    </div>
  );
}
