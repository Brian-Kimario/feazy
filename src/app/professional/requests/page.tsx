import { redirect } from 'next/navigation';
import { CircleAlert, Inbox, Lock, PowerOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getProfessionalShell } from '@/lib/services/shell';
import { verificationNotice } from '@/lib/shell/rules';
import { EmptyState, PageContainer, PageHeader } from '@/components/shell/primitives';
import { RequestCard } from '@/components/professional/RequestCard';

export const metadata = {
  title: 'Requests — Feazy',
};

export default async function RequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/professional/requests');

  const shell = await getProfessionalShell(user.id);
  const notice = verificationNotice(shell.verificationStatus, shell.rejectionReason);
  const now = new Date();
  const requests = shell.requests;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Requests"
        description="Jobs offered to you. Each offer is held for you for a limited time, then passed to another professional."
      />

      {notice ? (
        <EmptyState
          icon={Lock}
          title="Requests are locked"
          body={`${notice.title}. You’ll start receiving job requests once an admin verifies your profile.`}
          action={{ href: '/professional/profile', label: 'View verification' }}
        />
      ) : (
        <>
          {shell.error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>We couldn’t load your requests just now. Refresh the page to try again.</p>
            </div>
          )}

          {!shell.isAvailable && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm text-ink-2">
              <PowerOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
              <p>
                <span className="font-semibold text-ink">You’re offline.</span> New requests won’t reach you until you
                switch to Online in the top bar.
              </p>
            </div>
          )}

          {requests.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No requests right now"
              body={
                shell.isAvailable
                  ? 'New offers that match your skills and working hours will appear here.'
                  : 'Go online to start receiving offers.'
              }
              secondary={{ href: '/professional/jobs', label: 'View your jobs' }}
            />
          ) : (
            <ul className="space-y-3" aria-label={`${requests.length} open ${requests.length === 1 ? 'request' : 'requests'}`}>
              {requests.map((job) => (
                <li key={job.id}>
                  <RequestCard job={job} serverNow={now.getTime()} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageContainer>
  );
}
