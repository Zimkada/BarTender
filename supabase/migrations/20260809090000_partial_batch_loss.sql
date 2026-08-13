-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: perte PARTIELLE sur un lot encore en service
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN, DIT PAR L'EXPLOITANT (08/08/2026)
-- > « Des éléments du lot expirés avant, et non déclarer tout le stock
-- >   restant expiré. »
--
-- Le cas : 14 portions restantes, 4 ont tourné, les 10 autres sont bonnes et
-- le service continue. Aujourd'hui il faut choisir entre tout jeter (perte
-- surévaluée de 10 portions) ou ne rien déclarer (perte invisible, et
-- l'écart apparaîtra à l'inventaire sans cause identifiable).
--
-- ⛔ POURQUOI `close_batch` NE PEUT PAS LE FAIRE
-- Elle pose `remaining_qty = 0` et `status <> 'active'` dans TOUS les cas -
-- c'est le sens même d'une clôture. L'étendre lui ferait porter deux gestes
-- métier opposés : « ce lot est fini » et « ce lot continue, amputé ».
--
-- ⭐ CE QUI EST RÉUTILISÉ, ET C'EST L'ESSENTIEL
-- Les colonnes `discarded_qty` / `discarded_at` / `discard_reason` existent et
-- ne sont PAS liées au statut : la contrainte `pb_discard_coherence` exige
-- seulement que quantité et date aillent ensemble. Les métriques de perte
-- (20260807210000) bornent déjà sur `discarded_at` sans regarder le statut.
-- Une perte partielle y entre donc SANS AUCUNE modification des métriques.
--
-- ⚠️ CUMUL, pas remplacement : `discarded_qty` s'ADDITIONNE. Deux pertes
-- partielles sur le même lot doivent compter deux fois - écraser ferait
-- disparaître la première.
--
-- ⛔ CE QUE CETTE RPC NE FAIT PAS
-- Elle ne clôture jamais. Si la perte vide le lot, `remaining_qty` tombe à 0
-- et le statut passe `depleted` - le seul statut automatique du module
-- (§13.3 : il CONSTATE un fait, il ne juge pas). La décision de clôturer
-- reste humaine.
--
-- BREAKING_CHANGE: NO - nouvelle fonction, aucune signature existante touchée.
--
-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.record_batch_loss(uuid,uuid,numeric,text);
--
-- FUNCTIONS_CREATED: public.record_batch_loss
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) La fonction ne doit PAS exister :
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_batch_loss';
--   → 0 ligne.
--
-- 2) Colonnes et contrainte indispensables :
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='production_batches'
--    AND column_name IN ('discarded_qty','discarded_at','discard_reason',
--                        'remaining_qty','status','unit_cost');
--   → 6 lignes.
--
-- SELECT conname FROM pg_constraint
--  WHERE conrelid='public.production_batches'::regclass
--    AND conname='pb_discard_coherence';
--   → 1 ligne. C'est elle qui rend la perte partielle possible sans clôture.

