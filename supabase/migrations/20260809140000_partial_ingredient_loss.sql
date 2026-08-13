-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: perte PARTIELLE sur un lot d'ingrédient
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN (09/08/2026)
-- > « Pour ingrédients, est-il possible de déclarer perte sur certains
-- >   éléments ? »
--
-- Le cas : 10 kg de riz reçus, 2 kg ont pourri, les 8 autres sont bons.
-- `discard_ingredient_lot` sort le lot ENTIER - il faut donc choisir entre
-- tout jeter (perte surévaluée de 8 kg) ou ne rien déclarer (perte invisible,
-- écart constaté plus tard à l'inventaire sans cause).
--
-- C'est exactement le manque comblé pour les lots de PRODUCTION le même jour
-- (20260809090000). Ce chantier applique la même règle aux INGRÉDIENTS.
--
-- ⭐ L'UTILISATEUR CHOISIT LE LOT, arbitrage explicite de l'exploitant :
-- > « c'est identifiable, et même dans le cas contraire, c'est mieux que
-- >   l'utilisateur choisisse le lot. »
-- Un prélèvement FEFO automatique aurait deviné l'origine - or deux lots du
-- même ingrédient ont des coûts différents, et c'est celui du lot RÉELLEMENT
-- abîmé qui doit être valorisé.
--
-- ⛔ POURQUOI PAS `discard_ingredient_lot` ÉTENDUE
-- Elle pose `remaining_qty = 0` et un statut de sortie dans TOUS les cas -
-- c'est le sens d'une sortie de lot. Lui ajouter une quantité lui ferait
-- porter deux gestes opposés : « ce lot sort du stock » et « ce lot continue,
-- amputé ».
--
-- ⭐ CE QUI EST RÉUTILISÉ À L'IDENTIQUE
--   · `ingredient_consumptions` — une perte EST une sortie de matière ;
--     la tracer ailleurs créerait deux historiques concurrents ;
--   · le recalcul de `current_stock` depuis la SOURCE DE VÉRITÉ
--     (Σ lots actifs − Σ dettes ouvertes), jamais un décrément ;
--   · `reference_type = 'inventory_adjustment'`, qui distingue déjà une perte
--     d'une consommation par recette.
--
-- ⚠️ `reference_key` PORTE L'HORODATAGE : `discard:<lot>:<epoch_ms>`. La clé
-- de la sortie totale (`discard:<lot>`) identifie UN geste unique ; ici il
-- peut y en avoir plusieurs sur le même lot, et deux lignes identiques
-- seraient indistinguables dans l'historique.
--
-- BREAKING_CHANGE: NO - nouvelle fonction, aucune signature existante touchée.
--
-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.record_ingredient_lot_loss(uuid,uuid,numeric,text,text,date);
--
-- FUNCTIONS_CREATED: public.record_ingredient_lot_loss
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) La fonction ne doit PAS exister :
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_ingredient_lot_loss';
--   → 0 ligne.
--
-- 2) Tables et colonnes indispensables :
-- SELECT to_regclass('public.ingredient_lots')          AS t_lots,
--        to_regclass('public.ingredient_consumptions')  AS t_conso,
--        to_regclass('public.ingredient_stock_debts')   AS t_debts;
--   → les 3 NON NULL.
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='ingredient_lots'
--    AND column_name IN ('remaining_qty','discarded_qty','discarded_at',
--                        'status','unit_cost','ingredient_id');
--   → 6 lignes.
--
-- 3) La fonction de référence existe (on reprend sa logique de journal) :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='discard_ingredient_lot';
--   → 1 ligne.

