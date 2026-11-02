/**
 * Admin reads for the service catalogue and materials. Not a server-action module. Checks the admin
 * role before creating the service-role client. Joins are done in code. Selects tolerate migrations
 * 119/120 being unapplied (missing columns/tables read as empty).
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';

export interface CatalogueCategory {
  id: string;
  name: string;
  availability: string;
  isActive: boolean;
  verifiedProfessionals: number;
  services: { id: string; name: string }[];
}

export interface CatalogueMaterial {
  id: string;
  name: string;
  brand: string | null;
  specification: string | null;
  unit: string;
  isActive: boolean;
  indicativePrice: number | null;
  priceUnit: string | null;
  serviceIds: string[];
}

export interface Catalogue {
  categories: CatalogueCategory[];
  materials: CatalogueMaterial[];
  /** False before migration 120; the page shows the editors disabled. */
  materialsReady: boolean;
}

export async function loadCatalogue(): Promise<AdminResult<Catalogue>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);

  const admin = await createTypedAdminClient();
  const [catsRes, svcRes, skillsRes, profRes, matRes, linkRes, brandRes] = await Promise.all([
    admin.from('service_categories').select('*').order('sort_order', { ascending: true }),
    admin.from('services').select('id, name, category_id').eq('is_active', true).order('name'),
    admin.from('professional_skills').select('professional_id, service_category_id'),
    admin.from('professional_profiles').select('user_id').eq('verification_status', 'verified'),
    admin.from('materials').select('*').order('name'),
    admin.from('service_materials').select('service_id, material_id'),
    admin.from('brands').select('id, name'),
  ]);
  if (catsRes.error || svcRes.error) return adminFailure('FAILED', 'Could not load the catalogue.');

  const verified = new Set((profRes.data ?? []).map((p) => p.user_id));
  const prosByCategory = new Map<string, Set<string>>();
  for (const s of skillsRes.data ?? []) {
    if (!s.service_category_id || !verified.has(s.professional_id)) continue;
    (prosByCategory.get(s.service_category_id) ?? prosByCategory.set(s.service_category_id, new Set()).get(s.service_category_id)!).add(
      s.professional_id,
    );
  }

  const categories: CatalogueCategory[] = (catsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    availability: c.availability ?? 'bookable',
    isActive: c.is_active !== false,
    verifiedProfessionals: prosByCategory.get(c.id)?.size ?? 0,
    services: (svcRes.data ?? []).filter((s) => s.category_id === c.id).map((s) => ({ id: s.id, name: s.name })),
  }));

  const brandName = new Map((brandRes.data ?? []).map((b) => [b.id, b.name]));
  const links = linkRes.data ?? [];
  const materialsReady = !matRes.error && !linkRes.error;
  const materials: CatalogueMaterial[] = (matRes.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    brand: m.brand_id ? (brandName.get(m.brand_id) ?? null) : null,
    specification: m.specification ?? null,
    unit: m.unit,
    isActive: m.is_active !== false,
    indicativePrice: m.indicative_price ?? null,
    priceUnit: m.price_unit ?? null,
    serviceIds: links.filter((l) => l.material_id === m.id).map((l) => l.service_id),
  }));

  return { ok: true, data: { categories, materials, materialsReady } };
}
