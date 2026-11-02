import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feazy.in";

export const metadata: Metadata = {
  title: "Sign In | Feazy",
  description: "Sign in to your Feazy account to manage property maintenance requests.",
  openGraph: {
    title: "Sign In | Feazy",
    description: "Sign in to your Feazy account",
    url: `${siteUrl}/auth/login`,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Sign In" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign In | Feazy",
    description: "Sign in to your Feazy account",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/auth/login`,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
