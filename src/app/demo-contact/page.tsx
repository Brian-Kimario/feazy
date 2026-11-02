import type { Metadata } from 'next';
import { DemoContactPageClient } from '@/components/pages/DemoContactPageClient';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://feazy.in';

export const metadata: Metadata = {
  title: 'Demo Contact | Feazy',
  description: 'Submit a demo request to see Feazy in action',
  alternates: {
    canonical: `${siteUrl}/demo-contact`,
  },
  openGraph: {
    title: 'Demo Contact | Feazy',
    description: 'Request a demo of the Feazy property maintenance platform',
    url: `${siteUrl}/demo-contact`,
    type: 'website',
    images: [
      {
        url: '/og-image-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Feazy demo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Demo Contact | Feazy',
    description: 'Request a demo of the Feazy property maintenance platform',
    images: ['/og-image-1200x630.png'],
  },
};

export default function DemoContactPage() {
  return <DemoContactPageClient />;
}
