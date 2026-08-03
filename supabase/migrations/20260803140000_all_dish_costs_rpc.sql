-- ===================================================================
-- MIGRATION: calculate_all_dish_costs — coûts de TOUS les plats en UN appel
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration (§8, §9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `calculate_dish_cost` répond pour UN plat. La maquette du §9 affiche la
--   marge sur CHAQUE ligne de la liste :
--       🍗 Poulet braisé   2 500 F • coût 1 450 F • marge 42 %
--   L'appeler en boucle serait un N+1 : 40 plats = 40 requêtes à chaque
--   affichage, sur un projet qui a mené 3 vagues d'optimisation pour ramener
--   l'egress à ~200 MB/j.

-- ⭐⭐ POURQUOI C'EST LE LIVRABLE DE LA PHASE 2, PAS UN CONFORT
--   Le plan annonce : « le promoteur découvre la marge réelle de ses plats —
--   souvent une révélation ». Une marge qu'il faut ouvrir plat par plat pour
--   consulter n'est PAS une révélation : il faudrait ouvrir 15 recettes et
--   noter les chiffres à la main. Personne ne le fera.
--   La question à laquelle cet écran doit répondre est « LEQUEL de mes plats
--   me fait perdre de l'argent ? » — elle exige une COMPARAISON, donc une vue
--   d'ensemble.

-- ⚠️⚠️ INVARIANT CRITIQUE — MÊME CALCUL QUE `calculate_dish_cost`
--   Les deux fonctions doivent produire le MÊME coût pour le même plat :
--     - même ordre FEFO       : expires_at NULLS LAST, received_at
--     - mêmes filtres de lots : status='active' AND remaining_qty > 0
--     - même quantité brute   : quantity / yield_factor (DIVISION)
--     - mêmes 4 cost_mode     : direct / per_dish_flat / global / cost_only
--     - mêmes exclusions      : is_optional hors du total
--   ⛔ Toute divergence afficherait DEUX MARGES DIFFÉRENTES pour le même plat
--      selon qu'on regarde la liste ou la recette. Le promoteur ne saurait
--      plus laquelle croire — pire qu'une absence de chiffre.
--   ⚠️ Toute correction future de l'un DOIT être portée sur l'autre. C'est le
--      coût assumé de la duplication ; la factoriser en une fonction commune
--      appelée par ligne réintroduirait le N+1 côté SQL.

-- ⭐ DIFFÉRENCE DE PÉRIMÈTRE assumée avec la version unitaire :
--   celle-ci ne retourne PAS le détail ligne par ligne (`lines`). Une liste de
--   40 plats × 8 ingrédients = 320 objets JSON dont l'écran n'affiche RIEN.
--   Le détail reste l'affaire de `calculate_dish_cost`, appelé à l'ouverture
--   d'une recette.

-- BREAKING_CHANGE: NO — fonction NEUVE.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.calculate_all_dish_costs(UUID);
--   Sans risque : lecture seule, aucun effet de bord.

-- FUNCTIONS_CREATED: calculate_all_dish_costs
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction ne doit pas exister :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='calculate_all_dish_costs';
--    -- ATTENDU : 0 ligne. (CREATE OR REPLACE perdrait les GRANTS.)
--
-- 2) La fonction unitaire existe — c'est la RÉFÉRENCE que celle-ci doit
--    reproduire à l'identique :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='calculate_dish_cost';
--    -- ATTENDU : 1 ligne
--
-- 3) Dépendances :
--
--    SELECT to_regclass('public.dishes')            AS t_dishes,
--           to_regclass('public.dish_ingredients')  AS t_recettes,
--           to_regclass('public.ingredient_lots')   AS t_lots;
--    -- ATTENDU : les 3 non NULL
--
-- 4) Helper RLS (SECURITY DEFINER → filtrage explicite obligatoire) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='is_bar_member';
--    -- ATTENDU : >= 1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='calculate_all_dish_costs'
  ) THEN
    RAISE EXCEPTION
      'calculate_all_dish_costs existe déjà — CREATE OR REPLACE perdrait les GRANTS.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='calculate_dish_cost'
  ) THEN
    RAISE EXCEPTION
      'calculate_dish_cost absente — appliquer d''abord 20260803110000 (elle est la référence du calcul)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — filtrage d''accès impossible';
  END IF;
END $$;

