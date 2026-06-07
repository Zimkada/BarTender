-- MIGRATION: Create subscription_payments table + record RPC
-- DATE: 2026-06-07
-- AUTHOR: BarTender

-- PROBLEM: Aucun suivi des abonnements. Le super_admin encaisse manuellement
--          (Mobile Money / espèces) mais n'a aucune visibilité sur qui a payé,
--          qui est en retard, ni d'historique des paiements.
-- IMPACT:  Super_admin uniquement (gestion commerciale des abonnements).
-- SOLUTION: Nouvelle table subscription_payments (historique normalisé) +
--           RPC atomique record_subscription_payment qui insère le paiement ET
--           avance bars.settings.subscriptionDueDate du nombre de mois couverts.
--           Le statut (à jour / en retard) n'est PAS stocké : il est dérivé de
--           subscriptionDueDate côté client.

-- BREAKING_CHANGE: NO (additif)
-- TABLES_CREATED: subscription_payments
-- TABLES_MODIFIED: bars (settings JSONB — subscriptionStartDate/subscriptionDueDate)
-- RLS_CHANGES: subscription_payments — accès super_admin uniquement

BEGIN;

-- =====================================================
-- 1. TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id          UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  months_covered  INT NOT NULL CHECK (months_covered >= 1),
  method          TEXT NOT NULL CHECK (method IN ('momo', 'cash', 'bank', 'other')),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  recorded_by     UUID REFERENCES public.users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_bar_paid
  ON public.subscription_payments (bar_id, paid_at DESC);

-- =====================================================
-- 2. RLS — super_admin uniquement
-- =====================================================

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage subscription payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Super admins view subscription payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Super admins insert subscription payments" ON public.subscription_payments;

CREATE POLICY "Super admins view subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "Super admins insert subscription payments"
  ON public.subscription_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

-- =====================================================
-- 3. RPC — enregistrer un paiement (atomique)
-- =====================================================
-- Insère le paiement ET avance bars.settings.subscriptionDueDate.
-- period_start = échéance courante si future, sinon now() (date d'effet réelle).
-- period_end   = period_start + months_covered mois = nouvelle échéance.

CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  p_bar_id         UUID,
  p_amount         NUMERIC,
  p_months_covered INT,
  p_method         TEXT,
  p_notes          TEXT DEFAULT NULL
)
RETURNS public.subscription_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_settings     JSONB;
  v_due_text     TEXT;
  v_current_due  TIMESTAMPTZ;
  v_period_start TIMESTAMPTZ;
  v_period_end   TIMESTAMPTZ;
  v_payment      public.subscription_payments;
