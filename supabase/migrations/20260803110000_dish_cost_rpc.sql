-- ===================================================================
-- MIGRATION: calculate_dish_cost — coût matière théorique d'un plat
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration (§4.1, §8, §16.3, §16.13)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Les recettes existent (dish_ingredients) mais restent muettes : rien ne
--   les transforme en chiffre. C'est CETTE fonction qui produit le livrable
--   de la phase 2 — « le promoteur découvre la marge réelle de ses plats,
--   souvent une révélation ».

-- ⭐⭐ RÈGLE FONDATRICE (§4.1) — le coût n'est JAMAIS stocké
--   Aucune colonne `cost` n'existe sur `dishes`, et il ne faut PAS en créer.
--   Un coût stocké se désynchronise dès qu'un prix d'ingrédient bouge, sans
--   que personne ne s'en aperçoive. Cette fonction le calcule À LA DEMANDE.
--   ⚠️ Le seul coût figé du module est kitchen_order_items.computed_cost
--      (phase 3) : ce qui a été RÉELLEMENT consommé, pas une estimation.

-- ⭐ POURQUOI SIMULER LE FEFO PLUTÔT QU'UNE MOYENNE
--   Le §8 définit la marge matière brute comme
--       prix − Σ(qté × coût du lot consommé)
--   Le coût théorique doit donc refléter le PROCHAIN LOT À SORTIR, dans le
--   même ordre que consume_ingredients_fefo (expires_at NULLS LAST,
--   received_at). Toute autre convention ferait diverger le théorique du réel
--   PAR CONSTRUCTION — or c'est justement leur ÉCART qui est « la métrique la
--   plus précieuse du module » (§8). Un écart dû à la méthode de calcul
--   rendrait cette métrique ininterprétable.
--   ⚠️ La « double marge » (FIFO réalisé + prix du jour) a été explicitement
--      ÉCARTÉE (§16.13) : sur des denrées fraîches le FIFO converge vers le
--      prix du jour, l'écart est négligeable et deux indicateurs permanents
--      seraient de la complexité pour un gain nul.

-- ⭐ LES QUATRE cost_mode (§16.3) — ce qui remplace `is_transversal`
--   Ce booléen était un BIAIS SYSTÉMATIQUE de marge : traiter l'huile de
--   friture comme le sel sous-estime la marge des plats frits (alloco,
--   poisson) et surestime celle des mijotés. Le classement des plats par
--   rentabilité — livrable de CETTE phase — en serait faussé.
--     direct        → coût FEFO réel des lots (décrémenté au service)
--     per_dish_flat → FORFAIT par plat (huile, charbon, emballage)
--     cost_only     → au dernier prix connu, jamais suivi en stock
--     global        → charge indirecte cuisine, EXCLUE du coût du plat
--   ⚠️ Les 4 doivent être traités ICI, sinon la marge des plats frits reste
--      fausse — ce qui était la raison même d'abandonner le booléen.

-- BREAKING_CHANGE: NO — fonction NEUVE, aucune fonction existante remplacée.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.calculate_dish_cost(UUID, UUID);
--   Sans risque : lecture seule, aucun effet de bord.

-- FUNCTIONS_CREATED: calculate_dish_cost
-- TABLES_MODIFIED: aucune · VIEWS_AFFECTED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction ne doit pas déjà exister :
--
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='calculate_dish_cost';
--    -- ATTENDU : 0 ligne.
--    -- ⛔ Si une ligne existe, NE PAS APPLIQUER en l'état : CREATE OR REPLACE
--    --    PERD LES GRANTS (leçon des vagues 1-4). Prévoir de re-jouer
--    --    REVOKE/GRANT et de vérifier has_function_privilege('anon', ...).
--
-- 2) Les dépendances existent :
--
--    SELECT to_regclass('public.dishes')            AS t_dishes,
--           to_regclass('public.dish_ingredients')  AS t_recettes,
--           to_regclass('public.ingredients')       AS t_ingredients,
--           to_regclass('public.ingredient_lots')   AS t_lots;
--    -- ATTENDU : les 4 non NULL
--
-- 3) Helper RLS présent (la fonction est SECURITY DEFINER, elle DOIT filtrer
--    l'accès elle-même) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='is_bar_member';
--    -- ATTENDU : >= 1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='calculate_dish_cost'
  ) THEN
    RAISE EXCEPTION
      'calculate_dish_cost existe déjà — CREATE OR REPLACE perdrait les GRANTS. Diagnostiquer d''abord.';
  END IF;

  IF to_regclass('public.dish_ingredients') IS NULL THEN
    RAISE EXCEPTION 'Table dish_ingredients absente — appliquer d''abord 20260803100000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — le filtrage d''accès serait impossible';
  END IF;
