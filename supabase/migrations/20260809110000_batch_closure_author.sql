-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: QUI a fermé ce lot, et QUAND
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ LE BESOIN, DIT PAR L'EXPLOITANT (09/08/2026)
-- > « Est-ce que terminer n'est pas une porte ouverte à la fraude ? »
-- puis : « on le fait maintenant, c'est important pour la transparence. »
--
-- Le bouton « Terminer » a été retiré le même jour : plus rien ne sort d'un
-- lot sans qu'une quantité et un motif soient déclarés. Mais il restait un
-- trou : AUCUNE clôture n'enregistrait son AUTEUR. Un promoteur voyait
-- « 8 portions perdues » sans savoir qui l'avait saisi ni quand.
--
-- ⛔ UN CHIFFRE SANS NOM NE SE CONTRÔLE PAS. C'est précisément le geste que le
-- cuisinier - celui qui répond du stock - est seul à poser en fin de service.
--
-- ⭐ LES DEUX FONCTIONS SONT TOUCHÉES, et c'est délibéré :
--   · `close_batch`       — clôture avec perte totale ;
--   · `record_batch_loss` — perte PARTIELLE, le lot reste en service.
-- La seconde est la plus discrète des deux : elle ne fait pas disparaître le
-- lot de l'écran. La tracer importe donc autant, sinon plus.
--
-- ⚠️ `auth.uid()` CAPTÉ DANS LA FONCTION, jamais reçu en paramètre. Un client
-- peut mentir sur un paramètre ; il ne peut pas falsifier sa session.
--
-- ⚠️ MÊME CONVENTION que `produced_by` (20260807140000) : `ON DELETE SET NULL`.
-- Supprimer un compte ne doit pas effacer l'historique des lots - la trace
-- perd son nom, pas son existence.
--
-- BREAKING_CHANGE: NO - deux colonnes NULLABLES, aucune ligne existante
--   invalidée. Les lots déjà clos garderont `closed_by = NULL` : on ne peut
--   pas inventer un auteur rétroactivement, et prétendre le contraire serait
--   pire que l'absence.
--
-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.production_batches
--     DROP COLUMN IF EXISTS closed_by, DROP COLUMN IF EXISTS closed_at;
--   puis réappliquer 20260807190000_close_batch_rpc.sql
--   et 20260809090000_partial_batch_loss.sql.
--
-- TABLES_MODIFIED: public.production_batches (+2 colonnes)
-- FUNCTIONS_CREATED: (aucune - CREATE OR REPLACE de deux existantes)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
-- 1) Les colonnes ne doivent PAS déjà exister :
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='production_batches'
--    AND column_name IN ('closed_by','closed_at');
--   -> 0 ligne.
--
-- 2) Les deux fonctions à remplacer existent, en UN exemplaire chacune :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('close_batch','record_batch_loss');
--   -> 2 lignes :
--     close_batch       -> 'p_bar_id uuid, p_batch_id uuid, p_status text, p_reason text'
--     record_batch_loss -> 'p_bar_id uuid, p_batch_id uuid, p_qty numeric, p_reason text'
--   ⛔ Plus de 2 lignes = surcharge : ARRÊTER.
--
-- 3) Combien de lots déjà clos resteront sans auteur (information, pas
--    blocage) :
-- SELECT count(*) AS lots_sans_auteur
--   FROM public.production_batches
--  WHERE bar_id = '<BAR_ID>'::uuid AND status <> 'active';
--   -> ces lots garderont `closed_by = NULL`. C'est normal et assumé.

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.production_batches.closed_by IS
  '⭐ QUI a fermé ce lot ou déclaré une perte dessus. Capté par `auth.uid()` '
  'dans la RPC, jamais reçu du client. NULL sur les lots clos avant le '
  '09/08/2026 - un auteur ne s''invente pas rétroactivement.';

COMMENT ON COLUMN public.production_batches.closed_at IS
  '⚠️ Distinct de `discarded_at` : celui-ci date la PERTE (et sert aux '
  'métriques), celui-là date le GESTE. Ils coïncident sur une perte, mais '
  '`closed_at` existe aussi sur une clôture sans perte.';

