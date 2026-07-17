-- MIGRATION A : Colonnes de facturation dédiées + trigger de garde + source unique de prix
-- DATE: 2026-07-16
-- AUTHOR: BarTender
--
-- PROBLEM: Les champs d'abonnement (subscriptionDueDate/subscriptionStartDate) vivent dans
--          bars.settings (JSONB), or la policy RLS "Bar owners can update bars" autorise
--          promoteur/gérant à écrire dans bars.settings. Ajouter billingExempt dans settings
--          permettrait à un promoteur de S'AUTO-EXEMPTER de paiement via l'API directe.
-- IMPACT:  Sécurité facturation (tous les bars) + préparation intégration FedaPay.
-- SOLUTION: Colonnes dédiées sur bars, protégées par un TRIGGER de garde (un REVOKE par
--           colonne serait un no-op face au GRANT UPDATE table-level de Supabase — RLS est
--           par ligne, pas par colonne). Seuls les RPC SECURITY DEFINER (owner postgres) et
--           service_role peuvent modifier ces colonnes.
--           + Colonnes provider sur subscription_payments (idempotence webhook FedaPay).
--           + Fonction get_plan_price() : source unique du prix côté serveur.
--
-- BREAKING_CHANGE: NO (additif — la migration de données purge settings après copie)
-- TABLES_MODIFIED: bars (+4 colonnes), subscription_payments (+2 colonnes)
-- RLS_CHANGES: aucun (le trigger complète les policies existantes)
-- À EXÉCUTER À LA MAIN dans le SQL Editor, AVANT la migration B (20260716000001).

BEGIN;

-- =====================================================
-- 1. COLONNES DE FACTURATION SUR bars
-- =====================================================

ALTER TABLE public.bars
  ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_exempt_reason TEXT,
  ADD COLUMN IF NOT EXISTS subscription_due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;

