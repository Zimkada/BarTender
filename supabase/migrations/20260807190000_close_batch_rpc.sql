-- ===================================================================
-- MIGRATION: close_batch — clôturer un lot, jeter son reste
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.1 du module restauration (§13.3)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐⭐ AUCUNE FERMETURE AUTOMATIQUE — arbitrage du 06/08/2026.
--   Ni cron, ni bascule à la journée commerciale. Un lot reste `active`
--   jusqu'à ce qu'un HUMAIN décide de son sort.
--   ⚠️ La raison est métier : une sauce tomate se conserve trois jours, un
--   bouillon aussi. Clôturer à la journée compterait en PERTE ce qui est
--   encore parfaitement utilisable en cuisine — et le cuisinier cesserait de
--   croire le chiffre, ce qui viderait toute la métrique de sens.

-- ⭐ TROIS SORTIES, TROIS SENS COMPTABLES DIFFÉRENTS (§13.3) :
--   · `closed`    — terminé sans reste notable, rien à signaler
--   · `discarded` — le reste est JETÉ : perte valorisée (qty × unit_cost)
--   · `expired`   — périmé sans être écoulé : perte, mais d'une autre cause
--   `depleted` n'est PAS ici : il est posé AUTOMATIQUEMENT par
--   `mark_kitchen_item_ready` quand `remaining_qty` atteint 0. C'est le seul
--   qui constate un fait plutôt qu'un jugement.

-- ⛔ POURQUOI `discarded_qty` N'EST PAS UN PARAMÈTRE LIBRE
--   On jette CE QUI RESTE, pas un nombre saisi. Laisser l'utilisateur taper
--   une quantité ouvrirait deux incohérences : jeter plus qu'il ne reste, ou
--   jeter moins sans dire où est passé le solde. Le RPC prend
--   `remaining_qty` et le met à zéro — un lot clos ne peut plus rien servir.

-- ⚠️ UN LOT CLOS NE SE RÉOUVRE PAS
--   Volontaire. Rouvrir un lot dont le reste a été déclaré perdu ferait
--   réapparaître de la matière déjà sortie des compteurs. En cas d'erreur, on
--   produit un nouveau lot — c'est plus honnête et ça laisse une trace.

-- BREAKING_CHANGE: NO — fonction NEUVE.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.close_batch(UUID, UUID, TEXT, TEXT);
--   ⚠️ Les lots déjà clos RESTENT clos : leur reste a été compté en perte.

-- FUNCTIONS_CREATED: close_batch
-- TABLES_MODIFIED: production_batches (UPDATE) · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='close_batch';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — la table existe :
--
--    SELECT to_regclass('public.production_batches') AS t;
--    -- ATTENDU : non NULL

DO $$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
END $$;

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

REVOKE ALL ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.close_batch(UUID, UUID, TEXT, TEXT) IS
  '§13.3 — clôture MANUELLE d''un lot. Aucune fermeture automatique dans le module : une '
  'sauce se conserve trois jours, clôturer à la journée compterait en perte ce qui est encore '
  'en cuisine. '
  '⭐ Trois sorties : closed (rien à signaler), discarded (reste jeté = perte valorisée), '
  'expired (périmé). `depleted` est EXCLU — il se pose seul au prélèvement, l''accepter ici '
  'permettrait de déclarer « épuisé par les ventes » un lot dont il reste 15 portions. '
  '⚠️ Jette CE QUI RESTE, jamais un nombre saisi. Idempotent : un lot non actif est retourné '
  'tel quel, et ne se rouvre jamais.';

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction existe, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='close_batch';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔ BLOQUANT — privilèges :
--
--    SELECT has_function_privilege('anon',
--             'public.close_batch(UUID,UUID,TEXT,TEXT)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.close_batch(UUID,UUID,TEXT,TEXT)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — `depleted` est REFUSÉ. L'accepter permettrait de
--    déclarer « épuisé par les ventes » un lot encore plein :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'IN \(''closed'', ''discarded'', ''expired''\)'
--             AS liste_blanche
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='close_batch';
--    -- ATTENDU : true
--
-- 4) ⚠️ FONCTIONNEL — via l'application (auth.uid() vaut NULL dans le SQL
--    Editor : la RPC répond « Accès refusé », comportement ATTENDU) :
--    -- a) jeter un lot avec du reste → il disparaît de la liste active,
--    --    `discarded_qty` = ce qu'il restait, `loss_amount` cohérent ;
--    -- b) le re-jeter → `already_closed: true`, aucun second comptage ;
--    -- c) clôturer un lot en « terminé » → AUCUNE perte enregistrée.
