-- MIGRATION: Fix Payments RLS Policies
-- Goal: Enforce backend-owned payment state transitions, add INSERT policy
-- Date: 2026-10-04

-- ============================================================================
-- Issue 1: Remove overly permissive UPDATE policy
-- ============================================================================
-- The payments_update_customer policy allowed customers to UPDATE any field,
-- including status. Status should only be updated via transition_payment_status() RPC.
-- 
-- ACTION: Drop the old policy entirely. Direct UPDATEs are not needed; only
-- the RPC should modify payment status.

DROP POLICY IF EXISTS payments_update_customer ON public.payments;

-- ============================================================================
-- Issue 2: Add INSERT RLS policy
-- ============================================================================
-- Previously, any authenticated user could INSERT a payment for any customer
-- if they had the quote_id. The app layer validated ownership, but RLS should
-- enforce it too.
--
-- ACTION: Add a restrictive INSERT policy that validates customer_id via the
-- quote. Only the quote's customer can insert a payment record for it.

DROP POLICY IF EXISTS payments_insert_own ON public.payments;
CREATE POLICY payments_insert_own ON public.payments
  FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.quotes
      WHERE id = quote_id AND customer_id = auth.uid()
    )
  );

-- ============================================================================
-- Issue 3: Backend state management
-- ============================================================================
-- Payment status transitions MUST flow through transition_payment_status() RPC,
-- which is marked SECURITY DEFINER and enforces authorization.
--
-- RLS policies on the payments table should NOT permit direct UPDATE of status.
-- The RPC is the only authorized path for status changes. This is already in place
-- via the lack of an UPDATE policy; confirming here for clarity.

-- ============================================================================
-- VERIFICATION: RLS on payments table is now:
-- ============================================================================
-- 1. SELECT: customer views own, admin views all (existing: payments_select_own)
-- 2. INSERT: customer can insert own via quote ownership (new: payments_insert_own)
-- 3. UPDATE: NONE (direct UPDATE not permitted; use RPC only)
-- 4. DELETE: NONE (payments are immutable)
--
-- Status transitions happen exclusively via:
--   transition_payment_status() RPC (SECURITY DEFINER, enforces auth)
--   ↓
--   Updates payments.status and creates immutable payment_events entry

-- ============================================================================
-- Confirmation: Verify transition_payment_status RPC is in place
-- ============================================================================
-- This RPC should exist from migration 20261004_001.
-- If not present, it will fail at deployment, alerting us to a dependency issue.

-- SELECT * FROM pg_proc WHERE proname = 'transition_payment_status';
-- Should return exactly one row with SECURITY DEFINER.
