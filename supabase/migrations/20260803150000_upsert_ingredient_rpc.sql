-- ===================================================================
-- MIGRATION: upsert_ingredient — le chaînon manquant
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: correctif de la phase 1 (§16.3)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⛔ PROBLEM — DÉFAUT MAJEUR RELEVÉ LE 03/08/2026
--   Il n'existait AUCUN moyen de créer un ingrédient. Ni RPC, ni service, ni
--   écran. `ingredients` accorde SELECT seul à `authenticated`, et les trois
--   RPC existants (receive_ingredient_supply, consume_ingredients_fefo,
--   discard_ingredient_lot) supposent tous un ingrédient DÉJÀ présent.
--
--   Conséquence : le module cuisine était INUTILISABLE sans un INSERT manuel
--   en base. Pas d'appro possible (sélecteur vide), donc pas de recette, donc
--   pas de marge — toute la phase 2 reposait sur un objet qu'on ne pouvait pas
--   créer.
--
-- ⚠️ COMMENT CE TROU A ÉTÉ MANQUÉ : les couches ont été livrées lecture →
--   écriture, en vérifiant à chaque fois que le chemin d'écriture existait pour
--   ce qui venait d'être ajouté (plats, recettes, catégories). La question
--   « un promoteur qui ouvre l'app, que peut-il faire ? » n'a jamais été posée.
--   Les inventaires cherchaient ce qui pouvait CASSER, aucun ne cherchait ce
--   qui MANQUAIT.

-- ⭐ POURQUOI L'INGRÉDIENT DOIT EXISTER AVANT LA RECETTE
--   `replace_dish_recipe` rejette tout ingredient_id inconnu — et c'est juste.
--   Un ingrédient n'est pas qu'un nom : il porte `unit` (la recette dit
--   « 200 g »), `cost_mode` (qui décide s'il entre au coût du plat), et
--   `flat_cost_per_dish`. Le créer « à la volée » depuis une recette
--   produirait un ingrédient au cost_mode DEVINÉ et au coût nul — la marge du
--   plat serait fausse sans que rien ne le signale.
--   C'est exactement le défaut que §16.3 combat en remplaçant is_transversal.
--   → L'UI doit permettre de le créer SANS QUITTER la recette (même formulaire,
--     pas une version « rapide » qui créerait des objets incomplets).

-- BREAKING_CHANGE: NO — fonction NEUVE.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.upsert_ingredient(UUID, JSONB);
--   ⚠️ Rollback = retour à un module inutilisable sans SQL manuel.

-- FUNCTIONS_CREATED: upsert_ingredient
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction ne doit pas exister :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='upsert_ingredient';
--    -- ATTENDU : 0 ligne. (CREATE OR REPLACE perdrait les GRANTS.)
--
-- 2) La table et le helper RLS existent :
--
--    SELECT to_regclass('public.ingredients') AS t_ingredients,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname='is_bar_member') AS fn_helper;
--    -- ATTENDU : non NULL, >= 1
--
-- 3) ⭐ Combien d'ingrédients existent aujourd'hui — mesure du trou :
--
--    SELECT count(*) AS nb_ingredients FROM public.ingredients;
--    -- Tout ingrédient présent a été créé par un INSERT MANUEL en SQL.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_ingredient'
  ) THEN
    RAISE EXCEPTION
      'upsert_ingredient existe déjà — CREATE OR REPLACE perdrait les GRANTS.';
  END IF;

  IF to_regclass('public.ingredients') IS NULL THEN
    RAISE EXCEPTION 'Table ingredients absente — appliquer d''abord 20260802140000';
  END IF;

  -- ⚠️ `dish_ingredients` est lue par le garde sur l'unité. Sans elle, la
  -- fonction se créerait sans erreur et échouerait à la PREMIÈRE modification
  -- d'unité — un défaut différé, donc difficile à relier à sa cause.
  IF to_regclass('public.dish_ingredients') IS NULL THEN
    RAISE EXCEPTION
      'Table dish_ingredients absente — appliquer d''abord 20260803100000 (lue par le garde sur l''unité)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — filtrage d''accès impossible';
  END IF;
END $$;

