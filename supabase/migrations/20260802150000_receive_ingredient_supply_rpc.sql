-- ===================================================================
-- MIGRATION: receive_ingredient_supply — appro d'ingrédients (FEFO)
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 1 du module restauration
-- DEPEND DE: 20260802140000_create_ingredients_tables.sql
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Les tables ingrédients existent mais sont INERTES : aucune fonction n'y
--   écrit. `authenticated` n'a que SELECT — volontairement, pour que toute
--   écriture passe par un RPC qui garantit le calcul FEFO et le cache.

-- IMPACT:
--   ⭐ AUCUN bar existant. Fonction NEUVE sur des tables NEUVES.
--   Appelée uniquement quand `hasRestaurant = true` (§3).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION: un RPC atomique qui, dans CET ORDRE (§13.2) :
--   1. solde les dettes ouvertes de l'ingrédient (FIFO sur incurred_at)
--   2. trace `price_variance` (coût estimé vs coût réel)
--   3. crée le lot avec le RELIQUAT seulement
--   4. met à jour le cache `current_stock`
--
-- ⭐ L'ORDRE EST LA SPÉCIFICATION, PAS UN DÉTAIL.
--   Créer le lot d'abord puis solder les dettes donnerait le même
--   `current_stock` mais une VALORISATION FAUSSE : la quantité qui solde une
--   dette n'a jamais été disponible, elle ne doit donc jamais apparaître dans
--   `remaining_qty`. Sinon le FEFO consommerait deux fois la même matière.

-- ⚠ IDEMPOTENCE — ajoutée à ingredient_lots par cette migration.
--   Un appro se saisit souvent en zone de réseau instable, et un double-clic
--   sur « valider » créerait DEUX lots, donc un stock doublé et une marge
--   fausse. Le dégât serait SILENCIEUX — aucune erreur, juste des chiffres
--   faux. Même raisonnement que create_sale_idempotent.

-- BREAKING_CHANGE: NO
--   ALTER sur une table créée le jour même, encore vide en production.
--   Aucune table ni fonction préexistante touchée.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.receive_ingredient_supply(uuid,uuid,numeric,numeric,date,text,date,text);
--   ALTER TABLE public.ingredient_lots DROP COLUMN IF EXISTS idempotency_key;

-- TABLES_MODIFIED: ingredient_lots (+ idempotency_key)
-- FUNCTIONS_CREATED: public.receive_ingredient_supply

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la migration 20260802140000 doit être appliquée :
--
--    SELECT to_regclass('public.ingredients')            AS t_ingredients,
--           to_regclass('public.ingredient_lots')        AS t_lots,
--           to_regclass('public.ingredient_stock_debts') AS t_debts;
--    -- ATTENDU : les 3 non NULL
--
-- 2) La fonction ne doit pas déjà exister :
--
--    SELECT count(*) AS nb FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'receive_ingredient_supply';
--    -- ATTENDU : 0
--
-- 3) La colonne d'idempotence n'existe pas encore :
--
--    SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'ingredient_lots'
--      AND column_name = 'idempotency_key';
--    -- ATTENDU : 0 ligne
--
-- 4) État des données (comparaison post-vol) :
--
--    SELECT (SELECT count(*) FROM public.ingredient_lots)        AS nb_lots,
--           (SELECT count(*) FROM public.ingredient_stock_debts) AS nb_debts;
--    -- ATTENDU : 0 / 0 (tables neuves, aucune saisie)

BEGIN;

-- Garde-fou : dépendances et non-réexécution.
DO $$
BEGIN
  IF to_regclass('public.ingredients') IS NULL
     OR to_regclass('public.ingredient_lots') IS NULL
     OR to_regclass('public.ingredient_stock_debts') IS NULL THEN
    RAISE EXCEPTION 'Tables ingrédients absentes — exécuter 20260802140000 d''abord';
  END IF;
END $$;

-- =====================================================
-- 1. Idempotence sur les lots
-- =====================================================

