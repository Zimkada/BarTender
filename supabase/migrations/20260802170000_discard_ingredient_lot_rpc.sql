-- ===================================================================
-- MIGRATION: discard_ingredient_lot — sortie de lot et perte valorisée
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 1 du module restauration
-- DEPEND DE: 20260802140000 (tables), 20260802160000 (consommation)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Un lot périmé ou jeté reste `active` avec son `remaining_qty` : le stock
--   théorique compte une matière qui n'existe plus, et la perte n'est nulle
--   part. Sans ce RPC, la 5e métrique du §8 — les pertes par péremption —
--   n'est pas calculable.

-- IMPACT:
--   ⭐ AUCUN bar existant. Fonction neuve sur des tables neuves.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION: sortir un lot du stock disponible en VALORISANT la perte à son
--   coût d'achat réel, puis recalculer le cache.
--
-- ⭐ POURQUOI CETTE MÉTRIQUE EST LE MEILLEUR ARGUMENT DU MODULE (§16.13)
--   Elle est IMPOSSIBLE en CUMP, qui fond tous les achats dans une moyenne
--   sans dates. Chaque lot portant `expires_at`, un lot non consommé à
--   échéance devient une perte chiffrée AU PRIX RÉELLEMENT PAYÉ :
--     « vous perdez 8 % de vos tomates » → achats surdimensionnés.
--   C'est un levier immédiat pour le promoteur, et une information qui
--   n'existe aujourd'hui nulle part.

-- ⚠ DEUX STATUTS DISTINCTS, PAS UN (§13.3 appliqué aux lots)
--   'expired'   : la date de péremption est passée — cause SUBIE
--   'discarded' : jeté avant péremption (chute de courant, accident, erreur
--                 de conservation) — cause ÉVITABLE
--   Les confondre rendrait la métrique inexploitable : on ne corrige pas un
--   surdimensionnement d'achat de la même façon qu'une panne de congélateur.
--   Même logique que cancel_reason (§16.4) : catégoriser rend actionnable.

-- ⚠ SORTIE TOTALE UNIQUEMENT en V1.
--   Une sortie PARTIELLE (« la moitié du sac est moisie ») exigerait de
--   scinder le lot en deux — un lot sain et un lot perdu — pour que le FEFO
--   reste juste. Le faire à moitié produirait un lot dont remaining_qty et
--   discarded_qty coexistent, donc une valorisation ambiguë. Reporté Post-V1,
--   avec une table de scission dédiée.

-- BREAKING_CHANGE: NO — création pure.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.discard_ingredient_lot(uuid,uuid,text,text,date);

