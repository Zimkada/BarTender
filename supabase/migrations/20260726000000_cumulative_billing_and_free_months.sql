-- MIGRATION : Facturation cumulée + mois offerts (admin)
-- DATE: 2026-07-26
-- AUTHOR: BarTender
--
-- PROBLEM: quand l'échéance d'un bar est dépassée, _advance_subscription_due repart
--          de now() (efface le retard). Un bar peut donc utiliser l'app des mois sans
--          payer puis "se remettre à jour" en payant 1 mois. Faille de revenus
--          (overdue est informatif, suspension manuelle).
-- IMPACT:  moteur d'échéance (les 2 canaux de paiement passent par _advance_subscription_due)
--          + garde-fou anti sous-paiement + vues de statut + nouveau geste "mois offerts".
-- SOLUTION: 1) months_overdue() : primitive de calcul du retard (arrondi mois supérieur).
--           2) _advance_subscription_due : empile TOUJOURS depuis l'échéance courante.
--           3) prepare_subscription_checkout / record_subscription_intent : imposent le
--              retard (rejet si months_covered < retard) et exposent months_overdue.
--           4) get_my_subscription_status / get_subscription_overview : exposent le retard.
--           5) grant_free_months : super_admin offre des mois (amount=0, provider='offert').
--
-- BREAKING_CHANGE: NO (additif + assouplissement de contraintes)
-- TABLES_MODIFIED: subscription_payments (CHECK amount, CHECK provider assouplis)
-- RLS_CHANGES: aucun
-- À EXÉCUTER À LA MAIN dans le SQL Editor.

BEGIN;

-- =====================================================
-- 1. Primitive : nombre de mois de retard (arrondi au mois supérieur)
-- =====================================================
-- Règle métier : "tout mois entamé au-delà de l'échéance est dû".
-- 0 si due_date NULL ou dans le futur.
-- Sinon : nombre de mois calendaires entiers écoulés depuis due_date, +1 s'il reste
-- des jours au-delà du dernier mois entier.
-- Ex : due=2026-03-01, now=2026-05-20 → 2 mois entiers (mars→mai) + 19j → 3 mois.
-- ⭐ DOIT rester identique à monthsOverdue() dans src/utils/subscriptionHelpers.ts
-- (le webhook FedaPay fige months_covered au checkout via l'intent, mais l'affichage
-- client et le garde-fou serveur doivent produire le même nombre).
--
-- STABLE (pas IMMUTABLE) car dépend de now() par défaut ; on passe la date en param
-- depuis les RPC pour la cohérence intra-transaction.

