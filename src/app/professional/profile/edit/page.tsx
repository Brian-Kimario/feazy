import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getProfessionalProfileView } from '@/lib/services/professional-profile';
import { PageContainer } from '@/components/shell/primitives';
import { EditProfessionalProfileForm } from './EditProfessionalProfileForm';

export const metadata = {
  title: 'Edit profile — Feazy Professional',
};

export default async function EditProfessionalProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?next=/professional/profile/edit');

  const supabase = await createClient();
  const [view, categoriesResult, skillsResult] = await Promise.all([
    getProfessionalProfileView(user.id),
    supabase.from('service_categories').select('id, name').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase
      .from('professional_skills')
      .select('service_category_id')
      .eq('professional_id', user.id),
  ]);

  return (
    <PageContainer className="max-w-3xl">
      <Link
        href="/professional/profile"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-deep"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to profile
      </Link>

      <p className="mt-4 text-sm font-medium text-ink-3">Account</p>
      <h1 className="mt-1 font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-4xl">
        Edit profile
      </h1>
      <p className="mt-2 max-w-xl text-ink-3">
        Customers see your name and bio on the jobs you take. Your skills decide which bookings can reach you.
      </p>

      {(categoriesResult.error || skillsResult.error) && (
        <p role="alert" className="mt-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          Some of your profile didn’t load. Refresh before saving so you don’t lose skills.
        </p>
      )}

      <div className="mt-8">
        <EditProfessionalProfileForm
          initial={{
            fullName: view.displayName || view.fullName || '',
            phone: view.phone ?? '',
            bio: view.bio ?? '',
            yearsExperience: view.yearsExperience?.toString() ?? '',
            categoryIds: Array.from(new Set((skillsResult.data ?? []).map((s) => s.service_category_id))),
          }}
          email={user.email ?? null}
          categories={categoriesResult.data ?? []}
        />
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-teal-wash p-5">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
        <p className="text-sm text-ink-2">
          Need to change your sign-in email or verification documents?{' '}
          <Link href="/professional/support" className="font-semibold text-teal hover:text-teal-deep">
            Visit Help &amp; support
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
