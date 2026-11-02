export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Feazy",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app",
    logo: `${process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app"}/brand/feasy-logo.svg`,
    description: "On-demand property maintenance marketplace connecting customers with verified professionals",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app"}/support`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      suppressHydrationWarning
    />
  );
}
