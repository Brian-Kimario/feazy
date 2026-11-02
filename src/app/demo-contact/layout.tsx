import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  title: "Demo Contact | Feazy",
  description: "Submit a demo request to see Feazy in action.",
  openGraph: {
    title: "Demo Contact | Feazy",
    description: "Request a demo of the Feazy property maintenance platform",
    url: `${siteUrl}/demo-contact`,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Demo Contact" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Demo Contact | Feazy",
    description: "Request a demo of Feazy",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/demo-contact`,
  },
};

export default function DemoContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
