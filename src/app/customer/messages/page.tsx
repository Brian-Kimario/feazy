import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMessageInbox } from '@/lib/services/messages';
import { PageContainer, PageHeader } from '@/components/shell/primitives';
import { MessageInbox } from '@/components/messages/MessageInbox';

export const metadata = { title: 'Messages — Feazy' };

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const inbox = await getMessageInbox(user.id, 'customer');
  return (
    <PageContainer className="max-w-3xl pb-28 md:pb-10">
      <PageHeader title="Messages" description="Your conversations, one for each job." />
      <MessageInbox
        threads={inbox.threads}
        error={inbox.error}
        emptyBody="Messages appear here once a professional has accepted your booking."
      />
    </PageContainer>
  );
}
