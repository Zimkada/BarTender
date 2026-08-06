-- ===================================================================
-- MIGRATION: lot APPROVISIONNÉ — un plat-base parfois acheté
-- DATE: 2026-08-08
-- AUTHOR: AI Assistant
-- PHASE: 3C.2 du module restauration (§19.3)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐ DÉCOUVERTE TERRAIN du 08/08/2026 (§19.3) :
--   « Si dans ce même restau par moment on produit de l'akassa, ça fera deux
--     recettes pour un même plat ou bien on crée deux plats ? »
--
--   Un maquis PRODUIT son akassa certains jours (maïs, eau, travail) et
--   l'ACHÈTE d'autres jours. Même article vendu, deux économies.
--
--   ⛔ `produce_batch` consommait TOUJOURS la recette du plat-base. Un lot
--   acheté n'a pas de recette à consommer — il a un PRIX PAYÉ. Le seul
--   contournement était de créer deux plats, ce qui scinde les statistiques
--   et alourdit le menu pour un même article.

-- ⭐⭐ LE PRIX SAISI EST LE PRIX TOTAL PAYÉ — arbitrage 08/08/2026.
--   « J'ai acheté 40 boules pour 4 000 F. » C'est ce qui est écrit sur le
--   reçu du fournisseur ; le système divise pour obtenir `unit_cost`.
--   ⚠️ Même logique que `produce_batch` pour un lot produit : coût TOTAL
--   divisé par les portions RÉELLEMENT produites. Une seule règle de calcul
--   pour les deux origines.

-- ⭐ UN PLAT SANS RECETTE PEUT ÊTRE APPROVISIONNÉ — arbitrage 08/08/2026.
--   Un akassa TOUJOURS acheté n'a aucune recette à saisir. Exiger une recette
--   pour un article qu'on ne produit jamais serait absurde.
--   ⚠️ Le refus existant (« renseignez sa recette ») ne s'applique donc
--   QU'AUX lots produits.

-- ⚠️ UN LOT ACHETÉ NE CONSOMME AUCUN INGRÉDIENT. Aucun appel au FEFO, aucun
--   décrément de stock : la matière n'est pas passée par le stock cuisine,
--   elle est arrivée prête. Le coût vient du prix payé, pas d'un calcul.

-- ⭐ LE PRÉLÈVEMENT NE CHANGE PAS — question tranchée sans code (§19.3).
--   « Doit-on faire du FIFO, chacun décrémentant selon sa nature ? » NON :
--   l'akassa acheté à 8h et celui produit à 14h sont dans le MÊME bac, on
--   sert le plus ancien. Chaque assiette prend le coût de SON lot, donc le
--   coût reste exact des deux côtés. Séparer les files supposerait un critère
--   de choix qui n'existe pas en métier.

-- BREAKING_CHANGE: NO
--   Colonne AJOUTÉE avec DEFAULT 'produced' : tous les lots existants sont
--   déclarés produits, ce qu'ils sont. La signature de `produce_batch` gagne
--   DEUX paramètres OPTIONNELS en fin de liste — les appels existants
--   continuent de fonctionner à l'identique.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.production_batches DROP COLUMN IF EXISTS source;
--   + réappliquer produce_batch depuis 20260807150000.
--   ⚠️ Les lots achetés déjà créés perdraient leur qualification, mais leur
--   `unit_cost` reste juste — il est figé.

-- TABLES_MODIFIED: production_batches (1 colonne)
-- FUNCTIONS_MODIFIED: produce_batch (2 paramètres optionnels)
-- RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la colonne ne doit PAS préexister :
--
--    SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='production_batches'
--      AND column_name='source';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — `produce_batch` existe (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : 1
--
-- 3) ⚠️ INFORMATIF — combien de lots existants seront déclarés « produced » :
--
--    SELECT count(*) AS lots_existants FROM public.production_batches;
--    -- Tous prendront `source = 'produced'`, ce qu'ils sont réellement.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'produce_batch'
  ) THEN
    RAISE EXCEPTION 'produce_batch absente — appliquer d''abord 20260807150000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. LA COLONNE                                                    │
