-- ============================================================================
-- Migration: Enforce plan feature gates at database level (INSERT/UPDATE/DELETE)
--
-- STEP 1: Backfill existing bars to plan='pro' BEFORE applying RLS policies.
--         This prevents a temporary coupure where bars without a plan would
--         fall back to 'starter' and lose access to accounting/promotions.
--
-- STEP 2: Adds a helper function check_bar_has_feature() that reads
--         bars.settings->>'plan' and returns whether a feature is enabled.
--
-- Applied to:
--   - promotions: requires 'promotions' feature (pro/enterprise)
--   - expenses, salaries, capital_contributions, initial_balances,
--     accounting_transactions: requires 'accounting' feature (pro/enterprise)
--
-- READ access is preserved — existing data remains visible after downgrade.
-- Super admins bypass all feature checks.
-- ============================================================================

-- ============================================================================
-- STEP 1: Backfill — must run before RLS policies are applied
-- ============================================================================

UPDATE public.bars
SET settings = COALESCE(settings, '{}'::jsonb)
  || jsonb_build_object('plan', 'pro', 'dataTier', 'balanced')
WHERE id <> '00000000-0000-0000-0000-000000000000'
  AND (
    settings->>'plan' IS NULL
    OR settings->>'plan' = ''
  );

-- ============================================================================
-- STEP 2: Helper function — check if a bar's plan includes a given feature
CREATE OR REPLACE FUNCTION public.check_bar_has_feature(p_bar_id UUID, p_feature TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT COALESCE(settings->>'plan', 'starter')
  INTO v_plan
  FROM public.bars
  WHERE id = p_bar_id;

  -- Feature matrix (matches src/config/plans.ts)
  RETURN CASE
    WHEN p_feature = 'accounting' THEN v_plan IN ('pro', 'enterprise')
    WHEN p_feature = 'exports' THEN v_plan IN ('pro', 'enterprise')
    WHEN p_feature = 'promotions' THEN v_plan IN ('pro', 'enterprise')
    WHEN p_feature = 'forecasting' THEN v_plan = 'enterprise'
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Promotions: block INSERT/UPDATE if plan doesn't include 'promotions'
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Managers can create promotions" ON promotions;
DROP POLICY IF EXISTS "Managers can update promotions" ON promotions;

-- Recreate with plan check
CREATE POLICY "Managers can create promotions"
  ON promotions FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) IN ('promoteur', 'gerant')
      AND public.check_bar_has_feature(bar_id, 'promotions')
    )
  );

CREATE POLICY "Managers can update promotions"
  ON promotions FOR UPDATE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) IN ('promoteur', 'gerant')
      AND public.check_bar_has_feature(bar_id, 'promotions')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) IN ('promoteur', 'gerant')
      AND public.check_bar_has_feature(bar_id, 'promotions')
    )
  );

-- ============================================================================
-- Expenses: block INSERT/UPDATE if plan doesn't include 'accounting'
-- ============================================================================

DROP POLICY IF EXISTS "Promoteurs can create expenses" ON expenses;
DROP POLICY IF EXISTS "Promoteurs can update expenses" ON expenses;

CREATE POLICY "Promoteurs can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  );

CREATE POLICY "Promoteurs can update expenses"
  ON expenses FOR UPDATE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  );

-- ============================================================================
-- Accounting transactions: block INSERT if plan doesn't include 'accounting'
-- ============================================================================

DROP POLICY IF EXISTS "System can create accounting records" ON accounting_transactions;

CREATE POLICY "System can create accounting records"
  ON accounting_transactions FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      is_bar_member(bar_id)
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  );

-- ============================================================================
-- Salaries: block INSERT/UPDATE if plan doesn't include 'accounting'
-- ============================================================================

