'use server';

/**
 * Verification Service — Professional Verification Workflow
 *
 * Security model:
 * - Professionals can upload their own documents (RLS + user check).
 * - Only admin can approve / reject (server-side role check + admin client).
 * - All approve / reject actions are written to audit_logs.
 *
 * NOTE: @ts-ignore comments below suppress Supabase SDK "never" type errors that
 * occur because no generated database types are present in this project. This is
 * consistent with the pattern used throughout the codebase (see admin.ts).
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { adminTransition } from './verification-transition';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentType = 'license' | 'insurance' | 'id' | 'background_check' | 'other';

export type VerificationStatus =
  | 'pending'
  | 'documents_submitted'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'suspended';

export interface VerificationDocument {
  id: string;
  document_type: DocumentType;
  storage_path: string;
  status: 'pending' | 'accepted' | 'rejected';
  uploaded_at: string;
  reviewer_notes: string | null;
}

export interface PendingProfessional {
  user_id: string;
  display_name: string;
  bio: string | null;
  years_experience: number | null;
  verification_status: VerificationStatus;
  created_at: string;
  full_name: string | null;
  email: string | null;
  verification_id: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  documents: VerificationDocument[];
}

export interface UploadDocumentResult {
  success: boolean;
  error: string | null;
  documentId?: string;
}

export interface VerificationActionResult {
  success: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Upload a verification document (professional action)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a verification document to Supabase Storage and record it in the DB.
 *
 * Flow:
 *  1. Authenticate caller and confirm they are a professional.
 *  2. Ensure a professional_verifications row exists (create if needed).
 *  3. Upload the file to the `verification-documents` bucket.
 *  4. Insert a professional_verification_documents row.
 *  5. Bump professional_verifications.status → documents_submitted.
 *  6. Bump professional_profiles.verification_status → documents_submitted.
 */
