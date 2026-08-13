-- ===================================================================
-- MIGRATION: kitchen_item_batch_consumptions — les prélèvements réels
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.2 du module restauration (§12.4.d)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐⭐ RECETTE (modèle) ≠ LOT (instance) — §12.4.d
--   `dish_recipe_components` dit « ce plat contient 1 portion de spaghetti
--   cuits ». CETTE table dit « CETTE ligne de commande a prélevé 1 portion
--   DU LOT #47, à 320 F la portion ».
--
--   ⛔ Le coût vit ICI, pas sur la recette. Deux assiettes du même plat
--   servies à une semaine d'écart n'ont pas le même coût matière — elles
--   viennent de lots différents. Un coût porté par la recette les
--   moyennerait et rendrait la marge fausse pour les deux.

-- ⭐ POURQUOI UNE TABLE ET NON UNE COLONNE SUR `kitchen_order_items`
--   Une ligne peut prélever dans PLUSIEURS lots : commander 5 spaghetti
--   quand le lot en cours n'en a plus que 2 en prend 2 dans celui-ci et 3
--   dans le suivant. Une colonne `batch_id` unique ne pourrait pas
--   l'exprimer, et le coût de la ligne serait celui d'un seul lot.

-- ⚠️ AUCUNE FK VERS `kitchen_order_items` EN CASCADE
--   RESTRICT : supprimer une ligne de commande qui a prélevé de la matière
--   doit ÉCHOUER. Le prélèvement est un fait comptable — la matière est
--   sortie du lot, l'effacer laisserait le lot en déficit silencieux.

-- BREAKING_CHANGE: NO
--   Table NEUVE. Aucune table, vue ou RPC existante touchée.

-- ROLLBACK_STRATEGY:
--   DROP TABLE IF EXISTS public.kitchen_item_batch_consumptions;
--   ⚠️ À ne faire que si AUCUN prélèvement n'a eu lieu : la table porte le
--   coût matière réel des plats servis, non reconstituable après coup.

-- TABLES_CREATED: kitchen_item_batch_consumptions
-- INDEXES_CREATED: idx_kibc_item, idx_kibc_batch, idx_kibc_bar
-- RLS_CHANGES: RLS activée + 1 policy SELECT (écriture par RPC uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT to_regclass('public.kitchen_item_batch_consumptions') AS deja_la;
--    -- ATTENDU : NULL
--
-- 2) ⛔ BLOQUANT — dépendances :
--
--    SELECT to_regclass('public.kitchen_order_items') AS t_items,
--           to_regclass('public.production_batches')  AS t_batches,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin',
--                                'update_updated_at_column')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 3

DO $$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'kitchen_order_items absente — appliquer d''abord 20260804120000';
  END IF;
END $$;

BEGIN;

CREATE TABLE public.kitchen_item_batch_consumptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- ⚠️ RESTRICT : un prélèvement est un fait comptable. Supprimer la ligne
  -- de commande qui l'a produit laisserait le lot en déficit silencieux.
  kitchen_order_item_id UUID NOT NULL
    REFERENCES public.kitchen_order_items(id) ON DELETE RESTRICT,

  production_batch_id   UUID NOT NULL
    REFERENCES public.production_batches(id) ON DELETE RESTRICT,

  -- Portions réellement prélevées dans CE lot.
  quantity      NUMERIC(10,3) NOT NULL CHECK (quantity > 0),

  -- ⭐⭐ COPIE du `unit_cost` du lot AU MOMENT du prélèvement.
  -- ⚠️ Dupliqué VOLONTAIREMENT depuis `production_batches`. On pourrait le
  -- lire par jointure — mais le lot peut être corrigé ou clôturé, et le coût
  -- d'une assiette DÉJÀ SERVIE ne doit jamais bouger rétroactivement. Le
  -- snapshot est la seule façon de le garantir (même principe que
  -- `computed_cost` sur la ligne de commande).
  unit_cost     NUMERIC(12,4) NOT NULL CHECK (unit_cost >= 0),

  consumed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⚠️ Un même couple (ligne, lot) ne peut apparaître qu'une fois : deux
  -- lignes identiques double-compteraient le prélèvement, donc le coût.
  -- ⭐ C'est aussi ce qui rend `mark_kitchen_item_ready` idempotente côté
  -- lots : un rejeu heurterait cette contrainte au lieu de re-prélever.
  CONSTRAINT kibc_unique_item_batch UNIQUE (kitchen_order_item_id, production_batch_id)
);