ALTER TABLE public.ingredient_lots
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN public.ingredient_lots.idempotency_key IS
  'Clé d''idempotence de l''appro (UUID généré côté client AVANT l''appel). '
  'Un double-clic ou un retry réseau ne doit jamais créer deux lots : le stock '
  'serait doublé et la marge fausse, SANS aucune erreur visible.';

-- Unicité par bar. Partiel : les lots antérieurs à cette migration, ou créés
-- par un import futur sans clé, ne doivent pas se bloquer entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_lots_idempotency
  ON public.ingredient_lots (bar_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- 2. receive_ingredient_supply
-- =====================================================

CREATE OR REPLACE FUNCTION public.receive_ingredient_supply(
  p_bar_id          UUID,
  p_ingredient_id   UUID,
  p_qty             NUMERIC,
  p_unit_cost       NUMERIC,
  p_idempotency_key TEXT,
  p_expires_at      DATE DEFAULT NULL,
  p_business_date   DATE DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id       UUID;
  v_caller_role    TEXT;
  v_business_date  DATE;
  v_existing_lot   public.ingredient_lots;
  v_debt           RECORD;
  v_remaining_qty  NUMERIC;
  v_settle_qty     NUMERIC;
  v_settled_total  NUMERIC := 0;
  v_variance       NUMERIC;
  v_fully_settled  BOOLEAN;
  v_lot_id         UUID;
  v_ingredient     public.ingredients;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '30s';

  -- ── Validation de base ────────────────────────────────────────────
  IF p_bar_id IS NULL OR p_ingredient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'bar_id et ingredient_id sont requis');
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La quantité doit être strictement positive');
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le coût unitaire ne peut pas être négatif');
  END IF;

  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_key est requise');
  END IF;

  -- ── 🛡️ SECURITY CHECK — membre actif + permission ─────────────────
  -- Bypass service_role pour SyncManager, migrations et tests.
  -- ⚠️ Sous service_role, v_actor_id reste NULL : le lot créé aura
  --    created_by = NULL. La colonne est nullable, donc pas d'échec, mais la
  --    traçabilité est perdue. Acceptable pour un rejeu de sync (l'auteur
  --    réel est dans la file offline) ; à garder à l'esprit en test manuel.
  IF auth.role() <> 'service_role' THEN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
    END IF;

    SELECT bm.role INTO v_caller_role
    FROM public.bar_members bm
    WHERE bm.user_id = v_actor_id
      AND bm.bar_id = p_bar_id
      AND bm.is_active = TRUE;

    IF v_caller_role IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Accès refusé : non membre actif de ce bar');
    END IF;

    -- ⭐ LISTE BLANCHE, jamais liste noire — leçon de create_sale_idempotent.
    --    Correspond à canManageIngredientStock (MATRICE_RBAC_CUISINIER §3) :
    --    le cuisinier réceptionne les livraisons, le serveur non.
    IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'cuisinier') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Accès refusé : le rôle %s ne peut pas enregistrer un approvisionnement', v_caller_role)
      );
    END IF;
  END IF;

  -- ── ⭐ IDEMPOTENCE — avant toute écriture ─────────────────────────
  SELECT * INTO v_existing_lot
  FROM public.ingredient_lots
  WHERE bar_id = p_bar_id AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'lot_id', v_existing_lot.id,
      'idempotent_replay', true
    );
  END IF;

  -- ── Verrouiller l'ingrédient ──────────────────────────────────────
  -- ⚠️ FOR UPDATE : deux appros simultanés sur le même ingrédient
  --    liraient le même current_stock et le second écraserait le premier.
  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingrédient introuvable dans ce bar');
  END IF;

  IF NOT v_ingredient.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cet ingrédient est désactivé');
  END IF;

  v_business_date := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  v_remaining_qty := p_qty;

  -- ── ⭐ ÉTAPE 1 : SOLDER LES DETTES, AVANT de créer le lot (§13.2) ──
  --
  -- L'ordre EST la spécification. Créer le lot puis solder donnerait le même
  -- current_stock, mais une valorisation FAUSSE : la quantité qui solde une
  -- dette n'a jamais été disponible, elle ne doit donc jamais figurer dans
  -- remaining_qty — sinon le FEFO consommerait deux fois la même matière.
  --
  -- FIFO sur incurred_at : la dette la plus ancienne se solde d'abord.
  FOR v_debt IN
    SELECT * FROM public.ingredient_stock_debts
    WHERE ingredient_id = p_ingredient_id
      AND bar_id = p_bar_id
      AND status = 'open'
    ORDER BY incurred_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_settle_qty := LEAST(v_remaining_qty, v_debt.qty_owed - v_debt.settled_qty);

    -- ⭐ price_variance : écart entre l'estimation faite à la consommation
    --    et le coût réellement payé. C'est CE chiffre qui rend l'anomalie
    --    exploitable — il alimente l'écart théorique/réel (§8).
    v_variance := (p_unit_cost - v_debt.estimated_unit_cost) * v_settle_qty;

    -- ⚠️ `v_fully_settled` calculé AVANT l'UPDATE, sur les valeurs lues.
    --    Répéter `settled_qty + v_settle_qty >= qty_owed` dans le SET est
    --    fragile : ces colonnes y désignent les valeurs AVANT mise à jour,
    --    ce qui est correct mais non évident — et la moindre réécriture par
    --    un tiers casserait la cohérence avec la contrainte.
    v_fully_settled := (v_debt.settled_qty + v_settle_qty) >= v_debt.qty_owed;

    UPDATE public.ingredient_stock_debts
    SET -- ⚠️ Sur solde total, on POSE qty_owed plutôt que d'additionner : la
        --    contrainte ingredient_debts_settled_coherence exige l'égalité
        --    STRICTE, et une addition de NUMERIC(14,3) pourrait la manquer
        --    d'un millième — la transaction entière échouerait alors.
        settled_qty    = CASE WHEN v_fully_settled THEN qty_owed
                              ELSE settled_qty + v_settle_qty END,
        price_variance = COALESCE(price_variance, 0) + v_variance,
        status         = CASE WHEN v_fully_settled THEN 'settled' ELSE 'open' END,
        settled_at     = CASE WHEN v_fully_settled THEN NOW() ELSE settled_at END
    WHERE id = v_debt.id;

    v_remaining_qty := v_remaining_qty - v_settle_qty;
    v_settled_total := v_settled_total + v_settle_qty;
  END LOOP;

  -- ── ÉTAPE 2 : créer le lot avec le RELIQUAT ───────────────────────
  -- ⚠️ Si tout l'appro a soldé des dettes, il n'y a PAS de lot à créer :
  --    initial_qty > 0 est une contrainte, et un lot vide n'aurait aucun sens.
  IF v_remaining_qty > 0 THEN
    INSERT INTO public.ingredient_lots (
      bar_id, ingredient_id, initial_qty, remaining_qty, unit_cost,
      expires_at, business_date, status, created_by, idempotency_key
    ) VALUES (
      p_bar_id, p_ingredient_id, v_remaining_qty, v_remaining_qty, p_unit_cost,
      p_expires_at, v_business_date, 'active', v_actor_id, p_idempotency_key
    )
    RETURNING id INTO v_lot_id;
  END IF;

  -- ── ÉTAPE 3 : mettre à jour le cache ──────────────────────────────
  -- ⚠️ Recalcul depuis la SOURCE DE VÉRITÉ, jamais un incrément : un
  --    `current_stock + p_qty` accumulerait les dérives silencieusement.
  --    C'est la leçon du CUMP (vague 4c).
  UPDATE public.ingredients
  SET current_stock = (
        SELECT COALESCE(SUM(remaining_qty), 0)
        FROM public.ingredient_lots
        WHERE ingredient_id = p_ingredient_id AND status = 'active'
      ) - (
        SELECT COALESCE(SUM(qty_owed - settled_qty), 0)
        FROM public.ingredient_stock_debts
        WHERE ingredient_id = p_ingredient_id AND status = 'open'
      ),
      last_unit_cost = p_unit_cost
  WHERE id = p_ingredient_id;

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot_id,                    -- NULL si tout a soldé des dettes
    'qty_received', p_qty,
    'qty_settled_debts', v_settled_total,
    'qty_stocked', v_remaining_qty,
    'idempotent_replay', false
  );

