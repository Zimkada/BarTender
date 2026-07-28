-- MIGRATION : Rattrapage des bars "never_paid" + exemption des bars en pause
-- DATE: 2026-07-28
-- AUTHOR: BarTender
--
-- PROBLEM: 9 bars ont subscription_due_date = NULL (statut 'never_paid') car créés
--          AVANT la mise en place de l'essai gratuit auto / de la facturation. Ils
--          sont hors du circuit. Parmi la base : de vrais clients actifs, le bar
--          système, un bar de test, des bars en pause, un bar suspendu.
-- IMPACT:  Facturation des abonnements (ces bars n'étaient jamais relancés).
-- SOLUTION: 4 traitements distincts selon l'état réel du bar :
--           (a) EXEMPTER système + bar de test.
--           (b) EXEMPTER les bars "en pause" (motif dédié, réversible via l'admin) —
--               y compris COUR DES GRANDS qui a une échéance mais est en pause.
--           (c) EXCLURE les bars SUSPENDUS (is_active=false) — non facturés, laissés
--               tels quels jusqu'à réactivation.
--           (d) FACTURATION IMMÉDIATE des vrais bars ACTIFS never_paid restants.
--
-- ⚠️ Colonnes de facturation protégées par le trigger guard_bars_billing_columns
--    (seuls postgres/service_role/supabase_admin écrivent). Le SQL Editor s'exécute
--    en 'postgres' → les UPDATE passent le trigger.
--
-- BREAKING_CHANGE: NO (rattrapage de données ponctuel)
-- TABLES_MODIFIED: bars (données uniquement)
-- À EXÉCUTER À LA MAIN dans le SQL Editor.

BEGIN;

-- =====================================================
-- (a) EXEMPTER : bar système + bar de test
-- =====================================================

UPDATE public.bars
SET billing_exempt        = true,
    billing_exempt_reason = 'Bar système interne (super admins)'
WHERE id = '00000000-0000-0000-0000-000000000000';

UPDATE public.bars
SET billing_exempt        = true,
    billing_exempt_reason = 'Bar de test interne'
WHERE name = 'BAR-TEST'
  AND subscription_due_date IS NULL;

-- =====================================================
-- (b) EXEMPTER : bars "en pause" (activité suspendue temporairement)
-- =====================================================
-- Réversible : retirer l'exemption via l'admin quand ils reprennent.
-- COUR DES GRANDS ciblé par id car il a déjà une échéance (pas never_paid),
-- donc non attrapé par un filtre subscription_due_date IS NULL.

UPDATE public.bars
SET billing_exempt        = true,
    billing_exempt_reason = 'En pause (activité suspendue temporairement)'
WHERE name IN ('Bar Restau ESPOIR', 'DAÏBI B. C.')
  AND subscription_due_date IS NULL;

UPDATE public.bars
SET billing_exempt        = true,
    billing_exempt_reason = 'En pause (activité suspendue temporairement)'
WHERE id = '81a9b77b-a981-4a87-821d-ec1b1e3c939c';  -- COUR DES GRANDS

-- =====================================================
-- (d) FACTURATION IMMÉDIATE : vrais bars ACTIFS never_paid restants
-- =====================================================
-- subscription_due_date = now() → 'due_soon' aujourd'hui puis 'overdue'.
-- Le filtre exclut AUTOMATIQUEMENT :
--   - les exemptés (étapes a/b : système, BAR-TEST, ESPOIR, DAÏBI, COUR DES GRANDS)
--   - les bars SUSPENDUS (is_active = false, ex. Le Privilège) → non facturés.
-- Ne restent que les vrais bars actifs never_paid (Le Marché, LAS VEGAS,
-- Tour Eiffel, PRESTIGE BAR 2, etc.).

UPDATE public.bars
SET subscription_due_date   = now(),
    subscription_start_date = now()
WHERE subscription_due_date IS NULL
  AND billing_exempt = false
  AND is_active = true;

COMMIT;

-- =====================================================
-- POST-VOL
-- =====================================================
-- 1) Répartition finale :
-- SELECT
--   CASE WHEN billing_exempt THEN 'exempté'
--        WHEN NOT is_active AND subscription_due_date IS NULL THEN 'suspendu (non facturé)'
--        WHEN subscription_due_date IS NULL THEN 'never_paid RESTANT'
--        ELSE 'a une échéance' END AS categorie,
--   COUNT(*) AS nb
-- FROM public.bars GROUP BY categorie ORDER BY categorie;
--   → attendu : 'exempté' = 5 (système + BAR-TEST + ESPOIR + DAÏBI + COUR DES GRANDS),
--               'suspendu (non facturé)' = 1 (Le Privilège),
--               'never_paid RESTANT' = 0,
--               'a une échéance' = les vrais bars actifs.
--
-- 2) Bars mis en facturation aujourd'hui :
-- SELECT name, subscription_due_date FROM public.bars
-- WHERE subscription_due_date::date = CURRENT_DATE ORDER BY name;
--
-- 3) Le Privilège (suspendu) non facturé :
-- SELECT name, is_active, subscription_due_date, billing_exempt
-- FROM public.bars WHERE name = 'Le Privilège';
--   → attendu : is_active=false, subscription_due_date=NULL, billing_exempt=false
