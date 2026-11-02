-- 20261101_110_verification_document_integrity
--
-- A1 document integrity (docs/A1_DOCUMENT_INTEGRITY.md). Before this, approval only checked that a
-- document ROW of type 'id' existed, and any signed-in professional could insert any row (any path, any
-- status). This migration:
--   1. creates the private 'verification-documents' bucket and its storage policies (uploads are made by the
--      server with the service role, so professionals get no direct storage INSERT);
--   2. removes every client write on professional_verification_documents (INSERT policy dropped, INSERT/UPDATE/
--      DELETE revoked from authenticated and anon). The server upload action already inserts with status
--      'pending' using the service role;
--   3. adds admin_review_verification_document(): admin accepts or rejects one pending document, accept only if
--      the file exists in storage;
--   4. makes 'approve' require an admin-accepted document of each required type whose file exists in storage.
-- Not changed: _verification_missing_documents (still used by professional submission), reactivate, suspend,
-- reject. Legacy verified professionals are not altered; they can no longer be re-approved without evidence.

-- 1. Bucket and storage policies ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-documents', 'verification-documents', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "professionals_upload_own_verification_documents" ON storage.objects;
DROP POLICY IF EXISTS "professionals_read_own_verification_documents" ON storage.objects;
DROP POLICY IF EXISTS "admins_read_all_verification_documents" ON storage.objects;
DROP POLICY IF EXISTS "admins_delete_verification_documents" ON storage.objects;

CREATE POLICY "professionals_read_own_verification_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "admins_read_all_verification_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-documents'
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Close the client write path ---------------------------------------------------------------
DROP POLICY IF EXISTS verification_documents_insert_own ON public.professional_verification_documents;
REVOKE INSERT, UPDATE, DELETE ON public.professional_verification_documents FROM authenticated, anon;

