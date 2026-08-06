-- ===================================================================
-- MIGRATION: produce_batch — produire un lot et figer son coût
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.1 du module restauration (§16.8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- Le cuisinier braise 20 poulets le matin. Cette RPC :
--   1. consomme les ingrédients du plat-base en FEFO ;
--   2. crée le lot avec son coût unitaire FIGÉ ;
--   3. rend le lot disponible au prélèvement (3B.2).

-- ⭐⭐ LE COÛT EST FIGÉ ICI, ET C'EST TOUT L'INTÉRÊT DU RÉGIME
--   `unit_cost = coût matière réel du lot / portions produites`.
--   Deux lots du même plat produits à une semaine d'écart n'ont pas le même
--   coût — les prix bougent. Un plat vendu prélève le coût DE SON LOT, pas
--   un coût moyen recalculé : c'est ce qui rend la marge exacte.

-- ⭐ DÉLÉGATION À `consume_ingredients_fefo` — jamais de décrément écrit ici.
--   Cette primitive porte le FEFO, les dettes (§13.2), l'idempotence par
--   `reference_key` et le calcul du coût réel. La réimplémenter ferait
--   diverger deux logiques de consommation, et les dettes ne seraient
--   couvertes que d'un côté.

-- ⚠️ IDEMPOTENCE — `p_idempotency_key` OBLIGATOIRE
--   Un double-clic sur « Produire » créerait DEUX lots et consommerait DEUX
--   fois la matière. La clé est transmise à `consume_ingredients_fefo`
--   (idempotente par (bar_id, reference_key)) ET vérifiée ici avant
--   insertion : sans le second contrôle, un rejeu retournerait le coût sans
--   double décrément, mais créerait quand même un second lot — un lot
--   FANTÔME, avec de la matière déjà consommée par le premier.

-- ⭐ JOURNÉE COMMERCIALE — `closing_hour` DU BAR, pas 6 en dur.
--   ⚠️ Les RPC de la machine d'état (20260804130000) utilisent
--   `EXTRACT(HOUR ...) < 6` en repli. C'est une DETTE : un bar qui ferme à 4h
--   ou à 8h y est mal borné. Le repli ne sert que si le client omet la date,
--   ce qu'il ne fait pas — mais on ne reproduit pas le défaut ici.

-- BREAKING_CHANGE: NO
--   Fonction NEUVE. Aucune RPC existante touchée.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE);
--   ⚠️ Les lots déjà produits RESTENT — leur matière a réellement été
--   consommée. Ne pas les supprimer : le stock ingrédients ne serait pas
--   restauré pour autant.

-- FUNCTIONS_CREATED: produce_batch
-- TABLES_MODIFIED: aucune (INSERT uniquement) · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — dépendances :
--
--    SELECT to_regclass('public.production_batches') AS t_batches,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin',
--                                'consume_ingredients_fefo')) AS helpers;
--    -- ATTENDU : non NULL | 3
--
-- 3) ⚠️ INFORMATIF — un plat-base avec une recette est nécessaire pour
--    produire quoi que ce soit :
--
--    SELECT d.name, d.portions_per_batch,
--           count(di.id) AS lignes_recette
--    FROM public.dishes d
--    LEFT JOIN public.dish_ingredients di ON di.dish_id = d.id
--    WHERE d.is_active AND d.is_batch_base
--    GROUP BY d.id, d.name, d.portions_per_batch;
--    -- Un plat-base SANS recette produirait un lot à coût ZÉRO.