-- FUNCTIONS_CREATED: public.discard_ingredient_lot
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — dépendances présentes :
--
--    SELECT to_regclass('public.ingredient_lots')          AS t_lots,
--           to_regclass('public.ingredient_consumptions')  AS t_consumptions,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo') AS fn_consume;
--    -- ATTENDU : 2 tables non NULL, fn_consume = 1
--
-- 2) La fonction n'existe pas :
--
--    SELECT count(*) AS nb FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='discard_ingredient_lot';
--    -- ATTENDU : 0
--
-- 3) État des données (référence post-vol) :
--
--    SELECT (SELECT count(*) FROM public.ingredient_lots) AS nb_lots,
--           (SELECT count(*) FROM public.ingredients)     AS nb_ingredients;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ingredient_lots') IS NULL THEN
    RAISE EXCEPTION 'Table ingredient_lots absente — exécuter 20260802140000 d''abord';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.discard_ingredient_lot(
  p_bar_id        UUID,
  p_lot_id        UUID,
  p_reason        TEXT,
  p_notes         TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id      UUID;
  v_caller_role   TEXT;
  v_lot           public.ingredient_lots;
  v_business_date DATE;
  v_lost_qty      NUMERIC;
  v_lost_value    NUMERIC;
  v_new_status    TEXT;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '30s';

  IF p_bar_id IS NULL OR p_lot_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'bar_id et lot_id sont requis');
  END IF;

  -- ⚠️ Motif STRUCTURÉ, jamais du texte libre (§16.4) : « catégoriser rend
  --    actionnable ». Un champ libre produirait des motifs non agrégeables,
  --    donc une métrique inexploitable.
  IF p_reason IS NULL OR p_reason NOT IN ('expired', 'spoiled', 'damaged', 'inventory_correction') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Motif invalide. Attendu : expired | spoiled | damaged | inventory_correction'
    );
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

    -- ⭐ LISTE BLANCHE — correspond à canManageIngredientStock (§3).
    --    Le cuisinier constate la péremption, c'est lui qui est devant le lot.
    IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'cuisinier') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Accès refusé : le rôle %s ne peut pas sortir un lot du stock', v_caller_role)
      );
    END IF;
  END IF;

  -- ⚠️ FOR UPDATE : deux sorties simultanées du même lot doubleraient la perte.
  SELECT * INTO v_lot
  FROM public.ingredient_lots
  WHERE id = p_lot_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lot introuvable dans ce bar');
  END IF;

  -- ⚠️ 'expired' vs 'discarded' : cause SUBIE (péremption, donc achats
  --    surdimensionnés) vs cause ÉVITABLE (panne, accident, erreur de
  --    conservation). On ne corrige pas l'une comme l'autre — les confondre
  --    rendrait la métrique du §8 inexploitable.
  --    Calculé ICI, avant le garde d'idempotence, pour servir aussi à
  --    détecter un rejeu portant un motif différent.
  v_new_status := CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'discarded' END;

  -- ── ⭐ IDEMPOTENCE — un lot déjà sorti n'est pas ressorti ─────────
  -- Pas de clé externe ici : l'état du lot EST la clé. Un rejeu retourne la
  -- perte déjà enregistrée, sans la compter deux fois.
  --
  -- ⚠️ Le motif du rejeu est SIGNALÉ, pas ignoré. Un second appel avec
  --    reason='spoiled' sur un lot déjà 'expired' ne peut PAS changer la
  --    cause enregistrée (la perte est figée) — retourner un succès muet
  --    laisserait croire au contraire. L'appelant doit pouvoir distinguer
  --    « rejeu identique » de « rejeu avec un motif différent », sinon une
  --    correction de motif échouerait SILENCIEUSEMENT.
  IF v_lot.status IN ('expired', 'discarded') THEN
    RETURN jsonb_build_object(
      'success', true,
      'lot_id', v_lot.id,
      'lost_qty', v_lot.discarded_qty,
      'lost_value', ROUND(COALESCE(v_lot.discarded_qty, 0) * v_lot.unit_cost, 2),
      'status', v_lot.status,
      'idempotent_replay', true,
      -- true si l'appelant demandait une AUTRE cause que celle déjà figée
      'reason_mismatch', (v_new_status <> v_lot.status)
    );
  END IF;

  -- Un lot épuisé n'a plus rien à perdre — le sortir n'aurait aucun sens et
  -- fausserait la métrique en enregistrant une perte nulle.
  IF v_lot.status = 'depleted' OR v_lot.remaining_qty <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce lot est déjà épuisé : il ne reste rien à sortir du stock'
    );
  END IF;

  v_business_date := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  v_lost_qty   := v_lot.remaining_qty;
  -- ⭐ Valorisation au coût d'achat RÉEL du lot — c'est ce que le FEFO rend
  --    possible et que le CUMP interdit. La perte est chiffrée au prix
  --    effectivement payé pour CETTE matière, pas à une moyenne.
  v_lost_value := ROUND(v_lost_qty * v_lot.unit_cost, 2);

  -- v_new_status déjà calculé plus haut (avant le garde d'idempotence).

  UPDATE public.ingredient_lots
  SET remaining_qty = 0,          -- contrainte ingredient_lots_closed_is_empty
      status        = v_new_status,
      discarded_qty = v_lost_qty,
      discarded_at  = NOW()
  WHERE id = p_lot_id;

  -- ── Journaliser la perte dans le flux de consommation ─────────────
  -- ⭐ Une perte EST une sortie de matière : la tracer ailleurs créerait deux
  --    historiques concurrents. reference_type = 'inventory_adjustment' la
  --    distingue d'une consommation par recette, et la clé dérivée du lot_id
  --    garantit l'unicité sans clé externe.
  INSERT INTO public.ingredient_consumptions (
    bar_id, ingredient_id, reference_key, reference_type,
    qty_consumed, computed_cost, lot_breakdown, qty_from_debt,
    business_date, created_by
  ) VALUES (
    p_bar_id, v_lot.ingredient_id,
    'discard:' || p_lot_id::TEXT, 'inventory_adjustment',
    v_lost_qty, v_lost_value,
    jsonb_build_array(jsonb_build_object(
      'lot_id', v_lot.id,
      'qty', v_lost_qty,
      'unit_cost', v_lot.unit_cost,
      'expires_at', v_lot.expires_at,
      'loss_reason', p_reason,
      'notes', p_notes
    )),
    0, v_business_date, v_actor_id
  );

  -- ── Recalculer le cache depuis la SOURCE DE VÉRITÉ ────────────────
  UPDATE public.ingredients
  SET current_stock = (
        SELECT COALESCE(SUM(remaining_qty), 0)
        FROM public.ingredient_lots
        WHERE ingredient_id = v_lot.ingredient_id AND status = 'active'
      ) - (
        SELECT COALESCE(SUM(qty_owed - settled_qty), 0)
        FROM public.ingredient_stock_debts
        WHERE ingredient_id = v_lot.ingredient_id AND status = 'open'
      )
  WHERE id = v_lot.ingredient_id;

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot.id,
    'ingredient_id', v_lot.ingredient_id,
    'lost_qty', v_lost_qty,
    'lost_value', v_lost_value,
    'reason', p_reason,
    'status', v_new_status,
    'idempotent_replay', false
  );

