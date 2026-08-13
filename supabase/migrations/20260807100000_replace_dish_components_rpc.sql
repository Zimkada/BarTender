-- ===================================================================
-- MIGRATION: replace_dish_components + dérivation corrigée du régime
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.0 du module restauration (§13.8, §16.8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- Deux choses indissociables, d'où une seule migration :
--   1. `replace_dish_components` — écrire la composition d'un plat
--      (« spaghetti-poulet contient 1 portion de spaghetti cuits »).
--   2. ⛔ La DÉRIVATION du `production_mode`, aujourd'hui FAUSSE pour
--      `batch_finish`.

-- ⛔⛔ LE DÉFAUT CORRIGÉ ICI — relevé le 06/08/2026 à la certification du
-- cadrage 3B.
--
--   `replace_dish_recipe` (migration 20260803120000) dérive ainsi :
--     NOT is_batch_base  → 'on_order'
--     v_has_finish       → 'batch_finish'
--     sinon              → 'batch'
--
--   Un plat n'est donc `batch_finish` que s'il est LUI-MÊME un plat-base. Or
--   le cas CENTRAL du régime est exactement l'inverse, et la migration de
--   phase 2 le documente noir sur blanc :
--     « spaghetti-poulet prélève une portion dans le lot d'un AUTRE plat […]
--       Il n'est donc PAS lui-même un plat-base. »
--
--   ⚠️ Conséquence : le spaghetti-poulet tombait en 'on_order' et n'aurait
--   JAMAIS prélevé de lot. Le régime 3B était inapplicable.
--
--   ⭐ La règle d'origine n'était pas absurde — `dish_recipe_components`
--   n'existait pas, `is_batch_base` était le seul signal disponible. Elle
--   devient fausse au moment précis où la table apparaît.

-- ⭐ DÉRIVATION CORRIGÉE — deux axes, dans cet ordre :
--   · a des composants          → 'batch_finish'  (il CONSOMME un lot)
--   · plat-base + finition      → 'batch_finish'  (il produit ET finit)
--   · plat-base sans finition   → 'batch'         (lot servi tel quel)
--   · ni l'un ni l'autre        → 'on_order'
--
--   ⚠️ « a des composants » PASSE EN PREMIER : un plat qui consomme un lot
--   est servi par prélèvement, qu'il produise ou non le sien.

-- ⭐ UN SEUL NIVEAU, GARANTI PAR CE RPC (§13.8)
--   `base_dish_id` ne peut pas désigner un plat lui-même composé. Une
--   contrainte SQL ne peut pas parcourir un graphe : le RPC est le garde-fou.
--   ⛔ D'où la lecture seule sur la table pour `authenticated` — un INSERT
--   direct contournerait ce contrôle.

-- BREAKING_CHANGE: NO pour les plats existants.
--   ⚠️ `replace_dish_recipe` est REMPLACÉE (CREATE OR REPLACE) : sa
--   dérivation change. Un plat SANS composants garde exactement le régime
--   qu'il avait — la nouvelle branche ne s'active qu'en présence de
--   composants, impossibles à créer avant cette migration. Aucun plat
--   existant ne peut donc changer de régime.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.replace_dish_components(UUID, UUID, JSONB);
--   + réappliquer le corps de replace_dish_recipe depuis 20260803120000.

-- FUNCTIONS_CREATED: replace_dish_components
-- FUNCTIONS_MODIFIED: replace_dish_recipe (dérivation du régime)
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la table de 3B.0 doit exister :
--
--    SELECT to_regclass('public.dish_recipe_components') AS t;
--    -- ATTENDU : non NULL. Sinon appliquer d'abord 20260807090000.
--
-- 2) ⛔ BLOQUANT — `replace_dish_recipe` existe (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='replace_dish_recipe';
--    -- ATTENDU : 1
--
-- 3) ⛔ BLOQUANT — PHOTO DES RÉGIMES AVANT. À conserver : le post-vol la
--    compare pour prouver qu'aucun plat existant n'a changé de régime.
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- NOTER LE RÉSULTAT.

