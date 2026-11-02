import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { BookingWizard } from '@/components/customer/BookingWizard';
import type {
  WizardCategory,
  WizardService,
  WizardProperty,
} from '@/components/customer/BookingWizard';
import Link from 'next/link';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { PageContainer } from '@/components/shell/primitives';

export const metadata = {
  title: 'Book a Service — Feazy',
};

interface NewBookingPageProps {
  searchParams: Promise<{
    service?: string;
    category?: string;
    propertyId?: string;
    problem?: string;
  }>;
}

export default async function NewBookingPage({ searchParams }: NewBookingPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?next=/customer/bookings/new');

  const supabase = await createClient();
  const {
    service: preselectedServiceId,
    category: preselectedCategoryId,
    propertyId: preselectedPropertyId,
    problem: preselectedProblem,
  } = await searchParams;

  // ── Load properties ─────────────────────────────────────────────────────
  const { data: rawProperties } = await supabase
    .from('properties')
    .select('id, name, property_type, addresses(address_line_1, city)')
    .eq('owner_customer_id', user.id)
    .order('created_at', { ascending: false });

  const properties: WizardProperty[] = (rawProperties ?? []).map((p) => {
    const addr = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses;
    return {
      id: p.id,
      name: p.name,
      property_type: p.property_type,
      address: addr
        ? { address_line_1: addr.address_line_1, city: addr.city }
        : null,
    };
  });

  // ── Load catalogue ──────────────────────────────────────────────────────
  const { data: rawCategories } = await supabase
    .from('service_categories')
    .select('id, name, slug, description, icon_key')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const { data: rawServices } = await supabase
    .from('services')
    .select(`
      id, name, slug, description, pricing_model,
      base_price, inspection_fee, estimated_duration_minutes, category_id,
      service_options (
        id, name, option_type, is_required, sort_order,
        service_option_values (
          id, label, value, price_modifier, sort_order
        )
      )
    `)
    .eq('is_active', true)
    .order('name', { ascending: true });

  const categories: WizardCategory[] = (rawCategories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon_key: c.icon_key,
  }));

  // Group services by category_id
  const servicesByCategory: Record<string, WizardService[]> = {};
  for (const s of rawServices ?? []) {
    if (!servicesByCategory[s.category_id]) {
      servicesByCategory[s.category_id] = [];
    }
    const options = ((s.service_options as unknown as Array<{
      id: string;
      name: string;
      option_type: string;
      is_required: boolean;
      sort_order: number;
      service_option_values: Array<{
        id: string;
        label: string;
        value: string;
        price_modifier: number | null;
        sort_order: number;
      }>;
    }>) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((opt) => ({
        id: opt.id,
        name: opt.name,
        option_type: opt.option_type,
        is_required: opt.is_required,
        sort_order: opt.sort_order,
        values: (opt.service_option_values ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((v) => ({
            id: v.id,
            label: v.label,
            value: v.value,
            price_modifier: v.price_modifier,
            sort_order: v.sort_order,
          })),
      }));

    servicesByCategory[s.category_id].push({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      pricing_model: s.pricing_model as WizardService['pricing_model'],
      base_price: s.base_price,
      inspection_fee: s.inspection_fee,
      estimated_duration_minutes: s.estimated_duration_minutes,
      options,
    });
  }

  // ── Resolve pre-selected category from service, slug, or name ──────────
  let resolvedCategoryId = preselectedCategoryId;

  // If it's a slug or human category name (e.g. "Plumbing", "HVAC"), match it
  if (resolvedCategoryId && !/^[0-9a-f-]{36}$/.test(resolvedCategoryId)) {
    const term = resolvedCategoryId.toLowerCase().trim();
    const match = categories.find(
      (c) =>
        c.slug === term ||
        c.name.toLowerCase() === term ||
        c.name.toLowerCase().includes(term) ||
        term.includes(c.name.toLowerCase())
    );
    resolvedCategoryId = match?.id;
  }

  if (preselectedServiceId && !resolvedCategoryId) {
    outer: for (const [catId, svcs] of Object.entries(servicesByCategory)) {
      for (const svc of svcs) {
        if (svc.id === preselectedServiceId) {
          resolvedCategoryId = catId;
          break outer;
        }
      }
    }
  }

  return (
    <PageContainer className="max-w-6xl">
      <Link
        href="/customer/bookings"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-deep"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Bookings
      </Link>
      <p className="text-sm font-medium text-ink-3">New booking</p>
      <h1 className="mt-1 font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-4xl">
        Book a service
      </h1>
      <p className="mt-2 max-w-xl text-ink-3">
        Tell us what you need and when. We match you with a verified professional, and any change to the price needs
        your approval.
      </p>

      {properties.length === 0 && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-ochre/30 bg-ochre-soft px-4 py-3 text-sm text-ochre">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            You need a property before you can book.{' '}
            <Link href="/customer/properties" className="font-semibold underline underline-offset-2">
              Add a property
            </Link>
          </p>
        </div>
      )}

      <div className="mt-8">
        <BookingWizard
          categories={categories}
          servicesByCategory={servicesByCategory}
          properties={properties}
          preselectedServiceId={preselectedServiceId}
          preselectedCategoryId={resolvedCategoryId}
          preselectedPropertyId={preselectedPropertyId}
          initialProblemNotes={preselectedProblem}
        />
      </div>
    </PageContainer>
  );
}