EXCEPTION
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

COMMENT ON FUNCTION public.discard_ingredient_lot IS
  'Sort un lot du stock disponible et VALORISE la perte à son coût d''achat réel (§8, 5e '
  'métrique). Impossible en CUMP, qui fond les achats dans une moyenne sans dates. '
  'Distingue ''expired'' (cause subie, surdimensionnement d''achat) de ''discarded'' (cause '
  'évitable) — les confondre rendrait la métrique inexploitable. Idempotent : l''état du lot '
  'EST la clé, un rejeu ne compte pas la perte deux fois. Sortie TOTALE uniquement en V1.';

REVOKE ALL ON FUNCTION public.discard_ingredient_lot(
  uuid, uuid, text, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discard_ingredient_lot(
  uuid, uuid, text, text, date
) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Fonction créée, unique, durcie :
--
--    SELECT count(*) AS nb, bool_and(p.prosecdef) AS secdef,
--           bool_and(p.proconfig::text ILIKE '%search_path%') AS searchpath_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='discard_ingredient_lot';
--    -- ATTENDU : nb = 1, secdef = true, searchpath_ok = true
--
-- 2) ⚠ CRITIQUE — anon ne peut pas exécuter :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='discard_ingredient_lot';
--    -- ATTENDU : anon = false, auth_role = true
--
-- 3) Aucune donnée créée (comparer au pré-vol 3) :
--
--    SELECT (SELECT count(*) FROM public.ingredient_lots) AS nb_lots,
--           (SELECT count(*) FROM public.ingredients)     AS nb_ingredients;
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTS FONCTIONNELS — SQL Editor (service_role bypass)           │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ☐ Lot actif + reason='expired'  → status 'expired', lost_value = qty × unit_cost
-- ☐ Lot actif + reason='spoiled'  → status 'discarded' (cause évitable ≠ subie)
-- ☐ ⭐ Rejeu sur le même lot      → idempotent_replay=true, perte NON doublée
-- ☐ Lot déjà 'depleted'           → refus explicite (rien à perdre)
-- ☐ Motif invalide                → refus, liste des motifs attendus
-- ☐ Lot d'un AUTRE bar            → « Lot introuvable dans ce bar »
-- ☐ current_stock recalculé (le lot sorti n'y figure plus)
-- ☐ Une ligne dans ingredient_consumptions, reference_type='inventory_adjustment'
-- ☐ Après chaque test : vue de cohérence VIDE
