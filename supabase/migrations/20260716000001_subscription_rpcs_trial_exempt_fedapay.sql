-- MIGRATION B : RPC abonnements — trial, exempt, paiements FedaPay, essai gratuit 30j
-- DATE: 2026-07-16
-- AUTHOR: BarTender
--
-- PROBLEM: Aucun paiement en ligne (encaissement 100% manuel), pas d'essai gratuit à la
--          création d'un bar, pas d'exemption pour les bars tests/partenaires. Les RPC
--          existants lisent bars.settings alors que la migration A a déplacé les champs
--          de facturation vers des colonnes dédiées.
-- IMPACT:  RPC abonnements (admin) + nouveau flux FedaPay (webhook service_role) +
--          statut lisible par les membres du bar (paiement par promoteur/gérant).
-- SOLUTION: - _advance_subscription_due : logique d'échéance factorisée (anti-divergence)
--           - record_subscription_payment : réécrit sur les colonnes
--           - record_provider_subscription_payment : idempotent, service_role only (webhook)
--           - set_bar_billing_exempt : exemption super_admin only
--           - get_my_subscription_status : statut du bar pour promoteur/gérant
--           - setup_promoter_bar : essai gratuit 30 jours à la création
--           - get_subscription_overview : statuts trial/exempt, MRR corrigé, prix centralisé
--
-- BREAKING_CHANGE: NO (les signatures publiques existantes sont conservées)
-- TABLES_MODIFIED: aucune (RPC uniquement)
-- RLS_CHANGES: aucun
-- À EXÉCUTER À LA MAIN dans le SQL Editor, APRÈS la migration A (20260716000000).

BEGIN;

-- =====================================================
-- 1. FONCTION INTERNE — avancement d'échéance (factorisation)
-- =====================================================
-- ⭐ Logique commune aux paiements manuels ET FedaPay : ne JAMAIS dupliquer cette
-- règle ailleurs. FOR UPDATE sur le bar = sérialise les paiements concurrents.
-- period_start = échéance courante si future (paiement anticipé), sinon now().