BEGIN
  -- 🛡️ Sécurité : super_admin uniquement
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can record subscription payments';
  END IF;

  IF p_months_covered < 1 THEN
    RAISE EXCEPTION 'months_covered must be >= 1';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF p_method NOT IN ('momo', 'cash', 'bank', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_method;
  END IF;

  -- Récupérer les settings actuels du bar
  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
  FROM public.bars
  WHERE id = p_bar_id
  FOR UPDATE;

  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  -- Échéance courante (NULL si jamais payé)
  v_due_text := NULLIF(v_settings->>'subscriptionDueDate', '');
  BEGIN
    v_current_due := v_due_text::timestamptz;
  EXCEPTION WHEN others THEN
    v_current_due := NULL;
  END;

  -- Point de départ : échéance courante si future, sinon maintenant
  IF v_current_due IS NOT NULL AND v_current_due > now() THEN
    v_period_start := v_current_due;
  ELSE
    v_period_start := now();
  END IF;

  v_period_end := v_period_start + (p_months_covered || ' months')::interval;

  -- Insérer le paiement
  INSERT INTO public.subscription_payments (
    bar_id, amount, months_covered, method, paid_at,
    period_start, period_end, recorded_by, notes
  ) VALUES (
    p_bar_id, p_amount, p_months_covered, p_method, now(),
    v_period_start::date, v_period_end::date, auth_user_id(), p_notes
  )
  RETURNING * INTO v_payment;

  -- Avancer l'échéance + fixer la date de début si premier paiement
  v_settings := v_settings || jsonb_build_object(
    'subscriptionDueDate', to_char(v_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  IF (v_settings->>'subscriptionStartDate') IS NULL THEN
    v_settings := v_settings || jsonb_build_object(
      'subscriptionStartDate', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  UPDATE public.bars SET settings = v_settings WHERE id = p_bar_id;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_subscription_payment(UUID, NUMERIC, INT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- 4. RPC - liste paginee exacte des abonnements
-- =====================================================

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
  up_to_date_count BIGINT
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

  IF p_status_filter NOT IN ('all', 'overdue', 'due_soon', 'never_paid', 'up_to_date') THEN
    RAISE EXCEPTION 'Invalid status filter: %', p_status_filter;
  END IF;

  v_offset := (p_page - 1) * p_limit;
  v_search := '%' || COALESCE(p_search_query, '') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT
      b.id,
      b.name,
      b.address,
      b.phone,
      b.owner_id,
      b.created_at,
      b.is_active,
      b.closing_hour,
      COALESCE(b.settings, '{}'::jsonb) AS settings,
      -- ⭐ SYNCHRONISER avec src/config/plans.ts (PLANS[*].monthlyPriceXOF).
      -- Le SQL ne peut pas lire le TS : si un prix change, le modifier AUX DEUX
      -- endroits sinon le MRR serveur diverge de l'affichage UI.
      CASE COALESCE(b.settings->>'plan', 'starter')
        WHEN 'pro' THEN 15000
        WHEN 'enterprise' THEN 30000
        ELSE 9000
      END::NUMERIC AS monthly_price,
      CASE
        WHEN NULLIF(b.settings->>'subscriptionDueDate', '') IS NULL THEN NULL
        WHEN (b.settings->>'subscriptionDueDate') ~ '^\d{4}-\d{2}-\d{2}' THEN (b.settings->>'subscriptionDueDate')::timestamptz
        ELSE NULL
      END AS due_at
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
      -- ⭐ SOURCE DE VÉRITÉ du statut (le client consomme subscription_status d'ici).
      -- Doit rester IDENTIQUE à computeSubscriptionStatus() dans
      -- src/utils/subscriptionHelpers.ts (seuil due_soon = DUE_SOON_THRESHOLD_DAYS = 5).
      CASE
        WHEN due_at IS NULL THEN 'never_paid'
        WHEN due_at::date < CURRENT_DATE THEN 'overdue'
        WHEN due_at::date <= CURRENT_DATE + 5 THEN 'due_soon'
        ELSE 'up_to_date'
      END AS subscription_status,
      CASE
        WHEN due_at IS NULL THEN NULL
        ELSE due_at::date - CURRENT_DATE
      END AS days_until_due
    FROM base
  ),
  filtered AS (
    SELECT *
    FROM enriched
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
        ELSE 3
      END,
      due_at ASC NULLS FIRST,
      name ASC
    LIMIT p_limit OFFSET v_offset
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE p_status_filter = 'all' OR subscription_status = p_status_filter) AS total_count,
      COALESCE(SUM(monthly_price) FILTER (
        WHERE is_active AND (p_status_filter = 'all' OR subscription_status = p_status_filter)
      ), 0) AS mrr,
      COUNT(*) FILTER (WHERE subscription_status = 'overdue') AS overdue_count,
      COUNT(*) FILTER (WHERE subscription_status = 'due_soon') AS due_soon_count,
      COUNT(*) FILTER (WHERE subscription_status = 'never_paid') AS never_paid_count,
      COUNT(*) FILTER (WHERE subscription_status = 'up_to_date') AS up_to_date_count
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
        'days_until_due', s.days_until_due
      )
    ), '[]'::jsonb) AS bars
    FROM sorted s
  )
  SELECT
    page_data.bars,
    counts.total_count,
    counts.mrr,
    counts.overdue_count,
    counts.due_soon_count,
    counts.never_paid_count,
    counts.up_to_date_count
  FROM counts
  CROSS JOIN page_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_overview(INT, INT, TEXT, TEXT) TO authenticated;

COMMIT;