CREATE FUNCTION public.upsert_ingredient(
  p_bar_id     UUID,
  p_ingredient JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- ⚠️ sans lui, un search_path manipulé ferait
                           --    résoudre `ingredients` vers une table pirate
AS $$
DECLARE
  v_id         UUID;
  v_name       TEXT;
  v_unit       TEXT;
  v_cost_mode  TEXT;
  v_flat_cost  NUMERIC(12, 2);
  v_min_alert  NUMERIC(14, 3);
  v_actor_id   UUID := auth.uid();
  v_existing   RECORD;
  v_row        RECORD;
  v_recipe_use INTEGER;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS ne s'applique
  -- pas. Sans ce garde, n'importe quel utilisateur créerait des ingrédients
  -- dans le bar de son choix.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  v_id        := NULLIF(p_ingredient->>'id', '')::UUID;
  v_name      := NULLIF(TRIM(p_ingredient->>'name'), '');
  v_unit      := NULLIF(TRIM(p_ingredient->>'unit'), '');
  v_cost_mode := COALESCE(NULLIF(p_ingredient->>'cost_mode', ''), 'direct');
  v_flat_cost := NULLIF(p_ingredient->>'flat_cost_per_dish', '')::NUMERIC;
  v_min_alert := NULLIF(p_ingredient->>'min_stock_alert', '')::NUMERIC;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le nom de l''ingrédient est obligatoire');
  END IF;

  IF v_unit IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'L''unité est obligatoire (kg, L, pièce…)');
  END IF;

  IF v_cost_mode NOT IN ('direct', 'global', 'per_dish_flat', 'cost_only') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Mode de coût inconnu : %s', v_cost_mode));
  END IF;

  -- ⚠️ Miroir de la contrainte `ingredients_flat_cost_coherence`. Sans ce
  -- contrôle, la base lèverait une 23514 brute et illisible.
  -- ⭐ Le forfait est OBLIGATOIRE en per_dish_flat : sans lui, le coût du plat
  -- serait silencieusement NUL — l'ingrédient entrerait au coût pour 0 F.
  IF v_cost_mode = 'per_dish_flat' AND (v_flat_cost IS NULL OR v_flat_cost < 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un coût forfaitaire par plat est obligatoire pour ce mode (ex. huile de friture)'
    );
  END IF;

  -- Le forfait n'a de sens QUE pour per_dish_flat : le neutraliser plutôt que
  -- de refuser, l'utilisateur ayant pu changer de mode après l'avoir saisi.
  IF v_cost_mode <> 'per_dish_flat' THEN
    v_flat_cost := NULL;
  END IF;

  IF v_min_alert IS NOT NULL AND v_min_alert < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le seuil d''alerte ne peut pas être négatif');
  END IF;

  IF v_id IS NULL THEN
    -- ── CRÉATION ──
    -- ⚠️ Doublon intercepté ICI : l'index unique partiel
    -- `idx_ingredients_unique_name_per_bar` lèverait une 23505 illisible.
    -- Comparaison sur lower(name), comme l'index.
    IF EXISTS (
      SELECT 1 FROM public.ingredients
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name) AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('L''ingrédient « %s » existe déjà', v_name));
    END IF;

    INSERT INTO public.ingredients (
      bar_id, name, unit, cost_mode, flat_cost_per_dish, min_stock_alert, created_by
    ) VALUES (
      p_bar_id, v_name, v_unit, v_cost_mode, v_flat_cost, v_min_alert, v_actor_id
    )
    RETURNING * INTO v_row;

  ELSE
    -- ── MODIFICATION ──
    SELECT * INTO v_existing
    FROM public.ingredients
    WHERE id = v_id AND bar_id = p_bar_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ingrédient introuvable dans ce bar');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ingredients
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name)
        AND is_active = TRUE AND id <> v_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('L''ingrédient « %s » existe déjà', v_name));
    END IF;

    -- ⭐⭐ L'UNITÉ EST FIGÉE DÈS QU'UN LOT OU UNE RECETTE EXISTE.
    --
    -- C'est le garde le plus important de cette fonction. `ingredient_lots`
    -- stocke des quantités EN UNITÉ D'USAGE, et `dish_ingredients` aussi.
    -- Passer « kg » à « g » ne convertit RIEN : un stock de 12,5 kg
    -- deviendrait 12,5 g, et une recette de 200 g deviendrait 200 kg. Le coût
    -- matière serait faux d'un facteur 1000, SANS AUCUNE ERREUR.
    --
    -- ⚠️ Refuser plutôt que convertir : une conversion automatique supposerait
    -- de connaître tous les couples d'unités (kg↔g oui, mais L↔pièce ?), et
    -- se tromperait silencieusement sur les cas inconnus.
    -- ⚠️ Comparaison insensible à la CASSE : « KG » et « kg » sont la même
    -- unité. Une comparaison stricte déclencherait le refus ci-dessous pour
    -- une simple correction de saisie, avec un message incompréhensible
    -- (« l'unité ne peut plus être modifiée » alors qu'elle ne change pas).
    IF lower(v_unit) <> lower(v_existing.unit) THEN
      -- ⚠️ Le comptage porte sur les plats ACTIFS et les lots NON SOLDÉS.
      --
      -- Sans ces filtres, le garde bloquerait pour de mauvaises raisons :
      --   • `dishes` fait un SOFT delete (is_active = false), donc le CASCADE
      --     de dish_ingredients ne se déclenche JAMAIS. Les lignes de recette
      --     d'un plat retiré du menu restent en base — elles feraient refuser
      --     un changement d'unité à cause d'un plat qui n'existe plus pour
      --     l'utilisateur, avec un message incompréhensible.
      --   • un lot 'depleted' ou 'discarded' est de l'HISTORIQUE : sa quantité
      --     est figée, plus aucun calcul ne s'en sert.
      -- ⚠️ Cas encore INATTEIGNABLE (deactivate_dish n'existe pas), mais il le
      --    deviendra — mieux vaut traiter maintenant qu'un piège différé.
      SELECT
        (SELECT count(*) FROM public.ingredient_lots
          WHERE ingredient_id = v_id AND status = 'active')
        + (SELECT count(*) FROM public.dish_ingredients di
           JOIN public.dishes d ON d.id = di.dish_id
           WHERE di.ingredient_id = v_id AND d.is_active = TRUE)
      INTO v_recipe_use;

      IF v_recipe_use > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format(
            'L''unité ne peut plus être modifiée : « %s » est utilisé dans %s lot(s) ou recette(s). '
            'Les quantités enregistrées sont exprimées en %s — les convertir automatiquement '
            'fausserait le stock et les coûts.',
            v_existing.name, v_recipe_use, v_existing.unit
          )
        );
      END IF;
    END IF;

    UPDATE public.ingredients SET
      name               = v_name,
      unit               = v_unit,
      cost_mode          = v_cost_mode,
      flat_cost_per_dish = v_flat_cost,
      min_stock_alert    = v_min_alert
      -- ⚠️ current_stock et last_unit_cost ABSENTS volontairement : ce sont des
      -- caches alimentés par les RPC de lot. Les exposer ici permettrait de
      -- « corriger » un stock à la main, contournant le FEFO et la table des
      -- dettes — exactement ce que §13.2 rend visible.
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('success', true, 'ingredient', to_jsonb(v_row));
END;
$$;

