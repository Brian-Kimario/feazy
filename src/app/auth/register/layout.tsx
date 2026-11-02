import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feazy.in";

export const metadata: Metadata = {
  title: "Create Account | Feazy",
  description: "Sign up as a customer to start requesting property maintenance services on Feazy.",
  openGraph: {
    title: "Create Account | Feazy",
    description: "Sign up for Feazy",
    url: `${siteUrl}/auth/register`,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Create Account" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Account | Feazy",
    description: "Sign up for Feazy",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/auth/register`,
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
