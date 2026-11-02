import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { jobCodePurpose, type JobCodePurpose } from '@/validators';

/**
 * What the code stage of a job looks like to the signed-in party. `code` is present only for the
 * customer and only while the code is active; the professional never receives it.
 */
export interface JobCodeState {
  purpose: JobCodePurpose;
  status: 'none' | 'active' | 'used' | 'locked' | 'expired' | 'superseded' | 'invalidated';
  expiresAt: string | null;
  attemptsLeft: number | null;
  reissuesLeft: number;
  code: string | null;
}

const rpcShape = z.object({
  purpose: jobCodePurpose.nullable(),
  status: z.enum(['none', 'active', 'used', 'locked', 'expired', 'superseded', 'invalidated']).optional(),
  expires_at: z.string().nullish(),
  attempts_left: z.number().nullish(),
  reissues_left: z.number().optional(),
  code: z.string().nullish(),
});

export function parseJobCodeState(raw: unknown): JobCodeState | null {
  const parsed = rpcShape.safeParse(raw);
  if (!parsed.success || !parsed.data.purpose) return null;
  const d = parsed.data;
  return {
    purpose: d.purpose as JobCodePurpose,
    status: d.status ?? 'none',
    expiresAt: d.expires_at ?? null,
    attemptsLeft: d.attempts_left ?? null,
    reissuesLeft: d.reissues_left ?? 0,
    code: d.code ?? null,
  };
}

/** Null when the job is not at a stage that uses a code, or the state could not be read. */
export async function getJobCodeState(jobId: string): Promise<JobCodeState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_job_code_state', { p_job_id: jobId });
  if (error) {
    console.error('get_job_code_state error:', error.message);
    return null;
  }
  return parseJobCodeState(data);
}

/** When the customer reported a no-show on this job, or null if they have not. Read under their own RLS. */
export async function getNoShowReportedAt(jobId: string): Promise<{ reportedAt: string; status: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('job_exceptions')
    .select('reported_at, status')
    .eq('job_id', jobId)
    .eq('kind', 'professional_no_show')
    .maybeSingle();
  if (error) {
    console.error('getNoShowReportedAt error:', error.message);
    return null;
  }
  return data ? { reportedAt: data.reported_at, status: data.status } : null;
}

/** The customer's cancellation request for a job, if any. `open` means it is under review by Fixify. */
export async function getCancellationReviewStatus(jobId: string): Promise<{ status: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('job_exceptions')
    .select('status')
    .eq('job_id', jobId)
    .eq('kind', 'customer_cancellation_request')
    .maybeSingle();
  if (error) {
    console.error('getCancellationReviewStatus error:', error.message);
    return null;
  }
  return data ? { status: data.status } : null;
}
