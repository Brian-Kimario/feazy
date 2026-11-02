import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { SettingToggleClient } from '@/components/customer/SettingToggleClient';
import Link from 'next/link';

export const metadata = {
  title: 'Account Settings - Feazy',
};

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  return (
    <div className="pb-20 md:pb-0 min-h-screen bg-paper">
      {/* Header */}
      <div className="px-4 md:px-6 py-8 md:py-12 bg-gradient-to-br from-teal-soft to-paper border-b border-line">
        <div className="max-w-4xl mx-auto">
          <Link href="/customer/profile" className="text-xs font-bold text-teal hover:text-teal-dark transition inline-flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Profile
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-teal text-paper rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.11em] text-teal mb-1">Settings</div>
              <h1 className="text-3xl md:text-4xl font-bold text-ink">Account Settings</h1>
            </div>
          </div>
          <p className="text-ink-3 max-w-2xl">Manage your account preferences, security, and communication settings</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 md:px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Email & Authentication */}
          <div className="bg-porcelain border border-line rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-teal/10 text-teal rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Email & Authentication</h2>
                <p className="text-sm text-ink-3">Manage your login credentials and security</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.05em] text-ink-4 mb-3">Email Address</label>
                <div className="text-sm bg-paper p-4 rounded-lg border border-line font-mono text-ink break-all">
                  {user?.email || 'Not set'}
                </div>
                <p className="text-xs text-ink-3 mt-2">Your primary login email. Contact support to change it.</p>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  disabled
                  className="w-full px-4 py-3 bg-paper border-2 border-line text-ink rounded-lg font-semibold text-sm hover:bg-porcelain transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Change Email Address
                </button>
                <button
                  disabled
                  className="w-full px-4 py-3 bg-paper border-2 border-line text-ink rounded-lg font-semibold text-sm hover:bg-porcelain transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Change Password
                </button>
                <p className="text-xs text-ink-3">
                  Need help?{' '}
                  <Link href="/customer/support" className="text-teal font-semibold hover:underline">
                    Contact support
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Profile Information */}
          <div className="bg-porcelain border border-line rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-teal/10 text-teal rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Profile Information</h2>
                <p className="text-sm text-ink-3">View and manage your account details</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-paper p-4 rounded-lg border border-line">
                <label className="block text-xs font-bold uppercase tracking-[0.05em] text-ink-4 mb-2">Full Name</label>
                <p className="text-sm font-semibold text-ink">{profile?.full_name || 'Not set'}</p>
                <p className="text-xs text-ink-3 mt-1">This name is visible on your service requests.</p>
              </div>

              <div className="bg-paper p-4 rounded-lg border border-line">
                <label className="block text-xs font-bold uppercase tracking-[0.05em] text-ink-4 mb-2">Phone Number</label>
                <p className="text-sm font-semibold text-ink">{profile?.phone || 'Not set'}</p>
                <p className="text-xs text-ink-3 mt-1">Used to contact you about service appointments.</p>
              </div>

              <div className="bg-paper p-4 rounded-lg border border-line">
                <label className="block text-xs font-bold uppercase tracking-[0.05em] text-ink-4 mb-2">Account Type</label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal text-paper flex items-center justify-center text-xs font-bold">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-ink capitalize">
                    {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Customer'}
                  </span>
                </div>
                <p className="text-xs text-ink-3 mt-1">Your account role on the Feazy platform.</p>
              </div>
            </div>

            <Link href="/customer/profile/edit">
              <button className="w-full px-4 py-3 bg-teal text-paper rounded-lg font-semibold text-sm hover:bg-teal-dark transition flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile Information
              </button>
            </Link>
          </div>

          {/* Communication Preferences */}
          <div className="bg-porcelain border border-line rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-teal/10 text-teal rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Communication Preferences</h2>
                <p className="text-sm text-ink-3">Choose how and when we contact you</p>
              </div>
            </div>

            <div className="space-y-4">
              <SettingToggleClient
                id="email-notifications"
                label="Email notifications"
                description="Receive updates about your account, bookings, and services"
                defaultChecked={(profile?.notification_preferences as any)?.email_notifications !== false}
                settingKey="email_notifications"
              />
              <div className="border-t border-line"></div>
              <SettingToggleClient
                id="marketing-emails"
                label="Marketing emails"
                description="Receive tips, updates, and offers from Feazy"
                defaultChecked={(profile?.notification_preferences as any)?.marketing_emails === true}
                settingKey="marketing_emails"
              />
              <div className="border-t border-line"></div>
              <SettingToggleClient
                id="sms-notifications"
                label="SMS notifications"
                description="Receive service updates and reminders via text message"
                defaultChecked={(profile?.notification_preferences as any)?.sms_notifications === true}
                settingKey="sms_notifications"
              />
              <div className="border-t border-line"></div>
              <SettingToggleClient
                id="push-notifications"
                label="Push notifications"
                description="Receive notifications on your device"
                defaultChecked={(profile?.notification_preferences as any)?.push_notifications === true}
                settingKey="push_notifications"
              />
            </div>

            <div className="mt-6 pt-6 border-t border-line">
              <p className="text-xs text-ink-3">
                <span className="text-teal font-bold">✓</span> Your preferences are saved automatically. Essential account notifications remain enabled by default.
              </p>
            </div>
          </div>

          {/* Privacy & Data */}
          <div className="bg-porcelain border border-line rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-teal/10 text-teal rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Privacy & Data</h2>
                <p className="text-sm text-ink-3">Control how your data is used</p>
              </div>
            </div>

            <div className="space-y-4">
              <SettingToggleClient
                id="data-collection"
                label="Usage analytics"
                description="Allow us to analyze usage patterns to improve Feazy"
                defaultChecked={(profile?.notification_preferences as any)?.data_collection === true}
                settingKey="data_collection"
              />
              <div className="border-t border-line"></div>
              <SettingToggleClient
                id="data-sharing"
                label="Service optimization"
                description="Share data with service providers to improve matching"
                defaultChecked={(profile?.notification_preferences as any)?.data_sharing === true}
                settingKey="data_sharing"
              />
              <div className="border-t border-line"></div>
              <SettingToggleClient
                id="profile-visibility"
                label="Public profile"
                description="Allow professionals to see your profile and rating"
                defaultChecked={(profile?.notification_preferences as any)?.profile_visibility !== false}
                settingKey="profile_visibility"
              />
            </div>

            <div className="mt-6 pt-6 border-t border-line">
              <p className="text-xs text-ink-3">
                You can request your data or ask for deletion at any time by{' '}
                <Link href="/customer/support" className="text-teal font-semibold hover:underline">
                  contacting support
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Sessions & Security */}
          <div className="bg-porcelain border border-line rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-teal/10 text-teal rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Sessions & Security</h2>
                <p className="text-sm text-ink-3">View and manage your active sessions</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-paper p-4 rounded-lg border border-line">
                <p className="text-sm font-semibold text-ink-3 mb-1">
                  <span className="text-teal font-bold">✓</span> You're logged in on this device.
                </p>
                <p className="text-xs text-ink-3">
                  You have an active session. Your security is managed through your email and password.
                </p>
              </div>
              <button
                disabled
                className="w-full px-4 py-3 bg-paper border-2 border-line text-ink rounded-lg font-semibold text-sm hover:bg-porcelain transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View All Active Sessions (Coming Soon)
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 0v2m0-2v-2m0 0V9m0 2a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-600">Danger Zone</h2>
                <p className="text-sm text-red-600/70">These actions cannot be undone. Please be careful.</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                disabled
                className="w-full px-4 py-3 bg-red-50 border-2 border-red-300 text-red-600 rounded-lg font-semibold text-sm hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Account (Coming Soon)
              </button>
              <p className="text-xs text-red-600/70">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Help Section */}
          <div className="text-center py-6 border-t border-line">
            <p className="text-sm text-ink-3 mb-4">
              Have questions about your account or need assistance?
            </p>
            <Link href="/customer/support">
              <button className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal text-paper rounded-lg font-semibold hover:bg-teal-dark transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Contact Support
              </button>
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
