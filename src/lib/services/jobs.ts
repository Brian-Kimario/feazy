'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canTransition } from '@/lib/jobs/states';

/** Targets a professional may request here; `quote_pending` goes through the quote flow. */
const PRO_TARGETS: ReadonlySet<string> = new Set(['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled']);

export type TransitionResult =
  | { success: true; jobId: string; newState: string }
  | { success: false; error: string };

/**
 * updateJobState — Server action for professional job state transitions.
 *
 * Validates the actor is the assigned professional for this job,
 * then delegates to the DB-level transition_job_state() function which
 * enforces state machine rules, writes the job_events log, and sets timestamps.
 *
 * Never trusts client input for ownership or allowed states.
 */
export async function updateJobState(
  jobId: string,
  newState: string,
): Promise<TransitionResult> {
  const supabase = await createClient();

  // 1. Authenticate
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Not authenticated. Please log in again.' };
  }

  // A professional no longer cancels a job directly: stepping away goes through
  // professional_withdraw_from_job, which decides withdraw vs admin review and keeps the booking alive.
  if (newState === 'cancelled') {
    return { success: false, error: 'Use "Withdraw from job" to step away from this job.' };
  }

  // 2. Load current job state from DB — never trust client-submitted state
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, current_state, professional_id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return { success: false, error: 'Job not found or access denied.' };
  }

  // 3. Authorize — only the assigned professional may transition
  if (job.professional_id !== user.id) {
    return { success: false, error: 'You are not authorized to update this job.' };
  }

  // 4. Verify professional is verified before allowing job acceptance
  // (HIGH PRIORITY: Server-side enforcement per owner decision)
  if (newState === 'accepted') {
    const { data: professional, error: profError } = await supabase
      .from('professional_profiles')
      .select('verification_status')
      .eq('user_id', user.id)
      .single();

    if (profError || !professional) {
      return { success: false, error: 'Professional profile not found.' };
    }

    if (professional.verification_status !== 'verified') {
      return {
        success: false,
        error: 'You must complete professional verification before accepting jobs.',
      };
    }
  }

  // 5. Server-side transition guard (belt-and-suspenders before hitting DB function)
  if (!PRO_TARGETS.has(newState) || !canTransition(job.current_state, newState)) {
    return {
      success: false,
      error: `Transition from "${job.current_state}" to "${newState}" is not allowed.`,
    };
  }

  // 6. Call the DB function — it validates again, updates state, sets timestamps,
  //    and inserts an immutable job_events record (per security.md rule 3.3)
  const { error: rpcError } = await supabase.rpc('transition_job_state', {
    p_job_id:        jobId,
    p_new_state:     newState,
    p_actor_user_id: user.id,
  });

  if (rpcError) {
    // Surface a clean error — the RPC raises an EXCEPTION on invalid transitions
    return { success: false, error: rpcError.message ?? 'State transition failed.' };
  }

  // 7. Invalidate Next.js cache so the detail page reflects the new state
  revalidatePath(`/professional/jobs/${jobId}`);
  revalidatePath('/professional/jobs');

  return { success: true, jobId, newState };
}
