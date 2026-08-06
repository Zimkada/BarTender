-- ===================================================================
-- MIGRATION: dish_recipe_components — le lien plat composé → plat-base
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.0 du module restauration (§13.8, §12.4.d)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Le régime `batch_finish` (§16.8) sert un plat en prélevant une portion
--   dans le lot d'un AUTRE plat : « spaghetti-poulet » prend une portion du
--   plat-base « spaghetti cuits », puis ajoute ses ingrédients de finition.
--
--   ⛔ Rien ne porte ce lien aujourd'hui. Un plat `batch_finish` ne sait donc
--   PAS dans quel lot prélever — le régime est inapplicable en l'état.

-- ⚠️ DETTE DE LA PHASE 2, relevée le 06/08/2026 à la certification du cadrage
--   3B. Le séquençage (§14) place cette table en phase 2, livrée. Elle ne
--   l'a jamais été : absente de la base ET de `dishes.service.ts`. Le manque
--   n'est apparu qu'en préparant 3B, parce que c'est le premier régime qui
--   s'en sert.

-- ⭐⭐ RECETTE (modèle) ≠ LOT (instance) — §12.4.d
--   Cette table est le MODÈLE : « ce plat contient 1 portion de sauce ».
--   Elle ne porte AUCUN coût : une recette dit une quantité, jamais un prix.
--   Le coût vit sur l'INSTANCE — `kitchen_item_batch_consumptions` (3B.2),
--   qui enregistre quel lot a réellement été prélevé et à quel `unit_cost`.
--   ⛔ Mettre un coût ici le figerait à la conception de la recette, alors
--   qu'il change à chaque lot produit.

-- ⭐ DEUX AXES INDÉPENDANTS, à ne pas confondre (cf. commentaire de
--   `dishes_batch_portions_coherence`, migration 20260803100000) :
--     · `is_batch_base`   = ce plat PRODUIT un lot
--     · `production_mode` = comment ce plat est SERVI
--   Un plat `batch_finish` n'est PAS un plat-base : il consomme le lot d'un
--   autre. C'est précisément ce que cette table exprime.

-- BREAKING_CHANGE: NO
--   Table NEUVE. Aucune table, vue ou RPC existante touchée. Un bar pur ne
--   la lit jamais (`enabled: hasRestaurant` côté client).

-- ROLLBACK_STRATEGY:
--   DROP TABLE IF EXISTS public.dish_recipe_components;
--   (aucune donnée à préserver : table vide à la création)

-- TABLES_CREATED: dish_recipe_components
-- INDEXES_CREATED: idx_drc_dish, idx_drc_base_dish, idx_drc_unique
-- RLS_CHANGES: RLS activée + 1 policy SELECT (écriture par RPC uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT to_regclass('public.dish_recipe_components') AS deja_la;
--    -- ATTENDU : NULL
--
-- 2) ⛔ BLOQUANT — dépendances :
--
--    SELECT to_regclass('public.dishes') AS t_dishes,
--           to_regclass('public.bars')   AS t_bars,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 2
--
-- 3) ⚠️ INFORMATIF — y a-t-il déjà des plats-bases déclarés ?
--
--    SELECT count(*) FILTER (WHERE is_batch_base) AS plats_bases,
--           count(*) FILTER (WHERE production_mode = 'batch_finish') AS plats_batch_finish
--    FROM public.dishes WHERE is_active;
--    -- Informatif : si `plats_batch_finish` > 0 alors que `plats_bases` = 0,
--    -- ces plats ne pourront rien prélever tant qu'un plat-base n'existe pas.

DO $$
BEGIN
  IF to_regclass('public.dishes') IS NULL THEN
    RAISE EXCEPTION 'Table dishes absente — appliquer d''abord 20260803100000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — RLS impossible';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'Fonction update_updated_at_column() absente — trigger updated_at impossible';
  END IF;
END $$;

BEGIN;

CREATE TABLE public.dish_recipe_components (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⭐ bar_id porté explicitement bien que dérivable via dish_id : convention
  -- d'isolation multi-tenant du projet. Les policies RLS en dépendent —
  -- dériver par jointure alourdirait chaque policy et chaque index.
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- Le plat COMPOSÉ (spaghetti-poulet).
  dish_id       UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,

  -- ⚠️ RESTRICT et non CASCADE, même raisonnement que `dish_ingredients` :
  -- supprimer un plat-base encore utilisé dans une recette doit ÉCHOUER
  -- franchement. Un CASCADE viderait silencieusement des recettes, et le coût
  -- des plats concernés chuterait sans explication.
  base_dish_id  UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,

  -- Portions de base prévues par assiette (1 portion de spaghetti cuits).
  -- ⚠️ NUMERIC et non INTEGER : une demi-portion de sauce est légitime.
  quantity      NUMERIC(10,3) NOT NULL CHECK (quantity > 0),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⛔ UN PLAT NE PEUT PAS SE CONTENIR LUI-MÊME. Cycle le plus court, et le
  -- seul qu'une contrainte de ligne puisse attraper : les cycles à 2 sauts
  -- (A→B, B→A) et la profondeur > 1 relèvent du RPC (§13.8) — une contrainte
  -- SQL pure ne peut pas parcourir un graphe.
  CONSTRAINT drc_no_self_reference CHECK (dish_id <> base_dish_id)
);