CREATE OR REPLACE FUNCTION public.record_batch_loss(
  p_bar_id   UUID,
  p_batch_id UUID,
  p_qty      NUMERIC,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch      RECORD;
  v_new_remain NUMERIC(10,3);
  v_new_status TEXT;
  v_loss       NUMERIC(14,2);
BEGIN
  -- ⭐⭐ En SECURITY DEFINER la RLS ne s'applique pas : garde explicite.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⚠️ `FOR UPDATE` : deux déclarations simultanées sur le même lot doivent
  -- se sérialiser, sinon la seconde lirait un `remaining_qty` périmé et la
  -- perte totale serait sous-comptée.
  SELECT * INTO v_batch
  FROM public.production_batches
  WHERE id = p_batch_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lot introuvable dans ce bar');
  END IF;

  -- ⛔ Un lot clos ne reçoit plus de perte : sa quantité restante est déjà à
  -- zéro et son sort est tranché. Accepter ici créerait une perte sur du stock
  -- qui n'existe plus.
  IF v_batch.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Ce lot n''est plus en service (%s). Une perte ne peut être déclarée que sur un lot actif.',
        v_batch.status
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
   * silencieux.
   *
   * Saisir 20 quand il en reste 14 n'est pas une perte de 14 : c'est une
   * ERREUR DE SAISIE, ou un stock réel qui ne correspond pas au théorique.
   * Ramener discrètement à 14 masquerait les deux - et le message doit dire
   * COMBIEN il reste, sinon l'utilisateur retente au hasard.
   */
  IF p_qty > v_batch.remaining_qty THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Il ne reste que %s portion(s) dans ce lot. Pour tout déclarer perdu, utilisez « Jeter le reste ».',
        v_batch.remaining_qty
      )
    );
  END IF;

  v_new_remain := ROUND(v_batch.remaining_qty - p_qty, 3);

  /**
   * ⭐ `depleted` posé AUTOMATIQUEMENT à zéro - le seul statut du module qui
   * constate un FAIT plutôt qu'un jugement (§13.3). Le lot n'a plus rien à
   * servir : le dire n'est pas une décision.
   * ⚠️ La clôture, elle, reste HUMAINE : cette fonction ne pose jamais
   * `discarded`, `expired` ni `closed`.
   */
  v_new_status := CASE WHEN v_new_remain <= 0 THEN 'depleted' ELSE 'active' END;

  UPDATE public.production_batches
  SET remaining_qty  = v_new_remain,
      status         = v_new_status,
      -- ⭐⭐ CUMUL : `COALESCE(..., 0) + p_qty`. Deux pertes partielles sur le
      -- même lot comptent deux fois ; écraser ferait disparaître la première.
      discarded_qty  = COALESCE(discarded_qty, 0) + p_qty,
      /**
       * ⛔⛔ LIMITE CONNUE, MESURÉE EN CODE REVIEW LE 09/08/2026.
       *
       * La date suit la DERNIÈRE perte, et les métriques bornent dessus. Un
       * lot amputé de 4 lundi puis de 2 mercredi porte donc :
       *   `discarded_qty = 6` (juste) et `discarded_at = mercredi`.
       * Conséquence sur une période COURTE :
       *   · lundi seul    → 0 perte  (les 4 ont disparu)
       *   · mercredi seul → 6 pertes (surévalué de 4)
       *   · lundi→mercredi → 6       (JUSTE)
       *
       * ⚠️ Le total est donc toujours exact ; seule sa RÉPARTITION dans le
       * temps est fausse quand un lot subit plusieurs pertes à des jours
       * différents. Un lot vivant plusieurs jours (une sauce), le cas est
       * plausible.
       *
       * ⛔ GARDER LA PREMIÈRE DATE SERAIT AUSSI FAUX, en sens inverse. La
       * seule correction exacte est une table de mouvements de lot - chaque
       * perte avec sa date - ce qui suppose aussi de réécrire la requête de
       * métriques. Écarté tant que personne ne consulte l'écart au jour près :
       * le chiffre qui compte, « combien j'ai perdu ce mois-ci », reste juste.
       */
      discarded_at   = NOW(),
      discard_reason = COALESCE(p_reason, discard_reason)
  WHERE id = p_batch_id;

  v_loss := ROUND(p_qty * v_batch.unit_cost, 2);

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'lost_qty', p_qty,
    'remaining_qty', v_new_remain,
    'status', v_new_status,
    -- ⚠️ Le montant EST retourné : l'appelant décide de l'afficher ou non
    -- selon `canViewKitchenCosts` (§8). Le cuisinier ne le verra pas.
    'loss_value', v_loss
  );
END;
$$;

COMMENT ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) IS
  '⭐ Perte PARTIELLE sur un lot qui reste en service : « 4 portions ont tourné, '
  'les 10 autres sont bonnes ». Distinct de close_batch, qui clôture et met '
  'remaining_qty à 0. '
  '⚠️ `discarded_qty` est CUMULÉ, jamais écrasé - deux pertes comptent deux fois. '
  '⛔ Ne clôture JAMAIS : si la perte vide le lot, le statut passe `depleted` '
  '(le seul statut automatique, §13.3). La clôture reste humaine. '
  '⛔ REFUSE si la quantité dépasse le reste - une saisie trop grande est une '
  'erreur, pas une perte totale.';

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe, en un exemplaire, SECURITY DEFINER :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_batch_loss';
--   → 1 ligne, args = 'p_bar_id uuid, p_batch_id uuid, p_qty numeric, p_reason text',
--     prosecdef = true.
--
-- 2) ⛔ Privilèges - `anon` ne doit PAS pouvoir exécuter :
-- SELECT has_function_privilege('anon',
--          'public.record_batch_loss(uuid,uuid,numeric,text)','EXECUTE') AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.record_batch_loss(uuid,uuid,numeric,text)','EXECUTE') AS auth_peut;
--   → anon_peut = false, auth_peut = true.
--
-- 3) ⚠️ LE CUMUL EST BIEN EN PLACE (commentaires retirés, sinon faux positif) :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'COALESCE\(discarded_qty, 0\) \+ p_qty' AS cumule
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='record_batch_loss';
--   → true. Si false : les pertes successives s'écrasent, ARRÊTER.
--
-- 4) SMOKE TEST - le refus est le résultat ATTENDU (auth.uid() vaut NULL dans
--    le SQL Editor) :
-- SELECT public.record_batch_loss(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid(), 1, 'test');
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 5) TEST RÉEL DEPUIS L'UI, sur un lot actif de 10 portions :
--    a. déclarer 4 perdues → il reste 6, le lot est TOUJOURS actif,
--       `discarded_qty` = 4 ;
--    b. déclarer 2 de plus → il reste 4, `discarded_qty` = 6 (CUMUL, pas 2) ;
--    c. déclarer 99 → REFUS avec « il ne reste que 4 portion(s) » ;
--    d. déclarer les 4 dernières → `remaining_qty` = 0, statut `depleted`,
--       le lot disparaît de la liste des lots actifs.