DO $$
BEGIN
  IF to_regclass('public.dish_recipe_components') IS NULL THEN
    RAISE EXCEPTION 'dish_recipe_components absente — appliquer d''abord 20260807090000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'replace_dish_recipe'
  ) THEN
    RAISE EXCEPTION 'replace_dish_recipe absente — appliquer d''abord 20260803120000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. HELPER — la dérivation, en UN SEUL ENDROIT                    │
-- └─────────────────────────────────────────────────────────────────┘
-- ⭐⭐ Extrait en fonction parce que DEUX RPC doivent la calculer :
-- `replace_dish_recipe` (les ingrédients changent) et
-- `replace_dish_components` (la composition change). Dupliquer la règle la
-- ferait diverger — et un plat afficherait un régime différent selon l'écran
-- par lequel on l'a modifié.

CREATE OR REPLACE FUNCTION public.derive_dish_production_mode(
  p_bar_id  UUID,
  p_dish_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_base        BOOLEAN;
  v_has_finish     BOOLEAN;
  v_has_components BOOLEAN;
BEGIN
  SELECT is_batch_base INTO v_is_base
  FROM public.dishes
  WHERE id = p_dish_id AND bar_id = p_bar_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.dish_ingredients
    WHERE dish_id = p_dish_id AND bar_id = p_bar_id
      AND consumed_at_stage = 'finish'
  ) INTO v_has_finish;

  SELECT EXISTS (
    SELECT 1 FROM public.dish_recipe_components
    WHERE dish_id = p_dish_id AND bar_id = p_bar_id
  ) INTO v_has_components;

  -- ⭐ « a des composants » EN PREMIER : un plat qui prélève dans un lot est
  -- servi par prélèvement, qu'il produise ou non le sien.
  RETURN CASE
    WHEN v_has_components THEN 'batch_finish'
    WHEN NOT v_is_base    THEN 'on_order'
    WHEN v_has_finish     THEN 'batch_finish'
    ELSE                       'batch'
  END;
END;
$$;