DO $$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_ingredients_fefo'
  ) THEN
    RAISE EXCEPTION 'consume_ingredients_fefo absente — appliquer d''abord 20260802160000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.produce_batch(
  p_bar_id          UUID,
  p_dish_id         UUID,
  p_produced_qty    NUMERIC,
  p_idempotency_key TEXT,
  p_expires_at      TIMESTAMPTZ DEFAULT NULL,
  p_notes           TEXT        DEFAULT NULL,
  p_business_date   DATE        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_dish       RECORD;
  v_close      INTEGER;
  v_bdate      DATE;
  v_ing_items  JSONB;
  v_consume    JSONB;
  v_total_cost NUMERIC;
  v_unit_cost  NUMERIC;
  v_batch_id   UUID;
  v_existing   RECORD;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS ne s'applique
  -- pas aux tables lues.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clé d''idempotence requise');
  END IF;

  IF p_produced_qty IS NULL OR p_produced_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le nombre de portions doit être positif');
  END IF;

  -- ⭐⭐ IDEMPOTENCE, PREMIER VERROU. `consume_ingredients_fefo` est
  -- idempotente et ne double-décrémenterait pas — mais sans CE contrôle, un
  -- rejeu créerait quand même un SECOND lot, dont la matière aurait été
  -- consommée par le premier. Un lot fantôme, gratuit, qui fausserait le coût
  -- de tout ce qu'il sert.
  -- ⚠️ Ce SELECT est une COMMODITÉ, pas la protection : deux requêtes
  -- concurrentes le passeraient toutes deux avant qu'aucune n'ait inséré.
  -- La garantie réelle est l'index unique (bar_id, idempotency_key), dont la
  -- violation est rattrapée dans le bloc EXCEPTION plus bas.
  SELECT id, produced_qty, remaining_qty, unit_cost, status
  INTO v_existing
  FROM public.production_batches
  WHERE bar_id = p_bar_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'batch_id', v_existing.id,
      'produced_qty', v_existing.produced_qty,
      'remaining_qty', v_existing.remaining_qty,
      'unit_cost', v_existing.unit_cost,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  END IF;

  -- ⚠️ `is_batch_base` EXIGÉ : seul un plat-base produit un lot. Le
  -- spaghetti-poulet prélève dans le lot d'un autre, il ne produit rien.
  -- ⭐ Isolation par bar dans le MÊME prédicat : sans elle, on produirait un
  -- lot pour le plat d'un autre bar en consommant NOTRE stock.
  SELECT id, name, portions_per_batch
  INTO v_dish
  FROM public.dishes
  WHERE id = p_dish_id AND bar_id = p_bar_id
    AND is_active = TRUE AND is_batch_base = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Plat introuvable, inactif, ou ne produisant pas de lot'
    );
  END IF;

  -- ⭐ Journée commerciale : `closing_hour` DU BAR (cf. en-tête).
  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_bdate := COALESCE(
    p_business_date,
    DATE((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Porto-Novo')
         - (v_close || ' hours')::INTERVAL)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- CONSOMMATION DE LA MATIÈRE
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⭐⭐ SEULS LES INGRÉDIENTS `consumed_at_stage = 'batch'`.
   *
   * ⛔ C'est LA distinction du régime `batch_finish` : le poulet bouilli du
   * matin ne consomme pas l'huile de friture — celle-ci part à la finition,
   * quand le plat est réellement commandé. Consommer tout ici sortirait de
   * l'huile pour des portions qui ne seront peut-être jamais servies.
   *
   * ⚠️ Pour un plat en régime `batch` pur, TOUS ses ingrédients sont
   * naturellement `'batch'` (valeur par défaut de la colonne) : le filtre est
   * sans effet pour lui. C'est ce qui rend cette règle sûre pour les deux
   * régimes sans condition supplémentaire.
   *
   * ⭐ QUANTITÉ BRUTE — quantity / yield_factor, DIVISION.
   * yield_factor 0.8 = 20 % de perte : produire 100 g nets exige de SORTIR
   * 125 g. Multiplier sous-estimerait la consommation de façon systématique.
   * ⚠️ × le nombre de portions produites : la recette est écrite pour UNE
   * portion, on en produit `p_produced_qty`.
   */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ingredient_id', di.ingredient_id,
           'qty', ROUND((di.quantity / di.yield_factor) * p_produced_qty, 3)
         )), '[]'::JSONB)
  INTO v_ing_items
  FROM public.dish_ingredients di
  WHERE di.dish_id = p_dish_id
    AND di.bar_id = p_bar_id
    AND di.consumed_at_stage = 'batch';

  IF jsonb_array_length(v_ing_items) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Le plat « %s » n''a aucun ingrédient de production. Renseignez sa recette avant de produire un lot.',
        v_dish.name
      )
    );
  END IF;

  -- ⭐ DÉLÉGATION : le FEFO, les dettes et le coût réel vivent là-bas.
  -- ⚠️ `reference_type = 'production_batch'` — distinct de
  -- 'kitchen_order_item' : les deux consommations ne se confondent pas dans
  -- le journal, et une clé d'idempotence de lot ne peut pas entrer en
  -- collision avec celle d'une ligne de commande.
  v_consume := public.consume_ingredients_fefo(
    p_bar_id,
    v_ing_items,
    p_idempotency_key,
    'production_batch',
    v_bdate
  );

  /**
   * ⛔⛔ ANNULATION EXPLICITE — défaut trouvé à la code review du 07/08/2026.
   *
   * `consume_ingredients_fefo` attrape ses propres erreurs et retourne
   * `success: false` SANS LEVER. Un simple `RETURN` ici sortirait donc
   * NORMALEMENT de la fonction — et validerait tout ce qui a précédé.
   *
   * ⚠️ Le FEFO annule bien ses décréments dans SON bloc. Mais rien ne garantit
   * que l'appelant de `produce_batch` annulera sa propre transaction en
   * voyant `success: false` : sur un client qui enchaîne des écritures,
   * l'état resterait partiel.
   *
   * ⭐ On lève donc une exception, rattrapée par le bloc EXCEPTION de cette
   * fonction, qui garantit le retour à l'état initial AVANT de rendre la
   * réponse métier. `RAISE` + `EXCEPTION` est le seul moyen d'annuler
   * réellement en PL/pgSQL — il n'y a pas de ROLLBACK dans une fonction.
   */
  -- ⚠️ Le drapeau d'invariant est mis EN TÊTE, pas en queue : un message
  -- d'erreur contenant lui-même un « | » (SQLERRM interpolé par le FEFO)
  -- tronquerait le texte si on découpait par la fin.
  IF NOT COALESCE((v_consume->>'success')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'FEFO_FAILED:%:%',
      COALESCE(v_consume->>'invariant_violation', 'false'),
      COALESCE(v_consume->>'error', 'Consommation des ingrédients impossible')
      USING ERRCODE = 'raise_exception';
  END IF;

  v_total_cost := COALESCE((v_consume->>'total_cost')::NUMERIC, 0);

  -- ⭐ LE COÛT UNITAIRE, FIGÉ.
  -- ⚠️ Division par `p_produced_qty`, JAMAIS par `portions_per_batch` : le
  -- cuisinier a produit ce qu'il a produit. Un lot de 12 poulets alors que la
  -- fiche en prévoit 20 doit coûter le douzième du réel, pas le vingtième —
  -- sinon chaque portion serait sous-évaluée de 40 %.
  v_unit_cost := ROUND(v_total_cost / p_produced_qty, 4);

  INSERT INTO public.production_batches (
    bar_id, dish_id, produced_qty, remaining_qty, unit_cost,
    status, produced_by, business_date, expires_at, notes, idempotency_key
  ) VALUES (
    p_bar_id, p_dish_id, p_produced_qty, p_produced_qty, v_unit_cost,
    'active', v_actor, v_bdate, p_expires_at, p_notes, p_idempotency_key
  )
  RETURNING id INTO v_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'dish_name', v_dish.name,
    'produced_qty', p_produced_qty,
    'remaining_qty', p_produced_qty,
    'total_cost', v_total_cost,
    'unit_cost', v_unit_cost,
    'business_date', v_bdate,
    'status', 'active',
    'idempotent_replay', false
  );

