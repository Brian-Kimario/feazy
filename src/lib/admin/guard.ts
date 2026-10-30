import { createClient } from '@/lib/supabase/server';
import { adminFailure, type AdminResult } from './result';

export interface AdminActor {
  userId: string;
}

/**
 * The one place that decides "is the caller an admin". Reads the session and the caller's own
 * profile row with the user-scoped client, so the role comes from the database and never from
 * client input. Call this before any service-role client is created.
 */
export async function getAdminActor(): Promise<AdminResult<AdminActor>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return adminFailure('UNAUTHENTICATED', 'Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) return adminFailure('FORBIDDEN', 'Not authorised — admin only');
  if (profile.role !== 'admin') return adminFailure('FORBIDDEN', 'Not authorised — admin only');

  return { ok: true, data: { userId: user.id } };
}
