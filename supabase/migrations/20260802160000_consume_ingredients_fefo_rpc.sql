-- ===================================================================
-- MIGRATION: consume_ingredients_fefo — décrément FEFO + coût matière
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 1 du module restauration
-- DEPEND DE: 20260802140000 (tables), 20260802150000 (appro)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Rien ne consomme le stock d'ingrédients. Sans cette primitive, les lots
--   s'accumulent sans jamais sortir — et le coût matière d'un plat, qui est
--   LE livrable du module (§8), n'est pas calculable.

-- IMPACT:
--   ⭐ AUCUN bar existant. Fonction neuve sur des tables neuves.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION: une PRIMITIVE de consommation, appelée plus tard par
--   `mark_kitchen_item_ready` (phase 3), et dès maintenant par l'inventaire
--   physique et les ajustements (§16.5).
--
--   Pour chaque ingrédient demandé :
--     1. consommer les lots dans l'ordre FEFO (expires_at NULLS LAST, received_at)
--     2. si le stock manque → créer une DETTE au dernier prix connu (§13.2)
--     3. accumuler le coût réel des lots consommés
--     4. recalculer le cache current_stock depuis la source de vérité

-- ⭐ POURQUOI UNE PRIMITIVE ET NON `mark_kitchen_item_ready` DIRECTEMENT
--   `kitchen_order_items` n'existe pas encore (phase 3). Écrire la logique de
--   consommation MAINTENANT, isolée et testable, évite de la découvrir en même
--   temps que la machine d'état — le §11 qualifie mark_ready de « RPC le plus
--   dangereux du module ». Autant que sa partie stock soit déjà éprouvée.

-- ⚠ IDEMPOTENCE — via une table de traçabilité dédiée.
--   §11 impose que chaque transition porte sa propre clé stable, sinon un rejeu
--   produit un DOUBLE DÉCRÉMENT. La clé sera `kitchen_order_item_id` en phase 3 ;
--   ici elle est générique (`p_reference_key`), ce qui permet de servir aussi
--   l'inventaire physique.
--   La table `ingredient_consumptions` porte cette clé ET la traçabilité :
--   sans elle, impossible de répondre à « pourquoi ce plat coûte 340 F »
--   (§16.13, écran de détail du coût OBLIGATOIRE dès le départ).

-- ⚠ `cost_mode` — SEUL 'direct' décrémente (§16.3, §4.4).
--   'global' (sel, eau)          → stock simple, charge indirecte, PAS ici
--   'per_dish_flat' (huile)      → forfait au coût, AUCUN décrément
--   'cost_only'                  → non suivi en stock
--   Décrémenter un per_dish_flat serait une fausse précision (personne ne pèse
--   l'huile) ET fausserait le stock.

-- ⚠ JAMAIS BLOQUANT (§4.4) — en cuisine réelle, le cuisinier voit ce qu'il a.
--   Un stock théorique à 0 ne doit pas empêcher un plat de sortir. D'où la
--   dette plutôt que le refus. C'est l'INVERSE du stock de boissons.

-- BREAKING_CHANGE: NO — création pure.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.consume_ingredients_fefo(uuid,jsonb,text,text,uuid,date);
--   DROP TABLE IF EXISTS public.ingredient_consumptions;

-- TABLES_CREATED: ingredient_consumptions
-- FUNCTIONS_CREATED: public.consume_ingredients_fefo

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — les migrations précédentes sont appliquées :
--
--    SELECT to_regclass('public.ingredients')            AS t_ingredients,
--           to_regclass('public.ingredient_lots')        AS t_lots,
--           to_regclass('public.ingredient_stock_debts') AS t_debts,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname='public' AND p.proname='receive_ingredient_supply') AS fn_supply;
--    -- ATTENDU : 3 tables non NULL, fn_supply = 1
--
-- 2) Les objets à créer n'existent pas :
--
--    SELECT to_regclass('public.ingredient_consumptions') AS t_consumptions,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo') AS fn_consume;
--    -- ATTENDU : NULL et 0
--
-- 3) État des données (référence post-vol) :
--
--    SELECT (SELECT count(*) FROM public.ingredients)            AS nb_ingredients,
--           (SELECT count(*) FROM public.ingredient_lots)        AS nb_lots,
--           (SELECT count(*) FROM public.ingredient_stock_debts) AS nb_debts;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ingredient_lots') IS NULL
     OR to_regclass('public.ingredient_stock_debts') IS NULL THEN
    RAISE EXCEPTION 'Tables ingrédients absentes — exécuter 20260802140000 d''abord';
  END IF;

  IF to_regclass('public.ingredient_consumptions') IS NOT NULL THEN
    RAISE EXCEPTION 'Table ingredient_consumptions déjà présente — migration probablement déjà appliquée';
  END IF;
