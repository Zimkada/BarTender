-- ===================================================================
-- MIGRATION: upsert_dish + replace_dish_recipe — écriture des plats
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration (§13.10, §16.8, §16.9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `dishes` et `dish_ingredients` sont en LECTURE SEULE pour `authenticated`
--   (RLS posée en 20260803100000) : aucun plat ne peut donc être créé. Il
--   manque les portes d'écriture — et elles doivent valider ce qu'une policy
--   RLS seule ne sait pas exprimer.

-- ⭐ REMPLACEMENT ATOMIQUE DE LA RECETTE — décision assumée
--   `replace_dish_recipe` remplace la recette ENTIÈRE en une transaction,
--   plutôt que d'exposer des RPC ligne par ligne.
--   Raisons :
--     1. C'est ainsi que le cuisinier pense : « voici ma recette », pas
--        « ajoute 20 g de sel à la ligne 3 ».
--     2. Aucun état intermédiaire incohérent : à aucun moment la recette
--        n'existe à moitié. Une UI ligne par ligne devrait orchestrer N appels
--        et gérer l'échec du 3e sur 5.
--     3. La dérivation du production_mode (§16.8) exige de voir la recette
--        COMPLÈTE — impossible ligne par ligne.
--   ⚠️ Coût accepté : deux utilisateurs éditant la même recette en même temps,
--      le dernier écrase le premier. Acceptable ici — une recette est éditée
--      rarement, par une seule personne (le cuisinier ou le promoteur).

-- ⭐ ISOLATION STRICTE PAR BAR — décision assumée
--   Un ingrédient d'un AUTRE bar est REJETÉ, jamais silencieusement ignoré.
--   Sans ce garde, un bar pourrait bâtir une recette sur les ingrédients d'un
--   autre : le coût matière serait calculé sur des lots inaccessibles, et
--   `calculate_dish_cost` (qui filtre par bar_id) retournerait un coût nul
--   sans expliquer pourquoi. Défaut silencieux, donc inacceptable.

-- ⭐⭐ production_mode DÉRIVÉ, PAS VALIDÉ (§16.8 / §16.9) — le point contre-intuitif
--   J'allais écrire une validation « consumed_at_stage='finish' interdit si
--   production_mode='on_order' ». Le plan dit l'INVERSE :
--     « La distinction batch / batch_finish N'A PAS À ÊTRE DEMANDÉE : si la
--       recette contient des ingrédients marqués consumed_at_stage='finish',
--       il y a une finition ; sinon, non. Le système le DÉDUIT au lieu de
--       l'exiger. »
--   L'UI ne propose donc que DEUX choix (« à la commande » / « préparé
--   d'avance »), et le RPC dérive batch vs batch_finish depuis la recette.
--   Rejeter l'incohérence aurait produit une erreur incompréhensible pour un
--   cuisinier qui n'a jamais vu ces mots techniques.

-- BREAKING_CHANGE: NO — deux fonctions NEUVES.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.replace_dish_recipe(UUID, UUID, JSONB);
--   DROP FUNCTION IF EXISTS public.upsert_dish(UUID, JSONB);

-- FUNCTIONS_CREATED: upsert_dish, replace_dish_recipe
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — aucune des deux fonctions ne doit exister :
--
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('upsert_dish','replace_dish_recipe');
--    -- ATTENDU : 0 ligne. (CREATE OR REPLACE perdrait les GRANTS.)
--
-- 2) Dépendances :
--
--    SELECT to_regclass('public.dishes')           AS t_dishes,
--           to_regclass('public.dish_ingredients') AS t_recettes,
--           to_regclass('public.bar_categories')   AS t_categories;
--    -- ATTENDU : les 3 non NULL
--
-- 3) Helpers RLS (les fonctions sont SECURITY DEFINER) :
--
--    SELECT count(DISTINCT p.proname) AS helpers
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin');
--    -- ATTENDU : 2

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('upsert_dish','replace_dish_recipe')
  ) THEN
    RAISE EXCEPTION
      'upsert_dish et/ou replace_dish_recipe existent déjà — CREATE OR REPLACE perdrait les GRANTS.';
  END IF;

  IF to_regclass('public.dish_ingredients') IS NULL THEN
    RAISE EXCEPTION 'Table dish_ingredients absente — appliquer d''abord 20260803100000';
  END IF;

  IF (
    SELECT count(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin')
  ) < 2 THEN
    RAISE EXCEPTION 'Helpers RLS absents — filtrage d''accès impossible';
  END IF;
END $$;

-- =====================================================
-- 1. upsert_dish — créer ou modifier un plat
-- =====================================================

CREATE FUNCTION public.upsert_dish(
  p_bar_id UUID,
  p_dish   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- ⚠️ sans lui, un search_path manipulé ferait
                           --    résoudre `dishes` vers une table pirate
AS $$
DECLARE
  v_dish_id     UUID;
  v_name        TEXT;
  v_price       NUMERIC(12, 2);
  v_category_id UUID;
  v_is_base     BOOLEAN;
  v_portions    INTEGER;
  v_actor_id    UUID := auth.uid();
  v_row         RECORD;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  v_dish_id     := NULLIF(p_dish->>'id', '')::UUID;
  v_name        := NULLIF(TRIM(p_dish->>'name'), '');
  v_price       := (p_dish->>'price')::NUMERIC;
  v_category_id := NULLIF(p_dish->>'category_id', '')::UUID;
  v_is_base     := COALESCE((p_dish->>'is_batch_base')::BOOLEAN, FALSE);
  v_portions    := NULLIF(p_dish->>'portions_per_batch', '')::INTEGER;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le nom du plat est obligatoire');
  END IF;

  IF v_price IS NULL OR v_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le prix doit être positif ou nul');
  END IF;

  -- ⭐ ISOLATION — la catégorie doit appartenir au bar ET être de type 'dish'.
  -- La FK ne peut pas l'exprimer (pas de FK conditionnelle en PostgreSQL,
  -- cf. §13.10 point 3) : c'est ICI que la garantie existe.
  IF v_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bar_categories
      WHERE id = v_category_id AND bar_id = p_bar_id AND type = 'dish'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Catégorie invalide : elle doit appartenir à ce bar et être une catégorie de plats'
      );
    END IF;
  END IF;

  -- ⚠️ Cohérence plat-base / rendement vérifiée AVANT l'INSERT : la contrainte
  -- SQL la garantit aussi, mais elle produirait une erreur Postgres brute
  -- (23514) que l'UI ne saurait pas traduire.
  IF v_is_base AND v_portions IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un plat préparé en lot doit indiquer son rendement (nombre de portions)'
    );
  END IF;
  IF NOT v_is_base AND v_portions IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Le rendement ne s''applique qu''aux plats préparés en lot'
    );
  END IF;

  IF v_dish_id IS NULL THEN
    -- ── CRÉATION ──
    -- ⚠️ Le doublon de nom est intercepté ICI plutôt que laissé remonter :
    -- l'index unique produirait une 23505 illisible pour l'utilisateur.
    IF EXISTS (
      SELECT 1 FROM public.dishes
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name) AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('Le plat « %s » existe déjà', v_name));
    END IF;

    INSERT INTO public.dishes (
      bar_id, name, category_id, price,
      production_mode, preparation_time_min,
      is_batch_base, portions_per_batch,
      is_available, photo_url, created_by
    ) VALUES (
      p_bar_id, v_name, v_category_id, v_price,
      -- ⭐ Toujours 'on_order' à la création : le mode réel sera DÉRIVÉ par
      -- replace_dish_recipe une fois la recette connue (§16.8). Le figer ici
      -- sur une déclaration serait prématuré — la recette n'existe pas encore.
      'on_order',
      NULLIF(p_dish->>'preparation_time_min','')::INTEGER,
      v_is_base, v_portions,
      COALESCE((p_dish->>'is_available')::BOOLEAN, TRUE),
      NULLIF(p_dish->>'photo_url',''),
      v_actor_id
    )
    RETURNING * INTO v_row;

  ELSE
    -- ── MODIFICATION ──
    IF NOT EXISTS (
      SELECT 1 FROM public.dishes WHERE id = v_dish_id AND bar_id = p_bar_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dishes
      WHERE bar_id = p_bar_id AND lower(name) = lower(v_name)
        AND is_active = TRUE AND id <> v_dish_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('Le plat « %s » existe déjà', v_name));
    END IF;

    UPDATE public.dishes SET
      name                 = v_name,
      category_id          = v_category_id,
      price                = v_price,
      preparation_time_min = NULLIF(p_dish->>'preparation_time_min','')::INTEGER,
      is_batch_base        = v_is_base,
      portions_per_batch   = v_portions,
      is_available         = COALESCE((p_dish->>'is_available')::BOOLEAN, is_available),
      photo_url            = NULLIF(p_dish->>'photo_url','')
      -- ⚠️ production_mode ABSENT volontairement : il appartient à
      -- replace_dish_recipe, qui seul voit la recette (§16.8).
    WHERE id = v_dish_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dish', to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_dish(UUID, JSONB) IS
  'Crée ou modifie un plat. Valide que la catégorie appartient au bar ET est de type ''dish'' — '
  'garantie impossible par FK (pas de FK conditionnelle en PostgreSQL, §13.10). '
  '⚠️ N''écrit JAMAIS production_mode : il est DÉRIVÉ de la recette par replace_dish_recipe '
  '(§16.8), la distinction batch/batch_finish n''ayant pas à être demandée à l''utilisateur.';