-- =====================================================
-- 2. COLONNES PROVIDER SUR subscription_payments
-- =====================================================

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'fedapay')),
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- Clé d'idempotence des webhooks FedaPay (retries) : une transaction provider
-- ne peut produire qu'un seul paiement. Index PARTIEL : tout ON CONFLICT devra
-- répéter exactement le même WHERE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_provider_txn
  ON public.subscription_payments (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- =====================================================
-- 2b. TABLE D'INTENT DE PAIEMENT (anti-forgery webhook)
-- =====================================================
-- 🛡️ Le webhook ne DOIT jamais faire confiance au corps de la requête FedaPay
-- (la signature HMAC prouve seulement que FedaPay a émis l'événement depuis notre
-- compte marchand, PAS que notre serveur a créé cette transaction). Cette table
-- mémorise, AU CHECKOUT, chaque transaction que NOUS avons légitimement créée,
-- avec le bar/plan/mois/montant faisant autorité. Le webhook croise l'ID de
-- transaction reçu contre cette table et rejette tout ID inconnu ; le montant et
-- le bar crédités proviennent de l'intent, jamais de custom_metadata.

CREATE TABLE IF NOT EXISTS public.subscription_payment_intents (
  provider_transaction_id TEXT PRIMARY KEY,
  bar_id          UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL,
  months_covered  INT NOT NULL CHECK (months_covered >= 1),
  expected_amount NUMERIC NOT NULL CHECK (expected_amount > 0),
  created_by      UUID REFERENCES public.users(id),
  consumed_at     TIMESTAMPTZ,           -- fixé quand le paiement est enregistré
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_bar
  ON public.subscription_payment_intents (bar_id, created_at DESC);

-- RLS : accès service_role uniquement (créé au checkout, lu au webhook — tous deux
-- côté serveur). Aucune policy pour authenticated/anon → aucun accès via PostgREST.
ALTER TABLE public.subscription_payment_intents ENABLE ROW LEVEL SECURITY;
-- (Pas de policy = deny-all pour authenticated/anon. service_role bypasse la RLS.)

-- =====================================================
-- 3. MIGRATION DES DONNÉES settings -> colonnes
-- =====================================================
-- Guard regex : tolère les valeurs malformées (mêmes règles que l'ancien RPC)
-- au lieu d'avorter la migration.

UPDATE public.bars
SET
  subscription_due_date = CASE
    WHEN (settings->>'subscriptionDueDate') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (settings->>'subscriptionDueDate')::timestamptz
    ELSE NULL
  END,
  subscription_start_date = CASE
    WHEN (settings->>'subscriptionStartDate') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (settings->>'subscriptionStartDate')::timestamptz
    ELSE NULL
  END
WHERE settings ? 'subscriptionDueDate' OR settings ? 'subscriptionStartDate';

-- Purge des clés migrées : les colonnes deviennent la SEULE source de vérité.
UPDATE public.bars
SET settings = settings - 'subscriptionDueDate' - 'subscriptionStartDate'
WHERE settings ? 'subscriptionDueDate' OR settings ? 'subscriptionStartDate';

-- =====================================================
-- 4. TRIGGER DE GARDE — colonnes de facturation
-- =====================================================
-- 🛡️ Bloque toute modification des colonnes de facturation hors chemins autorisés.
-- Les RPC SECURITY DEFINER s'exécutent en 'postgres' (owner) et le webhook FedaPay
-- en 'service_role' : ils passent. Une requête API directe d'un promoteur s'exécute
-- en 'authenticated' : elle est rejetée. C'est LA barrière anti auto-exemption.

CREATE OR REPLACE FUNCTION public.guard_bars_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt
      OR NEW.billing_exempt_reason IS DISTINCT FROM OLD.billing_exempt_reason
      OR NEW.subscription_due_date IS DISTINCT FROM OLD.subscription_due_date
      OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date)
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Billing columns can only be modified via authorized RPCs';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bars_billing ON public.bars;
CREATE TRIGGER trg_guard_bars_billing
  BEFORE UPDATE ON public.bars
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_bars_billing_columns();

-- =====================================================
-- 5. SOURCE UNIQUE DE PRIX CÔTÉ SERVEUR
-- =====================================================
-- ⭐ SYNCHRONISER avec src/config/plans.ts (PLANS[*].monthlyPriceXOF).
-- Consommée par get_subscription_overview, record_provider_subscription_payment
-- (migration B) et l'Edge Function create-subscription-checkout. Un changement de
-- prix se fait ICI + plans.ts (2 endroits, plus jamais 3).

CREATE OR REPLACE FUNCTION public.get_plan_price(p_plan TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_plan, 'starter')
    WHEN 'pro' THEN 15000
    WHEN 'enterprise' THEN 30000
    ELSE 9000
  END::NUMERIC;
$$;

-- CREATE (OR REPLACE) accorde EXECUTE à PUBLIC par défaut : verrouiller d'abord.
REVOKE ALL ON FUNCTION public.get_plan_price(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_price(TEXT) TO authenticated, service_role;

COMMIT;

-- =====================================================
-- POST-VOL (exécuter après COMMIT, vérifier chaque résultat)
-- =====================================================
-- 1) Données migrées et clés purgées :
-- SELECT id, name, subscription_due_date, subscription_start_date, billing_exempt,
--        settings ? 'subscriptionDueDate' AS still_in_settings
-- FROM public.bars;
--
-- 2) Privilèges de la fonction prix :
-- SELECT has_function_privilege('anon', 'public.get_plan_price(text)', 'EXECUTE');          -- false
-- SELECT has_function_privilege('authenticated', 'public.get_plan_price(text)', 'EXECUTE'); -- true
-- SELECT has_function_privilege('service_role', 'public.get_plan_price(text)', 'EXECUTE');  -- true
--
-- 3) Trigger en place :
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.bars'::regclass AND tgname = 'trg_guard_bars_billing';
--
-- 4) 🛡️ TEST SÉCURITÉ CENTRAL (via l'UI en promoteur — auth.uid() est NULL dans le SQL Editor) :
--    supabase.from('bars').update({ billing_exempt: true }).eq('id', '<mon-bar>')
--    → doit échouer : "Billing columns can only be modified via authorized RPCs"