-- ⚠️ AUCUN INDEX. Personne ne filtre les lots par auteur : la colonne sert à
-- LIRE une trace sur un lot déjà identifié, pas à chercher.

-- ⛔⛔ CE QUE CETTE MIGRATION NE FAIT PAS, ET QU'IL FAUT SAVOIR.
-- AUCUN ÉCRAN n'affiche encore cette trace. L'onglet Production ne montre que
-- les lots ACTIFS - un lot clos en sort aussitôt - et il n'existe pas d'écran
-- d'historique des lots.
--
-- ⭐ La colonne reste utile MAINTENANT : elle rend le contrôle POSSIBLE. Sans
-- elle, l'information n'existe nulle part et aucun écran futur ne pourra la
-- reconstituer. Avec elle, une requête suffit dès aujourd'hui (cf. post-vol
-- n°6), et l'écran viendra quand le besoin sera mesuré.
--
-- ⚠️ Ne pas présenter ce chantier comme « la traçabilité est en place » : la
-- DONNÉE est en place, sa CONSULTATION ne l'est pas.

CREATE OR REPLACE FUNCTION public.close_batch(
  p_bar_id   UUID,
  p_batch_id UUID,
  p_status   TEXT,           -- 'closed' | 'discarded' | 'expired'
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ⭐ QUI ferme ce lot. Capté ICI et non passé en paramètre : un client
  -- pourrait mentir sur un paramètre, jamais sur `auth.uid()`.
  v_actor      UUID := auth.uid();
  v_batch     RECORD;
  v_discarded NUMERIC(10,3);
  v_loss      NUMERIC(14,2);
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⛔ LISTE BLANCHE des statuts acceptés, jamais une liste noire.
  -- ⚠️ `depleted` est EXCLU volontairement : il se pose tout seul au
  -- prélèvement. L'accepter ici permettrait de déclarer « épuisé par les
  -- ventes » un lot dont il reste 15 portions — un mensonge comptable.
  IF p_status NOT IN ('closed', 'discarded', 'expired') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Statut de clôture invalide'
    );
  END IF;

  SELECT id, remaining_qty, unit_cost, status, dish_id
  INTO v_batch
  FROM public.production_batches
  WHERE id = p_batch_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lot introuvable dans ce bar');
  END IF;

  -- ⭐⭐ IDEMPOTENCE — un double-clic sur « Jeter » ne doit pas compter la
  -- perte deux fois. On retourne l'état existant sans rien modifier.
  -- ⚠️ Et un lot clos ne se RÉOUVRE pas (cf. en-tête) : ce garde porte les
  -- deux règles à la fois.
  IF v_batch.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', true,
      'batch_id', p_batch_id,
      'status', v_batch.status,
      'already_closed', true
    );
  END IF;

  -- ⭐ On jette CE QUI RESTE — jamais un nombre saisi (cf. en-tête).
  -- ⚠️ `closed` ne compte AUCUNE perte : c'est le sens de ce statut. Un reste
  -- de 0.2 portion déclaré « terminé » n'a pas à polluer les métriques.
  v_discarded := CASE
    WHEN p_status IN ('discarded', 'expired') AND v_batch.remaining_qty > 0
    THEN v_batch.remaining_qty
    ELSE NULL
  END;

  v_loss := ROUND(COALESCE(v_discarded, 0) * v_batch.unit_cost, 2);

  UPDATE public.production_batches
  SET status         = p_status,
      -- ⭐⭐ TRAÇABILITÉ - ajoutée le 09/08/2026 pour la transparence.
      -- Sans ces deux colonnes, un promoteur voyait « 8 portions perdues »
      -- sans savoir QUI l'avait déclaré ni QUAND. Un chiffre sans nom ne se
      -- contrôle pas.
      closed_by      = v_actor,
      closed_at      = NOW(),
      -- ⛔ `remaining_qty` À ZÉRO dans TOUS les cas : un lot clos ne peut plus
      -- rien servir. Le laisser à sa valeur permettrait à
      -- `mark_kitchen_item_ready` d'y prélever encore — il filtre sur
      -- `status = 'active'`, mais deux gardes valent mieux qu'un sur du stock.
      remaining_qty  = 0,
      discarded_qty  = v_discarded,
      -- ⚠️ Les deux colonnes de rejet vont ENSEMBLE (contrainte
      -- `pb_discard_coherence`) : une quantité sans date rendrait la perte
      -- impossible à dater, donc absente des métriques d'une période.
      discarded_at   = CASE WHEN v_discarded IS NOT NULL THEN NOW() ELSE NULL END,
      discard_reason = CASE WHEN v_discarded IS NOT NULL THEN p_reason ELSE NULL END
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', p_status,
    'discarded_qty', COALESCE(v_discarded, 0),
    -- ⭐ Le montant perdu est RETOURNÉ pour que l'UI puisse l'annoncer — à qui
    -- a le droit de voir les montants (§8). Le compteur de portions, lui,
    -- reste lisible par tous.
    'loss_amount', v_loss,
    'already_closed', false
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
$$;

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
  -- ⭐ QUI déclare cette perte. Même règle que `close_batch` : capté du
  -- serveur, jamais reçu du client.
  v_actor      UUID := auth.uid();
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
      -- ⭐⭐ TRAÇABILITÉ (09/08/2026). Une perte PARTIELLE doit être signée
      -- autant qu'une clôture : c'est le geste le plus discret des deux.
      -- ⚠️ Écrase l'auteur précédent, comme `discarded_at` écrase sa date -
      -- même limite, même raison (cf. le bloc ci-dessus).
      closed_by      = v_actor,
      closed_at      = NOW(),
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

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_batch_loss(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les deux colonnes existent, NULLABLES :
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='production_batches'
--    AND column_name IN ('closed_by','closed_at');
--   -> 2 lignes, is_nullable = 'YES' pour les deux.
--
-- 2) ⛔ LES DEUX FONCTIONS ÉCRIVENT L'AUTEUR (commentaires retirés, sinon
--    faux positif - leçon du post-vol `loss_cost`) :
-- SELECT p.proname,
--        regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'closed_by' AS trace_l_auteur
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('close_batch','record_batch_loss');
--   -> trace_l_auteur = true pour les DEUX.
--
-- 3) ⚠️ L'AUTEUR VIENT DE LA SESSION, pas d'un paramètre :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'v_actor\s+UUID\s*:=\s*auth\.uid\(\)' AS capte_la_session
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='close_batch';
--   -> true. Si false, l'auteur pourrait être falsifié par l'appelant.
--
-- 4) Les grants ont survécu au REPLACE :
-- SELECT has_function_privilege('anon',
--          'public.close_batch(uuid,uuid,text,text)','EXECUTE')          AS anon_close,
--        has_function_privilege('authenticated',
--          'public.close_batch(uuid,uuid,text,text)','EXECUTE')          AS auth_close,
--        has_function_privilege('anon',
--          'public.record_batch_loss(uuid,uuid,numeric,text)','EXECUTE') AS anon_loss,
--        has_function_privilege('authenticated',
--          'public.record_batch_loss(uuid,uuid,numeric,text)','EXECUTE') AS auth_loss;
--   -> anon_* = false, auth_* = true.
--
-- 5) SMOKE TEST - le refus est ATTENDU (auth.uid() vaut NULL ici) :
-- SELECT public.record_batch_loss(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid(), 1, 'test');
--   -> {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) TEST RÉEL DEPUIS L'UI : déclarer une perte sur un lot, puis
-- SELECT pb.dish_id, pb.discarded_qty, pb.discard_reason,
--        u.name AS declare_par, pb.closed_at
--   FROM public.production_batches pb
--   LEFT JOIN public.users u ON u.id = pb.closed_by
--  WHERE pb.bar_id = '<BAR_ID>'::uuid AND pb.closed_by IS NOT NULL
--  ORDER BY pb.closed_at DESC LIMIT 5;
--   -> `declare_par` doit porter le nom du compte connecté.
