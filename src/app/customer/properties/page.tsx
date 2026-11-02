import { redirect } from 'next/navigation';
import { CircleAlert } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getCustomerPropertiesOverview } from '@/lib/services/customer-properties';
import { PageContainer } from '@/components/shell/primitives';
import { PropertiesManager } from './PropertiesManager';

export const metadata = {
  title: 'Properties — Feazy',
};

export default async function PropertiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?next=/customer/properties');

  const overview = await getCustomerPropertiesOverview(user.id);

  return (
    <PageContainer>
      {overview.error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Some of your property details didn’t load. Refresh the page to try again.</p>
        </div>
      )}
      <PropertiesManager properties={overview.properties} looseAddresses={overview.looseAddresses} />
    </PageContainer>
  );
}
