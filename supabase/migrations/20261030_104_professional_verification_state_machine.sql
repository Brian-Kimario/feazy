-- MIGRATION 20261030_104: Professional verification state machine (replaces 20261004_003)
--
-- SUPERSEDES supabase/migrations/20261004_003_phase3_verification_state_machine.sql, which was
-- never applied and must not be: it trusted a caller-supplied admin id with EXECUTE granted to
-- `authenticated`, admitted the `support` role, and had its SECURITY DEFINER clause inside the body.
-- This file is idempotent, so it is safe in an environment where the old file did or did not run.
--
-- Lifecycle (all transitions go through the two functions below; nothing else may change
-- professional_profiles.verification_status except service_role maintenance):
--   pending | documents_submitted | under_review --approve--> verified   (required documents must exist)
--   pending | documents_submitted | under_review --reject---> rejected   (reason mandatory)
--   verified  --suspend-->   suspended   (reason; is_available=false; pending offers withdrawn; active jobs recorded)
--   suspended --reactivate-> verified    (reason; documents re-checked; is_available is NOT restored)
--   pending | rejected --professional submits--> documents_submitted     (documents must exist; for rejected,
--                                                                          documents newer than the rejection)
--
-- History: public.professional_verification_events is the domain history of status changes.
-- The admin action runner separately writes admin.* rows to audit_logs (who attempted what).
-- The two answer different questions and are not mirrored into each other.

-- ============================================================================
-- 1. History table (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.professional_verification_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professional_profiles(user_id) ON DELETE CASCADE,
  from_status     text NOT NULL,
  to_status       text NOT NULL,
  action          text NOT NULL CHECK (action IN ('approve','reject','suspend','reactivate','submit','resubmit')),
  actor_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role      text NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 5),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 003 created this table without the action column; add it for databases that predate it.
ALTER TABLE public.professional_verification_events ADD COLUMN IF NOT EXISTS action text;

CREATE INDEX IF NOT EXISTS idx_pv_events_professional
  ON public.professional_verification_events (professional_id, created_at DESC);

ALTER TABLE public.professional_verification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pv_events_select_admin ON public.professional_verification_events;
CREATE POLICY pv_events_select_admin ON public.professional_verification_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- A professional sees their own submission/decision events, never suspension notes.
DROP POLICY IF EXISTS pv_events_select_own ON public.professional_verification_events;
CREATE POLICY pv_events_select_own ON public.professional_verification_events
  FOR SELECT TO authenticated
  USING (professional_id = auth.uid() AND action IN ('submit','resubmit','approve','reject'));

REVOKE ALL ON TABLE public.professional_verification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.professional_verification_events TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._pv_events_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'professional_verification_events is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public._pv_events_block_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pv_events_no_update ON public.professional_verification_events;
CREATE TRIGGER pv_events_no_update
  BEFORE UPDATE ON public.professional_verification_events
  FOR EACH ROW EXECUTE FUNCTION public._pv_events_block_mutation();

-- ============================================================================
-- 2. Offer withdrawal on suspension: allow the attempt log to say what happened
--    (additive: existing 'declined'/'expired' rows and codes stay valid)
-- ============================================================================
ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT IF EXISTS booking_assignment_attempts_outcome_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_outcome_check
  CHECK (outcome = ANY (ARRAY['declined'::text, 'expired'::text, 'withdrawn'::text]));

ALTER TABLE public.booking_assignment_attempts DROP CONSTRAINT IF EXISTS booking_assignment_attempts_reason_code_check;
ALTER TABLE public.booking_assignment_attempts ADD CONSTRAINT booking_assignment_attempts_reason_code_check
  CHECK (reason_code IS NULL OR reason_code = ANY (ARRAY[
    'schedule_conflict'::text, 'too_far'::text, 'not_my_skill'::text, 'need_more_detail'::text,
    'other'::text, 'professional_suspended'::text]));

-- ============================================================================
-- 3. Protected-column guard: no status change outside the state machine
--    Replaces the body from 20261030_102. Differences: status changes require the
--    transaction-local marker set by the functions below (admins included, so history is never
--    skipped); is_available can only be true for a verified professional.
--    service_role / no-JWT sessions stay unrestricted for maintenance and migrations.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_professional_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service boolean;
  v_admin   boolean;
BEGIN
  v_service := COALESCE(auth.jwt() ->> 'role', '') = 'service_role' OR auth.uid() IS NULL;
  IF v_service THEN
    RETURN NEW;
  END IF;

  v_admin := EXISTS (
    SELECT 1 FROM public.profiles AS actor
    WHERE actor.id = auth.uid() AND actor.role = 'admin'::public.user_role
  );

  IF TG_OP = 'INSERT' THEN
    IF v_admin THEN
      RETURN NEW;
    END IF;
    NEW.verification_status := 'pending';
    NEW.is_available := false;
    NEW.rating_average := 0;
    NEW.completed_jobs_count := 0;
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND COALESCE(current_setting('app.verification_transition', true), '')
         IS DISTINCT FROM (NEW.user_id::text || ':' || NEW.verification_status) THEN
    RAISE EXCEPTION 'Verification status can only change through the verification state machine'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.rating_average IS DISTINCT FROM OLD.rating_average
      OR NEW.completed_jobs_count IS DISTINCT FROM OLD.completed_jobs_count)
     AND NOT v_admin THEN
    RAISE EXCEPTION 'Only administrators can change rating or completed job count'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_available AND NEW.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'Only a verified professional can be available for work'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Backstop independent of the trigger: unverified professionals can never be available.
