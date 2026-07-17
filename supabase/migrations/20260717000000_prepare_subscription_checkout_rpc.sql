-- MIGRATION C : RPC prepare_subscription_checkout (autorisation + montant côté SQL)
-- DATE: 2026-07-17
-- AUTHOR: BarTender
--
-- PROBLEM: l'Edge Function create-subscription-checkout faisait des SELECT directs
--          sur bars et bar_members via un client service_role. Or service_role n'a
--          AUCUN privilège sur ces tables (REVOKE hérité du durcissement RPC des
--          vagues 1-4 — [[project_rpc_security_hardening]]), d'où un échec Postgres
--          42501 "permission denied for table bar_members" → 403 systématique.
-- IMPACT:  le paiement FedaPay (checkout) était totalement bloqué (403).
-- SOLUTION: déplacer toute la logique serveur (autorisation membre/owner + lecture
--           du plan + calcul du montant) dans un RPC SECURITY DEFINER, exécuté avec
--           les privilèges de l'owner (postgres) — indépendant des GRANT service_role.
--           L'Edge Function n'accède plus jamais aux tables en direct : elle appelle
--           ce RPC, get_plan_price, et record_subscription_intent (tous SECURITY DEFINER).
--
-- ⭐ Appelé par l'Edge Function en service_role (auth.uid() = NULL). L'identité de
-- l'appelant réel (promoteur/gérant) est passée en paramètre p_caller_id, extraite
-- du JWT DÉJÀ VÉRIFIÉ par getUser() côté Edge Function. On ne peut pas se fier à
-- auth.uid() ici, mais on peut se fier à p_caller_id car le JWT a été validé en amont.
--
-- BREAKING_CHANGE: NO (additif)
-- TABLES_MODIFIED: aucune (RPC uniquement)
-- RLS_CHANGES: aucun
-- À EXÉCUTER À LA MAIN dans le SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_subscription_checkout(
  p_caller_id      UUID,
  p_bar_id         UUID,
  p_months_covered INT
)
RETURNS TABLE (
  plan            TEXT,
  expected_amount NUMERIC,
  bar_name        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bar    public.bars;
  v_plan   TEXT;
BEGIN
  IF p_months_covered NOT IN (1, 3, 6, 12) THEN
    RAISE EXCEPTION 'Invalid months_covered: %', p_months_covered;
  END IF;

  SELECT * INTO v_bar FROM public.bars WHERE id = p_bar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bar not found: %', p_bar_id;
  END IF;

  -- 🛡️ Autorisation : owner du bar, OU membre actif promoteur/gérant.
  -- p_caller_id vient du JWT vérifié côté Edge Function (getUser()).
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

  RETURN QUERY SELECT
    v_plan,
    public.get_plan_price(v_plan) * p_months_covered,
    v_bar.name;
END;
$$;

-- 🛡️ service_role UNIQUEMENT (appelée par l'Edge Function). Jamais anon/authenticated
-- en direct (l'autorisation se fait via p_caller_id, pas auth.uid()).
REVOKE ALL ON FUNCTION public.prepare_subscription_checkout(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_subscription_checkout(UUID, UUID, INT) TO service_role;

COMMIT;

-- =====================================================
-- POST-VOL
-- =====================================================
-- SELECT has_function_privilege('service_role',  'public.prepare_subscription_checkout(uuid,uuid,int)', 'EXECUTE'); -- true
-- SELECT has_function_privilege('authenticated', 'public.prepare_subscription_checkout(uuid,uuid,int)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('anon',          'public.prepare_subscription_checkout(uuid,uuid,int)', 'EXECUTE'); -- false
-- Smoke test (remplacer les UUID par un vrai couple promoteur/bar) :
-- SELECT * FROM public.prepare_subscription_checkout(
--   'bf4502a6-0f67-4e07-924e-51778d253427', '66f6a6a9-35d7-48b9-a49a-4075c45ea452', 1);
-- → doit retourner (plan, expected_amount, bar_name)
