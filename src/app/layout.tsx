import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import "../styles/variables.css";
import { AnimationProvider } from "@/components/ui/AnimationProvider";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Feazy — Property Maintenance, Made Simple",
  description:
    "Connect with verified professionals for plumbing, electrical, handyman and other property maintenance services. Describe your problem and let Feazy handle the rest.",
  keywords: [
    "property maintenance",
    "home repairs",
    "marketplace",
    "verified professionals",
    "plumbing",
    "electrical",
    "handyman",
  ],
  openGraph: {
    title: "Feazy — Property Maintenance, Made Simple",
    description: "Connect with verified professionals for property maintenance services",
    url: siteUrl,
    type: "website",
    locale: "en_IN",
    images: [
      {
        url: "/og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Feazy property maintenance marketplace",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Feazy — Property Maintenance, Made Simple",
    description: "Connect with verified professionals for property maintenance services",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/feasy-logo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    shortcut: "/favicon.ico",
  },
  verification: {
    other: {
      "strix-verification": ["strix-verify-c9a07f22b5eef84cb1df84c3127358b1"],
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F4EC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${fraunces.variable} ${dmSans.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="canonical" href={siteUrl} />
        <OrganizationSchema />
      </head>
      <body className="min-h-full flex flex-col bg-porcelain text-ink antialiased">
        <WebVitalsReporter />
        {/* Skip to main content link - visible on keyboard focus */}
        <a
          href="#main-content"
          className="absolute left-0 top-0 z-50 -translate-y-full focus:translate-y-0 px-4 py-2 bg-ink text-porcelain font-semibold rounded-b text-sm transition-transform"
        >
          Skip to main content
        </a>
        <AnimationProvider>
          {children}
        </AnimationProvider>
      </body>
    </html>
  );
}