-- 3. Evidence check and admin review -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public._verification_unaccepted_documents(p_professional_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(req ORDER BY req), ARRAY[]::text[])
  FROM unnest(ARRAY['id']::text[]) AS req
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.professional_verifications v
    JOIN public.professional_verification_documents d ON d.verification_id = v.id
    JOIN storage.objects o ON o.bucket_id = 'verification-documents' AND o.name = d.storage_path
    WHERE v.professional_id = p_professional_id
      AND d.document_type = req
      AND d.status = 'accepted'
      AND d.reviewer_id IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public._verification_unaccepted_documents(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_verification_document(
  p_document_id uuid,
  p_decision    text,
  p_note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid := auth.uid();
  v_role   text;
  v_note   text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_doc    public.professional_verification_documents%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_document_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'A document and a decision (accepted or rejected) are required' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'The note must be 500 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected' AND (v_note IS NULL OR char_length(v_note) < 5) THEN
    RAISE EXCEPTION 'A note of at least 5 characters is required to reject a document' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_doc FROM public.professional_verification_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Stale request: document is already %', COALESCE(v_doc.status, 'unknown') USING ERRCODE = '55000';
  END IF;
  IF p_decision = 'accepted' AND NOT EXISTS (
       SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'verification-documents' AND o.name = v_doc.storage_path) THEN
    RAISE EXCEPTION 'The document file does not exist in storage' USING ERRCODE = '23514';
  END IF;

  UPDATE public.professional_verification_documents
  SET status = p_decision, reviewed_at = now(), reviewer_id = v_actor, reviewer_notes = v_note
  WHERE id = p_document_id;

  RETURN jsonb_build_object('document_id', p_document_id, 'document_type', v_doc.document_type,
                            'from_status', 'pending', 'to_status', p_decision);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_review_verification_document(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_document(uuid, text, text) TO authenticated;

-- 4. Approve requires evidence ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_transition_professional_verification(
  p_professional_id uuid,
  p_action          text,
  p_expected_status text,
  p_reason          text,
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid := auth.uid();
  v_role       text;
  v_current    text;
  v_new        text;
  v_reason     text := btrim(COALESCE(p_reason, ''));
  v_missing    text[];
  v_vid        uuid;
  v_job        record;
  v_released   int := 0;
  v_active_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve','reject','suspend','reactivate') THEN
    RAISE EXCEPTION 'Unknown verification action' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason of 5 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Metadata must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT verification_status INTO v_current
  FROM public.professional_profiles
  WHERE user_id = p_professional_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Stale request: status is now %, expected %', v_current, COALESCE(p_expected_status, 'none')
      USING ERRCODE = '55000';
  END IF;

  IF p_action IN ('approve','reject') AND v_current IN ('pending','documents_submitted','under_review') THEN
    v_new := CASE p_action WHEN 'approve' THEN 'verified' ELSE 'rejected' END;
  ELSIF p_action = 'suspend' AND v_current = 'verified' THEN
    v_new := 'suspended';
  ELSIF p_action = 'reactivate' AND v_current = 'suspended' THEN
    v_new := 'verified';
  ELSE
    RAISE EXCEPTION 'Cannot % a professional whose status is %', p_action, v_current USING ERRCODE = '55000';
  END IF;

  IF v_new = 'verified' THEN
    v_missing := public._verification_missing_documents(p_professional_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Required documents missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Approval needs evidence, not just a row: an admin-accepted document whose file exists in storage.
  -- Reactivating a suspended professional does not re-prove identity, so only 'approve' is checked.
  IF p_action = 'approve' THEN
    v_missing := public._verification_unaccepted_documents(p_professional_id);
    IF array_length(v_missing, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Documents not accepted or file missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.verification_transition', p_professional_id::text || ':' || v_new, true);

  UPDATE public.professional_profiles
  SET verification_status = v_new,
      is_available = CASE WHEN v_new = 'verified' THEN is_available ELSE false END,
      updated_at = now()
  WHERE user_id = p_professional_id;

  PERFORM set_config('app.verification_transition', '', true);

  -- Keep the submission record in step with the decision.
  SELECT id INTO v_vid FROM public.professional_verifications
  WHERE professional_id = p_professional_id ORDER BY created_at DESC LIMIT 1;

  IF p_action = 'reject' THEN
    IF v_vid IS NULL THEN
      INSERT INTO public.professional_verifications (professional_id, status, reviewed_at, reviewed_by, rejection_reason)
      VALUES (p_professional_id, 'rejected', now(), v_actor, v_reason);
    ELSE
      UPDATE public.professional_verifications
      SET status = 'rejected', reviewed_at = now(), reviewed_by = v_actor, rejection_reason = v_reason, updated_at = now()
      WHERE id = v_vid;
    END IF;
  ELSIF p_action = 'approve' AND v_vid IS NOT NULL THEN
    UPDATE public.professional_verifications
    SET status = 'verified', reviewed_at = now(), reviewed_by = v_actor, updated_at = now()
    WHERE id = v_vid;
  END IF;

  IF p_action = 'suspend' THEN
    -- Withdraw outstanding offers. Each is released and re-offered to the next eligible
    -- professional; this one is already suspended so ranking excludes them.
    FOR v_job IN
      SELECT id FROM public.jobs
      WHERE professional_id = p_professional_id AND current_state = 'assigned'
      ORDER BY created_at
      FOR UPDATE
    LOOP
      PERFORM public._release_offer(v_job.id, 'withdrawn', 'professional_suspended',
                                    'Professional suspended by administrator', v_actor);
      v_released := v_released + 1;
    END LOOP;

    -- Work already accepted or under way is left alone and not cancelled; it is recorded here
    -- and is derivable at any time as: jobs of a suspended professional in a non-terminal state.
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_active_ids
    FROM public.jobs
    WHERE professional_id = p_professional_id
      AND current_state NOT IN ('assigned','completed','closed','cancelled');
  END IF;

  INSERT INTO public.professional_verification_events
    (professional_id, from_status, to_status, action, actor_id, actor_role, reason, metadata)
  VALUES
    (p_professional_id, v_current, v_new, p_action, v_actor, 'admin', v_reason,
     COALESCE(p_metadata, '{}'::jsonb)
       || CASE WHEN p_action = 'suspend'
               THEN jsonb_build_object('offers_withdrawn', v_released,
                                       'active_job_ids', to_jsonb(v_active_ids))
               ELSE '{}'::jsonb END);

  RETURN jsonb_build_object(
    'professional_id', p_professional_id,
    'from_status', v_current,
    'to_status', v_new,
    'offers_withdrawn', v_released,
    'active_jobs', COALESCE(array_length(v_active_ids, 1), 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transition_professional_verification(uuid, text, text, text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_transition_professional_verification(uuid, text, text, text, jsonb) TO authenticated;
