/** Where public-site calls to action should land, given who is looking at the page. */
export type ViewerRole = string | null | undefined;

export const DASHBOARD_BY_ROLE: Record<string, string> = {
  customer: '/customer',
  professional: '/professional',
  admin: '/admin',
  support: '/support',
};

export const SERVICES = [
  { slug: 'plumbing', name: 'Plumbing', blurb: 'Leaks, blockages, fittings and water-pressure problems.' },
  { slug: 'electrical', name: 'Electrical', blurb: 'Sockets, lights, wiring faults, breakers and fans.' },
  { slug: 'ac-cooling', name: 'AC & cooling', blurb: 'Not cooling, noisy units, servicing and installation checks.' },
  { slug: 'appliances', name: 'Appliances', blurb: 'Washing machines, refrigerators, ovens and geysers.' },
] as const;

export type ServiceSlug = (typeof SERVICES)[number]['slug'];

/** "Book a service": straight into the booking wizard for customers, through sign-in for visitors. */
export function bookingHref(role: ViewerRole, categoryId?: string) {
  const dest = categoryId ? `/customer/bookings/new?category=${encodeURIComponent(categoryId)}` : '/customer/bookings/new';
  if (!role) return `/auth/login?as=customer&next=${encodeURIComponent(dest)}`;
  if (role === 'customer') return dest;
  return DASHBOARD_BY_ROLE[role] ?? '/';
}

/** "Join as a professional": application for visitors, workspace for professionals. */
export function professionalHref(role: ViewerRole) {
  if (role === 'professional') return '/professional';
  if (role && DASHBOARD_BY_ROLE[role]) return DASHBOARD_BY_ROLE[role];
  return '/auth/register?as=professional';
}

export const comingSoon = (page: string) => `/coming-soon?page=${encodeURIComponent(page)}`;