export async function uploadVerificationDocument(
  formData: FormData,
): Promise<UploadDocumentResult> {
  try {
    const supabase = await createClient();
    const adminClient = await createAdminClient();

    // ── Auth ─────────────────────────────────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // ── Confirm professional role ─────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || (profile as any).role !== 'professional') {
      return { success: false, error: 'Not authorised — professionals only' };
    }

    // ── Parse form data ───────────────────────────────────────────────────────
    const file = formData.get('file') as File | null;
    const docType = formData.get('docType') as DocumentType | null;

    if (!file || !docType) {
      return { success: false, error: 'Missing file or document type' };
    }

    const validTypes: DocumentType[] = ['license', 'insurance', 'id', 'background_check', 'other'];
    if (!validTypes.includes(docType)) {
      return { success: false, error: 'Invalid document type' };
    }

    // 10 MB limit
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File exceeds 10 MB limit' };
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.type)) {
      return { success: false, error: 'Unsupported file type. Use JPEG, PNG, WEBP or PDF.' };
    }

    // ── Ensure verification record ────────────────────────────────────────────
    // @ts-ignore - Supabase SDK type inference issue (no generated DB types)
    const { data: verification } = await supabase
      .from('professional_verifications')
      .select('id')
      .eq('professional_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let verificationId: string;

    if (!verification) {
      // @ts-ignore - Supabase SDK type inference issue
      const { data: newVerification, error: insertError } = await (adminClient as any)
        .from('professional_verifications')
        .insert({
          professional_id: user.id,
          status: 'documents_submitted',
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !newVerification) {
        console.error('[Verification] Failed to create verification record:', insertError);
        return { success: false, error: 'Failed to initialise verification record' };
      }
      verificationId = (newVerification as any).id;
    } else {
      verificationId = (verification as any).id;
    }

    // ── Upload to Storage ─────────────────────────────────────────────────────
    const ext = file.name.split('.').pop() ?? 'bin';
    const storagePath = `${user.id}/${docType}/${Date.now()}.${ext}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: storageError } = await adminClient.storage
      .from('verification-documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      console.error('[Verification] Storage upload failed:', storageError);
      return { success: false, error: 'Failed to upload file. Please try again.' };
    }

    // ── Insert document record ────────────────────────────────────────────────
    // @ts-ignore - Supabase SDK type inference issue
    const { data: docRecord, error: docInsertError } = await (adminClient as any)
      .from('professional_verification_documents')
      .insert({
        verification_id: verificationId,
        document_type: docType,
        storage_path: storagePath,
        status: 'pending',
        uploaded_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (docInsertError) {
      console.error('[Verification] Failed to insert document record:', docInsertError);
      return { success: false, error: 'Failed to record document. Contact support.' };
    }

    // ── Submit for review via the verification state machine ─────────────────
    // Idempotent: returns changed=false when the status cannot move (already submitted, or
    // required documents still missing), so it is safe to call after every upload.
    // @ts-ignore - RPC not in generated types
    const { error: statusError } = await supabase.rpc('submit_professional_verification');

    if (statusError) {
      console.error('[Verification] Failed to submit verification:', statusError);
      return { success: false, error: 'Failed to update verification status. Contact support.' };
    }

    // @ts-ignore - Supabase SDK type inference issue
    await (adminClient as any)
      .from('professional_verifications')
      .update({
        status: 'documents_submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', verificationId);

    revalidatePath('/professional/onboarding');
    return { success: true, error: null, documentId: (docRecord as any).id };
  } catch (err) {
    console.error('[Verification] Unexpected error in uploadVerificationDocument:', err);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Get professionals pending verification (admin action)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all professionals whose verification_status is not 'verified' or 'suspended'.
 * Returns profile info, latest verification record, and its documents.
 *
 * Requires: admin role.
 */
export async function getUnverifiedProfessionals(): Promise<{
  data: PendingProfessional[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Not authenticated' };

    // Server-side admin check
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!actorProfile || (actorProfile as any).role !== 'admin') {
      return { data: [], error: 'Not authorised' };
    }

    const adminClient = await createAdminClient();

    // All non-verified, non-suspended professionals
    // @ts-ignore - Supabase SDK type inference issue
    const { data: professionalsRaw, error: profError } = await (adminClient as any)
      .from('professional_profiles')
      .select(
        `user_id, display_name, bio, years_experience, verification_status, created_at,
         profiles!professional_profiles_user_id_fkey (full_name, email)`,
      )
      .not('verification_status', 'in', '("verified","suspended")')
      .order('created_at', { ascending: false });

    if (profError) {
      console.error('[Verification] Failed to fetch professionals:', profError);
      return { data: [], error: (profError as any).message };
    }

    const professionals: any[] = professionalsRaw ?? [];

    if (professionals.length === 0) {
      return { data: [], error: null };
    }

    const professionalIds = professionals.map((p: any) => p.user_id);

    // Latest verification for each professional
    // @ts-ignore - Supabase SDK type inference issue
    const { data: verificationsRaw } = await (adminClient as any)
      .from('professional_verifications')
      .select('id, professional_id, status, submitted_at, rejection_reason, notes')
      .in('professional_id', professionalIds)
      .order('created_at', { ascending: false });

    const verifications: any[] = verificationsRaw ?? [];

    // Documents for those verifications
    const verificationIds = verifications.map((v: any) => v.id);
    let documents: any[] = [];
    if (verificationIds.length) {
      // @ts-ignore - Supabase SDK type inference issue
      const { data: docsRaw } = await adminClient
        .from('professional_verification_documents')
        .select('id, verification_id, document_type, storage_path, status, uploaded_at, reviewer_notes')
        .in('verification_id', verificationIds)
        .order('uploaded_at', { ascending: false });
      documents = docsRaw ?? [];
    }

    // Build look-ups
    const verificationByPro = new Map<string, any>();
    for (const v of verifications) {
      if (!verificationByPro.has(v.professional_id)) {
        verificationByPro.set(v.professional_id, v);
      }
    }

    const docsByVerification = new Map<string, VerificationDocument[]>();
    for (const doc of documents) {
      if (!docsByVerification.has(doc.verification_id)) {
        docsByVerification.set(doc.verification_id, []);
      }
      docsByVerification.get(doc.verification_id)!.push({
        id: doc.id,
        document_type: doc.document_type as DocumentType,
        storage_path: doc.storage_path,
        status: doc.status as 'pending' | 'accepted' | 'rejected',
        uploaded_at: doc.uploaded_at,
        reviewer_notes: doc.reviewer_notes,
      });
    }

    const result: PendingProfessional[] = professionals.map((p: any) => {
      const profileData = p.profiles as { full_name: string | null; email: string | null } | null;
      const latestVerification = verificationByPro.get(p.user_id) ?? null;
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        bio: p.bio,
        years_experience: p.years_experience,
        verification_status: p.verification_status as VerificationStatus,
        created_at: p.created_at,
        full_name: profileData?.full_name ?? null,
        email: profileData?.email ?? null,
        verification_id: latestVerification?.id ?? null,
        submitted_at: latestVerification?.submitted_at ?? null,
        rejection_reason: latestVerification?.rejection_reason ?? null,
        notes: latestVerification?.notes ?? null,
        documents: latestVerification
          ? (docsByVerification.get(latestVerification.id) ?? [])
          : [],
      };
    });

    return { data: result, error: null };
  } catch (err) {
    console.error('[Verification] Unexpected error in getUnverifiedProfessionals:', err);
    return { data: [], error: 'Failed to load verification queue' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Approve a professional (admin action)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set professional_profiles.verification_status → 'verified'.
 * Updates the verification record and writes an audit log.
 *
 * Security rules:
 * - Professional CANNOT call this on themselves (server role check).
 * - Uses admin client to bypass RLS for write.
 */
export async function approveProfessional(
  professionalId: string,
): Promise<VerificationActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Must be admin
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!actorProfile || (actorProfile as any).role !== 'admin') {
      return { success: false, error: 'Not authorised — admin only' };
    }

    // Admin transition through the verification state machine (actor derived from the session).
    const { error: stateError } = await adminTransition(supabase, professionalId, 'approve', 'Admin approved professional verification');

    if (stateError) {
      console.error('[Verification] Failed to transition verification status:', stateError);
      return { success: false, error: (stateError as any).message };
    }

    const adminClient = await createAdminClient();

    // Update the latest verification record
    // @ts-ignore - Supabase SDK type inference issue
    const { data: latestVerif } = await (adminClient as any)
      .from('professional_verifications')
      .select('id')
      .eq('professional_id', professionalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVerif?.id) {
      // @ts-ignore - Supabase SDK type inference issue
      await (adminClient as any)
        .from('professional_verifications')
        .update({
          status: 'verified',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', latestVerif.id);
    }

    // Audit log
    // @ts-ignore - Supabase SDK type inference issue
    await (adminClient as any).from('audit_logs').insert({
      user_id: professionalId,
      action: 'professional_verified',
      changes: { verification_status: 'verified', reviewed_by: user.id },
      created_by: user.id,
    });

    revalidatePath('/admin/professionals');
    return { success: true, error: null };
  } catch (err) {
    console.error('[Verification] Unexpected error in approveProfessional:', err);
    return { success: false, error: 'Failed to approve professional' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reject a professional (admin action)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set professional_profiles.verification_status → 'rejected'.
 * Persists rejection_reason and writes an audit log.
 */
export async function rejectProfessional(
  professionalId: string,
  reason: string,
): Promise<VerificationActionResult> {
  try {
    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'Please provide a rejection reason (min 5 characters)' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Must be admin
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!actorProfile || (actorProfile as any).role !== 'admin') {
      return { success: false, error: 'Not authorised — admin only' };
    }

    // Admin transition through the verification state machine (actor derived from the session).
    const { error: stateError } = await adminTransition(supabase, professionalId, 'reject', reason);

    if (stateError) {
      console.error('[Verification] Failed to transition verification status:', stateError);
      return { success: false, error: (stateError as any).message };
    }

    const adminClient = await createAdminClient();

    // Update verification record
    // @ts-ignore - Supabase SDK type inference issue
    const { data: latestVerif } = await (adminClient as any)
      .from('professional_verifications')
      .select('id')
      .eq('professional_id', professionalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVerif?.id) {
      // @ts-ignore - Supabase SDK type inference issue
      await (adminClient as any)
        .from('professional_verifications')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: reason.trim(),
        })
        .eq('id', latestVerif.id);
    }

    // Audit log
    // @ts-ignore - Supabase SDK type inference issue
    await (adminClient as any).from('audit_logs').insert({
      user_id: professionalId,
      action: 'professional_rejected',
      changes: {
        verification_status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: user.id,
      },
      created_by: user.id,
    });

    revalidatePath('/admin/professionals');
    return { success: true, error: null };
  } catch (err) {
    console.error('[Verification] Unexpected error in rejectProfessional:', err);
    return { success: false, error: 'Failed to reject professional' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Generate a signed URL for a verification document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a short-lived signed URL (1 hour) to view a verification document.
 * Allowed for the document owner (professional) or any admin.
 */
export async function getDocumentSignedUrl(storagePath: string): Promise<{
  url: string | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { url: null, error: 'Not authenticated' };

    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isOwner = storagePath.startsWith(`${user.id}/`);
    const isAdmin = (actorProfile as any)?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return { url: null, error: 'Not authorised' };
    }

    const adminClient = await createAdminClient();
    const { data, error } = await adminClient.storage
      .from('verification-documents')
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error) return { url: null, error: error.message };
    return { url: data.signedUrl, error: null };
  } catch (err) {
    console.error('[Verification] Error creating signed URL:', err);
    return { url: null, error: 'Failed to generate document URL' };
  }
}