-- =====================================================
-- 2. replace_dish_recipe — remplacement ATOMIQUE
-- =====================================================

CREATE FUNCTION public.replace_dish_recipe(
  p_bar_id  UUID,
  p_dish_id UUID,
  p_lines   JSONB   -- [{ingredient_id, quantity, yield_factor?, is_optional?, consumed_at_stage?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line        JSONB;
  v_ing_id      UUID;
  v_qty         NUMERIC(14, 3);
  v_yield       NUMERIC(5, 4);
  v_stage       TEXT;
  v_bad_names   TEXT[] := ARRAY[]::TEXT[];
  v_has_finish  BOOLEAN := FALSE;
  v_is_base     BOOLEAN;
  v_new_mode    TEXT;
  v_count       INTEGER := 0;
  -- ⚠️ Mémoire des triplets déjà vus, pour détecter un doublon AVANT que
  -- l'index unique ne lève une 23505 illisible (cf. passe 1).
  v_seen        TEXT[] := ARRAY[]::TEXT[];
  v_key         TEXT;
  v_dup_names   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT is_batch_base INTO v_is_base
  FROM public.dishes
  WHERE id = p_dish_id AND bar_id = p_bar_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de recette invalide');
  END IF;

  -- ── PASSE 1 : VALIDER AVANT DE TOUCHER À QUOI QUE CE SOIT ──
  -- ⚠️ Valider d'abord, écrire ensuite. Sans cette séparation, une recette
  -- de 5 lignes dont la 4e est invalide aurait déjà supprimé l'ancienne
  -- recette avant d'échouer — le cuisinier perdrait son travail sur une
  -- faute de saisie. Le ROLLBACK protège la base, pas l'utilisateur qui
  -- devrait tout resaisir.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_ing_id := NULLIF(v_line->>'ingredient_id','')::UUID;
    v_qty    := (v_line->>'quantity')::NUMERIC;
    v_yield  := COALESCE(NULLIF(v_line->>'yield_factor','')::NUMERIC, 1.0);
    v_stage  := COALESCE(NULLIF(v_line->>'consumed_at_stage',''), 'batch');

    IF v_ing_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ligne de recette sans ingrédient');
    END IF;

    -- ⭐⭐ ISOLATION STRICTE PAR BAR — le garde le plus important de ce RPC.
    -- Un ingrédient d'un autre bar est REJETÉ, jamais ignoré : sinon la
    -- recette se bâtirait sur des lots inaccessibles et calculate_dish_cost
    -- (qui filtre par bar_id) retournerait un coût nul sans rien expliquer.
    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients
      WHERE id = v_ing_id AND bar_id = p_bar_id AND is_active = TRUE
    ) THEN
      v_bad_names := v_bad_names || v_ing_id::TEXT;
      CONTINUE;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'La quantité doit être strictement positive');
    END IF;

    IF v_yield <= 0 OR v_yield > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Le rendement doit être compris entre 0 (exclu) et 1 — 0.8 = 20 % de perte'
      );
    END IF;

    IF v_stage NOT IN ('batch','finish') THEN
      RETURN jsonb_build_object('success', false, 'error', format('Stade de consommation inconnu : %s', v_stage));
    END IF;

    -- ⭐ DOUBLON DANS LA CHARGE UTILE — détecté ICI, pas par l'index unique.
    -- L'index idx_dish_ingredients_unique porte sur
    -- (dish_id, ingredient_id, consumed_at_stage) : deux lignes identiques
    -- lèveraient une 23505 brute à la passe 2, incompréhensible pour un
    -- cuisinier qui a simplement ajouté « tomate » deux fois par inadvertance.
    -- ⚠️ Rappel : le même ingrédient à DEUX STADES différents reste légitime
    -- (huile à la cuisson ET à la finition) — d'où la clé sur le TRIPLET.
    v_key := v_ing_id::TEXT || '|' || v_stage;
    IF v_key = ANY(v_seen) THEN
      v_dup_names := v_dup_names || (
        SELECT name FROM public.ingredients WHERE id = v_ing_id
      );
    ELSE
      v_seen := v_seen || v_key;
    END IF;

    IF v_stage = 'finish' THEN
      v_has_finish := TRUE;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  IF array_length(v_dup_names, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Ingrédient en double dans la recette : %s. Regroupez les quantités en une seule ligne.',
        array_to_string(v_dup_names, ', ')
      ),
      'duplicate_ingredients', array_to_json(v_dup_names)::JSONB
    );
  END IF;

  IF array_length(v_bad_names, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un ou plusieurs ingrédients n''appartiennent pas à ce bar ou sont inactifs',
      'invalid_ingredient_ids', array_to_json(v_bad_names)::JSONB
    );
  END IF;

  -- ── PASSE 2 : REMPLACEMENT ATOMIQUE ──
  -- DELETE puis INSERT dans la MÊME transaction : la recette n'existe jamais
  -- à moitié. Un échec à l'INSERT annule le DELETE.
  DELETE FROM public.dish_ingredients
  WHERE dish_id = p_dish_id AND bar_id = p_bar_id;

  -- ⚠️ La passe 2 insère l'INTÉGRALITÉ de p_lines, sans re-filtrer. C'est
  -- volontaire et SÛR uniquement parce que la passe 1 fait un RETURN sur la
  -- moindre anomalie : si on arrive ici, chaque ligne a été validée.
  -- ⛔ NE JAMAIS remplacer un RETURN de la passe 1 par un CONTINUE sans
  --    filtrer ici aussi — la ligne écartée à la validation serait quand même
  --    insérée, et le garde deviendrait décoratif.
  IF v_count > 0 THEN
    INSERT INTO public.dish_ingredients (
      bar_id, dish_id, ingredient_id, quantity,
      yield_factor, is_optional, consumed_at_stage
    )
    SELECT
      p_bar_id,
      p_dish_id,
      (l->>'ingredient_id')::UUID,
      (l->>'quantity')::NUMERIC,
      COALESCE(NULLIF(l->>'yield_factor','')::NUMERIC, 1.0),
      COALESCE((l->>'is_optional')::BOOLEAN, FALSE),
      COALESCE(NULLIF(l->>'consumed_at_stage',''), 'batch')
    FROM jsonb_array_elements(p_lines) AS l;
  END IF;

  -- ── ⭐⭐ DÉRIVATION DU production_mode (§16.8, §16.9) ──
  -- Le plan est explicite : « la distinction batch / batch_finish N'A PAS À
  -- ÊTRE DEMANDÉE : si la recette contient des ingrédients marqués
  -- consumed_at_stage = 'finish', il y a une finition ; sinon, non. Le
  -- système le DÉDUIT au lieu de l'exiger. »
  -- L'UI ne propose donc que 2 choix (« à la commande » / « préparé
  -- d'avance »), et c'est is_batch_base qui les porte.
  v_new_mode := CASE
    WHEN NOT v_is_base    THEN 'on_order'      -- pas de lot → à la commande
    WHEN v_has_finish     THEN 'batch_finish'  -- lot + finition
    ELSE                       'batch'         -- lot servi tel quel
  END;

  UPDATE public.dishes
  SET production_mode = v_new_mode
  WHERE id = p_dish_id AND bar_id = p_bar_id;

  RETURN jsonb_build_object(
    'success', true,
    'dish_id', p_dish_id,
    'line_count', v_count,
    -- Retourné pour que l'UI puisse expliquer le régime déduit en langage
    -- clair, sans jamais afficher le nom technique.
    'production_mode', v_new_mode,
    'has_finish_stage', v_has_finish
  );