DROP POLICY IF EXISTS "Promoteurs can create salaries" ON salaries;
DROP POLICY IF EXISTS "Promoteurs can update salaries" ON salaries;
DROP POLICY IF EXISTS "Promoteurs can manage salaries" ON salaries;
DROP POLICY IF EXISTS "Plan-gated salary insert" ON salaries;
DROP POLICY IF EXISTS "Plan-gated salary update" ON salaries;
DROP POLICY IF EXISTS "Plan-gated salary delete" ON salaries;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salaries' AND table_schema = 'public') THEN
    EXECUTE '
      CREATE POLICY "Plan-gated salary insert"
      ON salaries FOR INSERT
      WITH CHECK (
        is_super_admin() OR (
          get_user_role(bar_id) = ''promoteur''
          AND public.check_bar_has_feature(bar_id, ''accounting'')
        )
      )';

    EXECUTE '
      CREATE POLICY "Plan-gated salary update"
      ON salaries FOR UPDATE
      USING (
        is_super_admin() OR (
          get_user_role(bar_id) = ''promoteur''
          AND public.check_bar_has_feature(bar_id, ''accounting'')
        )
      )
      WITH CHECK (
        is_super_admin() OR (
          get_user_role(bar_id) = ''promoteur''
          AND public.check_bar_has_feature(bar_id, ''accounting'')
        )
      )';

    EXECUTE '
      CREATE POLICY "Plan-gated salary delete"
      ON salaries FOR DELETE
      USING (
        is_super_admin() OR (
          get_user_role(bar_id) = ''promoteur''
          AND public.check_bar_has_feature(bar_id, ''accounting'')
        )
      )';
  END IF;
END $$;

-- ============================================================================
-- Initial balances: block INSERT/UPDATE/DELETE if plan doesn't include 'accounting'
-- ============================================================================

DROP POLICY IF EXISTS "Promoteurs can manage balances" ON initial_balances;
DROP POLICY IF EXISTS "Users can insert initial balance for their bars" ON initial_balances;
DROP POLICY IF EXISTS "Users can update initial balance of their bars" ON initial_balances;
DROP POLICY IF EXISTS "Users can delete initial balance of their bars" ON initial_balances;
DROP POLICY IF EXISTS "Plan-gated initial balance insert" ON initial_balances;
DROP POLICY IF EXISTS "Plan-gated initial balance update" ON initial_balances;
DROP POLICY IF EXISTS "Plan-gated initial balance delete" ON initial_balances;

CREATE POLICY "Plan-gated initial balance insert"
  ON initial_balances FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
      AND (created_by = auth.uid() OR created_by IS NULL)
    )
  );

CREATE POLICY "Plan-gated initial balance update"
  ON initial_balances FOR UPDATE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
      AND (created_by = auth.uid() OR created_by IS NULL)
    )
  );

CREATE POLICY "Plan-gated initial balance delete"
  ON initial_balances FOR DELETE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  );

-- ============================================================================
-- Capital contributions: block INSERT/UPDATE/DELETE if plan doesn't include 'accounting'
-- ============================================================================

DROP POLICY IF EXISTS "Promoteurs can manage capital" ON capital_contributions;
DROP POLICY IF EXISTS "Users can insert capital contributions for their bars" ON capital_contributions;
DROP POLICY IF EXISTS "Users can update their own capital contributions" ON capital_contributions;
DROP POLICY IF EXISTS "Users can delete their own capital contributions" ON capital_contributions;
DROP POLICY IF EXISTS "Plan-gated capital insert" ON capital_contributions;
DROP POLICY IF EXISTS "Plan-gated capital update" ON capital_contributions;
DROP POLICY IF EXISTS "Plan-gated capital delete" ON capital_contributions;

CREATE POLICY "Plan-gated capital insert"
  ON capital_contributions FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
      AND (created_by = auth.uid() OR created_by IS NULL)
    )
  );

CREATE POLICY "Plan-gated capital update"
  ON capital_contributions FOR UPDATE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
      AND (created_by = auth.uid() OR created_by IS NULL)
    )
  );

CREATE POLICY "Plan-gated capital delete"
  ON capital_contributions FOR DELETE
  USING (
    is_super_admin()
    OR (
      get_user_role(bar_id) = 'promoteur'
      AND public.check_bar_has_feature(bar_id, 'accounting')
    )
  );
