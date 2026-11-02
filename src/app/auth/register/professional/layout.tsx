import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  title: "Become a Professional | Feazy",
  description: "Join Feazy as a verified service professional and grow your business.",
  openGraph: {
    title: "Become a Professional | Feazy",
    description: "Join Feazy as a professional",
    url: `${siteUrl}/auth/register/professional`,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Professional Registration" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Become a Professional | Feazy",
    description: "Join Feazy as a professional",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/auth/register/professional`,
  },
};

export default function ProfessionalRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