END;
$$;

COMMENT ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) IS
  'Remplace ATOMIQUEMENT la recette d''un plat (DELETE + INSERT en une transaction) : à aucun '
  'moment la recette n''existe à moitié. Valide TOUT avant d''écrire — sinon une faute de '
  'saisie en 4e ligne détruirait l''ancienne recette avant d''échouer. '
  '⭐ Rejette les ingrédients d''un AUTRE bar plutôt que de les ignorer : silencieusement '
  'ignorés, ils produiraient un coût matière nul sans explication. '
  '⭐ DÉRIVE production_mode depuis la recette (§16.8) : batch_finish si au moins un '
  'ingrédient est consumed_at_stage=''finish'', sinon batch ; on_order si le plat n''est pas '
  'un plat-base. La distinction n''est JAMAIS demandée à l''utilisateur.';

-- =====================================================
-- 3. Privilèges
-- =====================================================
REVOKE ALL ON FUNCTION public.upsert_dish(UUID, JSONB)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB)      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_dish(UUID, JSONB)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_dish(UUID, JSONB)               TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 2 fonctions, avec search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('upsert_dish','replace_dish_recipe')
--    ORDER BY p.proname;
--    -- ATTENDU : 2 lignes, security_definer=true, config={search_path=public}
--    -- ⛔ config NULL = FAILLE : search_path manipulable par l'appelant.
--
-- 2) ⚠ CRITIQUE — `anon` ne doit PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon','public.upsert_dish(uuid,jsonb)','EXECUTE')
--             AS anon_upsert,
--           has_function_privilege('anon','public.replace_dish_recipe(uuid,uuid,jsonb)','EXECUTE')
--             AS anon_recipe,
--           has_function_privilege('authenticated','public.upsert_dish(uuid,jsonb)','EXECUTE')
--             AS auth_upsert;
--    -- ATTENDU : false | false | true
--
-- 3) ⚠ Les tables restent en LECTURE SEULE pour authenticated (non-régression
--    de 20260803100000 — l'écriture doit passer par ces RPC, pas en direct) :
--
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name IN ('dishes','dish_ingredients')
--    ORDER BY table_name, privilege_type;
--    -- ATTENDU : uniquement SELECT.
--
-- ⭐ TESTS FONCTIONNELS — depuis l'APPLICATION uniquement.
--    ⚠️ Le SQL Editor a auth.uid() = NULL, donc is_bar_member() y renvoie
--       false : ces RPC y répondront toujours « Accès refusé ». Ce n'est PAS
--       un défaut, c'est le garde qui fonctionne.
--
-- ☐ 4a. Ingrédient d'un AUTRE bar → { success: false, invalid_ingredient_ids: [...] }
-- ☐ 4b. Catégorie de type 'product' → « Catégorie invalide »
-- ☐ 4c. Recette avec une ligne 'finish' sur un plat-base → production_mode
--        passe à 'batch_finish' SANS que l'utilisateur l'ait demandé
-- ☐ 4d. Retirer la ligne 'finish' → repasse à 'batch'
-- ☐ 4e. Recette vide (p_lines = '[]') → supprime toutes les lignes, succès
-- ☐ 4f. ⭐ Quantité invalide en 3e ligne d'une recette de 5 → l'ANCIENNE
--        recette est INTACTE (c'est le point de la validation en 2 passes)
-- ☐ 4g. ⭐ Le MÊME ingrédient deux fois au MÊME stade → message métier
--        « Ingrédient en double dans la recette : Tomate », PAS une 23505.
--        Cas réaliste : le cuisinier ajoute « tomate » deux fois par
--        inadvertance. Défaut trouvé à la certification.
-- ☐ 4h. ⭐ CAS INVERSE — le même ingrédient à DEUX STADES différents
--        (huile en 'batch' ET en 'finish') doit RÉUSSIR : c'est légitime,
--        et c'est la raison de l'unicité sur le TRIPLET.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Fonctions NEUVES, jamais appelées sur un bar pur (le frontend ne les
--    invoque que derrière `hasRestaurant`). Aucune table existante écrite.