CREATE OR REPLACE FUNCTION public.record_ingredient_lot_loss(
  p_bar_id        UUID,
  p_lot_id        UUID,
  p_qty           NUMERIC,
  p_reason        TEXT,
  p_notes         TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot        RECORD;
  v_new_remain NUMERIC(14,3);
  v_new_status TEXT;
  v_lost_value NUMERIC(14,2);
  v_bdate      DATE;
  -- ⭐ QUI déclare cette perte. Capté de la session, jamais reçu du client :
  -- un appelant peut mentir sur un paramètre, pas falsifier `auth.uid()`.
  v_actor_id   UUID := auth.uid();
BEGIN
  -- ⭐⭐ En SECURITY DEFINER la RLS ne s'applique pas : garde explicite.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  /**
   * ⚠️ `FOR UPDATE` : deux déclarations simultanées sur le même lot doivent se
   * sérialiser. Sans lui, la seconde lirait un `remaining_qty` périmé et la
   * perte totale serait sous-comptée.
   */
  SELECT * INTO v_lot
  FROM public.ingredient_lots
  WHERE id = p_lot_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lot introuvable dans ce bar');
  END IF;

  -- ⛔ Un lot déjà sorti n'a plus de stock : y déclarer une perte créerait un
  -- manque sur de la matière qui n'existe plus.
  IF v_lot.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Ce lot n''est plus en stock (%s). Une perte ne peut être déclarée que sur un lot actif.',
        v_lot.status
      )
    );
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La quantité perdue doit être supérieure à zéro'
    );
  END IF;

  /**
   * ⛔⛔ REFUS SI LA PERTE DÉPASSE LE RESTE, plutôt qu'un plafonnement
   * silencieux. Saisir 20 kg quand il en reste 8 est une ERREUR DE SAISIE, ou
   * un stock réel qui ne correspond pas au théorique - les deux méritent
   * d'être vus. Le message dit COMBIEN il reste, sinon on retente au hasard.
   */
  IF p_qty > v_lot.remaining_qty THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Il ne reste que %s dans ce lot. Pour tout sortir du stock, utilisez « Sortir le lot ».',
        v_lot.remaining_qty
      )
    );
  END IF;

  v_bdate := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  v_new_remain := ROUND(v_lot.remaining_qty - p_qty, 3);

  /**
   * ⭐ `depleted` posé AUTOMATIQUEMENT à zéro - il CONSTATE un fait (le lot est
   * vide) plutôt qu'il ne juge d'une cause.
   * ⚠️ La sortie pour cause (`expired`, `discarded`) reste un geste HUMAIN :
   * cette fonction ne pose jamais ces statuts.
   * ⛔ La contrainte `ingredient_lots_closed_is_empty` impose
   * `remaining_qty = 0` hors `active` - d'où `depleted` et non `active` à zéro.
   */
  v_new_status := CASE WHEN v_new_remain <= 0 THEN 'depleted' ELSE 'active' END;

  v_lost_value := ROUND(p_qty * COALESCE(v_lot.unit_cost, 0), 2);

  /**
   * ⛔⛔ `discarded_qty` N'EST PAS ÉCRIT ICI - défaut BLOQUANT trouvé en code
   * review le 09/08/2026, avant application.
   *
   * La contrainte `ingredient_lots_discard_coherence` impose :
   *   (status IN ('expired','discarded') AND discarded_qty IS NOT NULL)
   *   OR (status IN ('active','depleted') AND discarded_qty IS NULL)
   *
   * Une perte PARTIELLE laisse le lot `active`. Y écrire `discarded_qty`
   * violait donc la contrainte : le RPC aurait échoué À CHAQUE APPEL, et
   * aucun test ne l'aurait vu - ils lisent le TEXTE du SQL, jamais les
   * contraintes de la table.
   *
   * ⭐ CE N'EST PAS UNE PERTE D'INFORMATION. La perte est journalisée dans
   * `ingredient_consumptions` juste en dessous - même destination que
   * `discard_ingredient_lot`, et c'est là que les métriques la liront.
   * `discarded_qty` sur le lot ne décrit qu'une SORTIE DE LOT, pas une perte
   * partielle : le sens de la colonne est préservé.
   *
   * ⚠️ DIFFÉRENCE ASSUMÉE avec `record_batch_loss` (lots de production), qui
   * cumule bien son `discarded_qty` : `pb_discard_coherence` n'exige, elle,
   * que la cohérence quantité/date, sans lien avec le statut. Deux tables,
   * deux contraintes - la règle est celle de la table, pas de l'analogie.
   */
  UPDATE public.ingredient_lots
  SET remaining_qty = v_new_remain,
      status        = v_new_status
  WHERE id = p_lot_id;

  /**
   * ⭐ Une perte EST une sortie de matière : elle va dans le MÊME journal que
   * les consommations. La tracer ailleurs créerait deux historiques
   * concurrents, et le §8 mesure justement l'écart entre les deux.
   *
   * ⚠️ `reference_key` HORODATÉE, contrairement à `discard_ingredient_lot` :
   * une sortie totale n'a lieu qu'une fois par lot, une perte partielle peut
   * se répéter. Deux lignes de clé identique seraient indistinguables.
   */
  INSERT INTO public.ingredient_consumptions (
    bar_id, ingredient_id, reference_key, reference_type,
    qty_consumed, computed_cost, lot_breakdown, qty_from_debt,
    business_date, created_by
  ) VALUES (
    p_bar_id, v_lot.ingredient_id,
    'partial_loss:' || p_lot_id::TEXT || ':' ||
      (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT::TEXT,
    'inventory_adjustment',
    p_qty, v_lost_value,
    jsonb_build_array(jsonb_build_object(
      'lot_id', v_lot.id,
      'qty', p_qty,
      'unit_cost', v_lot.unit_cost,
      'expires_at', v_lot.expires_at,
      'loss_reason', p_reason,
      'notes', p_notes,
      'partial', true
    )),
    0, v_bdate, v_actor_id
  );

  /**
   * ⭐⭐ RECALCUL depuis la SOURCE DE VÉRITÉ, jamais un décrément.
   * `current_stock - p_qty` accumulerait les dérives en silence - leçon du
   * CUMP (vague 4c), reprise à l'identique de `consume_ingredients_fefo`.
   * ⚠️ La formule inclut les DETTES OUVERTES : l'omettre ferait diverger ce
   * cache de tout le reste du module.
   */
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
    'lot_id', p_lot_id,
    'lost_qty', p_qty,
    'remaining_qty', v_new_remain,
    'status', v_new_status,
    -- ⚠️ MONTANT : l'appelant décide de l'afficher selon `canViewKitchenCosts`
    -- (§8). Le cuisinier voit les quantités, pas les valeurs.
    'loss_value', v_lost_value
  );