EXCEPTION
  -- ⭐ Une violation de contrainte n'est PAS une erreur ordinaire : elle
  --    signale un INVARIANT CASSÉ (dette sur-soldée, lot négatif, forfait
  --    incohérent). La confondre avec « ingrédient introuvable » ferait
  --    disparaître un bug de calcul derrière un message anodin.
  WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );
  WHEN OTHERS THEN
    -- ⚠️ Message SQL brut conservé : diagnostiquer un appro raté sans lui
    --    serait impossible (observabilité).
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.receive_ingredient_supply IS
  'Enregistre un approvisionnement d''ingrédient (§13.2). ORDRE CRITIQUE : solde les dettes '
  'ouvertes AVANT de créer le lot — la quantité qui solde une dette n''a jamais été disponible '
  'et ne doit pas entrer dans remaining_qty, sinon le FEFO consommerait deux fois la même '
  'matière. Idempotent par (bar_id, idempotency_key). Recalcule current_stock depuis la source '
  'de vérité, jamais par incrément.';

-- ⚠️ CREATE OR REPLACE perd les grants dans cette base : REVOKE/GRANT explicites.
REVOKE ALL ON FUNCTION public.receive_ingredient_supply(
  uuid, uuid, numeric, numeric, text, date, date, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_ingredient_supply(
  uuid, uuid, numeric, numeric, text, date, date, text
) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe, en 1 seule version, durcie :
--
--    SELECT count(*) AS nb, bool_and(p.prosecdef) AS secdef,
--           bool_and(p.proconfig::text ILIKE '%search_path%') AS searchpath_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'receive_ingredient_supply';
--    -- ATTENDU : nb = 1, secdef = true, searchpath_ok = true
--
-- 2) ⚠ CRITIQUE — privilèges : anon ne doit PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'receive_ingredient_supply';
--    -- ATTENDU : anon = false, auth_role = true
--    -- ⛔ Si anon = true : BRÈCHE. Rejouer le bloc REVOKE/GRANT.
--
-- 3) L'index d'idempotence existe :
--
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'ingredient_lots' AND indexname = 'idx_ingredient_lots_idempotency';
--    -- ATTENDU : 1 ligne
--
-- 4) Aucune donnée créée par la migration (comparer au pré-vol 4) :
--
--    SELECT (SELECT count(*) FROM public.ingredient_lots)        AS nb_lots,
--           (SELECT count(*) FROM public.ingredient_stock_debts) AS nb_debts;
--    -- ATTENDU : identique au pré-vol
--
-- 5) La vue d'audit reste vide :
--
--    SELECT count(*) FROM public.ingredient_stock_consistency_violations;
--    -- ATTENDU : 0
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTS FONCTIONNELS — via SQL Editor (service_role bypass)       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠ auth.uid() vaut NULL en SQL Editor, donc le bloc SECURITY CHECK est
--   court-circuité (auth.role() = 'service_role'). Les tests ci-dessous
--   valident la LOGIQUE MÉTIER ; le guard de permission se teste par l'UI.
--
-- ☐ Appro simple → 1 lot créé, current_stock = qty
-- ☐ MÊME idempotency_key rejouée → idempotent_replay = true, AUCUN 2e lot
-- ☐ Appro avec dette ouverte → dette soldée EN PREMIER, lot = reliquat
-- ☐ Appro < dette → dette partiellement soldée, AUCUN lot créé (lot_id NULL)
-- ☐ price_variance tracé et non nul quand unit_cost ≠ estimated_unit_cost
-- ☐ Après chaque test : la vue de cohérence reste VIDE
-- ☐ Ingrédient d'un AUTRE bar → « Ingrédient introuvable dans ce bar »
