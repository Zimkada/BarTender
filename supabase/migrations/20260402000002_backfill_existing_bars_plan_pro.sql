-- ============================================================================
-- Migration: Backfill existing bars with plan='pro' (safety net)
--
-- NOTE: The actual backfill was moved to 20260402000001_enforce_plan_feature_gates.sql
-- (STEP 1) to guarantee it runs BEFORE the RLS policies that depend on bars.settings->>'plan'.
--
-- This migration is kept as an idempotent safety net: it runs the same UPDATE
-- but bars that already have a plan set (assigned by 000001) are left untouched.
-- Result: always 0 rows affected after a normal deployment.
-- ============================================================================

UPDATE public.bars
SET settings = COALESCE(settings, '{}'::jsonb)
  || jsonb_build_object('plan', 'pro', 'dataTier', 'balanced')
WHERE id <> '00000000-0000-0000-0000-000000000000'
  AND (
    settings->>'plan' IS NULL
    OR settings->>'plan' = ''
  );
