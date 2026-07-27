-- MIGRATION : Exposer months_overdue + amount_due dans les vues de statut
-- DATE: 2026-07-26
-- AUTHOR: BarTender
--
-- PROBLEM: get_my_subscription_status (client bar) et get_subscription_overview (admin)
--          n'exposent pas le nombre de mois de retard ni le montant dû. L'UI ne peut
--          donc pas imposer le retard au moment du paiement.
-- SOLUTION: enrichir les 2 RETURNS TABLE avec months_overdue (et amount_due côté bar).
--           Le RETURNS TABLE change → DROP FUNCTION obligatoire.
-- DEPENDS:  la fonction months_overdue() créée par 20260726000000 (à exécuter AVANT).
--
-- BREAKING_CHANGE: NO (colonnes ajoutées ; les mappers TS lisent par clé nommée)
-- À EXÉCUTER À LA MAIN dans le SQL Editor, APRÈS 20260726000000.

BEGIN;

-- =====================================================
-- get_my_subscription_status — + months_overdue, amount_due
-- =====================================================

DROP FUNCTION IF EXISTS public.get_my_subscription_status(UUID);

CREATE OR REPLACE FUNCTION public.get_my_subscription_status(p_bar_id UUID)
RETURNS TABLE (
  subscription_status   TEXT,
  days_until_due        INT,
  due_date              TIMESTAMPTZ,
  start_date            TIMESTAMPTZ,
  plan                  TEXT,
  monthly_price         NUMERIC,
  billing_exempt        BOOLEAN,
  billing_exempt_reason TEXT,
  months_overdue        INT,
  amount_due            NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.bars b
      WHERE b.id = p_bar_id AND b.owner_id = auth_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = p_bar_id
        AND bm.user_id = auth_user_id()
        AND bm.is_active = true
        AND bm.role IN ('promoteur', 'gerant')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this bar subscription';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN b.billing_exempt THEN 'exempt'
      WHEN b.subscription_due_date IS NULL THEN 'never_paid'
      WHEN b.subscription_due_date::date < CURRENT_DATE THEN 'overdue'
      WHEN b.subscription_due_date::date <= CURRENT_DATE + 5 THEN 'due_soon'
      WHEN NOT EXISTS (SELECT 1 FROM public.subscription_payments sp WHERE sp.bar_id = b.id)
           AND b.subscription_start_date IS NOT NULL
           AND b.subscription_due_date::date <= (b.subscription_start_date::date + 31)
        THEN 'trial'
      ELSE 'up_to_date'
    END,
    CASE
      WHEN b.subscription_due_date IS NULL THEN NULL
      ELSE (b.subscription_due_date::date - CURRENT_DATE)::int
    END,
    b.subscription_due_date,
    b.subscription_start_date,
    COALESCE(b.settings->>'plan', 'starter'),
    public.get_plan_price(b.settings->>'plan'),
    b.billing_exempt,
    b.billing_exempt_reason,
    -- Retard (0 si exempté : pas de dette pour un bar exempté)
    CASE WHEN b.billing_exempt THEN 0 ELSE public.months_overdue(b.subscription_due_date) END,
    CASE WHEN b.billing_exempt THEN 0
         ELSE public.months_overdue(b.subscription_due_date) * public.get_plan_price(b.settings->>'plan')
    END
  FROM public.bars b
  WHERE b.id = p_bar_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_subscription_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_status(UUID) TO authenticated;

-- =====================================================
-- get_subscription_overview — + months_overdue par bar (dans le JSON)
-- =====================================================
-- Le RETURNS TABLE ne change PAS (months_overdue va dans le jsonb par bar, pas en
-- colonne top-level) → CREATE OR REPLACE suffirait, mais on DROP par cohérence
-- avec la version précédente pour éviter tout conflit de signature résiduel.

DROP FUNCTION IF EXISTS public.get_subscription_overview(INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_subscription_overview(
  p_page          INT DEFAULT 1,
  p_limit         INT DEFAULT 10,
  p_search_query  TEXT DEFAULT '',
  p_status_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
  bars JSONB,
  total_count BIGINT,
  mrr NUMERIC,
  overdue_count BIGINT,
  due_soon_count BIGINT,
  never_paid_count BIGINT,
  up_to_date_count BIGINT,
  trial_count BIGINT,
  exempt_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_offset INT;
  v_search TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can view subscription overview';
  END IF;

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;

  IF p_page < 1 THEN
    RAISE EXCEPTION 'p_page must be >= 1';
  END IF;

  IF p_status_filter NOT IN ('all', 'overdue', 'due_soon', 'never_paid', 'up_to_date', 'trial', 'exempt') THEN
    RAISE EXCEPTION 'Invalid status filter: %', p_status_filter;
  END IF;

  v_offset := (p_page - 1) * p_limit;
  v_search := '%' || COALESCE(p_search_query, '') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT
      b.id, b.name, b.address, b.phone, b.owner_id, b.created_at,
      b.is_active, b.closing_hour,
      COALESCE(b.settings, '{}'::jsonb) AS settings,
      public.get_plan_price(b.settings->>'plan') AS monthly_price,
      b.subscription_due_date AS due_at,
      b.subscription_start_date,
      b.billing_exempt,
      b.billing_exempt_reason,
      EXISTS (SELECT 1 FROM public.subscription_payments sp WHERE sp.bar_id = b.id) AS has_paid
    FROM public.bars b
    WHERE
      COALESCE(p_search_query, '') = ''
      OR b.name ILIKE v_search
      OR COALESCE(b.address, '') ILIKE v_search
      OR COALESCE(b.phone, '') ILIKE v_search
  ),
  enriched AS (
    SELECT
      *,
      CASE
        WHEN billing_exempt THEN 'exempt'
        WHEN due_at IS NULL THEN 'never_paid'
        WHEN due_at::date < CURRENT_DATE THEN 'overdue'
        WHEN due_at::date <= CURRENT_DATE + 5 THEN 'due_soon'
        WHEN NOT has_paid
             AND subscription_start_date IS NOT NULL
             AND due_at::date <= (subscription_start_date::date + 31)
          THEN 'trial'
        ELSE 'up_to_date'
      END AS subscription_status,
      CASE
        WHEN due_at IS NULL THEN NULL
        ELSE due_at::date - CURRENT_DATE
      END AS days_until_due,
      -- Retard en mois (0 si exempté)
      CASE WHEN billing_exempt THEN 0 ELSE public.months_overdue(due_at) END AS months_overdue
    FROM base
  ),
  filtered AS (
    SELECT * FROM enriched
    WHERE p_status_filter = 'all' OR subscription_status = p_status_filter
  ),
  sorted AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE subscription_status
        WHEN 'overdue' THEN 0
        WHEN 'due_soon' THEN 1
        WHEN 'never_paid' THEN 2
        WHEN 'trial' THEN 3
        WHEN 'up_to_date' THEN 4
        ELSE 5
      END,
      due_at ASC NULLS FIRST,
      name ASC
    LIMIT p_limit OFFSET v_offset
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE p_status_filter = 'all' OR subscription_status = p_status_filter) AS total_count,
      COALESCE(SUM(monthly_price) FILTER (
        WHERE is_active
          AND subscription_status NOT IN ('trial', 'exempt')
          AND (p_status_filter = 'all' OR subscription_status = p_status_filter)
      ), 0) AS mrr,
      COUNT(*) FILTER (WHERE subscription_status = 'overdue') AS overdue_count,
      COUNT(*) FILTER (WHERE subscription_status = 'due_soon') AS due_soon_count,
      COUNT(*) FILTER (WHERE subscription_status = 'never_paid') AS never_paid_count,
      COUNT(*) FILTER (WHERE subscription_status = 'up_to_date') AS up_to_date_count,
      COUNT(*) FILTER (WHERE subscription_status = 'trial') AS trial_count,
      COUNT(*) FILTER (WHERE subscription_status = 'exempt') AS exempt_count
    FROM enriched
  ),
  page_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'address', s.address,
        'phone', s.phone,
        'owner_id', s.owner_id,
        'created_at', s.created_at,
        'is_active', s.is_active,
        'closing_hour', s.closing_hour,
        'settings', s.settings,
        'subscription_status', s.subscription_status,
        'days_until_due', s.days_until_due,
        'subscription_due_date', s.due_at,
        'subscription_start_date', s.subscription_start_date,
        'billing_exempt', s.billing_exempt,
        'billing_exempt_reason', s.billing_exempt_reason,
        'months_overdue', s.months_overdue
      )
    ), '[]'::jsonb) AS bars
    FROM sorted s
  )
  SELECT
    page_data.bars, counts.total_count, counts.mrr,
    counts.overdue_count, counts.due_soon_count, counts.never_paid_count,
    counts.up_to_date_count, counts.trial_count, counts.exempt_count
  FROM counts CROSS JOIN page_data;
END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_overview(INT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_overview(INT, INT, TEXT, TEXT) TO authenticated;

COMMIT;

-- =====================================================
-- POST-VOL
-- =====================================================
-- SELECT has_function_privilege('authenticated','public.get_my_subscription_status(uuid)','EXECUTE'); -- true
-- SELECT has_function_privilege('authenticated','public.get_subscription_overview(int,int,text,text)','EXECUTE'); -- true
-- Smoke-test via l'UI (auth.uid() NULL dans le SQL Editor) :
--   - un bar en retard doit remonter months_overdue > 0 et amount_due cohérent.
-- Puis npm run gen:types.