END;
$$;

COMMENT ON FUNCTION public.record_ingredient_lot_loss(UUID, UUID, NUMERIC, TEXT, TEXT, DATE) IS
  '⭐ Perte PARTIELLE sur un lot d''ingrédient qui reste en stock : « 2 kg sur '
  '10 ont pourri ». Distinct de discard_ingredient_lot, qui sort le lot entier. '
  '⭐ Le LOT est choisi par l''utilisateur, pas deviné en FEFO : deux lots du '
  'même ingrédient ont des coûts différents, et c''est celui du lot réellement '
  'abîmé qui doit être valorisé. '
  '⛔ N''écrit PAS `discarded_qty` sur le lot : la contrainte '
  'ingredient_lots_discard_coherence l''interdit tant que le statut reste '
  'active. La perte est journalisée dans ingredient_consumptions. '
  '⛔ Ne sort JAMAIS le lot pour cause : si la perte le vide, le statut passe '
  '`depleted` (constat, pas jugement). '
  '⛔ REFUSE si la quantité dépasse le reste - une saisie trop grande est une '
  'erreur, pas une perte totale.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.record_ingredient_lot_loss(UUID, UUID, NUMERIC, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ingredient_lot_loss(UUID, UUID, NUMERIC, TEXT, TEXT, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_ingredient_lot_loss(UUID, UUID, NUMERIC, TEXT, TEXT, DATE) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe, en un exemplaire, SECURITY DEFINER :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_ingredient_lot_loss';
--   → 1 ligne, prosecdef = true.
--
-- 2) ⛔ Privilèges :
-- SELECT has_function_privilege('anon',
--          'public.record_ingredient_lot_loss(uuid,uuid,numeric,text,text,date)',
--          'EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.record_ingredient_lot_loss(uuid,uuid,numeric,text,text,date)',
--          'EXECUTE') AS auth_peut;
--   → anon_peut = false, auth_peut = true.
--
-- 3) ⚠️ LE CUMUL EST EN PLACE (commentaires retirés, sinon faux positif) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'COALESCE\(discarded_qty, 0\) \+ p_qty' AS cumule
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_ingredient_lot_loss';
--   → true. Si false : les pertes successives s'écrasent, ARRÊTER.
--
-- 4) ⚠️ LE STOCK EST RECALCULÉ, PAS DÉCRÉMENTÉ (leçon du CUMP) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'ingredient_stock_debts' AS recalcul_complet
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_ingredient_lot_loss';
--   → true. La formule doit inclure les dettes ouvertes.
--
-- 5) SMOKE TEST - le refus est ATTENDU (auth.uid() vaut NULL ici) :
-- SELECT public.record_ingredient_lot_loss(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid(), 1, 'spoiled');
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) TEST RÉEL DEPUIS L'UI, sur un lot actif de 10 kg :
--    a. déclarer 2 kg perdus → il reste 8, lot TOUJOURS actif,
--       `current_stock` de l'ingrédient baisse de 2 ;
--       ⚠️ `discarded_qty` du lot reste NULL - c'est VOULU : la perte vit
--         dans `ingredient_consumptions`, pas sur le lot (cf. n°3).
--    b. déclarer 1 kg de plus → il reste 7, DEUX lignes dans le journal ;
--    c. déclarer 99 → REFUS avec « il ne reste que 7 » ;
--    d. vérifier le journal :
--       SELECT reference_key, qty_consumed, computed_cost, created_by
--         FROM public.ingredient_consumptions
--        WHERE reference_type = 'inventory_adjustment'
--        ORDER BY created_at DESC LIMIT 3;
--       → deux lignes distinctes, clés horodatées différentes.