END $$;

-- =====================================================
-- 1. ingredient_consumptions — traçabilité + idempotence
-- =====================================================

CREATE TABLE public.ingredient_consumptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,

  -- ⭐ Clé d'idempotence de l'OPÉRATION appelante (§11). En phase 3 ce sera
  -- kitchen_order_item_id ; ici générique pour servir aussi l'inventaire (§16.5).
  reference_key TEXT NOT NULL,
  -- Nature de l'appelant — rend l'historique lisible et filtrable.
  reference_type TEXT NOT NULL DEFAULT 'kitchen_order_item'
                 CHECK (reference_type IN ('kitchen_order_item', 'production_batch',
                                           'inventory_adjustment', 'manual')),

  qty_consumed  NUMERIC(14, 3) NOT NULL CHECK (qty_consumed > 0),
  -- ⭐ Coût RÉEL des lots consommés — figé, JAMAIS recalculé (§4.4).
  -- Recalculer la marge d'un plat de mars avec les prix de juillet rendrait
  -- tout l'historique faux. Leçon déjà apprise sur le CUMP des boissons.
  computed_cost NUMERIC(14, 2) NOT NULL CHECK (computed_cost >= 0),

  -- Détail lot par lot : `[{lot_id, qty, unit_cost}, ...]`.
  -- ⭐ §16.13 impose un écran de détail du coût dès le départ : « un calcul
  -- juste mais opaque est presque aussi problématique qu'un calcul faux, parce
  -- qu'il n'est pas cru ». Sans ce détail, impossible de répondre à
  -- « pourquoi mon riz sauce coûte 340 F et pas 310 ».
  lot_breakdown JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Part couverte par une dette (stock insuffisant) — anomalie, jamais silencieuse.
  qty_from_debt NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (qty_from_debt >= 0),

  business_date DATE NOT NULL,
  consumed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT ingredient_consumptions_debt_lte_qty CHECK (qty_from_debt <= qty_consumed)
);

COMMENT ON TABLE public.ingredient_consumptions IS
  'Journal des consommations d''ingrédients — porte l''IDEMPOTENCE (§11) et la '
  'TRAÇABILITÉ du coût (§16.13). Append-only : une consommation n''est jamais modifiée. '
  'computed_cost est FIGÉ au moment de la consommation, jamais recalculé (§4.4).';

COMMENT ON COLUMN public.ingredient_consumptions.lot_breakdown IS
  'Détail lot par lot : [{lot_id, qty, unit_cost}]. Alimente l''écran de détail du coût, '
  'obligatoire dès la V1 — un calcul juste mais opaque n''est pas cru.';

-- ⭐ Unicité par (bar, référence, ingrédient) : un rejeu de la MÊME opération
-- ne peut pas décrémenter deux fois. Un plat consomme N ingrédients, d'où
-- l'ingredient_id dans la clé.
CREATE UNIQUE INDEX idx_ingredient_consumptions_idempotency
  ON public.ingredient_consumptions (bar_id, reference_key, ingredient_id);

CREATE INDEX idx_ingredient_consumptions_ingredient_date
  ON public.ingredient_consumptions (ingredient_id, business_date DESC);

ALTER TABLE public.ingredient_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_consumptions_bar_members_select"
  ON public.ingredient_consumptions FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.ingredient_consumptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_consumptions TO service_role;

-- =====================================================
-- 2. consume_ingredients_fefo
-- =====================================================

