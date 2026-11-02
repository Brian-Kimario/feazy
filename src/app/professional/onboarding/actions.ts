'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type VerificationStatus = 'pending' | 'documents_submitted' | 'under_review' | 'verified' | 'rejected' | 'suspended';

export interface ProfessionalVerificationData {
  user_id: string;
  display_name: string;
  years_experience: number;
  verification_status: VerificationStatus;
  is_available: boolean;
  created_at: string;
  verification_details: {
    status: VerificationStatus;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
  } | null;
}

/**
 * Get professional verification status and details
 */
export async function getProfessionalVerificationData(): Promise<{
  data: ProfessionalVerificationData | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        data: null,
        error: 'Not authenticated',
      };
    }

    // Get professional profile
    const { data: profile, error: profileError } = await supabase
      .from('professional_profiles')
      .select('user_id, display_name, years_experience, verification_status, is_available, created_at')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      return {
        data: null,
        error: profileError.message,
      };
    }

    // Get verification details
    const { data: verification, error: verificationError } = await supabase
      .from('professional_verifications')
      .select('status, submitted_at, reviewed_at, rejection_reason')
      .eq('professional_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verificationError && verificationError.code !== 'PGRST116') {
      console.warn('Error fetching verification details:', verificationError);
    }

    return {
      data: {
        ...profile,
        verification_status: (profile.verification_status as VerificationStatus),
        verification_details: verification ? {
          ...verification,
          status: (verification.status as VerificationStatus),
        } : null,
      },
      error: null,
    };
  } catch (err) {
    console.error('[Onboarding] Error fetching verification data:', err);
    return {
      data: null,
      error: 'Failed to load verification status',
    };
  }
}

/**
 * Get verification status description for UI
 */
export function getVerificationStatusDescription(status: VerificationStatus): {
  title: string;
  description: string;
  icon: string;
} {
  switch (status) {
    case 'pending':
      return {
        title: 'Verification Pending',
        description: 'Complete your professional profile and submit required documents to start accepting jobs.',
        icon: '⏳',
      };
    case 'documents_submitted':
      return {
        title: 'Documents Under Review',
        description: 'We\'re verifying your credentials. This usually takes 1-2 business days. We\'ll notify you when verification is complete.',
        icon: '📋',
      };
    case 'under_review':
      return {
        title: 'Under Review',
        description: 'Our team is reviewing your credentials to ensure quality and safety standards.',
        icon: '👀',
      };
    case 'verified':
      return {
        title: 'Verified Professional',
        description: 'Your account is verified and ready to accept jobs.',
        icon: '✓',
      };
    case 'rejected':
      return {
        title: 'Verification Rejected',
        description: 'Unfortunately, we were unable to verify your account at this time. Please contact support for more information.',
        icon: '❌',
      };
    case 'suspended':
      return {
        title: 'Account Suspended',
        description: 'Your account has been suspended. Please contact support.',
        icon: '⛔',
      };
    default:
      return {
        title: 'Unknown Status',
        description: 'Unable to determine verification status.',
        icon: '❓',
      };
  }
}