CREATE OR REPLACE FUNCTION public._advance_subscription_due(
  p_bar_id UUID,
  p_months INT,
  OUT o_period_start TIMESTAMPTZ,
  OUT o_period_end   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current_due TIMESTAMPTZ;
BEGIN
  SELECT subscription_due_date INTO v_current_due
  FROM public.bars
  WHERE id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  IF v_current_due IS NOT NULL AND v_current_due > now() THEN
    o_period_start := v_current_due;
  ELSE
    o_period_start := now();
  END IF;

  o_period_end := o_period_start + (p_months || ' months')::interval;

  UPDATE public.bars
  SET subscription_due_date   = o_period_end,
      subscription_start_date = COALESCE(subscription_start_date, now())
  WHERE id = p_bar_id;
END;
$$;

-- 🛡️ SECURITY DEFINER sans check interne : NE DOIT PAS être appelable par les clients.
-- (EXECUTE est accordé à PUBLIC par défaut sur toute nouvelle fonction.)
REVOKE ALL ON FUNCTION public._advance_subscription_due(UUID, INT) FROM PUBLIC, anon, authenticated;

-- =====================================================
-- 2. record_subscription_payment (réécrit sur les colonnes)
-- =====================================================
-- Signature et comportement publics inchangés (super_admin only). Ne lit plus
-- bars.settings : les colonnes sont la source de vérité depuis la migration A.

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

  SELECT o_period_start, o_period_end
  INTO v_period_start, v_period_end
  FROM public._advance_subscription_due(p_bar_id, p_months_covered);

  INSERT INTO public.subscription_payments (
    bar_id, amount, months_covered, method, paid_at,
    period_start, period_end, recorded_by, notes, provider
  ) VALUES (
    p_bar_id, p_amount, p_months_covered, p_method, now(),
    v_period_start::date, v_period_end::date, auth_user_id(), p_notes, 'manual'
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_payment(UUID, NUMERIC, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment(UUID, NUMERIC, INT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- 3. FLUX FEDAPAY — intent au checkout + paiement au webhook (anti-forgery)
-- =====================================================
-- Appelés UNIQUEMENT par les Edge Functions en service_role (auth.uid() = NULL →
-- pas de check is_super_admin, la sécurité vient des grants service_role only).
--
-- ⭐ IDEMPOTENCE (FedaPay retente les webhooks) :
--   1. FOR UPDATE sur le bar EN PREMIER → sérialise les livraisons concurrentes
--      du même event (la 2e attend le commit de la 1re).
--   2. Existence check APRÈS le verrou → un replay retourne le paiement existant
--      sans ré-avancer l'échéance.
--   3. Insert + avancement dans LA MÊME transaction : un crash à mi-chemin annule
--      tout, le retry FedaPay rejoue proprement. NE JAMAIS séparer ces étapes.
--   L'index unique partiel uq_subscription_payments_provider_txn reste le filet
--   de sécurité ultime (une violation → 500 → retry → existence check → 200).

-- 3a. create_subscription_intent — enregistre au checkout la transaction que NOTRE
-- serveur a légitimement créée. C'est la seule source de vérité pour le webhook :
-- bar_id / plan / mois / montant attendu sont figés ICI, côté serveur, jamais
-- redéterminés à partir du corps du webhook. Recalcule le prix pour ne pas faire
-- confiance au montant transmis par l'Edge Function.

CREATE OR REPLACE FUNCTION public.record_subscription_intent(
  p_provider_transaction_id TEXT,
  p_bar_id                  UUID,
  p_plan                    TEXT,
  p_months_covered          INT,
  p_created_by              UUID DEFAULT NULL
)
RETURNS public.subscription_payment_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expected NUMERIC;
  v_intent   public.subscription_payment_intents;
BEGIN
  IF NULLIF(btrim(p_provider_transaction_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider_transaction_id is required';
  END IF;
  IF p_months_covered < 1 THEN
    RAISE EXCEPTION 'months_covered must be >= 1';
  END IF;

  -- Montant attendu recalculé côté serveur (source unique get_plan_price)
  v_expected := public.get_plan_price(p_plan) * p_months_covered;

  INSERT INTO public.subscription_payment_intents (
    provider_transaction_id, bar_id, plan, months_covered, expected_amount, created_by
  ) VALUES (
    p_provider_transaction_id, p_bar_id, COALESCE(p_plan, 'starter'),
    p_months_covered, v_expected, p_created_by
  )
  RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_intent(TEXT, UUID, TEXT, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_intent(TEXT, UUID, TEXT, INT, UUID) TO service_role;

-- 3b. record_provider_subscription_payment — enregistre le paiement FedaPay.
--
-- 🛡️ ZÉRO CONFIANCE AU WEBHOOK : le webhook ne fournit QUE l'ID de transaction et
-- le montant re-fetché de façon autoritative auprès de l'API FedaPay (clé secrète).
-- Le bar crédité, le nombre de mois et le montant attendu viennent de l'INTENT
-- enregistré au checkout — jamais de custom_metadata. Un ID de transaction sans
-- intent correspondant (transaction forgée par un tiers sur le compte marchand)
-- est REJETÉ. Le montant payé doit correspondre EXACTEMENT au montant attendu.
--
-- IDEMPOTENCE (retries FedaPay) : FOR UPDATE sur le bar → sérialise ; existence
-- check → replay retourne l'existant sans ré-avancer l'échéance ; insert +
-- avancement dans la même transaction. Index unique partiel = filet ultime.

CREATE OR REPLACE FUNCTION public.record_provider_subscription_payment(
  p_provider_transaction_id TEXT,
  p_paid_amount             NUMERIC,
  p_method                  TEXT DEFAULT 'momo',
  p_notes                   TEXT DEFAULT NULL
)
RETURNS public.subscription_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_intent       public.subscription_payment_intents;
  v_period_start TIMESTAMPTZ;
  v_period_end   TIMESTAMPTZ;
  v_payment      public.subscription_payments;
BEGIN
  IF NULLIF(btrim(p_provider_transaction_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider_transaction_id is required';
  END IF;

  IF p_method NOT IN ('momo', 'cash', 'bank', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_method;
  END IF;

  -- 1. 🛡️ L'intent DOIT exister : sinon c'est une transaction que notre serveur
  -- n'a pas créée (potentiellement forgée). Verrou sur l'intent = sérialisation.
  SELECT * INTO v_intent
  FROM public.subscription_payment_intents
  WHERE provider_transaction_id = p_provider_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No checkout intent for transaction % (rejected)', p_provider_transaction_id;
  END IF;

  -- 2. 🛡️ Le montant réellement payé (re-fetché depuis FedaPay) doit correspondre
  -- EXACTEMENT au montant attendu figé au checkout. Bloque tout sous-paiement.
  IF p_paid_amount IS DISTINCT FROM v_intent.expected_amount THEN
    RAISE EXCEPTION 'Amount mismatch for transaction %: paid=%, expected=%',
      p_provider_transaction_id, p_paid_amount, v_intent.expected_amount;
  END IF;

  -- 3. Replay ? → retourner l'existant SANS ré-avancer l'échéance
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE provider_transaction_id = p_provider_transaction_id;

  IF FOUND THEN
    RETURN v_payment;
  END IF;

  -- 4. Verrou sur le bar (l'intent porte le bar_id autoritatif) + avancement
  PERFORM 1 FROM public.bars WHERE id = v_intent.bar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar not found: %', v_intent.bar_id;
  END IF;

  SELECT o_period_start, o_period_end
  INTO v_period_start, v_period_end
  FROM public._advance_subscription_due(v_intent.bar_id, v_intent.months_covered);

  INSERT INTO public.subscription_payments (
    bar_id, amount, months_covered, method, paid_at,
    period_start, period_end, recorded_by, notes,
    provider, provider_transaction_id
  ) VALUES (
    v_intent.bar_id, v_intent.expected_amount, v_intent.months_covered, p_method, now(),
    v_period_start::date, v_period_end::date, NULL,
    COALESCE(p_notes, 'FedaPay ' || p_provider_transaction_id || ' — plan ' || v_intent.plan),
    'fedapay', p_provider_transaction_id
  )
  RETURNING * INTO v_payment;

  -- Marquer l'intent consommé (traçabilité ; l'idempotence reste portée par
  -- l'existence du paiement + l'index unique).
  UPDATE public.subscription_payment_intents
  SET consumed_at = now()
  WHERE provider_transaction_id = p_provider_transaction_id;

  RETURN v_payment;
END;
$$;

-- 🛡️ service_role UNIQUEMENT (webhook). Jamais anon/authenticated.
REVOKE ALL ON FUNCTION public.record_provider_subscription_payment(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_subscription_payment(TEXT, NUMERIC, TEXT, TEXT) TO service_role;

-- =====================================================
-- 4. set_bar_billing_exempt (exemption — super_admin only)
-- =====================================================
-- Bars tests ET bars partenaires réels : motif obligatoire à l'activation,
-- nettoyé à la désactivation. Le trigger de garde (migration A) laisse passer
-- ce RPC (owner postgres) et bloque toute écriture directe.

CREATE OR REPLACE FUNCTION public.set_bar_billing_exempt(
  p_bar_id UUID,
  p_exempt BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.bars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bar public.bars;
BEGIN
  -- 🛡️ Sécurité : super_admin uniquement
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can change billing exemption';
  END IF;

  IF p_exempt AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to exempt a bar from billing';
  END IF;

  UPDATE public.bars
  SET billing_exempt        = p_exempt,
      billing_exempt_reason = CASE WHEN p_exempt THEN btrim(p_reason) ELSE NULL END
  WHERE id = p_bar_id
  RETURNING * INTO v_bar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  RETURN v_bar;
END;
$$;

REVOKE ALL ON FUNCTION public.set_bar_billing_exempt(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bar_billing_exempt(UUID, BOOLEAN, TEXT) TO authenticated;

-- =====================================================
-- 5. get_my_subscription_status (statut lisible côté bar)
-- =====================================================
-- Permet au promoteur/gérant d'afficher son statut et de payer via FedaPay.
-- ⭐ Le CASE de statut DOIT rester identique à celui de get_subscription_overview
-- (et cohérent avec computeSubscriptionStatus() côté client pour les 4 statuts
-- historiques — trial/exempt sont serveur-only).

CREATE OR REPLACE FUNCTION public.get_my_subscription_status(p_bar_id UUID)
RETURNS TABLE (
  subscription_status   TEXT,
  days_until_due        INT,
  due_date              TIMESTAMPTZ,
  start_date            TIMESTAMPTZ,
  plan                  TEXT,
  monthly_price         NUMERIC,
  billing_exempt        BOOLEAN,
  billing_exempt_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 🛡️ Membre promoteur/gérant actif du bar, ou propriétaire, ou super_admin
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
      -- 'trial' = essai gratuit initial : aucun paiement ET échéance encore dans la
      -- fenêtre d'essai (≤ start_date + 30j). La 2e condition évite qu'un bar sorti
      -- de l'essai redevienne 'trial' si sa preuve de paiement disparaissait
      -- (subscription_payments est append-only, mais on se protège d'une correction SQL directe).
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
    b.billing_exempt_reason
  FROM public.bars b
  WHERE b.id = p_bar_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_subscription_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_status(UUID) TO authenticated;

-- =====================================================
-- 6. setup_promoter_bar — essai gratuit 30 jours
-- =====================================================
-- Seul changement métier : à la création, subscription_due_date = now() + 30 jours
-- et subscription_start_date = now() → le bar démarre en statut 'trial'
-- (échéance future + aucun paiement enregistré).

DROP FUNCTION IF EXISTS public.setup_promoter_bar(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.setup_promoter_bar(
  p_owner_id UUID,
  p_bar_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_settings JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_super_admin BOOLEAN := FALSE;
  v_bar_id UUID;
  v_default_settings JSONB;
  v_categories_count INTEGER;
  v_bar_record RECORD;
BEGIN
  -- ✅ Security: Only super admins can execute this function
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = current_user_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Permission denied: only super admins can execute setup_promoter_bar.';
  END IF;

  RAISE NOTICE '[setup_promoter_bar] Starting setup: owner=%, bar_name=%, address=%, phone=%',
    p_owner_id, p_bar_name, p_address, p_phone;

  -- Default settings if not provided
  v_default_settings := '{
    "currency": "XOF",
    "currencySymbol": "FCFA",
    "timezone": "Africa/Porto-Novo",
    "language": "fr",
    "businessDayCloseHour": 6,
    "operatingMode": "full",
    "consignmentExpirationDays": 7
  }'::jsonb;

  IF p_settings IS NOT NULL THEN
    v_default_settings := v_default_settings || p_settings;
  END IF;

  -- 1. Create Bar — ✨ essai gratuit 30 jours (colonnes de facturation, pas settings)
  RAISE NOTICE '[setup_promoter_bar] Creating bar with address and phone...';
  INSERT INTO bars (
    name,
    owner_id,
    address,
    phone,
    settings,
    is_active,
    closing_hour,
    billing_exempt,
    subscription_start_date,
    subscription_due_date
  ) VALUES (
    p_bar_name,
    p_owner_id,
    p_address,
    p_phone,
    v_default_settings,
    true,
    6,
    false,
    now(),
    now() + interval '30 days'
  )
  RETURNING * INTO v_bar_record;

  v_bar_id := v_bar_record.id;
  RAISE NOTICE '[setup_promoter_bar] ✓ Bar created: id=%, name=%, trial until %',
    v_bar_id, p_bar_name, v_bar_record.subscription_due_date;

  -- 2. Assign Owner as Promoter
  RAISE NOTICE '[setup_promoter_bar] Assigning owner as promoter...';
  INSERT INTO bar_members (
    user_id,
    bar_id,
    role,
    assigned_by,
    joined_at,
    is_active
  ) VALUES (
    p_owner_id,
    v_bar_id,
    'promoteur',
    p_owner_id,
    NOW(),
    true
  );
  RAISE NOTICE '[setup_promoter_bar] ✓ Promoter assigned';

  -- 3. Initialize Default Categories
  RAISE NOTICE '[setup_promoter_bar] Initializing default categories...';
  INSERT INTO bar_categories (bar_id, global_category_id, is_active)
  SELECT v_bar_id, id, true
  FROM global_categories
  WHERE is_system = true;

  GET DIAGNOSTICS v_categories_count = ROW_COUNT;
  RAISE NOTICE '[setup_promoter_bar] ✓ Initialized % categories', v_categories_count;

  -- ✅ Return full bar record as JSON to eliminate 2nd fetch
  RETURN jsonb_build_object(
    'success', true,
    'bar_id', v_bar_record.id,
    'bar_name', v_bar_record.name,
    'bar_address', v_bar_record.address,
    'bar_phone', v_bar_record.phone,
    'id', v_bar_record.id,
    'name', v_bar_record.name,
    'owner_id', v_bar_record.owner_id,
    'address', v_bar_record.address,
    'phone', v_bar_record.phone,
    'logo_url', v_bar_record.logo_url,
    'settings', v_bar_record.settings,
    'is_active', v_bar_record.is_active,
    'closing_hour', v_bar_record.closing_hour,
    'created_at', v_bar_record.created_at,
    'updated_at', v_bar_record.updated_at,
    'billing_exempt', v_bar_record.billing_exempt,
    'subscription_start_date', v_bar_record.subscription_start_date,
    'subscription_due_date', v_bar_record.subscription_due_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.setup_promoter_bar(uuid, text, text, text, jsonb) IS
  'Create a new bar for an existing promoter (super_admin only).
   Starts a 30-day free trial (subscription_due_date = now() + 30 days).
   Returns complete bar record to avoid second fetch.';

-- =====================================================
-- 7. get_subscription_overview — statuts trial/exempt
-- =====================================================
-- ⚠️ Le RETURNS TABLE change (ajout trial_count/exempt_count) : DROP obligatoire,
-- CREATE OR REPLACE refuserait ("cannot change return type").

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
      b.id,
      b.name,
      b.address,
      b.phone,
      b.owner_id,
      b.created_at,
      b.is_active,
      b.closing_hour,
      COALESCE(b.settings, '{}'::jsonb) AS settings,
      -- ⭐ Prix centralisé : source unique serveur (sync avec src/config/plans.ts)
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
      -- ⭐ SOURCE DE VÉRITÉ du statut. Priorités : exempt court-circuite tout.
      -- Identique à get_my_subscription_status + computeSubscriptionStatus()
      -- (4 branches historiques, seuil due_soon = 5j). trial = échéance future
      -- + aucun paiement (les 5 derniers jours d'essai affichent due_soon :
      -- INTENTIONNEL, c'est l'alerte de conversion).
      CASE
        WHEN billing_exempt THEN 'exempt'
        WHEN due_at IS NULL THEN 'never_paid'
        WHEN due_at::date < CURRENT_DATE THEN 'overdue'
        WHEN due_at::date <= CURRENT_DATE + 5 THEN 'due_soon'
        -- 'trial' = essai initial : aucun paiement ET échéance encore dans la fenêtre
        -- d'essai (≤ start_date + 30j). La 2e condition empêche un bar sorti de l'essai
        -- de redevenir 'trial' si sa preuve de paiement disparaissait (défense en
        -- profondeur : subscription_payments est append-only côté API).
        WHEN NOT has_paid
             AND subscription_start_date IS NOT NULL
             AND due_at::date <= (subscription_start_date::date + 31)
          THEN 'trial'
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
        WHEN 'trial' THEN 3
        WHEN 'up_to_date' THEN 4
        ELSE 5 -- exempt en dernier
      END,
      due_at ASC NULLS FIRST,
      name ASC
    LIMIT p_limit OFFSET v_offset
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE p_status_filter = 'all' OR subscription_status = p_status_filter) AS total_count,
      -- ⭐ MRR = payeurs réels uniquement : trial et exempt exclus
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
        'billing_exempt_reason', s.billing_exempt_reason
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
    counts.up_to_date_count,
    counts.trial_count,
    counts.exempt_count
  FROM counts
  CROSS JOIN page_data;
END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_overview(INT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_overview(INT, INT, TEXT, TEXT) TO authenticated;

COMMIT;

-- =====================================================
-- PRÉ-VOL (exécuter AVANT la migration pour photographier l'existant)
-- =====================================================
-- SELECT proname, pg_get_function_identity_arguments(oid)
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('get_plan_price', 'record_subscription_payment',
--     'record_provider_subscription_payment', 'record_subscription_intent',
--     'set_bar_billing_exempt', 'get_my_subscription_status', 'setup_promoter_bar',
--     'get_subscription_overview', '_advance_subscription_due');

-- =====================================================
-- POST-VOL (exécuter après COMMIT, vérifier chaque résultat)
-- =====================================================
-- 1) Grants des RPC webhook (les plus critiques — service_role only) :
-- SELECT has_function_privilege('anon',          'public.record_provider_subscription_payment(text,numeric,text,text)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('authenticated', 'public.record_provider_subscription_payment(text,numeric,text,text)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('service_role',  'public.record_provider_subscription_payment(text,numeric,text,text)', 'EXECUTE'); -- true
-- SELECT has_function_privilege('anon',          'public.record_subscription_intent(text,uuid,text,int,uuid)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('authenticated', 'public.record_subscription_intent(text,uuid,text,int,uuid)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('service_role',  'public.record_subscription_intent(text,uuid,text,int,uuid)', 'EXECUTE'); -- true
-- 1b) La table d'intent n'est PAS accessible via PostgREST (aucune policy) :
-- SELECT has_table_privilege('anon',          'public.subscription_payment_intents', 'SELECT'); -- false (ou RLS bloque)
-- SELECT has_table_privilege('authenticated', 'public.subscription_payment_intents', 'SELECT'); -- (RLS deny-all : aucune ligne visible)
--
-- 2) Fonction interne verrouillée :
-- SELECT has_function_privilege('authenticated', 'public._advance_subscription_due(uuid,int)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('anon',          'public._advance_subscription_due(uuid,int)', 'EXECUTE'); -- false
--
-- 3) RPC utilisateurs :
-- SELECT has_function_privilege('authenticated', 'public.set_bar_billing_exempt(uuid,boolean,text)', 'EXECUTE');   -- true
-- SELECT has_function_privilege('anon',          'public.set_bar_billing_exempt(uuid,boolean,text)', 'EXECUTE');   -- false
-- SELECT has_function_privilege('authenticated', 'public.get_my_subscription_status(uuid)', 'EXECUTE');            -- true
-- SELECT has_function_privilege('anon',          'public.get_my_subscription_status(uuid)', 'EXECUTE');            -- false
-- SELECT has_function_privilege('authenticated', 'public.get_subscription_overview(int,int,text,text)', 'EXECUTE'); -- true
-- SELECT has_function_privilege('authenticated', 'public.record_subscription_payment(uuid,numeric,int,text,text)', 'EXECUTE'); -- true
-- SELECT has_function_privilege('authenticated', 'public.setup_promoter_bar(uuid,text,text,text,jsonb)', 'EXECUTE'); -- true
--
-- 4) Smoke test overview (en tant que super_admin via l'UI, PAS le SQL Editor — auth.uid() y est NULL)
--
-- 5) Après validation : npm run gen:types (JAMAIS de redirection > directe)
