import { getCurrentProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EditProfileForm } from './EditProfileForm';
import { Card } from '@/components/ui';
import Link from 'next/link';

export const metadata = {
  title: 'Edit Profile - Feazy',
};

export default async function EditProfilePage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/auth/login');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Back Navigation */}
      <Link
        href="/customer/profile"
        className="text-xs font-semibold text-teal hover:underline inline-flex items-center gap-1"
      >
        ← Back to Profile
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-2">
          Edit Profile
        </h1>
        <p className="text-ink-3">
          Update your personal information and preferences
        </p>
      </div>

      {/* Form Card */}
      <Card>
        <EditProfileForm initialProfile={profile} />
      </Card>

      {/* Help Section */}
      <div className="space-y-3">
        <h3 className="font-display text-sm font-bold text-ink-4 uppercase tracking-wider">
          Need Help?
        </h3>
        <div className="space-y-2 text-sm text-ink-3">
          <p>
            💡 Your profile information helps professionals provide better service estimates and communication.
          </p>
          <p>
            For additional account options, visit your{' '}
            <Link href="/customer/settings" className="text-teal hover:underline font-medium">
              Account Settings
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