EXCEPTION
  -- ⭐⭐ COURSE D'IDEMPOTENCE — traitée AVANT les autres violations.
  -- Deux requêtes concurrentes passent toutes deux le SELECT du haut, puis
  -- l'une insère et l'autre heurte l'index unique. Ce n'est PAS une
  -- incohérence : c'est exactement le cas que l'idempotence doit absorber.
  -- ⚠️ Sans cette branche, un double-clic afficherait « Incohérence de
  -- données détectée » — un message alarmant pour un comportement nominal.
  -- ⭐ On relit le lot gagnant et on le retourne : les deux appels rendent
  -- le même résultat, ce qui est la définition de l'idempotence.
  WHEN unique_violation THEN
    SELECT id, produced_qty, remaining_qty, unit_cost, status
    INTO v_existing
    FROM public.production_batches
    WHERE bar_id = p_bar_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_existing.id,
        'produced_qty', v_existing.produced_qty,
        'remaining_qty', v_existing.remaining_qty,
        'unit_cost', v_existing.unit_cost,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    END IF;

    -- Unicité violée sur autre chose que la clé d'idempotence : là, c'est
    -- bien une incohérence.
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );

  -- ⚠️ Une violation de contrainte signale un INVARIANT CASSÉ, pas un cas
  -- métier — même traitement que `consume_ingredients_fefo`.
  WHEN check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );

  /**
   * ⭐ ÉCHEC DU FEFO — l'annulation a eu lieu, on restitue le message MÉTIER.
   *
   * ⚠️ Sans cette branche, le cuisinier lirait « FEFO_FAILED:Ingrédient
   * introuvable|false » : le marqueur technique qui sert au transport
   * fuiterait jusqu'à l'écran. On le découpe pour ne rendre que ce qui a du
   * sens pour lui.
   * ⚠️ `WHEN OTHERS` la rattraperait aussi, mais APRÈS — l'ordre des
   * handlers compte, et celui-ci doit passer en premier.
   */
  WHEN raise_exception THEN
    -- Format : FEFO_FAILED:<true|false>:<message, qui peut contenir des « : »>
    -- ⚠️ On coupe sur les DEUX premiers séparateurs seulement — le reste est
    -- le message, quels que soient les caractères qu'il contient.
    IF SQLERRM LIKE 'FEFO_FAILED:%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', substring(SQLERRM FROM position(':' IN substring(SQLERRM FROM 13)) + 13),
        'invariant_violation', split_part(SQLERRM, ':', 2) = 'true'
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE) TO service_role;

