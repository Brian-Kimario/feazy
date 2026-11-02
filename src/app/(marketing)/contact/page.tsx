import type { Metadata } from 'next';
import { ContactPageClient } from '@/components/pages/ContactPageClient';
import { getCurrentProfile, getCurrentUser } from '@/lib/auth';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fixify.vercel.app';

export const metadata: Metadata = {
  title: 'Contact Feazy | Get Help with Property Maintenance',
  description: 'Have questions about Feazy? Contact our support team for information about services, partnerships, or feedback',
  alternates: {
    canonical: `${siteUrl}/contact`,
  },
  openGraph: {
    title: 'Contact Feazy',
    description: 'Contact Feazy support',
    url: `${siteUrl}/contact`,
    type: 'website',
    images: [
      {
        url: '/og-image-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Feazy contact',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Feazy',
    description: 'Contact Feazy support',
    images: ['/og-image-1200x630.png'],
  },
};

export default async function ContactPage() {
  const user = await getCurrentUser();
  const profile = user ? await getCurrentProfile() : null;
  return (
    <ContactPageClient
      defaultName={profile?.full_name ?? ''}
      defaultEmail={user?.email ?? ''}
      signedIn={Boolean(user)}
    />
  );
}