-- p_items : [{ingredient_id, qty}, ...]
CREATE OR REPLACE FUNCTION public.consume_ingredients_fefo(
  p_bar_id         UUID,
  p_items          JSONB,
  p_reference_key  TEXT,
  p_reference_type TEXT DEFAULT 'kitchen_order_item',
  p_business_date  DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id      UUID;
  v_caller_role   TEXT;
  v_business_date DATE;
  v_item          JSONB;
  v_ingredient_id UUID;
  v_qty_needed    NUMERIC;
  v_ingredient    public.ingredients;
  v_lot           RECORD;
  v_take          NUMERIC;
  v_cost_total    NUMERIC;
  v_breakdown     JSONB;
  v_debt_qty      NUMERIC;
  v_debt_cost     NUMERIC;
  v_existing      INT;
  v_results       JSONB := '[]'::JSONB;
  v_grand_total   NUMERIC := 0;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '30s';

  IF p_bar_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bar_id et items sont requis');
  END IF;

  IF p_reference_key IS NULL OR p_reference_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reference_key est requise (idempotence)');
  END IF;

  -- ── 🛡️ SECURITY CHECK ─────────────────────────────────────────────
  IF auth.role() <> 'service_role' THEN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
    END IF;

    SELECT bm.role INTO v_caller_role
    FROM public.bar_members bm
    WHERE bm.user_id = v_actor_id AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    IF v_caller_role IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Accès refusé : non membre actif de ce bar');
    END IF;

    -- ⭐ LISTE BLANCHE — correspond à canUpdateKitchenOrderStatus (§3) :
    --    c'est le cuisinier qui fait avancer la production, pas le serveur.
    IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'cuisinier') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Accès refusé : le rôle %s ne peut pas consommer du stock cuisine', v_caller_role)
      );
    END IF;
  END IF;

  v_business_date := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  -- ── ⭐ IDEMPOTENCE — avant toute écriture ─────────────────────────
  -- Un rejeu retourne l'état déjà consommé, SANS double décrément (§11).
  SELECT count(*) INTO v_existing
  FROM public.ingredient_consumptions
  WHERE bar_id = p_bar_id AND reference_key = p_reference_key;

  IF v_existing > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
             'ingredient_id', ingredient_id,
             'qty_consumed', qty_consumed,
             'computed_cost', computed_cost,
             'qty_from_debt', qty_from_debt,
             'lot_breakdown', lot_breakdown
           )),
           COALESCE(SUM(computed_cost), 0)
      INTO v_results, v_grand_total
    FROM public.ingredient_consumptions
    WHERE bar_id = p_bar_id AND reference_key = p_reference_key;

    RETURN jsonb_build_object(
      'success', true,
      'total_cost', v_grand_total,
      'items', v_results,
      'idempotent_replay', true
    );
  END IF;

  -- ── Boucle sur les ingrédients demandés ───────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_ingredient_id := (v_item->>'ingredient_id')::UUID;
    v_qty_needed    := (v_item->>'qty')::NUMERIC;

    IF v_ingredient_id IS NULL OR v_qty_needed IS NULL OR v_qty_needed <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Ligne invalide : ingredient_id et qty > 0 requis (reçu : %s)', v_item::TEXT)
      );
    END IF;

    -- ⚠️ FOR UPDATE : deux cuisiniers marquant `ready` simultanément liraient
    --    le même stock et le second écraserait le premier.
    SELECT * INTO v_ingredient
    FROM public.ingredients
    WHERE id = v_ingredient_id AND bar_id = p_bar_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Ingrédient %s introuvable dans ce bar', v_ingredient_id)
      );
    END IF;

    -- ⭐ SEUL 'direct' décrémente (§16.3). Les autres modes sont ignorés ici :
    --    per_dish_flat porte un forfait (calculé au niveau du plat), global est
    --    une charge indirecte, cost_only n'est pas suivi en stock.
    --    ⚠️ Décrémenter un per_dish_flat fausserait le stock ET serait une
    --    fausse précision — personne ne pèse l'huile de friture.
    IF v_ingredient.cost_mode <> 'direct' THEN
      -- ⚠️ On journalise QUAND MÊME, avec qty et coût à 0.
      --
      -- Sans cette trace, un appel ne portant QUE des ingrédients non-direct
      -- (huile seule, par exemple) n'écrirait AUCUNE ligne : le garde
      -- d'idempotence ne trouverait rien et un rejeu retournerait
      -- `idempotent_replay: false` sur une opération déjà traitée. Le contrat
      -- de l'API serait faux — inoffensif ici (aucun décrément), mais
      -- l'appelant ne peut plus distinguer un premier appel d'un rejeu.
      --
      -- La ligne à 0 dit aussi quelque chose d'utile : « cet ingrédient a bien
      -- été VU par la consommation, il a été ignoré par conception ».
      INSERT INTO public.ingredient_consumptions (
        bar_id, ingredient_id, reference_key, reference_type,
        qty_consumed, computed_cost, lot_breakdown, qty_from_debt,
        business_date, created_by
      ) VALUES (
        p_bar_id, v_ingredient_id, p_reference_key, p_reference_type,
        (v_item->>'qty')::NUMERIC, 0,
        jsonb_build_array(jsonb_build_object(
          'skipped_reason', 'cost_mode',
          'cost_mode', v_ingredient.cost_mode
        )),
        0, v_business_date, v_actor_id
      );

      v_results := v_results || jsonb_build_object(
                     'ingredient_id', v_ingredient_id,
                     'qty_consumed', (v_item->>'qty')::NUMERIC,
                     'computed_cost', 0,
                     'skipped', true,
                     'cost_mode', v_ingredient.cost_mode
                   );
      CONTINUE;
    END IF;

    v_cost_total := 0;
    v_breakdown  := '[]'::JSONB;
    v_debt_qty   := 0;

    -- ── ⭐ CONSOMMATION FEFO ────────────────────────────────────────
    -- ORDER BY expires_at NULLS LAST : ce qui périme sort D'ABORD, les
    -- non-périssables (sel, épices) en dernier. C'est FEFO et non FIFO strict
    -- (§16.13) : un lot acheté plus tard peut expirer plus tôt, et en cuisine
    -- c'est la date de péremption qui commande — obligation sanitaire.
    FOR v_lot IN
      SELECT * FROM public.ingredient_lots
      WHERE ingredient_id = v_ingredient_id
        AND bar_id = p_bar_id
        AND status = 'active'
        AND remaining_qty > 0
      ORDER BY expires_at NULLS LAST, received_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;

      v_take := LEAST(v_qty_needed, v_lot.remaining_qty);

      UPDATE public.ingredient_lots
      SET remaining_qty = remaining_qty - v_take,
          -- ⚠️ Un lot vidé passe à 'depleted' : la contrainte
          --    ingredient_lots_closed_is_empty impose remaining_qty = 0 hors
          --    'active', et l'index FEFO partiel cesse de l'indexer.
          status = CASE WHEN remaining_qty - v_take <= 0 THEN 'depleted' ELSE 'active' END
      WHERE id = v_lot.id;

      v_cost_total := v_cost_total + (v_take * v_lot.unit_cost);
      v_breakdown  := v_breakdown || jsonb_build_object(
                        'lot_id', v_lot.id,
                        'qty', v_take,
                        'unit_cost', v_lot.unit_cost,
                        'expires_at', v_lot.expires_at
                      );
      v_qty_needed := v_qty_needed - v_take;
    END LOOP;

    -- ── ⚠️ STOCK INSUFFISANT → DETTE, JAMAIS DE REFUS (§4.4) ────────
    -- « Ne jamais empêcher un plat de sortir parce que le stock théorique dit 0 :
    --   en cuisine réelle, le cuisinier voit ce qu'il a. » L'inverse du stock
    --   de boissons, qui lui est bloquant.
    IF v_qty_needed > 0 THEN
      v_debt_qty  := v_qty_needed;
      -- Valorisation au dernier prix connu, faute de lot réel. COALESCE à 0
      -- plutôt qu'un échec : un ingrédient jamais approvisionné ne doit pas
      -- bloquer le service, l'anomalie est déjà tracée par la dette elle-même.
      v_debt_cost := COALESCE(v_ingredient.last_unit_cost, 0);

      INSERT INTO public.ingredient_stock_debts (
        bar_id, ingredient_id, qty_owed, estimated_unit_cost,
        business_date, status, created_by
      ) VALUES (
        p_bar_id, v_ingredient_id, v_debt_qty, v_debt_cost,
        v_business_date, 'open', v_actor_id
      );

      v_cost_total := v_cost_total + (v_debt_qty * v_debt_cost);
      v_breakdown  := v_breakdown || jsonb_build_object(
                        'lot_id', NULL,
                        'qty', v_debt_qty,
                        'unit_cost', v_debt_cost,
                        'from_debt', true
                      );
    END IF;

    -- ── Journaliser (porte l'idempotence ET la traçabilité) ─────────
    INSERT INTO public.ingredient_consumptions (
      bar_id, ingredient_id, reference_key, reference_type,
      qty_consumed, computed_cost, lot_breakdown, qty_from_debt,
      business_date, created_by
    ) VALUES (
      p_bar_id, v_ingredient_id, p_reference_key, p_reference_type,
      (v_item->>'qty')::NUMERIC, v_cost_total, v_breakdown, v_debt_qty,
      v_business_date, v_actor_id
    );

    -- ── Recalculer le cache depuis la SOURCE DE VÉRITÉ ──────────────
    -- ⚠️ Jamais un décrément : `current_stock - qty` accumulerait les dérives
    --    en silence. Leçon du CUMP (vague 4c).
    UPDATE public.ingredients
    SET current_stock = (
          SELECT COALESCE(SUM(remaining_qty), 0)
          FROM public.ingredient_lots
          WHERE ingredient_id = v_ingredient_id AND status = 'active'
        ) - (
          SELECT COALESCE(SUM(qty_owed - settled_qty), 0)
          FROM public.ingredient_stock_debts
          WHERE ingredient_id = v_ingredient_id AND status = 'open'
        )
    WHERE id = v_ingredient_id;

    v_grand_total := v_grand_total + v_cost_total;
    v_results := v_results || jsonb_build_object(
                   'ingredient_id', v_ingredient_id,
                   'qty_consumed', (v_item->>'qty')::NUMERIC,
                   'computed_cost', v_cost_total,
                   'qty_from_debt', v_debt_qty,
                   'lot_breakdown', v_breakdown
                 );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_cost', v_grand_total,
    'items', v_results,
    'idempotent_replay', false
  );

