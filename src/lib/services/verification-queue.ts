/**
 * The admin verification queue. Not a server-action module: it is read by the server page only and
 * cannot be called from the browser. Requires the admin role, checked before the service-role client
 * is created.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import type {
  DocumentType,
  PendingProfessional,
  VerificationDocument,
  VerificationStatus,
} from './verification';

type VerificationRow = {
  id: string;
  professional_id: string;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
};

/**
 * Fetch all professionals whose verification_status is not 'verified' or 'suspended'.
 * Returns profile info, latest verification record, and its documents.
 */
export async function getUnverifiedProfessionals(): Promise<{
  data: PendingProfessional[];
  error: string | null;
}> {
  const auth = await requireAdmin();
  if ('error' in auth) return { data: [], error: auth.error };

  try {
    const adminClient = await createTypedAdminClient();

    // All non-verified, non-suspended professionals
    const { data: professionals, error: profError } = await adminClient
      .from('professional_profiles')
      .select(
        `user_id, display_name, bio, years_experience, verification_status, created_at,
         profiles!professional_profiles_user_id_fkey (full_name, email)`,
      )
      .not('verification_status', 'in', '("verified","suspended")')
      .order('created_at', { ascending: false });

    if (profError) {
      console.error('[Verification] Failed to fetch professionals:', profError);
      return { data: [], error: profError.message };
    }

    if (!professionals || professionals.length === 0) {
      return { data: [], error: null };
    }

    const professionalIds = professionals.map((p) => p.user_id);

    // Latest verification for each professional
    const { data: verificationsRaw } = await adminClient
      .from('professional_verifications')
      .select('id, professional_id, status, submitted_at, rejection_reason, notes')
      .in('professional_id', professionalIds)
      .order('created_at', { ascending: false });

    const verifications: VerificationRow[] = verificationsRaw ?? [];

    // Documents for those verifications
    const verificationIds = verifications.map((v) => v.id);
    let documents: Array<VerificationDocument & { verification_id: string }> = [];
    if (verificationIds.length) {
      const { data: docsRaw } = await adminClient
        .from('professional_verification_documents')
        .select('id, verification_id, document_type, storage_path, status, uploaded_at, reviewer_notes')
        .in('verification_id', verificationIds)
        .order('uploaded_at', { ascending: false });
      documents = (docsRaw ?? []).map((doc) => ({
        id: doc.id,
        verification_id: doc.verification_id,
        document_type: doc.document_type as DocumentType,
        storage_path: doc.storage_path,
        status: doc.status as 'pending' | 'accepted' | 'rejected',
        uploaded_at: doc.uploaded_at,
        reviewer_notes: doc.reviewer_notes,
      }));
    }

    // Build look-ups
    const verificationByPro = new Map<string, VerificationRow>();
    for (const v of verifications) {
      if (!verificationByPro.has(v.professional_id)) {
        verificationByPro.set(v.professional_id, v);
      }
    }

    const docsByVerification = new Map<string, VerificationDocument[]>();
    for (const { verification_id, ...doc } of documents) {
      const list = docsByVerification.get(verification_id) ?? [];
      list.push(doc);
      docsByVerification.set(verification_id, list);
    }

    const result: PendingProfessional[] = professionals.map((p) => {
      const profileData = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      const latestVerification = verificationByPro.get(p.user_id) ?? null;
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        bio: p.bio,
        years_experience: p.years_experience,
        verification_status: p.verification_status as VerificationStatus,
        created_at: p.created_at ?? '',
        full_name: profileData?.full_name ?? null,
        email: profileData?.email ?? null,
        verification_id: latestVerification?.id ?? null,
        submitted_at: latestVerification?.submitted_at ?? null,
        rejection_reason: latestVerification?.rejection_reason ?? null,
        notes: latestVerification?.notes ?? null,
        documents: latestVerification ? (docsByVerification.get(latestVerification.id) ?? []) : [],
      };
    });

    return { data: result, error: null };
  } catch (err) {
    console.error('[Verification] Unexpected error in getUnverifiedProfessionals:', err);
    return { data: [], error: 'Failed to load verification queue' };
  }
}
