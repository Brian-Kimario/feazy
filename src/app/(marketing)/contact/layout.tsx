import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  title: "Contact Feazy | Get Help with Property Maintenance",
  description: "Have questions about Feazy? Contact our support team for information about services, partnerships, or feedback.",
  openGraph: {
    title: "Contact Feazy",
    description: "Contact Feazy support",
    url: `${siteUrl}/contact`,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Contact Feazy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Feazy",
    description: "Contact Feazy support",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/contact`,
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