COMMENT ON FUNCTION public.upsert_ingredient(UUID, JSONB) IS
  'Crée ou modifie un ingrédient — chaînon qui MANQUAIT à la phase 1 (relevé le 03/08/2026 : '
  'aucun moyen de créer un ingrédient hors INSERT manuel, rendant tout le module inutilisable). '
  '⭐ N''expose PAS current_stock ni last_unit_cost : ce sont des caches alimentés par les RPC '
  'de lot. Les rendre modifiables permettrait de corriger un stock à la main, contournant le '
  'FEFO et la table des dettes (§13.2). '
  '⭐⭐ L''UNITÉ est FIGÉE dès qu''un lot ou une recette existe : les quantités enregistrées '
  'sont exprimées dans cette unité, et les convertir fausserait stock et coûts d''un facteur '
  '1000 (kg→g) sans lever la moindre erreur.';

REVOKE ALL ON FUNCTION public.upsert_ingredient(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ingredient(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ingredient(UUID, JSONB) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Signature et attributs :
--
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--           p.prosecdef AS security_definer, p.proconfig AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='upsert_ingredient';
--    -- ATTENDU : 'p_bar_id uuid, p_ingredient jsonb' | true | {search_path=public}
--
-- 2) ⚠ CRITIQUE — `anon` ne doit PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon','public.upsert_ingredient(uuid,jsonb)','EXECUTE') AS anon,
--           has_function_privilege('authenticated','public.upsert_ingredient(uuid,jsonb)','EXECUTE') AS auth;
--    -- ATTENDU : false | true
--
-- 3) ⚠ La table reste en LECTURE SEULE pour authenticated (non-régression) :
--
--    SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name='ingredients';
--    -- ATTENDU : SELECT uniquement.
--
-- ⭐ TESTS FONCTIONNELS — depuis l'APPLICATION (le SQL Editor a auth.uid() = NULL) :
--
-- ☐ 4a. Créer « Poulet », unité kg, mode direct → succès
-- ☐ 4b. Recréer « poulet » (casse différente) → « existe déjà »
-- ☐ 4c. Créer en mode per_dish_flat SANS forfait → message métier, pas une 23514
-- ☐ 4d. ⭐ Créer un ingrédient, l'utiliser dans une recette, puis tenter de
--        changer son unité → REFUS explicite mentionnant le nombre d'usages.
--        C'est le garde le plus important : une conversion silencieuse
--        fausserait les coûts d'un facteur 1000.
-- ☐ 4e. Changer l'unité d'un ingrédient JAMAIS utilisé → autorisé
-- ☐ 4f. ⭐ Corriger « kg » en « KG » sur un ingrédient UTILISÉ → doit RÉUSSIR.
--        La comparaison est insensible à la casse : une comparaison stricte
--        refuserait une simple correction de saisie avec un message absurde
--        (« l'unité ne peut plus être modifiée » alors qu'elle ne change pas).
-- ☐ 4g. ⭐ Un lot 'depleted' ou 'discarded' ne doit PAS bloquer le changement
--        d'unité : c'est de l'historique, sa quantité est figée.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Fonction NEUVE, appelée uniquement derrière `hasRestaurant`. Aucune table
--    existante touchée.