EXCEPTION
  -- Une violation de contrainte signale un INVARIANT CASSÉ (lot négatif,
  -- dette incohérente), pas un cas métier — à distinguer d'une erreur ordinaire.
  WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.consume_ingredients_fefo IS
  'Consomme des ingrédients en FEFO (expires_at NULLS LAST, received_at) et fige le coût '
  'matière réel. Idempotent par (bar_id, reference_key) — un rejeu retourne l''état déjà '
  'consommé sans double décrément (§11). Stock insuffisant ⟹ DETTE, jamais refus (§4.4). '
  'Seul cost_mode = ''direct'' décrémente (§16.3). Primitive appelée par '
  'mark_kitchen_item_ready (phase 3) et l''inventaire physique (§16.5).';

REVOKE ALL ON FUNCTION public.consume_ingredients_fefo(
  uuid, jsonb, text, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ingredients_fefo(
  uuid, jsonb, text, text, date
) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Table + fonction créées :
--
--    SELECT to_regclass('public.ingredient_consumptions') AS t_consumptions,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo') AS fn;
--    -- ATTENDU : non NULL et 1
--
-- 2) ⚠ CRITIQUE — RLS active + authenticated en lecture seule :
--
--    SELECT relrowsecurity FROM pg_class WHERE relname = 'ingredient_consumptions';
--    -- ATTENDU : true
--
--    SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee = 'authenticated' AND table_name = 'ingredient_consumptions';
--    -- ATTENDU : SELECT uniquement
--
-- 3) ⚠ CRITIQUE — anon ne peut pas exécuter le RPC :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo';
--    -- ATTENDU : anon = false, auth_role = true
--
-- 4) Index d'idempotence :
--
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'ingredient_consumptions'
--      AND indexname = 'idx_ingredient_consumptions_idempotency';
--    -- ATTENDU : 1 ligne
--
-- 5) Aucune donnée créée (comparer au pré-vol 3) :
--
--    SELECT (SELECT count(*) FROM public.ingredient_lots)        AS nb_lots,
--           (SELECT count(*) FROM public.ingredient_stock_debts) AS nb_debts,
--           (SELECT count(*) FROM public.ingredient_consumptions) AS nb_consumptions;
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTS FONCTIONNELS — SQL Editor (service_role bypass)           │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ☐ Consommation < stock d'un lot → 1 lot entamé, coût = qty × unit_cost
-- ☐ ⭐ Consommation à cheval sur 2 lots → coût MOYEN PONDÉRÉ des deux,
--      lot_breakdown à 2 entrées, ordre FEFO respecté (périssable d'abord)
-- ☐ Lot entièrement vidé → status = 'depleted', remaining_qty = 0
-- ☐ ⭐ Rejeu de la MÊME reference_key → idempotent_replay=true, AUCUN 2e décrément
-- ☐ ⚠️ Stock insuffisant → DETTE créée, jamais d'échec, qty_from_debt > 0
-- ☐ ⚠️ cost_mode = 'per_dish_flat' → AUCUN décrément, ingrédient ignoré
-- ☐ Ingrédient d'un autre bar → erreur explicite
-- ☐ Après chaque test : vue de cohérence VIDE
