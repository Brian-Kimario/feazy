import type { createClient } from '@/lib/supabase/server';

/**
 * Calls admin_transition_professional_verification. The function requires the status the admin saw
 * (p_expected_status) so stale requests fail; the current status is read here immediately before.
 */
export async function adminTransition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  professionalId: string,
  action: 'approve' | 'reject' | 'suspend' | 'reactivate',
  reason: string,
): Promise<{ error: { message: string } | null }> {
  const { data: profile, error: readError } = await supabase
    .from('professional_profiles')
    .select('verification_status')
    .eq('user_id', professionalId)
    .maybeSingle();
  if (readError || !profile) return { error: { message: 'Professional not found' } };

  // @ts-ignore - RPC not in generated types
  const { error } = await supabase.rpc('admin_transition_professional_verification', {
    p_professional_id: professionalId,
    p_action: action,
    p_expected_status: (profile as { verification_status: string }).verification_status,
    p_reason: reason,
    p_metadata: {},
  });
  return { error: error ? { message: error.message } : null };
}