CREATE FUNCTION public.calculate_all_dish_costs(p_bar_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public   -- ⚠️ sans lui, un search_path manipulé ferait
                           --    résoudre `ingredients` vers une table pirate
AS $$
DECLARE
  v_dish        RECORD;
  v_line        RECORD;
  v_lot         RECORD;
  v_needed      NUMERIC(14, 3);
  v_remaining   NUMERIC(14, 3);
  v_line_cost   NUMERIC(14, 4);
  v_total_cost  NUMERIC(14, 4);
  v_line_count  INTEGER;
  v_has_gap     BOOLEAN;
  v_results     JSONB := '[]'::JSONB;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS des tables lues
  -- NE S'APPLIQUE PAS. Sans ce garde, n'importe quel utilisateur authentifié
  -- lirait les coûts et marges de TOUS les bars.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  FOR v_dish IN
    SELECT id, name, price
    FROM public.dishes
    WHERE bar_id = p_bar_id AND is_active = TRUE
    ORDER BY name
  LOOP
    v_total_cost := 0;
    v_line_count := 0;
    v_has_gap    := FALSE;

    -- ⚠️ MÊME REQUÊTE que calculate_dish_cost, au ORDER BY près (inutile ici :
    -- on ne retourne pas le détail).
    FOR v_line IN
      SELECT di.ingredient_id,
             di.quantity,
             di.yield_factor,
             di.is_optional,
             i.cost_mode,
             i.flat_cost_per_dish,
             i.last_unit_cost
      FROM public.dish_ingredients di
      JOIN public.ingredients i ON i.id = di.ingredient_id
      WHERE di.dish_id = v_dish.id
        AND di.bar_id  = p_bar_id
    LOOP
      -- ⭐ DIVISION, pas multiplication : yield_factor 0.8 = 20 % de perte,
      -- donc 100 g nets exigent 125 g bruts. Multiplier sous-estimerait le
      -- coût sur TOUS les plats à épluchage — marge trop belle, sans alerte.
      v_needed    := v_line.quantity / v_line.yield_factor;
      v_line_cost := 0;
      v_line_count := v_line_count + 1;

      IF v_line.cost_mode = 'per_dish_flat' THEN
        -- Forfait par plat (huile de friture, charbon, emballage) : la
        -- quantité de la recette est IGNORÉE, par conception (§16.3).
        v_line_cost := COALESCE(v_line.flat_cost_per_dish, 0);

      ELSIF v_line.cost_mode = 'global' THEN
        -- Charge indirecte cuisine : n'entre pas dans le coût d'un plat.
        v_line_cost := 0;

      ELSIF v_line.cost_mode = 'cost_only' THEN
        v_line_cost := v_needed * COALESCE(v_line.last_unit_cost, 0);
        IF v_line.last_unit_cost IS NULL THEN
          v_has_gap := TRUE;
        END IF;

      ELSE
        -- ── cost_mode = 'direct' : SIMULATION FEFO ──
        -- ⚠️⚠️ ORDRE IDENTIQUE à consume_ingredients_fefo ET à
        -- calculate_dish_cost : expires_at NULLS LAST, received_at.
        -- Toute divergence ferait diverger le théorique du réel, or c'est leur
        -- ÉCART qui est la métrique clé du module (§8).
        v_remaining := v_needed;

        FOR v_lot IN
          SELECT remaining_qty, unit_cost
          FROM public.ingredient_lots
          WHERE ingredient_id = v_line.ingredient_id
            AND bar_id        = p_bar_id
            AND status        = 'active'
            AND remaining_qty > 0
          ORDER BY expires_at NULLS LAST, received_at
        LOOP
          EXIT WHEN v_remaining <= 0;

          IF v_lot.remaining_qty >= v_remaining THEN
            v_line_cost := v_line_cost + (v_remaining * v_lot.unit_cost);
            v_remaining := 0;
          ELSE
            v_line_cost := v_line_cost + (v_lot.remaining_qty * v_lot.unit_cost);
            v_remaining := v_remaining - v_lot.remaining_qty;
          END IF;
        END LOOP;

        -- Stock insuffisant : le coût reste calculable au dernier prix connu
        -- (§4.4, jamais bloquant), mais l'approximation est SIGNALÉE.
        IF v_remaining > 0 THEN
          v_line_cost := v_line_cost + (v_remaining * COALESCE(v_line.last_unit_cost, 0));
          v_has_gap   := TRUE;
        END IF;
      END IF;

      -- ⚠️ Un ingrédient OPTIONNEL n'entre pas dans le coût de référence : il
      -- surestimerait le coût nominal du plat.
      IF NOT v_line.is_optional THEN
        v_total_cost := v_total_cost + v_line_cost;
      END IF;
    END LOOP;

    v_results := v_results || jsonb_build_object(
      'dish_id',      v_dish.id,
      'price',        v_dish.price,
      'total_cost',   ROUND(v_total_cost, 2),
      'margin',       ROUND(v_dish.price - v_total_cost, 2),
      -- ⚠️ NULL si prix = 0 (plat offert) : un taux n'a alors aucun sens
      -- mathématique. L'UI doit afficher « — », JAMAIS 0 %.
      'margin_rate',  CASE WHEN v_dish.price > 0
                           THEN ROUND(((v_dish.price - v_total_cost) / v_dish.price) * 100, 1)
                           ELSE NULL END,
      -- ⭐ Nombre d'ingrédients — affiché sur la carte (§9 : « 8 ingrédients »).
      -- 0 = recette non saisie : la marge affichée serait alors le prix ENTIER,
      -- ce que l'UI doit distinguer d'une marge réellement excellente.
      'line_count',   v_line_count,
      'has_estimated_cost', v_has_gap
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'costs',   v_results,
    'count',   jsonb_array_length(v_results)
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_all_dish_costs(UUID) IS
  '§8/§9 — coût et marge de TOUS les plats d''un bar en UN appel, pour la liste de l''onglet '
  'Plats. Évite le N+1 (40 plats = 40 requêtes) qu''un appel unitaire en boucle produirait. '
  '⚠️⚠️ Le calcul DOIT rester identique à calculate_dish_cost : même ordre FEFO '
  '(expires_at NULLS LAST, received_at), mêmes filtres de lots, même division par '
  'yield_factor, mêmes 4 cost_mode, mêmes exclusions d''optionnels. Une divergence afficherait '
  'DEUX MARGES DIFFÉRENTES pour le même plat selon l''écran — pire qu''une absence de chiffre. '
  'Toute correction de l''une doit être portée sur l''autre. '
  '⭐ Ne retourne PAS le détail ligne par ligne : 40 plats × 8 ingrédients = 320 objets que la '
  'liste n''affiche pas. Le détail reste l''affaire de calculate_dish_cost.';

-- =====================================================
-- Privilèges
-- =====================================================
-- ⚠️ REVOKE PUBLIC d'abord, et JAMAIS de privilège à `anon` : la fonction est
-- SECURITY DEFINER, un accès anonyme contournerait toute la RLS.
REVOKE ALL ON FUNCTION public.calculate_all_dish_costs(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_all_dish_costs(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_all_dish_costs(UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Signature et attributs :
--
--    SELECT p.proname,
--           pg_get_function_identity_arguments(p.oid) AS args,
--           p.prosecdef   AS security_definer,
--           p.provolatile AS volatilite,
--           p.proconfig   AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='calculate_all_dish_costs';
--    -- ATTENDU : 'p_bar_id uuid' | true | 's' | {search_path=public}
--    -- ⛔ proconfig sans search_path = FAILLE.
--
-- 2) ⚠ CRITIQUE — `anon` ne doit PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon','public.calculate_all_dish_costs(uuid)','EXECUTE')
--             AS anon_peut,
--           has_function_privilege('authenticated','public.calculate_all_dish_costs(uuid)','EXECUTE')
--             AS auth_peut;
--    -- ATTENDU : false | true
--
-- ⭐ 3) TEST DE CONCORDANCE — LE PLUS IMPORTANT DE CETTE MIGRATION.
--    ⚠️ À exécuter depuis l'APPLICATION (le SQL Editor a auth.uid() = NULL,
--       donc is_bar_member() y renvoie false et les deux RPC refuseront tout).
--
--    Pour un plat AYANT UNE RECETTE, comparer :
--       calculate_dish_cost(bar, dish).total_cost
--       calculate_all_dish_costs(bar).costs[i].total_cost   (même dish_id)
--    -- ATTENDU : STRICTEMENT ÉGAUX, au centime près.
--    -- ⛔ Tout écart = les deux écrans afficheront des marges différentes pour
--    --    le même plat. Ne PAS livrer l'affichage tant que ce test n'est pas
--    --    concordant : un chiffre contradictoire détruit la confiance dans
--    --    TOUS les autres.
--
--    ☐ 3a. Plat avec recette simple (1 ingrédient direct)
--    ☐ 3b. Plat avec un ingrédient per_dish_flat (forfait)
--    ☐ 3c. Plat avec un ingrédient optionnel (exclu des deux côtés)
--    ☐ 3d. Plat dont un ingrédient manque de stock → has_estimated_cost = true
--          des DEUX côtés
--
-- 4) Un plat SANS recette retourne line_count = 0 et margin = price :
--
--    -- ATTENDU : total_cost = 0, margin = price, line_count = 0
--    -- ⚠️ L'UI DOIT distinguer ce cas d'une marge excellente : 100 % de marge
--    --    sur un plat sans recette signifie « coût inconnu », pas « très
--    --    rentable ».
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Fonction NEUVE, lecture seule, appelée uniquement derrière `hasRestaurant`.
-- ☐ CÔTÉ CLIENT : la query doit porter `enabled: !!barId && hasRestaurant`
-- ☐ Test §3 à ajouter dans dishesInvariance.test.tsx
