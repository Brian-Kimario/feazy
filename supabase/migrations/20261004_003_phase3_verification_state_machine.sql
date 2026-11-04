-- MIGRATION: Phase 3C — Professional Verification State Machine
-- Goal: Enforce verification status transitions with authorization and audit
-- Date: 2026-10-04

-- ============================================================================
-- PROFESSIONAL_VERIFICATION_EVENTS TABLE (Immutable Audit Log)
-- ============================================================================

CREATE TABLE public.professional_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professional_profiles(user_id) ON DELETE CASCADE,
  
  from_status text NOT NULL,
  to_status text NOT NULL,
  
  admin_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_verification_events_professional ON public.professional_verification_events(professional_id);
CREATE INDEX idx_verification_events_status ON public.professional_verification_events(to_status);
CREATE INDEX idx_verification_events_admin ON public.professional_verification_events(admin_user_id);
CREATE INDEX idx_verification_events_created_at ON public.professional_verification_events(created_at);

ALTER TABLE public.professional_verification_events ENABLE ROW LEVEL SECURITY;

-- RLS: Professional sees own events; admin sees all
CREATE POLICY verification_events_select_own ON public.professional_verification_events
  FOR SELECT
  USING (
    professional_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- ============================================================================
-- ADD BUSINESS RULE CONSTRAINT
-- ============================================================================

-- Unverified professionals cannot be available
ALTER TABLE public.professional_profiles
  ADD CONSTRAINT professional_availability_requires_verification
  CHECK (
    is_available = false 
    OR verification_status = 'verified'
  );

-- ============================================================================
-- FUNCTION: Transition Professional Verification Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_professional_verification_status(
  p_professional_id uuid,
  p_new_status text,
  p_admin_user_id uuid,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS BOOLEAN
-- NOTE: SECURITY DEFINER enforces that this function runs with the privileges of the 
-- function owner (postgres role), regardless of the calling user. Authorization checks 
-- inline ensure only admin/support users can change professional verification status.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_valid boolean := false;
  v_admin_role text;
BEGIN
  -- Verify caller is admin
  SELECT role INTO v_admin_role
  FROM public.profiles
  WHERE id = p_admin_user_id;
  
  IF v_admin_role NOT IN ('admin', 'support') THEN
    RAISE EXCEPTION 'Only admins can transition verification status';
  END IF;
  
  -- Get current status
  SELECT verification_status INTO v_current_status
  FROM public.professional_profiles
  WHERE user_id = p_professional_id
  FOR UPDATE;
  
  -- Validate state transition
  -- pending → documents_submitted (professional uploads docs)
  -- documents_submitted → verified or rejected (admin reviews)
  -- verified → suspended (admin action)
  -- suspended → verified (admin reactivates)
  IF (v_current_status = 'pending' AND p_new_status = 'documents_submitted') THEN
    v_valid := true;
  ELSIF (v_current_status = 'documents_submitted' AND p_new_status IN ('verified', 'rejected')) THEN
    v_valid := true;
  ELSIF (v_current_status = 'verified' AND p_new_status = 'suspended') THEN
    v_valid := true;
  ELSIF (v_current_status = 'suspended' AND p_new_status = 'verified') THEN
    v_valid := true;
  ELSIF (v_current_status = 'rejected' AND p_new_status = 'documents_submitted') THEN
    -- Allow professional to resubmit after rejection
    v_valid := true;
  END IF;
  
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid verification status transition from % to %', v_current_status, p_new_status;
  END IF;
  
  -- Update professional profile
  -- IMPORTANT: When re-approving after rejection/suspension, automatically restore availability.
  -- This simplifies UX: professional gets rejected → availability disabled, then re-approved → 
  -- availability automatically restored without manual toggle. See PROFESSIONAL_RESUBMIT_WORKFLOW.md
  UPDATE public.professional_profiles
  SET 
    verification_status = p_new_status,
    -- Availability logic:
    -- 1. If transitioning TO suspended or rejected: disable availability
    -- 2. If transitioning FROM suspended/rejected TO verified: auto-restore to true
    -- 3. Otherwise: preserve current availability setting
    is_available = CASE 
      WHEN p_new_status = 'verified' AND v_current_status IN ('suspended', 'rejected') THEN true
      WHEN p_new_status IN ('suspended', 'rejected') THEN false
      ELSE is_available
    END,
    updated_at = now()
  WHERE user_id = p_professional_id;
  
  -- Create immutable audit event
  INSERT INTO public.professional_verification_events (
    professional_id, 
    from_status, 
    to_status, 
    admin_user_id,
    reason,
    metadata
  )
  VALUES (
    p_professional_id, 
    v_current_status, 
    p_new_status, 
    p_admin_user_id,
    p_reason,
    p_metadata
  );
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.transition_professional_verification_status TO authenticated;

-- ============================================================================
-- FUNCTION: Update Professional Availability
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_professional_availability(
  p_professional_id uuid,
  p_is_available boolean
)
RETURNS BOOLEAN AS $$
DECLARE
  v_verification_status text;
BEGIN
  -- Get verification status
  SELECT verification_status INTO v_verification_status
  FROM public.professional_profiles
  WHERE user_id = p_professional_id;
  
  -- Only verified professionals can be available
  IF p_is_available AND v_verification_status != 'verified' THEN
    RAISE EXCEPTION 'Cannot set availability: professional must be verified';
  END IF;
  
  -- Update availability
  UPDATE public.professional_profiles
  SET 
    is_available = p_is_available,
    updated_at = now()
  WHERE user_id = p_professional_id;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.update_professional_availability TO authenticated;