COMMENT ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE) IS
  '§16.8 — produit un lot : consomme les ingrédients `consumed_at_stage = ''batch''` en FEFO '
  '(délégué à consume_ingredients_fefo) et fige unit_cost = coût réel / portions PRODUITES. '
  '⭐ Divise par les portions réellement produites, jamais par portions_per_batch : un lot de '
  '12 quand la fiche en prévoit 20 doit coûter le douzième du réel. '
  '⚠️ Idempotent par (bar_id, idempotency_key) — sans quoi un double-clic créerait un lot '
  'FANTÔME dont la matière aurait déjà été consommée par le premier.';

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction existe, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔ BLOQUANT — privilèges :
--
--    SELECT has_function_privilege('anon',
--             'public.produce_batch(UUID,UUID,NUMERIC,TEXT,TIMESTAMPTZ,TEXT,DATE)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.produce_batch(UUID,UUID,NUMERIC,TEXT,TIMESTAMPTZ,TEXT,DATE)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — SEULS LES INGRÉDIENTS 'batch' SONT CONSOMMÉS.
--    C'est LA distinction du régime : consommer les 'finish' ici sortirait de
--    l'huile pour des portions peut-être jamais servies.
--
--    SELECT pg_get_functiondef(p.oid) ~ 'consumed_at_stage = ''batch''' AS filtre_batch
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : true
--
-- 4) ⛔ BLOQUANT — le coût divise par les portions PRODUITES, pas par la
--    fiche technique :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'v_total_cost / p_produced_qty' AS division_correcte
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : true
--    -- ⛔ Si la division se faisait par portions_per_batch, un lot partiel
--    --    sous-évaluerait chaque portion.
--
-- 5) ⚠️ FONCTIONNEL — via l'application (auth.uid() vaut NULL dans le SQL
--    Editor, donc is_bar_member() y est faux : la RPC répond « Accès refusé »,
--    comportement ATTENDU) :
--    -- a) produire un lot de 10 portions → vérifier que le stock des
--    --    ingrédients 'batch' a bien baissé, et PAS celui des 'finish' ;
--    -- b) relancer avec la MÊME clé → `idempotent_replay: true`, aucun
--    --    second lot, aucun second décrément ;
--    -- c) produire sur un plat non plat-base → refusé.