ALTER TABLE public.professional_profiles DROP CONSTRAINT IF EXISTS professional_availability_requires_verification;
ALTER TABLE public.professional_profiles ADD CONSTRAINT professional_availability_requires_verification
  CHECK (is_available = false OR verification_status = 'verified');

-- ============================================================================
-- 4. Assignment backstop: no path may put a non-verified professional on a job
--    (ranking, admin reassignment, service-role writes all pass through here)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_job_professional_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id THEN
    RETURN NEW;
  END IF;

  SELECT verification_status INTO v_status
  FROM public.professional_profiles WHERE user_id = NEW.professional_id;

  IF v_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Professional is not verified and cannot be assigned work (status: %)', COALESCE(v_status, 'none')
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_job_professional_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jobs_guard_professional_verified ON public.jobs;
CREATE TRIGGER jobs_guard_professional_verified
  BEFORE INSERT OR UPDATE OF professional_id ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_professional_verified();

-- ============================================================================
-- 5. Evidence check. Required document types are fixed here and are an OWNER DECISION
--    (default: an identity document). Rejected documents never count.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._verification_missing_documents(p_professional_id uuid, p_since timestamptz DEFAULT NULL)
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
    WHERE v.professional_id = p_professional_id
      AND d.document_type = req
      AND d.status IS DISTINCT FROM 'rejected'
      AND (p_since IS NULL OR d.uploaded_at > p_since)
  );
$$;
REVOKE ALL ON FUNCTION public._verification_missing_documents(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. Admin transition: approve | reject | suspend | reactivate
--    Admin identity comes from auth.uid(); there is no admin-id parameter.
--    p_expected_status makes stale and duplicate requests fail instead of re-applying.
-- ============================================================================
DROP FUNCTION IF EXISTS public.transition_professional_verification_status(uuid, text, uuid, text, jsonb);

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

-- ============================================================================
-- 7. Professional submission / resubmission. Idempotent: calling it when nothing can change
--    returns changed=false rather than an error, so every document upload may call it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_professional_verification()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_current text;
  v_since   timestamptz;
  v_missing text[];
  v_vid     uuid;
  v_vstatus text;
  v_action  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'professional' THEN
    RAISE EXCEPTION 'Professional access required' USING ERRCODE = '42501';
  END IF;

  SELECT verification_status INTO v_current
  FROM public.professional_profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current NOT IN ('pending','rejected') THEN
    RETURN jsonb_build_object('changed', false, 'status', v_current);
  END IF;

  IF v_current = 'rejected' THEN
    SELECT max(created_at) INTO v_since FROM public.professional_verification_events
    WHERE professional_id = v_uid AND to_status = 'rejected';
  END IF;

  v_missing := public._verification_missing_documents(v_uid, v_since);
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('changed', false, 'status', v_current, 'missing', to_jsonb(v_missing));
  END IF;

  PERFORM set_config('app.verification_transition', v_uid::text || ':documents_submitted', true);
  UPDATE public.professional_profiles
  SET verification_status = 'documents_submitted', updated_at = now()
  WHERE user_id = v_uid;
  PERFORM set_config('app.verification_transition', '', true);

  -- A rejected round is kept intact (reason, reviewer, time); resubmission opens a new round.
  SELECT id, status INTO v_vid, v_vstatus FROM public.professional_verifications
  WHERE professional_id = v_uid ORDER BY created_at DESC LIMIT 1;
  IF v_vid IS NULL OR v_vstatus = 'rejected' THEN
    INSERT INTO public.professional_verifications (professional_id, status, submitted_at)
    VALUES (v_uid, 'documents_submitted', now());
  ELSE
    UPDATE public.professional_verifications
    SET status = 'documents_submitted', submitted_at = now(), updated_at = now()
    WHERE id = v_vid;
  END IF;

  v_action := CASE WHEN v_current = 'rejected' THEN 'resubmit' ELSE 'submit' END;
  INSERT INTO public.professional_verification_events
    (professional_id, from_status, to_status, action, actor_id, actor_role, reason, metadata)
  VALUES
    (v_uid, v_current, 'documents_submitted', v_action, v_uid, 'professional',
     CASE WHEN v_current = 'rejected' THEN 'Documents resubmitted after rejection'
          ELSE 'Documents submitted for review' END,
     '{}'::jsonb);

  RETURN jsonb_build_object('changed', true, 'status', 'documents_submitted');
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_professional_verification() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_professional_verification() TO authenticated;
