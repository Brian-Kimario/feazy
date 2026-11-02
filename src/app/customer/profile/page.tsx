import { getCurrentProfile, getCurrentUser } from '@/lib/auth';
import Link from 'next/link';

export const metadata = {
  title: 'Profile - Feazy',
};

export default async function ProfilePage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()]);
  const email = user?.email ?? null;
  const displayName = profile?.full_name || email?.split('@')[0] || 'Customer';

  const memberSinceDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Recently';

  return (
    <div className="min-h-screen bg-[#F7F4EC]">
      {/* Main Content */}
      <main id="main-content" className="px-4 md:px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7C8681] block">ACCOUNT</span>
            <h1 className="text-2xl font-bold tracking-tight text-[#18211F] mt-0.5">Your profile</h1>
          </div>
          
          {/* Profile Header Card */}
          <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0 relative">
                <div className="w-24 h-24 rounded-lg bg-[#E2EEE9] flex items-center justify-center text-3xl font-bold text-[#176B5B] border-2 border-[#176B5B]">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="w-full h-full rounded-lg object-cover"
                    />
                  ) : (
                    <span>{displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-bold text-[#18211F] mb-2">
                  {displayName}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-sm text-[#5A6661]">
                    Member since {memberSinceDate}
                  </span>
                </div>
                <Link
                  href="/customer/profile/edit"
                  className="inline-block px-5 py-2 bg-[#176B5B] text-white rounded-lg font-medium hover:bg-[#0D5144] transition text-sm"
                >
                  ✎ Edit Profile
                </Link>
              </div>
            </div>
          </div>

          {/* Contact Information Card */}
          <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-6 md:p-8">
            <h3 className="text-lg font-bold text-[#18211F] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#176B5B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Contact Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Email */}
              <div className="p-4 bg-[#F7F4EC] rounded-lg border border-[#E0E0E0]">
                <p className="text-xs font-bold text-[#5A6661] uppercase tracking-wider mb-1">
                  Email Address
                </p>
                <p className="text-sm font-medium text-[#18211F] mb-1">
                  {email || '—'}
                </p>
                <p className="text-xs text-[#5A6661]">Primary contact for updates</p>
              </div>

              {/* Phone */}
              <div className="p-4 bg-[#F7F4EC] rounded-lg border border-[#E0E0E0]">
                <p className="text-xs font-bold text-[#5A6661] uppercase tracking-wider mb-1">
                  Phone Number
                </p>
                <p className="text-sm font-medium text-[#18211F] mb-1">
                  {profile?.phone || '—'}
                </p>
                <p className="text-xs text-[#5A6661]">Used for service notifications</p>
              </div>
            </div>

            <Link
              href="/customer/profile/edit"
              className="block w-full px-4 py-2.5 border border-[#D9DED8] text-[#176B5B] font-medium rounded-lg hover:bg-[#F7F4EC] transition text-sm text-center"
            >
              Update Contact Info
            </Link>
          </div>

          {/* Account Details Card */}
          <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-lg p-6 md:p-8">
            <h3 className="text-lg font-bold text-[#18211F] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#176B5B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6m0 0v6" />
              </svg>
              Account Details
            </h3>

            <div className="space-y-4">
              {/* Full Name */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E0E0E0]">
                <div>
                  <p className="font-medium text-[#18211F]">Full Name</p>
                  <p className="text-xs text-[#5A6661] mt-0.5">Your registered name</p>
                </div>
                <p className="font-medium text-[#18211F] text-right">{profile?.full_name || '—'}</p>
              </div>

              {/* Account Type */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E0E0E0]">
                <div>
                  <p className="font-medium text-[#18211F]">Account Type</p>
                  <p className="text-xs text-[#5A6661] mt-0.5">Your account role</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-[#E2EEE9] text-[#176B5B] text-sm font-medium rounded">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Customer'}
                </div>
              </div>

              {/* Member Since */}
              <div className="flex items-center justify-between pb-0">
                <div>
                  <p className="font-medium text-[#18211F]">Member Since</p>
                  <p className="text-xs text-[#5A6661] mt-0.5">Account creation date</p>
                </div>
                <p className="font-medium text-[#18211F]">{memberSinceDate}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-[#E2EEE9] border border-[#BFD4CD] rounded-lg p-6 md:p-8">
            <h3 className="text-lg font-bold text-[#18211F] mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link
                href="/customer/profile/edit"
                className="px-4 py-2.5 bg-[#176B5B] text-white font-medium rounded-lg hover:bg-[#0D5144] transition text-sm text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile
              </Link>
              <Link
                href="/customer/settings"
                className="px-4 py-2.5 bg-white text-[#176B5B] font-medium rounded-lg hover:bg-[#F7F4EC] transition text-sm text-center flex items-center justify-center gap-2 border border-[#BFD4CD]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
                </svg>
                Settings
              </Link>
              <Link
                href="/customer/properties"
                className="px-4 py-2.5 bg-white text-[#176B5B] font-medium rounded-lg hover:bg-[#F7F4EC] transition text-sm text-center flex items-center justify-center gap-2 border border-[#BFD4CD]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m4 10 8-6 8 6v9H4zM9 19v-5h6v5" />
                </svg>
                My Properties
              </Link>
              <Link
                href="/customer/support"
                className="px-4 py-2.5 bg-white text-[#176B5B] font-medium rounded-lg hover:bg-[#F7F4EC] transition text-sm text-center flex items-center justify-center gap-2 border border-[#BFD4CD]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 6h14v10H9l-4 4z" />
                </svg>
                Support
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
