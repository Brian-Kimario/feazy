import { loadCatalogue } from '@/lib/services/admin-catalogue-reads';
import { isAdminFailure } from '@/lib/admin/result';
import { CategoryAvailabilityForm, MaterialEditor } from '@/components/admin/CatalogueForms';

export const metadata = { title: 'Catalogue & materials — Feazy Admin' };
export const dynamic = 'force-dynamic';

export default async function CataloguePage() {
  const result = await loadCatalogue();
  if (isAdminFailure(result)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <h1 className="text-lg font-bold">Could not load the catalogue</h1>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </div>
    );
  }
  const { categories, materials, materialsReady } = result.data;
  const allServices = categories.flatMap((c) => c.services);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-4">Admin · Catalogue</p>
      <h1 className="mb-2 text-2xl font-bold text-ink md:text-3xl">Services and materials</h1>
      <p className="mb-8 max-w-2xl text-sm text-ink-3">
        Customers can only book categories marked Bookable. Keep a category on Coming soon until it has verified
        professionals. Guide prices are indicative only; final prices come from an approved quotation.
      </p>

      <h2 className="mb-3 text-lg font-bold text-ink">Categories</h2>
      <ul className="mb-10 space-y-3">
        {categories.map((c) => (
          <li key={c.id} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{c.name}</p>
                <p className="text-xs text-ink-3">
                  {c.verifiedProfessionals} verified professional{c.verifiedProfessionals === 1 ? '' : 's'} ·{' '}
                  {c.services.length} active service{c.services.length === 1 ? '' : 's'}
                </p>
                {c.verifiedProfessionals === 0 && c.availability !== 'coming_soon' && (
                  <p role="status" className="mt-1 text-xs font-semibold text-danger">
                    No verified professionals: customers can book this but nobody can be assigned.
                  </p>
                )}
              </div>
              <CategoryAvailabilityForm categoryId={c.id} availability={c.availability} />
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 text-lg font-bold text-ink">Materials</h2>
      {!materialsReady ? (
        <p className="rounded-xl border border-line bg-paper p-4 text-sm text-ink-3">
          Materials are not available until migration 120 is applied.
        </p>
      ) : (
        <div className="space-y-4">
          {materials.map((m) => (
            <div key={m.id}>
              <p className="mb-1 text-xs text-ink-3">{m.isActive ? 'Active' : 'Inactive'}</p>
              <MaterialEditor material={m} services={allServices} />
            </div>
          ))}
          <h3 className="pt-2 font-bold text-ink">Add a material</h3>
          <MaterialEditor material={null} services={allServices} />
        </div>
      )}
    </div>
  );
}
