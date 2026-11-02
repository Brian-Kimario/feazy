import type { Metadata } from 'next';
import { FAQPageSchema } from '@/components/seo/FAQPageSchema';
import { HelpCenter } from '@/components/help/HelpCenter';
import { HELP_FAQS } from '@/lib/help/content';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://feazy.in';
const description = 'Answers for customers and professionals on bookings, quotes, codes, payment and safety.';

export const metadata: Metadata = {
  title: 'Help Centre | Feazy',
  description,
  alternates: { canonical: `${siteUrl}/help` },
  openGraph: {
    title: 'Help Centre | Feazy',
    description,
    url: `${siteUrl}/help`,
    type: 'website',
    images: [{ url: '/og-image-1200x630.png', width: 1200, height: 630, alt: 'Feazy help centre' }],
  },
};

export default function HelpPage() {
  // Structured data covers the customer answers; the professional ones are for signed-in work, not search.
  const indexed = HELP_FAQS.filter((faq) => faq.audience === 'customer');
  return (
    <>
      <FAQPageSchema faqs={indexed.map((f) => ({ question: f.question, answer: f.answer }))} />
      <HelpCenter />
    </>
  );
}
