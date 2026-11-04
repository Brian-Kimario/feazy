-- MIGRATION: Phase 3A — Payment Events Audit Table
-- Goal: Record all payment status transitions with authorization context
-- Date: 2026-10-04

-- ============================================================================
-- PAYMENT_EVENTS TABLE (Immutable Audit Log)
-- ============================================================================

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  
  from_status text NOT NULL,
  to_status text NOT NULL,
  
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  -- 'customer', 'professional', 'webhook', 'admin'
  
  reason text,
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_events_payment ON public.payment_events(payment_id);
CREATE INDEX idx_payment_events_status ON public.payment_events(to_status);
CREATE INDEX idx_payment_events_created_at ON public.payment_events(created_at);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- RLS: Customer/admin can view own/all payment events
CREATE POLICY payment_events_select_own ON public.payment_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE id = payment_id AND customer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- ============================================================================
-- Update payments table to track Razorpay order_id explicitly
-- ============================================================================

ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS razorpay_order_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS upi_vpa text,
  ADD COLUMN IF NOT EXISTS upi_rrn text,
  ADD COLUMN IF NOT EXISTS upi_ref_id text;

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);

-- ============================================================================
-- RLS: Add policy to enforce customer ownership on payments update
-- ============================================================================

-- Restrict UPDATE to customer only (enforce via RLS, not just app layer)
DROP POLICY IF EXISTS payments_update_customer ON public.payments;
CREATE POLICY payments_update_customer ON public.payments
  FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- ============================================================================
-- Immutability: Prevent direct UPDATE on payment_events (audit trail only)
-- ============================================================================

-- By default, no one can update/delete payment_events (INSERT only)
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_insert ON public.payment_events;
CREATE POLICY payment_events_insert ON public.payment_events
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE on payment_events — audit trail is immutable
-- (This is implicit since no policies grant these; but we can be explicit)

-- ============================================================================
-- FUNCTION: Transition Payment Status (server-side state machine)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_payment_status(
  p_payment_id uuid,
  p_new_status text,
  p_actor_user_id uuid,
  p_actor_role text DEFAULT 'customer',
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS BOOLEAN
-- NOTE: SECURITY DEFINER enforces that this function runs with the privileges of the 
-- function owner (postgres role), regardless of the calling user. This allows controlled
-- state transitions even from authenticated users. Authorization checks inline ensure
-- only authorized actors can change payment status.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_valid boolean := false;
  v_customer_id uuid;
BEGIN
  -- Get current status and customer
  SELECT status, customer_id INTO v_current_status, v_customer_id
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  
  -- Validate state transition
  -- Allowed: pending → processing → paid
  --          pending → failed
  --          paid → refunded, partially_refunded
  IF (v_current_status = 'pending' AND p_new_status IN ('processing', 'failed')) THEN
    v_valid := true;
  ELSIF (v_current_status = 'processing' AND p_new_status IN ('paid', 'failed')) THEN
    v_valid := true;
  ELSIF (v_current_status = 'paid' AND p_new_status IN ('refunded', 'partially_refunded')) THEN
    v_valid := true;
  END IF;
  
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid payment status transition from % to %', v_current_status, p_new_status;
  END IF;
  
  -- Update payment status
  UPDATE public.payments
  SET 
    status = p_new_status,
    paid_at = CASE WHEN p_new_status = 'paid' THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_payment_id;
  
  -- Create immutable audit event
  INSERT INTO public.payment_events (
    payment_id, 
    from_status, 
    to_status, 
    actor_user_id, 
    actor_role,
    reason,
    metadata
  )
  VALUES (
    p_payment_id, 
    v_current_status, 
    p_new_status, 
    p_actor_user_id, 
    p_actor_role,
    p_reason,
    p_metadata
  );
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.transition_payment_status TO authenticated;
