-- =====================================================
-- MIGRATION: Add 'cancelled' status to sales
-- =====================================================
-- DATE: 2026-02-03
-- FEATURE: Sale Cancellation by Promoteur / Gérant
--
-- PURPOSE: Allow cancellation of validated sales with full audit trail.
--          Distinct from 'rejected' (which covers pending sales only).
--          'cancelled' = reversal of a validated sale, with mandatory reason.
--
-- BUSINESS RULES:
--   1. Only gerant / promoteur / super_admin can cancel
--   2. Sale must be 'validated' (cannot cancel pending or already rejected/cancelled)
--   3. cancelled_by, cancelled_at, cancel_reason are all mandatory
--   4. Stock is restored client-side before the status update (same pattern as rejectSale)
--
-- SCHEMA CHANGES:
--   - 3 new columns: cancelled_by, cancelled_at, cancel_reason
--   - status CHECK updated to include 'cancelled'
--   - validated_fields CHECK updated with cancelled branch
--   - New RLS policy for the cancellation UPDATE
--   - 2 new indexes

BEGIN;

-- =====================================================
-- 1. Colonnes d'audit pour l'annulation
-- =====================================================
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES users(id);

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- =====================================================
-- 2. CHECK sur status — inclure 'cancelled'
-- L'ancienne contrainte est auto-nommée par PostgreSQL.
-- On essaie le nom standard (sales_status_check).
-- Si elle n'existe pas sous ce nom, le DROP est sans effet
-- et on cherche via pg_constraint dans le bloc DO ci-dessous.
-- =====================================================
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Trouver la contrainte CHECK sur la colonne status (autre que validated_fields)
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND contype = 'c'
    AND conname <> 'validated_fields'
    AND pg_get_constraintdef(oid) LIKE '%status%'
    AND pg_get_constraintdef(oid) LIKE '%pending%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.sales
ADD CONSTRAINT sales_status_check
  CHECK (status IN ('pending', 'validated', 'rejected', 'cancelled'));

-- =====================================================
-- 3. CHECK validated_fields — ajouter la branche cancelled
-- Dernière version dans 20260126000001_add_rejected_at_column.sql
-- =====================================================
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS validated_fields;

ALTER TABLE public.sales
ADD CONSTRAINT validated_fields CHECK (
    (status = 'validated'  AND validated_by  IS NOT NULL AND validated_at  IS NOT NULL) OR
    (status = 'rejected'   AND rejected_by   IS NOT NULL AND rejected_at   IS NOT NULL) OR
    (status = 'cancelled'  AND cancelled_by  IS NOT NULL AND cancelled_at  IS NOT NULL AND cancel_reason IS NOT NULL) OR
    (status = 'pending')
);

-- =====================================================
-- 4. RLS Policy — gerant / promoteur / super_admin
-- Même structure que "Servers can cancel own recent pending sales"
-- (20260126000003) mais pour les ventes validées.
-- =====================================================
CREATE POLICY "Promoteurs can cancel validated sales"
ON public.sales
FOR UPDATE
TO authenticated
USING (
  -- Utilisateur est membre actif avec rôle approprié (promoteur / super_admin uniquement)
  EXISTS (
    SELECT 1
    FROM public.bar_members bm
    WHERE bm.user_id = auth.uid()
      AND bm.bar_id = sales.bar_id
      AND bm.role IN ('promoteur', 'super_admin')
      AND bm.is_active = true
  )
  -- La vente doit être actuellement validée
  AND sales.status = 'validated'
)
WITH CHECK (
  -- Après la mise à jour : statut doit être cancelled
  status = 'cancelled'
  -- Audit : le canceller ne peut pas attribuer à quelqu'un d'autre
  AND cancelled_by = auth.uid()
  AND cancelled_at IS NOT NULL
  AND cancel_reason IS NOT NULL
);

-- =====================================================
-- 5. Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sales_cancelled_at
  ON public.sales(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_status_cancelled
  ON public.sales(bar_id, status)
  WHERE status = 'cancelled';

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║        MIGRATION: Add cancelled status to sales            ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Added columns: cancelled_by, cancelled_at, cancel_reason
    ✅ Updated status CHECK to include cancelled
    ✅ Updated validated_fields CHECK with cancelled branch
    ✅ Created RLS policy: "Promoteurs can cancel validated sales"
    ✅ Created indexes: idx_sales_cancelled_at, idx_sales_status_cancelled

    Business Rules Enforced at DB level:
    • cancelled_by = auth.uid() (no impersonation)
    • cancelled_at IS NOT NULL (timestamp required)
    • cancel_reason IS NOT NULL (reason mandatory)
    • USING: sale must be validated before cancellation
    • WITH CHECK: new status must be cancelled

    Distinct from rejection:
    • rejected  = manager denies a PENDING sale
    • cancelled = promoteur reverses a VALIDATED sale
    ';
END $$;

COMMIT;