-- └─────────────────────────────────────────────────────────────────┘

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'produced'
    CHECK (source IN ('produced', 'purchased'));

COMMENT ON COLUMN public.production_batches.source IS
  '§19.3 — origine du lot. `produced` : cuisiné sur place, les ingrédients ont été consommés en '
  'FEFO. `purchased` : acheté prêt, AUCUN ingrédient consommé, unit_cost = prix payé / portions. '
  '⭐ Le PRÉLÈVEMENT ne distingue PAS l''origine : les deux lots sont dans le même bac, on sert '
  'le plus ancien (FIFO). Chaque assiette prend le coût de SON lot.';

-- ⚠️ PAS d'index sur `source` seul : aucune requête ne filtre là-dessus. Les
-- lots se cherchent par plat et par statut, et `idx_pb_bar_dish_active`
-- couvre déjà ce cas. Un index sans lecteur est du volume mort.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. produce_batch — accepter un lot approvisionné                 │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ Le corps est repris de 20260807150000 : seuls la signature (2 paramètres
-- optionnels) et le bloc de consommation changent.

CREATE OR REPLACE FUNCTION public.produce_batch(
  p_bar_id          UUID,
  p_dish_id         UUID,
  p_produced_qty    NUMERIC,
  p_idempotency_key TEXT,
  p_expires_at      TIMESTAMPTZ DEFAULT NULL,
  p_notes           TEXT        DEFAULT NULL,
  p_business_date   DATE        DEFAULT NULL,
  -- ⭐ NOUVEAUX, en FIN de liste et OPTIONNELS : les appels existants
  -- continuent de fonctionner sans modification.
  p_source          TEXT        DEFAULT 'produced',
  -- ⚠️ Prix TOTAL payé, jamais unitaire — c'est ce qui figure sur le reçu.
  -- Le système divise, comme il le fait déjà pour un lot produit.
  p_total_cost      NUMERIC     DEFAULT NULL
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
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clé d''idempotence requise');
  END IF;

  IF p_produced_qty IS NULL OR p_produced_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le nombre de portions doit être positif');
  END IF;

  -- ⛔ LISTE BLANCHE des origines, jamais une liste noire — motif récurrent
  -- du projet. Une valeur ajoutée plus tard est refusée par défaut.
  IF COALESCE(p_source, 'produced') NOT IN ('produced', 'purchased') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Origine de lot invalide');
  END IF;

  /**
   * ⛔ UN LOT ACHETÉ EXIGE SON PRIX. Sans lui, `unit_cost` vaudrait 0 et
   * chaque portion servie afficherait 100 % de marge — un chiffre faux qui
   * ne se voit pas, et qui fausserait toute la rentabilité du plat.
   * ⚠️ `>= 0` et non `> 0` : un lot offert par un fournisseur est un cas
   * réel, et son coût est bien zéro.
   */
  IF COALESCE(p_source, 'produced') = 'purchased'
     AND (p_total_cost IS NULL OR p_total_cost < 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Le prix payé est requis pour un lot acheté'
    );
  END IF;

  -- ⭐⭐ IDEMPOTENCE, PREMIER VERROU. Sans ce contrôle, un rejeu créerait un
  -- SECOND lot dont la matière aurait été consommée par le premier.
  -- ⚠️ Ce SELECT est une COMMODITÉ : deux requêtes concurrentes le
  -- passeraient toutes deux. La garantie réelle est l'index unique.
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

  -- ⚠️ `is_batch_base` EXIGÉ, quelle que soit l'origine : seul un plat-base
  -- porte des lots. Un plat acheté qui n'en serait pas un n'aurait nulle part
  -- où stocker ses portions.
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

  SELECT COALESCE(closing_hour, 6) INTO v_close FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_bdate := COALESCE(
    p_business_date,
    DATE((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Porto-Novo')
         - (v_close || ' hours')::INTERVAL)
  );

  -- ═══════════════════════════════════════════════════════════════
  -- COÛT DU LOT — deux origines, deux façons de l'obtenir
  -- ═══════════════════════════════════════════════════════════════
  IF COALESCE(p_source, 'produced') = 'purchased' THEN
    /**
     * ⭐ LOT ACHETÉ — AUCUN ingrédient consommé, aucun appel au FEFO.
     * La matière n'est jamais passée par le stock cuisine : elle est arrivée
     * prête. Le coût vient du prix payé, pas d'un calcul.
     *
     * ⭐ Et AUCUNE recette n'est exigée : un akassa toujours acheté n'en a
     * pas. Le refus « renseignez sa recette » ne concerne que les lots
     * PRODUITS (arbitrage 08/08/2026).
     */
    v_total_cost := p_total_cost;
  ELSE
    /**
     * ⭐⭐ SEULS LES INGRÉDIENTS `consumed_at_stage = 'batch'`.
     * ⛔ C'est LA distinction du régime `batch_finish` : le poulet bouilli du
     * matin ne consomme pas l'huile de friture, qui part à la finition.
     * ⚠️ Pour un plat `batch` pur, TOUS ses ingrédients sont `'batch'`
     * (valeur par défaut) : le filtre est sans effet pour lui.
     *
     * ⭐ QUANTITÉ BRUTE — quantity / yield_factor, DIVISION. yield_factor 0.8
     * = 20 % de perte : produire 100 g nets exige de SORTIR 125 g.
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
          'Le plat « %s » n''a aucun ingrédient de production. Renseignez sa recette, ou déclarez ce lot comme acheté.',
          v_dish.name
        )
      );
    END IF;

    -- ⭐ DÉLÉGATION : le FEFO, les dettes et le coût réel vivent là-bas.
    v_consume := public.consume_ingredients_fefo(
      p_bar_id,
      v_ing_items,
      p_idempotency_key,
      'production_batch',
      v_bdate
    );

    /**
     * ⛔⛔ ANNULATION EXPLICITE. `consume_ingredients_fefo` attrape ses
     * propres erreurs et retourne `success: false` SANS LEVER — un simple
     * `RETURN` validerait ce qui précède. Il n'y a pas de ROLLBACK dans une
     * fonction PL/pgSQL : RAISE + EXCEPTION est le seul moyen d'annuler.
     */
    IF NOT COALESCE((v_consume->>'success')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'FEFO_FAILED:%:%',
        COALESCE(v_consume->>'invariant_violation', 'false'),
        COALESCE(v_consume->>'error', 'Consommation des ingrédients impossible')
        USING ERRCODE = 'raise_exception';
    END IF;

    v_total_cost := COALESCE((v_consume->>'total_cost')::NUMERIC, 0);
  END IF;

  -- ⭐ LE COÛT UNITAIRE, FIGÉ — MÊME règle pour les deux origines.
  -- ⚠️ Division par `p_produced_qty`, JAMAIS par `portions_per_batch` : un lot
  -- de 12 quand la fiche en prévoit 20 doit coûter le douzième du réel.
  v_unit_cost := ROUND(v_total_cost / p_produced_qty, 4);

  INSERT INTO public.production_batches (
    bar_id, dish_id, produced_qty, remaining_qty, unit_cost,
    status, produced_by, business_date, expires_at, notes, idempotency_key,
    source
  ) VALUES (
    p_bar_id, p_dish_id, p_produced_qty, p_produced_qty, v_unit_cost,
    'active', v_actor, v_bdate, p_expires_at, p_notes, p_idempotency_key,
    COALESCE(p_source, 'produced')
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
    'source', COALESCE(p_source, 'produced'),
    'idempotent_replay', false
  );

EXCEPTION
  -- ⭐⭐ COURSE D'IDEMPOTENCE — traitée AVANT les autres violations. Deux
  -- requêtes concurrentes passent le SELECT du haut, l'une insère et l'autre
  -- heurte l'index unique. Ce n'est PAS une incohérence : c'est exactement le
  -- cas que l'idempotence doit absorber.
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

    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );

  WHEN check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );

  WHEN raise_exception THEN
    -- Format : FEFO_FAILED:<true|false>:<message, qui peut contenir des « : »>
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

/**
 * ⛔⛔ L'ANCIENNE SIGNATURE DOIT ÊTRE SUPPRIMÉE.
 *
 * `CREATE OR REPLACE` ne remplace PAS une fonction dont la liste de
 * paramètres diffère : PostgreSQL crée une SURCHARGE. Les deux versions
 * coexisteraient, et PostgREST choisirait selon les paramètres envoyés — le
 * client appellerait donc parfois l'ancienne, sans jamais poser `source`.
 * ⚠️ Défaut invisible : aucune erreur, juste des lots mal qualifiés.
 */
DROP FUNCTION IF EXISTS public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE);

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS : les re-poser est obligatoire.
REVOKE ALL ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE, TEXT, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.produce_batch(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT, DATE, TEXT, NUMERIC) IS
  '§16.8 + §19.3 — crée un lot, PRODUIT ou ACHETÉ. '
  '⭐ `produced` : consomme les ingrédients ''batch'' en FEFO, unit_cost = coût réel / portions. '
  '⭐ `purchased` : AUCUN ingrédient consommé, unit_cost = prix TOTAL payé / portions. Aucune '
  'recette exigée — un akassa toujours acheté n''en a pas. '
  '⚠️ Le prélèvement ne distingue PAS l''origine (§19.3) : même bac, FIFO sur produced_at. '
  '⚠️ Idempotent par (bar_id, idempotency_key).';

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la colonne existe, avec le bon défaut :
--
--    SELECT column_name, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='production_batches'
--      AND column_name='source';
--    -- ATTENDU : source | 'produced'::text | NO
--
-- 2) ⛔⛔ BLOQUANT — UNE SEULE signature de `produce_batch`. Deux voudrait
--    dire que l'ancienne survit en surcharge : PostgREST appellerait parfois
--    celle qui ignore `source`, sans aucune erreur visible.
--
--    SELECT count(*) AS nb_signatures
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : 1
--    -- ⛔ Si 2 : DROP la signature à 7 arguments.
--
-- 3) ⛔ BLOQUANT — GRANTS re-posés sur la NOUVELLE signature :
--
--    SELECT has_function_privilege('authenticated',
--             'public.produce_batch(UUID,UUID,NUMERIC,TEXT,TIMESTAMPTZ,TEXT,DATE,TEXT,NUMERIC)',
--             'EXECUTE') AS auth_ok,
--           has_function_privilege('anon',
--             'public.produce_batch(UUID,UUID,NUMERIC,TEXT,TIMESTAMPTZ,TEXT,DATE,TEXT,NUMERIC)',
--             'EXECUTE') AS anon_ko;
--    -- ATTENDU : true | false
--
-- 4) ⛔⛔ BLOQUANT — UN LOT ACHETÉ NE CONSOMME RIEN. C'est la propriété qui
--    justifie cette migration : la matière n'est jamais passée par le stock.
--
--    SELECT pg_get_functiondef(p.oid) ~ 'p_source, ''produced''\) = ''purchased'' THEN'
--             AS branche_achetee
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='produce_batch';
--    -- ATTENDU : true
--
-- 5) ⛔ BLOQUANT — les lots existants sont déclarés « produced » :
--
--    SELECT source, count(*) FROM public.production_batches
--    GROUP BY source;
--    -- ATTENDU : uniquement 'produced' (aucun lot acheté n'existait avant).
--
-- 6) ⚠️ FONCTIONNEL — via l'application :
--    -- a) ⭐ NON-RÉGRESSION D'ABORD : produire un lot normalement → les
--    --    ingrédients baissent, `source = 'produced'` ;
--    -- b) déclarer un lot ACHETÉ (40 portions, 4 000 F) → unit_cost = 100,
--    --    AUCUN ingrédient ne bouge ;
--    -- c) lot acheté SANS prix → refusé avec un message clair ;
--    -- d) lot acheté sur un plat SANS recette → accepté (le cas normal) ;
--    -- e) servir un plat avec DEUX lots actifs d'origines différentes → le
--    --    plus ancien est prélevé en premier, quel que soit son origine.