END $$;

CREATE FUNCTION public.calculate_dish_cost(
  p_bar_id  UUID,
  p_dish_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE                    -- lecture seule : permet à PG de mettre en cache dans la requête
SECURITY DEFINER
SET search_path = public  -- ⚠️ OBLIGATOIRE sur SECURITY DEFINER : sans lui, un
                          --    search_path manipulé par l'appelant ferait résoudre
                          --    `ingredients` vers une table pirate.
AS $$
DECLARE
  v_dish          RECORD;
  v_line          RECORD;
  v_lot           RECORD;
  v_needed        NUMERIC(14, 3);
  v_remaining     NUMERIC(14, 3);
  v_line_cost     NUMERIC(14, 4);
  v_total_cost    NUMERIC(14, 4) := 0;
  v_lines         JSONB := '[]'::JSONB;
  v_has_gap       BOOLEAN := FALSE;
  v_gap_names     TEXT[]  := ARRAY[]::TEXT[];
BEGIN
  -- ⭐ FILTRAGE D'ACCÈS EXPLICITE — indispensable en SECURITY DEFINER : la
  -- fonction s'exécute avec les droits de son propriétaire, donc la RLS des
  -- tables lues NE S'APPLIQUE PAS. Sans ce garde, n'importe quel utilisateur
  -- authentifié lirait le coût des plats de TOUS les bars.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT id, name, price, bar_id
    INTO v_dish
  FROM public.dishes
  WHERE id = p_dish_id AND bar_id = p_bar_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  -- ── Parcours de la recette ──────────────────────────────────────
  FOR v_line IN
    SELECT di.ingredient_id,
           di.quantity,
           di.yield_factor,
           di.is_optional,
           di.consumed_at_stage,
           i.name        AS ingredient_name,
           i.unit,
           i.cost_mode,
           i.flat_cost_per_dish,
           i.last_unit_cost
    FROM public.dish_ingredients di
    JOIN public.ingredients i ON i.id = di.ingredient_id
    WHERE di.dish_id = p_dish_id
      AND di.bar_id  = p_bar_id
    ORDER BY i.name
  LOOP
    -- ⭐ QUANTITÉ BRUTE — c'est le point le plus facile à rater.
    -- yield_factor = 0.8 signifie 20 % de perte à l'épluchage : pour servir
    -- 100 g nets il faut SORTIR 125 g du stock (100 / 0.8), pas 100.
    -- Diviser et non multiplier. L'inverse sous-estimerait le coût de façon
    -- systématique sur tous les plats à légumes ou viande parée — donc la
    -- marge affichée serait trop belle, l'exact contraire du but du module.
    v_needed    := v_line.quantity / v_line.yield_factor;
    v_line_cost := 0;

    -- ── Les 4 cost_mode (§16.3) ───────────────────────────────────
    IF v_line.cost_mode = 'per_dish_flat' THEN
      -- Forfait par plat : l'huile de friture, le charbon, l'emballage.
      -- Évite la fausse précision (personne ne pèse l'huile) tout en
      -- attribuant le coût aux plats qui le supportent réellement.
      -- ⚠️ La quantité de la recette est IGNORÉE ici, par conception.
      v_line_cost := COALESCE(v_line.flat_cost_per_dish, 0);

    ELSIF v_line.cost_mode = 'global' THEN
      -- Charge indirecte cuisine : n'entre PAS dans le coût d'un plat
      -- particulier. Reste à 0, mais la ligne est retournée pour que l'UI
      -- puisse l'afficher comme « suivi hors coût plat » plutôt que de la
      -- faire disparaître silencieusement.
      v_line_cost := 0;

    ELSIF v_line.cost_mode = 'cost_only' THEN
      -- Non suivi en stock (donc aucun lot), mais doit entrer dans le coût.
      -- Valorisé au dernier prix connu, faute de mieux.
      v_line_cost := v_needed * COALESCE(v_line.last_unit_cost, 0);
      IF v_line.last_unit_cost IS NULL THEN
        v_has_gap   := TRUE;
        v_gap_names := v_gap_names || v_line.ingredient_name;
      END IF;

    ELSE
      -- ── cost_mode = 'direct' : SIMULATION FEFO ──────────────────
      -- ⚠️⚠️ MÊME ORDRE que consume_ingredients_fefo :
      --      expires_at NULLS LAST, received_at
      -- Toute divergence d'ordre ici ferait diverger le coût théorique du
      -- coût réel sans qu'aucune anomalie métier n'existe — et c'est leur
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

      -- ⭐ STOCK INSUFFISANT — le coût reste calculable, au dernier prix connu.
      -- Le §4.4 pose que le stock n'est JAMAIS bloquant : on ne refuse pas de
      -- servir. La cohérence exige donc que le COÛT ne soit pas bloquant non
      -- plus. Mais l'approximation doit être SIGNALÉE (has_estimated_cost),
      -- sinon l'UI afficherait une marge fausse avec l'aplomb d'une marge
      -- exacte — le pire des deux mondes.
      IF v_remaining > 0 THEN
        v_line_cost := v_line_cost + (v_remaining * COALESCE(v_line.last_unit_cost, 0));
        v_has_gap   := TRUE;
        v_gap_names := v_gap_names || v_line.ingredient_name;
      END IF;
    END IF;

    -- ⚠️ Un ingrédient OPTIONNEL n'entre pas dans le coût de référence : il
    -- surestimerait le coût nominal du plat. Sa ligne est retournée quand même
    -- (avec son coût), pour que l'UI puisse montrer « +150 F si ajouté ».
    IF NOT v_line.is_optional THEN
      v_total_cost := v_total_cost + v_line_cost;
    END IF;

    v_lines := v_lines || jsonb_build_object(
      'ingredient_id',     v_line.ingredient_id,
      'ingredient_name',   v_line.ingredient_name,
      'unit',              v_line.unit,
      'cost_mode',         v_line.cost_mode,
      'consumed_at_stage', v_line.consumed_at_stage,
      'quantity_net',      v_line.quantity,
      'quantity_gross',    ROUND(v_needed, 3),
      'yield_factor',      v_line.yield_factor,
      'is_optional',       v_line.is_optional,
      'line_cost',         ROUND(v_line_cost, 2),
      -- Inclus dans total_cost ? Permet à l'UI d'expliquer un total qui n'est
      -- pas la somme visuelle des lignes.
      'counted_in_total',  NOT v_line.is_optional
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'dish_id',       v_dish.id,
    'dish_name',     v_dish.name,
    'price',         v_dish.price,
    'total_cost',    ROUND(v_total_cost, 2),
    -- Marge en valeur ET en taux : le taux permet de comparer des plats de
    -- gammes de prix différentes, la valeur dit ce que le plat rapporte.
    'margin',        ROUND(v_dish.price - v_total_cost, 2),
    -- ⚠️ Garde anti division par zéro : un plat offert (price = 0) est
    -- légitime (menu du jour, geste commercial). Son taux n'a pas de sens
    -- mathématique → NULL, et l'UI doit afficher « — », jamais 0 %.
    'margin_rate',   CASE WHEN v_dish.price > 0
                          THEN ROUND(((v_dish.price - v_total_cost) / v_dish.price) * 100, 1)
                          ELSE NULL END,
    -- ⭐ Le coût est-il une ESTIMATION ? true dès qu'un ingrédient manquait de
    -- stock ou de prix connu. L'UI DOIT le signaler — une marge approximative
    -- présentée comme exacte est pire qu'une marge absente.
    'has_estimated_cost', v_has_gap,
    'estimated_reason',   CASE WHEN v_has_gap
                               THEN array_to_json(v_gap_names)::JSONB
                               ELSE NULL END,
    'lines',         v_lines,
    'line_count',    jsonb_array_length(v_lines)
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_dish_cost(UUID, UUID) IS
  '§4.1/§8 — coût matière THÉORIQUE d''un plat, calculé à la demande et JAMAIS stocké '
  '(un coût stocké se désynchronise dès qu''un prix d''ingrédient bouge). '
  'Simule la consommation FEFO dans le MÊME ORDRE que consume_ingredients_fefo '
  '(expires_at NULLS LAST, received_at) : toute divergence d''ordre ferait diverger le '
  'théorique du réel par construction, or c''est leur ÉCART qui est la métrique clé (§8). '
  'Traite les 4 cost_mode (§16.3) — sans quoi la marge des plats frits resterait fausse, '
  'ce qui était la raison même d''abandonner le booléen is_transversal. '
  'has_estimated_cost = true signale une approximation (stock ou prix manquant) : l''UI '
  'DOIT la montrer, une marge approximative présentée comme exacte étant pire qu''absente.';

-- =====================================================
-- Privilèges
-- =====================================================
-- ⚠️ Pattern des vagues de durcissement RPC : REVOKE PUBLIC d'abord, GRANT
-- ensuite, et JAMAIS de privilège à `anon` — la fonction est SECURITY DEFINER,
-- donc un accès anonyme contournerait toute la RLS.
REVOKE ALL ON FUNCTION public.calculate_dish_cost(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_dish_cost(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_dish_cost(UUID, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe, avec la bonne signature et les bons attributs :
--
--    SELECT p.proname,
--           pg_get_function_identity_arguments(p.oid) AS args,
--           p.prosecdef  AS security_definer,
--           p.provolatile AS volatilite,
--           p.proconfig  AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='calculate_dish_cost';
--    -- ATTENDU : args = 'p_bar_id uuid, p_dish_id uuid'
--    --           security_definer = true
--    --           volatilite = 's' (STABLE)
--    --           config contenant search_path=public
--    -- ⛔ Si proconfig ne contient PAS search_path : FAILLE. Un appelant
--    --    manipulant son search_path ferait résoudre `ingredients` vers une
--    --    table pirate. Recréer la fonction.
--
-- 2) ⚠️ CRITIQUE — `anon` NE DOIT PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon', 'public.calculate_dish_cost(uuid,uuid)', 'EXECUTE')
--             AS anon_peut_executer,
--           has_function_privilege('authenticated', 'public.calculate_dish_cost(uuid,uuid)', 'EXECUTE')
--             AS authenticated_peut_executer;
--    -- ATTENDU : false | true
--    -- ⛔ anon = true → SECURITY DEFINER exposé sans authentification.
--
-- 3) ⭐ TEST FONCTIONNEL — isolation multi-tenant.
--    ⚠️ À exécuter depuis l'APPLICATION (SQL Editor a auth.uid() = NULL, donc
--       is_bar_member() y renvoie false et la fonction refusera TOUT).
--       Dans le SQL Editor, ce test retournerait « Accès refusé » et ne
--       prouverait rien.
--
--    -- Depuis l'app, connecté sur un bar A, avec un dish_id du bar B :
--    -- ATTENDU : { success: false, error: 'Accès refusé à ce bar' }
--
-- 4) ⭐ TEST DE CALCUL — à faire après avoir saisi une recette réelle.
--    Vérifier À LA MAIN sur un plat simple :
--      quantity=100 g, yield_factor=0.8, lot à 5 F/g
--      → quantity_gross = 125 (100/0.8) et line_cost = 625 (125×5)
--    -- ⛔ Si quantity_gross = 80, la division est INVERSÉE : le coût serait
--    --    sous-estimé sur TOUS les plats à épluchage. C'est l'erreur la plus
--    --    facile à commettre et la plus difficile à voir.
--
-- 5) ⭐ TEST DE L'ORDRE FEFO — la garantie que théorique = réel.
--    Avec 2 lots d'un même ingrédient à prix différents, le lot dont
--    expires_at est le plus PROCHE doit être consommé en premier — même s'il
--    a été reçu APRÈS l'autre.
--
--    SELECT id, expires_at, received_at, unit_cost, remaining_qty
--    FROM public.ingredient_lots
--    WHERE ingredient_id = '<un-ingredient>' AND status='active'
--    ORDER BY expires_at NULLS LAST, received_at;
--    -- Comparer le 1er lot de cette liste avec le coût retourné par la
--    -- fonction : ils doivent concorder.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Fonction NEUVE, lecture seule, jamais appelée sur un bar pur : le
--    frontend ne l'invoque que derrière `hasRestaurant`. Aucune table
--    existante lue, aucun chemin de code existant modifié.
--
-- ☐ CÔTÉ CLIENT : la query de coût doit porter `enabled: !!barId && hasRestaurant`
-- ☐ Ne JAMAIS l'appeler en boucle par plat (N+1). Pour un classement de
--   rentabilité sur tout le menu, prévoir une fonction dédiée retournant tous
--   les plats en UN appel — sinon 40 plats = 40 requêtes.