CREATE OR REPLACE FUNCTION public.months_overdue(
  p_due_date TIMESTAMPTZ,
  p_now      TIMESTAMPTZ DEFAULT now()
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_due   DATE;
  v_now   DATE;
  v_full  INT;   -- mois calendaires entiers écoulés
  v_anchor DATE; -- due + v_full mois
BEGIN
  IF p_due_date IS NULL THEN
    RETURN 0;
  END IF;

  v_due := p_due_date::date;
  v_now := p_now::date;

  IF v_due >= v_now THEN
    RETURN 0;  -- échéance future ou aujourd'hui : pas de retard
  END IF;

  -- Mois calendaires entiers entre les deux dates
  v_full := (EXTRACT(YEAR FROM age(v_now, v_due)) * 12
             + EXTRACT(MONTH FROM age(v_now, v_due)))::int;

  -- Reste-t-il des jours au-delà du dernier mois entier ? → +1 (mois entamé)
  v_anchor := v_due + (v_full || ' months')::interval;
  IF v_anchor < v_now THEN
    RETURN v_full + 1;
  ELSE
    RETURN GREATEST(v_full, 1);  -- au moins 1 mois dû si échéance dépassée
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.months_overdue(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.months_overdue(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- =====================================================
-- 2. _advance_subscription_due — EMPILEMENT (le changement central)
-- =====================================================
-- Avant : si échéance dépassée → period_start = now() (retard effacé).
-- Après : period_start = échéance courante TOUJOURS (empilement), now() seulement
-- si l'échéance n'a jamais été initialisée (NULL). Un bar ne gagne plus de temps
-- gratuit en tardant : il paie le même nombre de mois pour couvrir la même période.
-- ⭐ Miroir : computeNextDueDate() dans src/utils/subscriptionHelpers.ts.

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

  -- Empilement : on repart TOUJOURS de l'échéance courante (passée OU future).
  -- now() seulement si jamais initialisée.
  o_period_start := COALESCE(v_current_due, now());
  o_period_end   := o_period_start + (p_months || ' months')::interval;

  UPDATE public.bars
  SET subscription_due_date   = o_period_end,
      subscription_start_date = COALESCE(subscription_start_date, now())
  WHERE id = p_bar_id;
END;
$$;

-- 🛡️ SECURITY DEFINER sans check interne : jamais appelable par les clients.
-- (CREATE OR REPLACE conserve les grants, mais on ré-applique par sécurité.)
REVOKE ALL ON FUNCTION public._advance_subscription_due(UUID, INT) FROM PUBLIC, anon, authenticated;

-- =====================================================
-- 3. Assouplir les CHECK de subscription_payments (mois offerts + montant 0)
-- =====================================================
-- amount=0 pour un mois offert ; provider='offert' comme nouveau canal.

ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_amount_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_amount_check CHECK (amount >= 0);

ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_provider_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_provider_check
  CHECK (provider IN ('manual', 'fedapay', 'offert'));

-- =====================================================
-- 4. prepare_subscription_checkout — garde-fou retard + expose months_overdue
-- =====================================================
-- Le RETURNS TABLE change (ajout months_overdue) → DROP obligatoire.

DROP FUNCTION IF EXISTS public.prepare_subscription_checkout(UUID, UUID, INT);

CREATE OR REPLACE FUNCTION public.prepare_subscription_checkout(
  p_caller_id      UUID,
  p_bar_id         UUID,
  p_months_covered INT
)
RETURNS TABLE (
  plan            TEXT,
  expected_amount NUMERIC,
  bar_name        TEXT,
  months_overdue  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bar     public.bars;
  v_plan    TEXT;
  v_overdue INT;
BEGIN
  -- Total borné (retard + avance) : 1..60 (5 ans — couvre un gros retard cumulé,
  -- garde-fou anti-erreur), au lieu de l'ancienne liste blanche {1,3,6,12}
  -- devenue incompatible avec la facturation cumulée.
  IF p_months_covered < 1 OR p_months_covered > 60 THEN
    RAISE EXCEPTION 'Invalid months_covered: %', p_months_covered;
  END IF;

  SELECT * INTO v_bar FROM public.bars WHERE id = p_bar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  IF NOT (
    v_bar.owner_id = p_caller_id
    OR EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = p_bar_id
        AND bm.user_id = p_caller_id
        AND bm.is_active = true
        AND bm.role IN ('promoteur', 'gerant')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a promoteur/gerant of this bar';
  END IF;

  IF v_bar.billing_exempt THEN
    RAISE EXCEPTION 'Bar is exempt from billing';
  END IF;

  v_plan := COALESCE(v_bar.settings->>'plan', 'starter');
  v_overdue := public.months_overdue(v_bar.subscription_due_date);

  -- 🛡️ Anti sous-paiement : impossible de payer moins que sa dette de retard.
  IF p_months_covered < v_overdue THEN
    RAISE EXCEPTION 'months_covered (%) below overdue debt (%)', p_months_covered, v_overdue;
  END IF;

  RETURN QUERY SELECT
    v_plan,
    public.get_plan_price(v_plan) * p_months_covered,
    v_bar.name,
    v_overdue;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_subscription_checkout(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_subscription_checkout(UUID, UUID, INT) TO service_role;

-- =====================================================
-- 5. record_subscription_intent — garde-fou retard (defense en profondeur)
-- =====================================================
-- Signature inchangée (RETURNS subscription_payment_intents) → CREATE OR REPLACE.

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
  v_overdue  INT;
  v_due      TIMESTAMPTZ;
  v_intent   public.subscription_payment_intents;
BEGIN
  IF NULLIF(btrim(p_provider_transaction_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider_transaction_id is required';
  END IF;
  IF p_months_covered < 1 OR p_months_covered > 60 THEN
    RAISE EXCEPTION 'months_covered must be between 1 and 60';
  END IF;

  -- Garde-fou retard aussi ici (le checkout passe par prepare_ mais on protège
  -- l'intent contre tout appel direct incohérent).
  SELECT subscription_due_date INTO v_due FROM public.bars WHERE id = p_bar_id;
  v_overdue := public.months_overdue(v_due);
  IF p_months_covered < v_overdue THEN
    RAISE EXCEPTION 'months_covered (%) below overdue debt (%)', p_months_covered, v_overdue;
  END IF;

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

-- =====================================================
-- 6. grant_free_months — mois offerts (super_admin only)
-- =====================================================
-- Geste ponctuel distinct de billing_exempt : avance l'échéance sans paiement,
-- tracé dans l'historique (amount=0, provider='offert'). N'affecte pas le MRR
-- (le bar reste up_to_date, MRR basé sur le plan).
--
-- ⭐ SÉMANTIQUE VOULUE (décision produit, pas un bug) : les mois offerts EMPILENT
-- depuis l'échéance courante, exactement comme un paiement (via _advance_subscription_due).
-- Conséquence assumée : offrir N mois à un bar EN RETARD réduit sa dette de N mois
-- mais ne le "remet pas à neuf" — un bar en retard de 5 mois à qui on offre 3 mois
-- reste 2 mois en retard. C'est cohérent avec la facturation cumulée (un mois offert
-- vaut un mois payé). Pour "remettre à zéro" un bar, utiliser plutôt billing_exempt.

CREATE OR REPLACE FUNCTION public.grant_free_months(
  p_bar_id UUID,
  p_months INT,
  p_reason TEXT
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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only superadmin can grant free months';
  END IF;

  IF p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'months must be between 1 and 24';
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to grant free months';
  END IF;

  -- Avance l'échéance (empilement, comme un paiement)
  SELECT o_period_start, o_period_end
  INTO v_period_start, v_period_end
  FROM public._advance_subscription_due(p_bar_id, p_months);

  -- Trace le geste dans l'historique (amount=0, provider='offert')
  INSERT INTO public.subscription_payments (
    bar_id, amount, months_covered, method, paid_at,
    period_start, period_end, recorded_by, notes, provider
  ) VALUES (
    p_bar_id, 0, p_months, 'other', now(),
    v_period_start::date, v_period_end::date, auth_user_id(), btrim(p_reason), 'offert'
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_free_months(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_free_months(UUID, INT, TEXT) TO authenticated;

COMMIT;

-- =====================================================
-- PRÉ-VOL (avant migration)
-- =====================================================
-- SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
-- WHERE pronamespace='public'::regnamespace AND proname IN
--   ('_advance_subscription_due','prepare_subscription_checkout','record_subscription_intent',
--    'get_my_subscription_status','get_subscription_overview','grant_free_months','months_overdue');

-- =====================================================
-- POST-VOL (après COMMIT)
-- =====================================================
-- 1) Grants :
-- SELECT has_function_privilege('authenticated','public.grant_free_months(uuid,int,text)','EXECUTE'); -- true
-- SELECT has_function_privilege('anon',         'public.grant_free_months(uuid,int,text)','EXECUTE'); -- false
-- SELECT has_function_privilege('authenticated','public.months_overdue(timestamptz,timestamptz)','EXECUTE'); -- true
-- SELECT has_function_privilege('authenticated','public._advance_subscription_due(uuid,int)','EXECUTE'); -- false
--
-- 2) CHECK assouplis (parenthèses obligatoires : AND lie plus fort que OR) :
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='public.subscription_payments'::regclass
--   AND (conname LIKE '%amount%' OR conname LIKE '%provider%');
-- (attendu : amount >= 0 ; provider IN ('manual','fedapay','offert'))
--
-- 3) Smoke-test months_overdue (dates connues) :
-- SELECT public.months_overdue('2026-03-01'::timestamptz, '2026-05-20'::timestamptz); -- 3
-- SELECT public.months_overdue('2026-05-01'::timestamptz, '2026-05-20'::timestamptz); -- 1
-- SELECT public.months_overdue((now() + interval '10 days'), now());                  -- 0
-- SELECT public.months_overdue(NULL, now());                                          -- 0
--
-- 4) Ensuite : appliquer la 2e migration (vues enrichies get_my_subscription_status
--    et get_subscription_overview) — fichier 20260726000001.
-- 5) npm run gen:types (jamais de redirection > directe)
