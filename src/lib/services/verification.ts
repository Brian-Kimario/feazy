'use server';

/**
 * Verification Service — Professional Verification Workflow
 *
 * Security model:
 * - Professionals can upload their own documents (RLS + user check).
 * - Only admin can approve / reject (server-side role check + admin client).
 * - Status changes go only through admin_transition_professional_verification and
 *   submit_professional_verification; the database records the history.
 * - Admin attempts and outcomes are written to audit_logs by runAdminAction.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { runAdminAction } from '@/lib/admin/action';
import { getAdminActor } from '@/lib/admin/guard';
import { logAuditEvent, AuditSeverity } from '@/lib/audit';
import { adminFailure, isAdminFailure, type AdminResult } from '@/lib/admin/result';
import { uuid } from '@/validators/common';
import {
  approveProfessionalInput,
  rejectProfessionalInput,
  suspendProfessionalInput,
  reactivateProfessionalInput,
  reviewVerificationDocumentInput,
  verificationDocumentPath,
} from '@/validators/admin';

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

    // ── Ensure an open verification round ─────────────────────────────────────
    // A rejected round is kept as history; resubmission opens a new one.
    const { data: latest } = await supabase
      .from('professional_verifications')
      .select('id, status')
      .eq('professional_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let verificationId: string;
    const latestRow = latest as { id: string; status: string } | null;

    if (!latestRow || latestRow.status === 'rejected') {
      const { data: newVerification, error: insertError } = await (adminClient as any)
        .from('professional_verifications')
        .insert({ professional_id: user.id, status: 'pending' })
        .select('id')
        .single();

      if (insertError || !newVerification) {
        console.error('[Verification] Failed to create verification record:', insertError);
        return { success: false, error: 'Failed to initialise verification record' };
      }
      verificationId = (newVerification as { id: string }).id;
    } else {
      verificationId = latestRow.id;
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

    // ── Submit for review once the required documents are present ────────────
    // Idempotent: returns changed=false (with what is still missing) rather than failing.
    const { error: statusError } = await supabase.rpc('submit_professional_verification');
    if (statusError) {
      console.error('[Verification] Failed to submit verification:', statusError);
      return { success: false, error: 'Document saved, but submitting for review failed. Please try again.' };
    }

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
// 3 & 4. Approve / reject a professional (admin actions)
// ─────────────────────────────────────────────────────────────────────────────

function toActionResult(result: AdminResult<null>): VerificationActionResult {
  return isAdminFailure(result) ? { success: false, error: result.error } : { success: true, error: null };
}

type TransitionAction = 'approve' | 'reject' | 'suspend' | 'reactivate';

/**
 * One call into the state machine. The function derives the admin from the session, locks the
 * row, checks the expected status, records the history event and (for suspension) withdraws
 * pending offers, all in one transaction. The review record is updated inside it too.
 */
async function transitionProfessional(args: {
  professionalId: string;
  action: TransitionAction;
  expectedStatus: string;
  reason: string;
}): Promise<AdminResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_transition_professional_verification', {
    p_professional_id: args.professionalId,
    p_action: args.action,
    p_expected_status: args.expectedStatus,
    p_reason: args.reason,
    p_metadata: {},
  });
  if (error) {
    // 23514: required documents missing, 55000: stale or invalid transition. Both are actionable.
    const actionable = error.code === '23514' || error.code === '55000' || error.code === '22023';
    return adminFailure('FAILED', actionable ? error.message : 'The status change could not be completed');
  }
  revalidatePath('/admin/professionals');
  return { ok: true, data: null };
}

/**
 * Approve a professional (pending / documents_submitted / under_review → verified).
 * Refused by the database unless the required documents are on file.
 */
export async function approveProfessional(
  professionalId: string,
  expectedStatus: string,
): Promise<VerificationActionResult> {
  return toActionResult(
    await runAdminAction({
      name: 'admin.professional.approve',
      schema: approveProfessionalInput,
      input: { professionalId, expectedStatus },
      subjectUserId: (i) => i.professionalId,
      targetType: 'professional',
      targetId: (i) => i.professionalId,
      execute: ({ input }) =>
        transitionProfessional({
          professionalId: input.professionalId,
          action: 'approve',
          expectedStatus: input.expectedStatus,
          reason: 'Verification approved by admin',
        }),
    }),
  );
}