-- ⛔⛔ PAS DE GRANT À `authenticated` — défaut trouvé à la code review du
-- 07/08/2026. Cette fonction est SECURITY DEFINER et ne porte AUCUN contrôle
-- d'appartenance au bar : accordée au client, n'importe quel utilisateur
-- connecté interrogerait le régime d'un plat d'un AUTRE bar.
--
-- ⭐ Y ajouter `is_bar_member` serait redondant : elle n'est appelée que
-- depuis `replace_dish_recipe` et `replace_dish_components`, qui vérifient
-- déjà l'accès AVANT de l'invoquer. Le contrôle vivrait à deux endroits.
-- ⚠️ La bonne réponse est de ne PAS l'exposer : une fonction interne n'a pas
-- besoin d'être appelable par le client. Les deux RPC appelantes sont
-- elles-mêmes SECURITY DEFINER, donc l'appel interne fonctionne sans grant.
REVOKE ALL ON FUNCTION public.derive_dish_production_mode(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.derive_dish_production_mode(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.derive_dish_production_mode(UUID, UUID) IS
  '§16.8 — déduit le régime de production d''un plat depuis sa recette et sa composition. '
  'SOURCE UNIQUE de la règle : appelée par replace_dish_recipe ET replace_dish_components, '
  'qui la feraient diverger si chacune la recalculait. '
  '⛔ « a des composants » passe AVANT « est plat-base » : un plat qui prélève dans le lot '
  'd''un autre est batch_finish même s''il ne produit aucun lot (cas central du §16.8).';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. replace_dish_components — écrire la composition               │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.replace_dish_components(
  p_bar_id  UUID,
  p_dish_id UUID,
  p_lines   JSONB   -- [{base_dish_id, quantity}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line       JSONB;
  v_base_id    UUID;
  v_qty        NUMERIC(10,3);
  v_bad_names  TEXT[] := ARRAY[]::TEXT[];
  v_seen       UUID[] := ARRAY[]::UUID[];
  v_dup_names  TEXT[] := ARRAY[]::TEXT[];
  v_deep_names TEXT[] := ARRAY[]::TEXT[];
  v_count      INTEGER := 0;
  v_new_mode   TEXT;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dishes
    WHERE id = p_dish_id AND bar_id = p_bar_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de composition invalide');
  END IF;

  -- ⛔⛔ GARDE SYMÉTRIQUE DU NIVEAU UNIQUE — défaut trouvé à la code review
  -- du 07/08/2026. Le garde par ligne (plus bas) refuse un plat-base DÉJÀ
  -- composé. Il ne suffit PAS : il ne couvre qu'un sens.
  --
  --   Ordre de saisie A — attrapé :
  --     1. B composé de C   → B a des composants
  --     2. A composé de B   → REFUSÉ, B est déjà composé ✓
  --
  --   Ordre de saisie B — PASSAIT :
  --     1. A composé de B   → B n'a pas de composants, accepté
  --     2. B composé de C   → le garde regarde C, jamais A
  --     ⟹ A → B → C, PROFONDEUR 2
  --
  -- ⚠️ Le second ordre n'a rien d'exotique : composer le plat vendu d'abord,
  -- puis détailler la base ensuite, est la façon NATURELLE de saisir. Le
  -- garde le plus important du RPC (§13.8) était donc contournable par un
  -- usage normal.
  --
  -- ⭐ On refuse ici de composer un plat qui sert DÉJÀ de base à un autre.
  -- ⚠️ Uniquement si la composition demandée est NON VIDE : vider la
  -- composition d'un plat utilisé comme base doit rester possible — c'est
  -- même la façon de sortir d'une situation bloquée.
  IF jsonb_array_length(p_lines) > 0 AND EXISTS (
    SELECT 1 FROM public.dish_recipe_components
    WHERE base_dish_id = p_dish_id AND bar_id = p_bar_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Ce plat sert déjà de base à %s. Un plat-base ne peut pas être lui-même composé — un seul niveau est autorisé.',
        COALESCE((
          SELECT string_agg(d.name, ', ')
          FROM public.dish_recipe_components c
          JOIN public.dishes d ON d.id = c.dish_id
          WHERE c.base_dish_id = p_dish_id AND c.bar_id = p_bar_id
        ), 'un autre plat')
      ),
      'used_as_base_by', COALESCE((
        SELECT array_to_json(array_agg(d.name))::JSONB
        FROM public.dish_recipe_components c
        JOIN public.dishes d ON d.id = c.dish_id
        WHERE c.base_dish_id = p_dish_id AND c.bar_id = p_bar_id
      ), '[]'::JSONB)
    );
  END IF;

  -- ── PASSE 1 : VALIDER AVANT DE TOUCHER À QUOI QUE CE SOIT ──
  -- ⚠️ Même principe que `replace_dish_recipe` : valider d'abord, écrire
  -- ensuite. Sans cette séparation, une composition de 3 lignes dont la 3e
  -- est invalide aurait déjà supprimé l'ancienne avant d'échouer. Le ROLLBACK
  -- protège la base, pas l'utilisateur qui devrait tout resaisir.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_base_id := NULLIF(v_line->>'base_dish_id','')::UUID;
    v_qty     := (v_line->>'quantity')::NUMERIC;

    IF v_base_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ligne de composition sans plat-base');
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Quantité de portions invalide');
    END IF;

    -- ⛔ AUTO-RÉFÉRENCE — doublée par la contrainte SQL, mais rattrapée ici
    -- pour rendre un message lisible plutôt qu'une 23514 brute.
    IF v_base_id = p_dish_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Un plat ne peut pas se contenir lui-même'
      );
    END IF;

    -- ⭐⭐ ISOLATION STRICTE PAR BAR — le garde le plus important de ce RPC.
    -- Sans lui, un bar pourrait composer ses plats avec les plats-bases d'un
    -- AUTRE bar : ses coûts fuiraient dans les nôtres.
    -- ⚠️ `is_batch_base` exigé : on ne prélève que dans un plat qui PRODUIT
    -- un lot. Composer avec un plat ordinaire n'aurait aucun lot à prélever.
    IF NOT EXISTS (
      SELECT 1 FROM public.dishes
      WHERE id = v_base_id AND bar_id = p_bar_id
        AND is_active = TRUE AND is_batch_base = TRUE
    ) THEN
      v_bad_names := v_bad_names || COALESCE(
        (SELECT name FROM public.dishes WHERE id = v_base_id), v_base_id::TEXT
      );
    END IF;

    -- ⭐⭐ UN SEUL NIVEAU (§13.8) — LE garde que la base ne peut pas porter.
    -- Un plat-base qui serait lui-même composé créerait une profondeur 2 :
    -- « spaghetti-poulet → sauce spéciale → sauce tomate ». Le calcul du coût
    -- devrait alors être récursif, et un cycle rendrait la production
    -- infinie. Une contrainte SQL ne peut pas parcourir un graphe.
    IF EXISTS (
      SELECT 1 FROM public.dish_recipe_components
      WHERE dish_id = v_base_id AND bar_id = p_bar_id
    ) THEN
      v_deep_names := v_deep_names || COALESCE(
        (SELECT name FROM public.dishes WHERE id = v_base_id), v_base_id::TEXT
      );
    END IF;

    -- Doublon détecté AVANT que l'index unique ne lève une 23505 illisible.
    IF v_base_id = ANY(v_seen) THEN
      v_dup_names := v_dup_names || COALESCE(
        (SELECT name FROM public.dishes WHERE id = v_base_id), v_base_id::TEXT
      );
    END IF;
    v_seen := v_seen || v_base_id;

    v_count := v_count + 1;
  END LOOP;

  IF array_length(v_dup_names, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Plat-base en double dans la composition : %s. Regroupez les portions en une seule ligne.',
        array_to_string(v_dup_names, ', ')
      ),
      'duplicate_base_dishes', array_to_json(v_dup_names)::JSONB
    );
  END IF;

  IF array_length(v_bad_names, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Un ou plusieurs plats-bases n''appartiennent pas à ce bar, sont inactifs, ou ne produisent pas de lot',
      'invalid_base_dishes', array_to_json(v_bad_names)::JSONB
    );
  END IF;

  IF array_length(v_deep_names, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Composition à plusieurs niveaux non permise : %s est déjà composé d''autres plats. Un seul niveau est autorisé.',
        array_to_string(v_deep_names, ', ')
      ),
      'nested_base_dishes', array_to_json(v_deep_names)::JSONB
    );
  END IF;

  -- ── PASSE 2 : REMPLACEMENT ATOMIQUE ──
  DELETE FROM public.dish_recipe_components
  WHERE dish_id = p_dish_id AND bar_id = p_bar_id;

  -- ⚠️ Insère l'INTÉGRALITÉ de p_lines sans re-filtrer. SÛR uniquement parce
  -- que la passe 1 fait un RETURN sur la moindre anomalie.
  -- ⛔ NE JAMAIS remplacer un RETURN de la passe 1 par un CONTINUE sans
  --    filtrer ici aussi — le garde deviendrait décoratif.
  IF v_count > 0 THEN
    INSERT INTO public.dish_recipe_components (bar_id, dish_id, base_dish_id, quantity)
    SELECT
      p_bar_id,
      p_dish_id,
      (l->>'base_dish_id')::UUID,
      (l->>'quantity')::NUMERIC
    FROM jsonb_array_elements(p_lines) AS l;
  END IF;

  -- ⭐ Régime recalculé par le HELPER, jamais en dur ici.
  v_new_mode := public.derive_dish_production_mode(p_bar_id, p_dish_id);

  UPDATE public.dishes
  SET production_mode = v_new_mode
  WHERE id = p_dish_id AND bar_id = p_bar_id;

  RETURN jsonb_build_object(
    'success', true,
    'dish_id', p_dish_id,
    'component_count', v_count,
    'production_mode', v_new_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_dish_components(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_dish_components(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_dish_components(UUID, UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.replace_dish_components(UUID, UUID, JSONB) IS
  '§13.8 — remplace ATOMIQUEMENT la composition d''un plat (quels plats-bases il prélève). '
  'Valide TOUT avant d''écrire. Porte le garde du NIVEAU UNIQUE, impossible en SQL pur : '
  'un plat-base déjà composé est refusé, sinon le coût deviendrait récursif et un cycle '
  'rendrait la production infinie.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. replace_dish_recipe — même dérivation, via le helper           │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ SEULE LA DÉRIVATION CHANGE. Tout le reste du corps est repris à
-- l'identique de 20260803120000 : validation en deux passes, isolation par
-- bar, détection des doublons. Le remplacement se limite au bloc final.

CREATE OR REPLACE FUNCTION public.replace_dish_recipe(
  p_bar_id  UUID,
  p_dish_id UUID,
  p_lines   JSONB
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
  v_new_mode    TEXT;
  v_count       INTEGER := 0;
  v_seen        TEXT[] := ARRAY[]::TEXT[];
  v_key         TEXT;
  v_dup_names   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dishes
    WHERE id = p_dish_id AND bar_id = p_bar_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Format de recette invalide');
  END IF;

  -- ── PASSE 1 : VALIDER AVANT D'ÉCRIRE ──
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_ing_id := NULLIF(v_line->>'ingredient_id','')::UUID;
    v_qty    := (v_line->>'quantity')::NUMERIC;
    v_yield  := COALESCE(NULLIF(v_line->>'yield_factor','')::NUMERIC, 1.0);
    v_stage  := COALESCE(NULLIF(v_line->>'consumed_at_stage',''), 'batch');

    IF v_ing_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ligne de recette sans ingrédient');
    END IF;

    -- ⚠️ Messages REPRIS MOT POUR MOT de 20260803120000 : ils expliquent la
    -- règle au lieu de la constater (« 0.8 = 20 % de perte »). Les reformuler
    -- plus court aurait appauvri l'aide à la saisie sans rien corriger.
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'La quantité doit être strictement positive');
    END IF;

    IF v_yield IS NULL OR v_yield <= 0 OR v_yield > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Le rendement doit être compris entre 0 (exclu) et 1 — 0.8 = 20 % de perte'
      );
    END IF;

    IF v_stage NOT IN ('batch', 'finish') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stade de consommation invalide');
    END IF;

    IF v_stage = 'finish' THEN
      v_has_finish := TRUE;
    END IF;

    -- ⭐⭐ ISOLATION STRICTE PAR BAR.
    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients
      WHERE id = v_ing_id AND bar_id = p_bar_id AND is_active = TRUE
    ) THEN
      v_bad_names := v_bad_names || COALESCE(
        (SELECT name FROM public.ingredients WHERE id = v_ing_id), v_ing_id::TEXT
      );
    END IF;

    -- Doublon sur le TRIPLET : un même ingrédient peut légitimement
    -- apparaître à deux stades différents.
    v_key := v_ing_id::TEXT || '|' || v_stage;
    IF v_key = ANY(v_seen) THEN
      v_dup_names := v_dup_names || COALESCE(
        (SELECT name FROM public.ingredients WHERE id = v_ing_id), v_ing_id::TEXT
      );
    END IF;
    v_seen := v_seen || v_key;

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
  DELETE FROM public.dish_ingredients
  WHERE dish_id = p_dish_id AND bar_id = p_bar_id;

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

  -- ── ⭐⭐ DÉRIVATION — DÉLÉGUÉE AU HELPER ──
  -- ⛔ Le CASE en dur qui vivait ici ignorait `dish_recipe_components` : un
  -- plat composé mais non plat-base tombait en 'on_order' et n'aurait jamais
  -- prélevé de lot. La règle vit désormais en UN SEUL endroit.
  v_new_mode := public.derive_dish_production_mode(p_bar_id, p_dish_id);

  UPDATE public.dishes
  SET production_mode = v_new_mode
  WHERE id = p_dish_id AND bar_id = p_bar_id;

  RETURN jsonb_build_object(
    'success', true,
    'dish_id', p_dish_id,
    'line_count', v_count,
    'production_mode', v_new_mode,
    'has_finish_stage', v_has_finish
  );
END;
$$;

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS sur ce projet : les re-poser est
-- OBLIGATOIRE, sinon l'écran de recette tombe en « permission denied ».
REVOKE ALL ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_dish_recipe(UUID, UUID, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — les 3 fonctions, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('derive_dish_production_mode','replace_dish_components','replace_dish_recipe')
--    ORDER BY p.proname;
--    -- ATTENDU : 3 lignes | true | {search_path=public} pour chacune
--
-- 2) ⛔ BLOQUANT — GRANTS (CREATE OR REPLACE les perd) :
--
--    SELECT has_function_privilege('anon',
--             'public.replace_dish_recipe(UUID,UUID,JSONB)','EXECUTE')     AS anon_recipe,
--           has_function_privilege('authenticated',
--             'public.replace_dish_recipe(UUID,UUID,JSONB)','EXECUTE')     AS auth_recipe,
--           has_function_privilege('authenticated',
--             'public.replace_dish_components(UUID,UUID,JSONB)','EXECUTE') AS auth_components,
--           has_function_privilege('authenticated',
--             'public.derive_dish_production_mode(UUID,UUID)','EXECUTE')   AS auth_helper_KO;
--    -- ATTENDU : false | true | true | false
--    -- ⛔ `auth_helper_KO` DOIT valoir false : le helper est SECURITY DEFINER
--    --    SANS contrôle d'appartenance au bar. Accordé au client, il
--    --    révélerait le régime des plats d'un AUTRE bar. Les deux RPC
--    --    appelantes l'invoquent en interne, ce qui ne nécessite aucun grant.
--
-- 3) ⛔⛔ BLOQUANT — AUCUN PLAT EXISTANT N'A CHANGÉ DE RÉGIME.
--    Comparer au relevé du pré-vol n°3 :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- ATTENDU : IDENTIQUE au pré-vol. Aucun plat n'a de composants (la
--    -- table vient d'être créée), donc la nouvelle branche ne s'active pour
--    -- personne.
--    -- ⛔ Un écart signifierait que la dérivation a changé pour des plats
--    --    existants — leur consommation de stock en dépend.
--
-- 4) ⛔⛔ BLOQUANT — LE GARDE SYMÉTRIQUE EST PRÉSENT.
--    Le garde par ligne seul ne couvrait qu'un sens : composer A de B, PUIS
--    composer B de C, produisait une profondeur 2 par un ordre de saisie
--    parfaitement naturel (défaut de la code review du 07/08/2026).
--
--    SELECT pg_get_functiondef(p.oid) ~ 'base_dish_id = p_dish_id' AS garde_symetrique
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='replace_dish_components';
--    -- ATTENDU : true
--    -- ⛔ Si false : le niveau unique (§13.8) est contournable, et le calcul
--    --    du coût deviendrait récursif.
--
-- 4bis) ⚠️ FONCTIONNEL, via l'application — les DEUX ordres de saisie doivent
--    être refusés (auth.uid() vaut NULL dans le SQL Editor, donc
--    is_bar_member() y est faux et le RPC répond « Accès refusé » :
--    comportement ATTENDU, ce test se fait par l'UI) :
--      · ordre 1 : B composé de C, puis A composé de B  → refus sur A
--      · ordre 2 : A composé de B, puis B composé de C  → refus sur B
--    ⭐ Le second est celui qui passait avant la correction.
--
-- 5) ⚠️ FONCTIONNEL — via l'application :
--    -- a) composer un plat avec un plat-base → son régime devient
--    --    `batch_finish`, MÊME s'il n'est pas lui-même plat-base.
--    --    ⭐ C'est le défaut corrigé par cette migration.
--    -- b) retirer tous ses composants → il retombe sur `on_order`.
--    -- c) tenter de composer avec un plat NON plat-base → refusé.
