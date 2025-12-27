-- MIGRATION: Add RLS policy to prevent servers from creating sales in simplified mode
-- DATE: 2025-12-24
-- PURPOSE: Enforce business rule at database level
--
-- Business rule:
-- - Full mode: All bar members can create sales (via RLS check)
-- - Simplified mode: ONLY gerant/promoteur/super_admin can create sales
--
-- This prevents a compromised/malicious server from creating invalid sales in simplified mode

BEGIN;

-- =====================================================
-- STEP 1: Check if old policy exists and drop it
-- =====================================================
-- We need to ensure the RLS policy correctly handles both modes
-- Drop the old generic policy if it exists, and replace with mode-aware one

DROP POLICY IF EXISTS "Bar members can create sales" ON public.sales;
DROP POLICY IF EXISTS "Managers and Promoters can create sales" ON public.sales;
DROP POLICY IF EXISTS "Bar members can create sales with mode restriction" ON public.sales;

-- =====================================================
-- STEP 2: Create new mode-aware RLS policy for INSERT
-- =====================================================
CREATE POLICY "Bar members can create sales with mode restriction"
ON public.sales FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be a bar member
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = sales.bar_id
    AND bm.is_active = true
  )
  AND
  -- Mode-aware restriction
  (
    -- In full mode: any bar member can create sales
    (
      SELECT COALESCE(b.settings->>'operatingMode', 'full') = 'full'
      FROM public.bars b
      WHERE b.id = sales.bar_id
    )
    OR
    -- In simplified mode: only gerant/promoteur/super_admin can create
    (
      SELECT COALESCE(b.settings->>'operatingMode', 'full') = 'simplified'
      FROM public.bars b
      WHERE b.id = sales.bar_id
    )
    AND
    EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.user_id = auth.uid()
      AND bm.bar_id = sales.bar_id
      AND bm.role IN ('gerant', 'promoteur', 'super_admin')
      AND bm.is_active = true
    )
  )
);

COMMENT ON POLICY "Bar members can create sales with mode restriction" ON public.sales IS 'Enforce: full mode allows all members, simplified mode allows only managers.';

-- =====================================================
-- STEP 3: Ensure SELECT policy still allows appropriate access
-- =====================================================
-- Keep the existing SELECT policies to allow viewing sales
-- (They should already be in place from earlier migrations)

-- If needed, we could add additional SELECT restrictions here
-- For now, rely on frontend filtering + RLS at table level

-- =====================================================
-- STEP 4: Add policy for UPDATE (status changes, validation)
-- =====================================================
-- Allow status changes (pending→validated) for gerants only
DROP POLICY IF EXISTS "Managers can validate sales" ON public.sales;

CREATE POLICY "Managers can validate sales"
ON public.sales FOR UPDATE
TO authenticated
USING (
  -- User is a manager
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = sales.bar_id
    AND bm.role IN ('gerant', 'promoteur', 'super_admin')
    AND bm.is_active = true
  )
  AND sales.bar_id = (SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid() LIMIT 1)
)
WITH CHECK (
  -- Validation restrictions
  EXISTS (
    SELECT 1 FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
    AND bm.bar_id = sales.bar_id
    AND bm.role IN ('gerant', 'promoteur', 'super_admin')
    AND bm.is_active = true
  )
);

COMMENT ON POLICY "Managers can validate sales" ON public.sales IS 'Managers can update (validate/reject) sales in their bar.';

-- =====================================================
-- STEP 5: Add policy for DELETE (soft delete via is_active)
-- =====================================================
-- Currently using is_active soft delete, handled by frontend
-- Can add explicit DELETE policy if needed in future

COMMIT;