/** Reject a professional with a mandatory reason. */
export async function rejectProfessional(
  professionalId: string,
  expectedStatus: string,
  reason: string,
): Promise<VerificationActionResult> {
  return toActionResult(
    await runAdminAction({
      name: 'admin.professional.reject',
      schema: rejectProfessionalInput,
      input: { professionalId, expectedStatus, reason },
      subjectUserId: (i) => i.professionalId,
      targetType: 'professional',
      targetId: (i) => i.professionalId,
      reason: (i) => i.reason,
      execute: ({ input }) =>
        transitionProfessional({
          professionalId: input.professionalId,
          action: 'reject',
          expectedStatus: input.expectedStatus,
          reason: input.reason,
        }),
    }),
  );
}

export interface DocumentReviewOutcome {
  documentId: string;
  documentType: string;
  status: 'accepted' | 'rejected';
}

/**
 * Accept or reject one pending document. The database checks the caller is an admin, that the
 * document is still pending, and for acceptance that the file exists in storage.
 */
export async function reviewVerificationDocument(
  input: unknown,
): Promise<AdminResult<DocumentReviewOutcome>> {
  return runAdminAction({
    name: 'admin.verification_document.review',
    schema: reviewVerificationDocumentInput,
    input,
    targetType: 'verification_document',
    targetId: (i) => i.documentId,
    reason: (i) => i.note,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_review_verification_document', {
        p_document_id: i.documentId,
        p_decision: i.decision,
        p_note: i.note,
      });
      if (error) {
        // 22023 bad input, P0002 unknown, 55000 already reviewed, 23514 file missing: all actionable.
        const actionable = ['22023', 'P0002', '55000', '23514'].includes(error.code ?? '');
        return adminFailure('FAILED', actionable ? error.message : 'The document could not be reviewed');
      }
      const result = data as { document_type?: unknown; to_status?: unknown } | null;
      if (!result || (result.to_status !== 'accepted' && result.to_status !== 'rejected')) {
        return adminFailure('FAILED', 'The document could not be reviewed');
      }
      revalidatePath('/admin/professionals');
      return {
        ok: true,
        data: {
          documentId: i.documentId,
          documentType: String(result.document_type ?? ''),
          status: result.to_status,
        },
      };
    },
  });
}

/** Suspend a verified professional: blocks new work, withdraws pending offers, flags active jobs. */
export async function suspendProfessional(
  professionalId: string,
  reason: string,
): Promise<VerificationActionResult> {
  return toActionResult(
    await runAdminAction({
      name: 'admin.professional.suspend',
      schema: suspendProfessionalInput,
      input: { professionalId, reason },
      subjectUserId: (i) => i.professionalId,
      targetType: 'professional',
      targetId: (i) => i.professionalId,
      reason: (i) => i.reason,
      execute: ({ input }) =>
        transitionProfessional({
          professionalId: input.professionalId,
          action: 'suspend',
          expectedStatus: 'verified',
          reason: input.reason,
        }),
    }),
  );
}

/** Reactivate a suspended professional. Availability is not restored; they switch it on themselves. */
export async function reactivateProfessional(
  professionalId: string,
  reason: string,
): Promise<VerificationActionResult> {
  return toActionResult(
    await runAdminAction({
      name: 'admin.professional.reactivate',
      schema: reactivateProfessionalInput,
      input: { professionalId, reason },
      subjectUserId: (i) => i.professionalId,
      targetType: 'professional',
      targetId: (i) => i.professionalId,
      reason: (i) => i.reason,
      execute: ({ input }) =>
        transitionProfessional({
          professionalId: input.professionalId,
          action: 'reactivate',
          expectedStatus: 'suspended',
          reason: input.reason,
        }),
    }),
  );
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
    const parsedPath = verificationDocumentPath.safeParse(storagePath);
    if (!parsedPath.success) return { url: null, error: 'Invalid document path' };
    const path = parsedPath.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { url: null, error: 'Not authenticated' };

    const isOwner = path.startsWith(`${user.id}/`);
    if (!isOwner) {
      const actor = await getAdminActor();
      if (isAdminFailure(actor)) return { url: null, error: 'Not authorised' };

      const ownerSegment = path.split('/')[0];
      // Reading another person's identity documents is recorded; fail closed if it cannot be.
      const audit = await logAuditEvent({
        user_id: uuid.safeParse(ownerSegment).success ? ownerSegment : actor.data.userId,
        created_by: actor.data.userId,
        action: 'admin.verification_document.view',
        severity: AuditSeverity.INFO,
        success: true,
        changes: { target_type: 'verification_document', target_id: path },
      });
      if (!audit.success) return { url: null, error: 'Could not record the audit trail' };
    }

    const adminClient = await createAdminClient();
    const { data, error } = await adminClient.storage
      .from('verification-documents')
      .createSignedUrl(path, 3600); // 1 hour

    if (error) return { url: null, error: error.message };
    return { url: data.signedUrl, error: null };
  } catch {
    return { url: null, error: 'Failed to generate document URL' };
  }
}
