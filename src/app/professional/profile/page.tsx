import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  CircleAlert,
  IndianRupee,
  LifeBuoy,
  Mail,
  Pencil,
  Phone,
  ShieldAlert,
  Star,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getProfessionalProfileView } from '@/lib/services/professional-profile';
import { getProfessionalShell } from '@/lib/services/shell';
import { PLATFORM_TIME_ZONE, verificationNotice } from '@/lib/shell/rules';
import { PageContainer, Panel } from '@/components/shell/primitives';
import { MobileSignOutButton } from '@/components/shared/MobileSignOutButton';

export const metadata = {
  title: 'Profile — Feazy Professional',
};

const NOTICE_TONE = {
  ochre: 'border-ochre/30 bg-ochre-soft',
  blue: 'border-blue/30 bg-blue-soft',
  danger: 'border-danger/30 bg-danger-soft',
} as const;

export default async function ProfessionalProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?next=/professional/profile');

  const [view, shell] = await Promise.all([getProfessionalProfileView(user.id), getProfessionalShell(user.id)]);
  const name = view.displayName || view.fullName || user.email?.split('@')[0] || 'Professional';
  const verified = view.verificationStatus === 'verified';
  const notice = verificationNotice(view.verificationStatus, shell.rejectionReason);
  const memberSince = view.memberSince
    ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: PLATFORM_TIME_ZONE }).format(
        new Date(view.memberSince),
      )
    : null;

  return (
    <PageContainer className="max-w-4xl">
      <p className="text-sm font-medium text-ink-3">Account</p>
      <h1 className="mt-1 font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-4xl">
        Your profile
      </h1>

      {view.error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Some of your profile didn’t load. Refresh the page to try again.</p>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {/* Identity */}
        <section className="overflow-hidden rounded-3xl border border-line bg-paper">
          <div className="h-20 bg-gradient-to-r from-teal-deep to-teal md:h-24" aria-hidden="true" />
          <div className="-mt-10 flex flex-col gap-5 px-6 pb-6 md:-mt-12 md:flex-row md:items-end md:px-8 md:pb-8">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-paper bg-teal-wash font-editorial text-3xl font-semibold text-teal md:h-24 md:w-24">
              {view.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage on any host
                <img src={view.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-editorial text-2xl font-semibold text-ink md:text-3xl">{name}</h2>
                {verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-wash px-2.5 text-xs font-semibold leading-6 text-teal">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ochre-soft px-2.5 text-xs font-semibold leading-6 text-ochre">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    Not verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-3">
                {[
                  view.yearsExperience != null
                    ? `${view.yearsExperience} ${view.yearsExperience === 1 ? 'year' : 'years'} of experience`
                    : null,
                  memberSince ? `On Feazy since ${memberSince}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Professional'}
              </p>
            </div>
            <Link
              href="/professional/profile/edit"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-paper hover:bg-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit profile
            </Link>
          </div>
        </section>

        {notice && (
          <div className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center ${NOTICE_TONE[notice.tone]}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{notice.title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{notice.body}</p>
            </div>
            {view.verificationStatus !== 'suspended' && (
              <Link
                href="/professional/onboarding"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line bg-paper px-4 text-sm font-semibold text-ink hover:bg-paper-2"
              >
                Open verification
              </Link>
            )}
          </div>
        )}

        {/* Stats */}
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            Icon={Briefcase}
            label="Jobs completed"
            value={view.completedJobs === null ? '—' : String(view.completedJobs)}
          />
          <Stat
            Icon={Star}
            label="Rating"
            value={view.ratingAverage === null ? 'No ratings yet' : `${view.ratingAverage.toFixed(1)} / 5`}
            muted={view.ratingAverage === null}
          />
          <div className="col-span-2 md:col-span-1">
            <Stat
              Icon={Wrench}
              label="Status"
              value={view.isAvailable ? 'Online' : 'Offline'}
              detail={view.isAvailable ? 'New requests can reach you' : 'You won’t get new requests'}
            />
          </div>
        </dl>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Contact */}
          <Panel className="p-6">
            <h3 className="text-base font-semibold text-ink">Contact</h3>
            <p className="mt-0.5 text-sm text-ink-3">Your phone is shared with a customer once you accept their job.</p>
            <div className="mt-4 space-y-3">
              <ContactTile Icon={Mail} label="Email" value={user.email ?? null} hint="Sign-in and account email" />
              <ContactTile
                Icon={Phone}
                label="Phone"
                value={view.phone}
                hint={view.phone ? 'Customers can call you on active jobs' : 'Add one so customers can reach you'}
                missing={!view.phone}
              />
            </div>
          </Panel>

          {/* About */}
          <Panel className="p-6">
            <h3 className="text-base font-semibold text-ink">About</h3>
            {view.bio ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink-2">{view.bio}</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-ink-3">
                No bio yet. A couple of lines about your experience helps customers know who is coming.
              </p>
            )}
            <h3 className="mt-6 text-base font-semibold text-ink">Skills</h3>
            <p className="mt-0.5 text-sm text-ink-3">Your skills decide which bookings can be offered to you.</p>
            {view.skills.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {view.skills.map((s) => (
                  <li key={s.categoryId} className="rounded-full bg-teal-wash px-3 text-sm font-medium leading-7 text-teal">
                    {s.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl bg-ochre-soft px-3 py-2 text-sm text-ochre">
                No skills yet, so no bookings can match you.
              </p>
            )}
          </Panel>
        </div>

        {/* Quick links */}
        <nav aria-label="Account shortcuts" className="overflow-hidden rounded-3xl border border-line bg-paper">
          <ul className="divide-y divide-line">
            <QuickLink href="/professional/profile/edit" Icon={Pencil} label="Edit profile" hint="Name, phone, bio and skills" />
            <QuickLink href="/professional/earnings" Icon={IndianRupee} label="Earnings" hint="Job value, paid and payment due" />
            <QuickLink href="/professional/support" Icon={LifeBuoy} label="Help & support" hint="How jobs work, and how to reach us" />
          </ul>
        </nav>

        <div className="md:hidden">
          <Panel className="p-6">
            <h3 className="text-base font-semibold text-ink">Session</h3>
            <p className="mt-0.5 mb-3 text-sm text-ink-3">Sign out of your account on this device.</p>
            <MobileSignOutButton />
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}

function Stat({
  Icon,
  label,
  value,
  detail,
  muted,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  muted?: boolean;
}) {
  return (
    <div className="h-full rounded-2xl border border-line bg-paper p-4">
      <dt className="flex items-center gap-2 text-sm text-ink-3">
        <Icon className="h-4 w-4 text-ink-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className={`mt-2 font-semibold tabular-nums ${muted ? 'text-base text-ink-3' : 'text-2xl text-ink'}`}>{value}</dd>
      {detail && <dd className="mt-0.5 text-xs text-ink-3">{detail}</dd>}
    </div>
  );
}

function ContactTile({
  Icon,
  label,
  value,
  hint,
  missing,
}: {
  Icon: LucideIcon;
  label: string;
  value: string | null;
  hint: string;
  missing?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-paper-2/70 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-teal">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-4">{label}</p>
        <p className={`break-all text-sm font-medium ${missing ? 'text-ink-3' : 'text-ink'}`}>{value ?? 'Not set'}</p>
        <p className={`text-xs ${missing ? 'text-ochre' : 'text-ink-3'}`}>{hint}</p>
      </div>
    </div>
  );
}

function QuickLink({ href, Icon, label, hint }: { href: string; Icon: LucideIcon; label: string; hint: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-16 items-center gap-4 px-6 py-3 hover:bg-paper-2/60 focus-visible:bg-paper-2 focus-visible:outline-none"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-wash text-teal">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="block text-xs text-ink-3">{hint}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
      </Link>
    </li>
  );
}