COMMENT ON TABLE public.kitchen_item_batch_consumptions IS
  '§12.4.d — l''INSTANCE des prélèvements : « cette ligne a pris 1 portion du lot #47 à 320 F ». '
  '⭐ Le coût vit ICI, jamais sur la recette : deux assiettes du même plat servies à une '
  'semaine d''écart viennent de lots différents et n''ont pas le même coût matière. '
  '⚠️ Une ligne peut prélever dans PLUSIEURS lots (5 portions quand le lot courant n''en a que '
  '2), d''où une table et non une colonne sur kitchen_order_items.';

COMMENT ON COLUMN public.kitchen_item_batch_consumptions.unit_cost IS
  '⭐ SNAPSHOT du coût du lot au moment du prélèvement, dupliqué volontairement. Le lot peut '
  'être corrigé ou clôturé — le coût d''une assiette déjà servie ne doit jamais bouger '
  'rétroactivement.';

CREATE INDEX idx_kibc_item
  ON public.kitchen_item_batch_consumptions (kitchen_order_item_id);

-- ⭐ « Qu'est-ce qui a été prélevé dans ce lot ? » — la traçabilité d'un lot,
-- posée quand un coût surprend ou qu'un lot se vide plus vite que prévu.
CREATE INDEX idx_kibc_batch
  ON public.kitchen_item_batch_consumptions (production_batch_id);

CREATE INDEX idx_kibc_bar
  ON public.kitchen_item_batch_consumptions (bar_id, consumed_at);

CREATE TRIGGER kitchen_item_batch_consumptions_updated_at
  BEFORE UPDATE ON public.kitchen_item_batch_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ RLS — lecture seule pour le client, écriture par RPC              │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ Un INSERT direct permettrait de déclarer un prélèvement SANS décrémenter
-- le lot : de la matière apparaîtrait de nulle part, avec un coût inventé.

ALTER TABLE public.kitchen_item_batch_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kibc_bar_members_select"
  ON public.kitchen_item_batch_consumptions FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.kitchen_item_batch_consumptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_item_batch_consumptions TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la table existe :
--
--    SELECT to_regclass('public.kitchen_item_batch_consumptions') AS t;
--    -- ATTENDU : non NULL
--
-- 2) ⛔⛔ BLOQUANT — RLS ACTIVE :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname = 'kitchen_item_batch_consumptions';
--    -- ATTENDU : true
--
-- 3) ⛔⛔ BLOQUANT — `authenticated` ne peut QUE lire :
--
--    SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name='kitchen_item_batch_consumptions'
--    ORDER BY privilege_type;
--    -- ATTENDU : SELECT, et RIEN d'autre.
--    -- ⛔ Un INSERT permettrait de déclarer un prélèvement SANS décrémenter
--    --    le lot : de la matière apparaîtrait de nulle part.
--
-- 4) ⛔ BLOQUANT — l'unicité (ligne, lot) protège du double-prélèvement :
--
--    SELECT indexdef FROM pg_indexes
--    WHERE schemaname='public'
--      AND indexname LIKE '%kibc_unique_item_batch%';
--    -- ATTENDU : contient « UNIQUE »
--    -- ⛔ Sans elle, un rejeu de mark_kitchen_item_ready prélèverait DEUX
--    --    fois dans le même lot.
--
-- 5) ⚠️ Index et trigger :
--
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='kitchen_item_batch_consumptions'
--    ORDER BY indexname;
--    -- ATTENDU : idx_kibc_bar, idx_kibc_batch, idx_kibc_item,
--    --           kibc_unique_item_batch (+ la PK)
--
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.kitchen_item_batch_consumptions'::regclass
--      AND NOT tgisinternal;
--    -- ATTENDU : kitchen_item_batch_consumptions_updated_at