-- ⚠️ AUCUNE colonne de coût — voir l'en-tête. Le coût vit sur l'instance
-- (`kitchen_item_batch_consumptions`), jamais sur le modèle.

COMMENT ON TABLE public.dish_recipe_components IS
  '§12.4.d — le MODÈLE des sous-recettes : « ce plat composé contient N portions de ce '
  'plat-base ». Porte une QUANTITÉ, jamais un coût — le coût vit sur l''instance '
  '(kitchen_item_batch_consumptions), car il change à chaque lot produit. '
  '⛔ Un seul niveau de composition, garanti par le RPC et non par une contrainte SQL : '
  'une contrainte de ligne ne peut pas parcourir un graphe (§13.8).';

COMMENT ON COLUMN public.dish_recipe_components.base_dish_id IS
  'Le plat-BASE dont on prélève une portion (is_batch_base = TRUE). '
  '⛔ NE PEUT PAS désigner un plat lui-même composé — vérifié par le RPC upsert, '
  'jamais par la base.';

COMMENT ON COLUMN public.dish_recipe_components.quantity IS
  'Portions de base par assiette. NUMERIC : une demi-portion de sauce est légitime.';

-- ⚠️ UNICITÉ SUR LE COUPLE, contrairement à `dish_ingredients` qui l'a sur un
-- TRIPLET (avec consumed_at_stage). Ici aucun stade : un même plat-base ne
-- peut apparaître qu'UNE fois dans une recette donnée. Deux lignes
-- « spaghetti-poulet contient des spaghetti cuits » double-compteraient le
-- prélèvement, donc le coût.
CREATE UNIQUE INDEX idx_drc_unique
  ON public.dish_recipe_components (dish_id, base_dish_id);

CREATE INDEX idx_drc_dish
  ON public.dish_recipe_components (dish_id);

-- ⭐ Index sur le plat-base : sert la question « quels plats consomment ce
-- lot ? », posée à chaque production et à chaque rupture de lot (l'alerte
-- « lot vide » doit savoir quels plats deviennent indisponibles).
CREATE INDEX idx_drc_base_dish
  ON public.dish_recipe_components (base_dish_id);

CREATE INDEX idx_drc_bar
  ON public.dish_recipe_components (bar_id);

-- ⚠️ TRIGGER `updated_at` — OUBLI trouvé à la code review du 07/08/2026.
-- `dishes` et `dish_ingredients` en ont un ; sans lui la colonne resterait
-- FIGÉE à la date de création, en mentant silencieusement sur la fraîcheur
-- de la donnée. Une colonne `updated_at` qui ne bouge pas est pire que pas
-- de colonne du tout : on lui fait confiance.
CREATE TRIGGER dish_recipe_components_updated_at
  BEFORE UPDATE ON public.dish_recipe_components
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ RLS — lecture seule pour le client, écriture par RPC             │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ Même régime que `dishes` et `dish_ingredients` : `authenticated` ne peut
-- que LIRE. Toute écriture passe par un RPC SECURITY DEFINER, seul endroit où
-- la règle du niveau unique (§13.8) peut être vérifiée. Accorder INSERT ici
-- permettrait de créer une composition à 3 niveaux depuis le client.

ALTER TABLE public.dish_recipe_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drc_bar_members_select"
  ON public.dish_recipe_components FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.dish_recipe_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_recipe_components TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la table existe :
--
--    SELECT to_regclass('public.dish_recipe_components') AS t;
--    -- ATTENDU : non NULL
--
-- 2) ⛔⛔ BLOQUANT — RLS ACTIVE. Sans elle, n'importe quel utilisateur
--    authentifié lirait les recettes de TOUS les bars :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname = 'dish_recipe_components';
--    -- ATTENDU : true
--
-- 3) ⛔⛔ BLOQUANT — `authenticated` ne peut QUE lire :
--
--    SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name='dish_recipe_components'
--    ORDER BY privilege_type;
--    -- ATTENDU : SELECT, et RIEN d'autre.
--    -- ⛔ Un INSERT ici permettrait de créer une composition à plusieurs
--    --    niveaux depuis le client, en contournant le garde du RPC (§13.8).
--
-- 4) ⛔ BLOQUANT — l'auto-référence est rejetée. Test ACTIF, transaction
--    annulée, donc sans effet. ⚠️ Adapter les UUID à un plat réel :
--
--    BEGIN;
--      INSERT INTO public.dish_recipe_components (bar_id, dish_id, base_dish_id, quantity)
--      SELECT d.bar_id, d.id, d.id, 1
--      FROM public.dishes d LIMIT 1;
--      -- ATTENDU : ERREUR « drc_no_self_reference »
--    ROLLBACK;
--
-- 5) ⚠️ Les index sont là :
--
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='dish_recipe_components'
--    ORDER BY indexname;
--    -- ATTENDU : idx_drc_bar, idx_drc_base_dish, idx_drc_dish, idx_drc_unique
--    --           (+ la PK)
