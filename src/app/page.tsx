import type { Metadata } from 'next';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Hero } from '@/components/home/hero';
import { FactsStrip, HowItWorks, ServicesIndex, PropertyRecord, ProfessionalSection, Faq, ClosingCta } from '@/components/home/sections';
import { getComingSoonCategories, getServiceCategories, type ServiceCategory } from '@/lib/services/catalogue';
import type { ViewerRole } from '@/lib/marketing-links';
import type { HomeCategory } from '@/components/home/sections';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feazy.in";

export const metadata: Metadata = {
  title: "Feazy — Book Verified Home Repair Professionals",
  description: "Book verified home repair professionals. Choose a service, get an itemised quotation in rupees, approve any extra work, and track the job to completion.",
  openGraph: {
    title: "Feazy — Book Verified Home Repair Professionals",
    description: "Book verified plumbers, electricians and handymen. Compare quotes and pay by UPI.",
    url: siteUrl,
    type: "website",
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Feazy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Feazy — Book Verified Home Repair Professionals",
    description: "Book verified home repair professionals. Compare quotes and pay by UPI.",
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default async function HomePage() {
  // One round of independent reads. The two catalogue lists share one memoised query.
  const [user, profile, categoryRows, comingSoonRows] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    // Database-driven: only categories that are active in the catalogue are shown.
    getServiceCategories().catch((): ServiceCategory[] => []),
    getComingSoonCategories().catch((): ServiceCategory[] => []),
  ]);
  const role = (user ? (profile?.role ?? 'customer') : null) as ViewerRole;
  const categories: HomeCategory[] = categoryRows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description }));
  const comingSoon: string[] = comingSoonRows.map((c) => c.name);
  return (
    <div className="flex min-h-screen flex-col bg-porcelain font-sans text-ink">
      <SiteHeader role={role} />
      <main id="main-content" className="flex-1">
        <Hero role={role} categories={categories} />
        <FactsStrip />
        <HowItWorks />
        <ServicesIndex role={role} categories={categories} comingSoon={comingSoon} />
        <PropertyRecord role={role} />
        <ProfessionalSection role={role} />
        <Faq />
        <ClosingCta role={role} />
      </main>
      <SiteFooter />
    </div>
  );
}
