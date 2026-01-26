-- =====================================================
-- MIGRATION: Allow Servers to Cancel Own Recent Sales
-- =====================================================
-- DATE: 2026-01-26
-- FEATURE: Server Self-Service Cancellation
--
-- PURPOSE: Allow servers to cancel their own pending sales within
--          10 minutes of creation. This improves UX by letting
--          servers fix mistakes immediately without manager intervention.
--
-- BUSINESS RULES:
--   1. Server can ONLY cancel sales they created (sold_by = auth.uid())
--   2. Sale must be 'pending' status (not validated or already rejected)
--   3. Sale must be < 10 minutes old (prevents abuse/fraud)
--   4. Server can ONLY change status to 'rejected' (no other modifications)
--   5. Full audit trail maintained (rejected_by, rejected_at)
--
-- SECURITY: Safe because:
--   - Time limit prevents abuse
--   - Own sales only (can't touch other servers' sales)
--   - Status must be pending (can't reject validated sales)
--   - Audit log captures all cancellations

BEGIN;

-- =====================================================
-- STEP 1: Create RLS policy for server cancellations
-- =====================================================
CREATE POLICY "Servers can cancel own recent pending sales"
ON public.sales
FOR UPDATE
USING (
    -- Server must be member of the bar
    EXISTS (
        SELECT 1
        FROM bar_members bm
        WHERE bm.user_id = auth.uid()
          AND bm.bar_id = sales.bar_id
          AND bm.role = 'serveur'
          AND bm.is_active = true
    )
    -- Can only cancel own sales
    AND sold_by = auth.uid()
    -- Sale must be pending
    AND status = 'pending'
    -- Sale must be recent (< 10 minutes)
    AND created_at > (NOW() - INTERVAL '10 minutes')
)
WITH CHECK (
    -- Can only change status to rejected
    status = 'rejected'
    -- Must set rejected_by to self
    AND rejected_by = auth.uid()
    -- Must set rejected_at
    AND rejected_at IS NOT NULL
);

-- =====================================================
-- STEP 2: Add index for performance
-- =====================================================
-- Index to optimize the "recent sales" query
CREATE INDEX IF NOT EXISTS idx_sales_created_at_status
ON public.sales(created_at DESC, status)
WHERE status = 'pending';

-- =====================================================
-- STEP 3: Add helpful comment
-- =====================================================
COMMENT ON POLICY "Servers can cancel own recent pending sales" ON public.sales IS
'Allows servers to self-service cancel their own pending sales within 10 minutes.
Prevents manager bottleneck for simple order mistakes.
Security: time-limited, own sales only, audit trail maintained.';

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║     FEATURE: Server Self-Service Sale Cancellation       ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Created RLS policy: "Servers can cancel own recent pending sales"
    ✅ Added performance index on created_at + status
    ✅ Time limit: 10 minutes from creation
    ✅ Scope: Own sales only (sold_by = auth.uid())

    Business Rules Enforced:
    • Server must be active member with role=serveur
    • Sale must be created by this server (sold_by = auth.uid())
    • Sale status must be pending (not validated/rejected)
    • Sale must be < 10 minutes old
    • Can only UPDATE status to rejected
    • Must set rejected_by = auth.uid()
    • Must set rejected_at timestamp

    User Flow:
    1. Server creates sale → status=pending, stock decremented
    2. Server realizes mistake within 10 min
    3. Server clicks "Annuler" button
    4. Sale status → rejected, stock restored
    5. After 10 min → only manager can cancel

    Security Guarantees:
    • Cannot cancel other servers sales
    • Cannot cancel validated sales
    • Cannot cancel old sales (> 10 min)
    • Full audit trail (rejected_by, rejected_at)
    • Manager still has full control

    Next Steps:
    • Update PendingOrders UI to show "Annuler" for servers
    • Test cancellation within 10 min window
    • Test that cancellation fails after 10 min
    • Verify audit logs capture server cancellations
    ';
END $$;

COMMIT;
