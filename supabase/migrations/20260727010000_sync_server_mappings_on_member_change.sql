-- =====================================================
-- MIGRATION: Synchronisation automatique des mappings de caisse
-- Date: 2026-07-27
--
-- PROBLÈME
--   Un serveur retiré de l'équipe (soft delete bar_members.is_active = FALSE)
--   conserve son nom dans server_name_mappings. Le nom reste donc sélectionnable
--   dans le sélecteur de caisse du mode simplifié, et les ventes continuent de
--   lui être attribuées. Aucun des chemins de retrait ne nettoie la table.
--
--   Second chemin, même symptôme : un serveur promu gérant/promoteur garde son
--   mapping (is_active reste TRUE, seul role change). Il apparaît alors EN DOUBLE
--   dans le sélecteur — une fois via l'option native « Moi (Nom) », une fois via
--   son mapping résiduel.
--
-- DIAGNOSTIC PROD (pré-vol exécuté le 2026-07-27, 6 orphelins sur 5 bars)
--   PROMU_NON_SERVEUR (3) : Koto (promoteur, Bar Restau Le Marché, mode
--     simplifié → doublon visible en caisse), Chabi BONI (promoteur) et
--     Gerant Bar (gérant) sur PRESTIGE BAR 1.
--     Vérifié : 0 bon ouvert, 0 vente attribuée par un tiers sur les trois.
--     Les 2 ventes de Koto portent operating_mode_at_creation = 'full', mode
--     dans lequel le sélecteur n'existe pas (CartDrawer.tsx:66 renvoie
--     directement currentSession.userId) → le mapping n'a jamais servi.
--   MEMBRE_RETIRE (3) : Bastou (Bar Tour Eiffel, mode simplifié),
--     Tata bignon (Bar Restau ESPOIR), Serveur TEST4 (PRESTIGE BAR 1).
--   Collisions de noms (bloc 4) : AUCUNE — aucun bar bloqué pour réembauche.
--   Bons ouverts rattachés à un orphelin (bloc 5) : AUCUN.
--
-- POURQUOI PAS UN SIMPLE DELETE
--   useTickets.ts:400 résout le nom affiché d'un bon UNIQUEMENT via les mappings
--   (mappings.find(m => m.userId === ticket.serverId)). Supprimer la ligne d'un
--   serveur ayant un bon ouvert anonymise ce bon — de l'argent en cours sur une
--   table, sans nom pour le réclamer. Aucun cas aujourd'hui, mais le risque se
--   représente au premier retrait d'un serveur en service.
--   → is_active sur le mapping : le nom sort de la caisse, les bons gardent leur
--     libellé.
--
-- TRAITEMENT DIFFÉRENCIÉ (fondé sur le diagnostic ci-dessus)
--   Membre retiré  → DÉSACTIVATION : trace d'exploitation réelle à préserver.
--   Promu manager  → SUPPRESSION  : doublon avec l'option « Moi », aucune donnée
--                    rattachée, aucune valeur historique. C'est déjà ce que
--                    prescrivait 20260102_remove_managers_from_server_name_mappings,
--                    qui a échoué faute de garde-fou permanent (le mapping Koto a
--                    été recréé 3 jours après son passage).
--
-- POURQUOI UN TRIGGER PLUTÔT QU'UN PATCH DANS remove_bar_member_v2
--   Cinq chemins écrivent bar_members.is_active ou role :
--     1. remove_bar_member_v2        (utilisé par l'UI)
--     2. add_bar_member_v2           (utilisé par l'UI : ajout ET changement de rôle)
--     3. add_bar_member_existing     (exposé PostgREST, sans appelant client)
--     4. assign_bar_member           (exposé PostgREST, sans appelant client)
--     5. UPDATE direct               (bar_members_update_policy autorise un gérant
--                                     à modifier les lignes de rôle 'serveur')
--   Un trigger sur la table les couvre tous, y compris l'UPDATE direct qu'aucun
--   patch de RPC ne pourrait intercepter.
--
-- CONTENU
--   1. Colonne server_name_mappings.is_active
--   2. Fonction + trigger de synchronisation
--   3. Correction du DO NOTHING d'add_bar_member_v2 (réactivation)
--   4. Backfill des 6 orphelins diagnostiqués
--
-- NON INCLUS (volontairement)
--   - Guard p_server_id dans create_sale_idempotent : livré séparément, car il
--     touche le flux de vente (risque et test différents).
--   - Durcissement RLS de server_name_mappings : les policies actuelles
--     n'exigent que bar_members.is_active = true, SANS filtre de rôle — un simple
--     serveur peut réécrire les mappings de son bar. Faille réelle mais hors
--     périmètre, à traiter dans une passe dédiée.
-- =====================================================

BEGIN;

-- =====================================================
-- ÉTAPE 1 — Colonne is_active
-- =====================================================
-- DEFAULT TRUE : les mappings existants restent actifs. Le backfill (étape 4)
-- corrige ensuite les seuls cas diagnostiqués.

ALTER TABLE public.server_name_mappings
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.server_name_mappings.is_active IS
  'FALSE = le membre n''est plus un serveur actif du bar. Le nom disparaît du '
  'sélecteur de caisse mais reste résolvable pour l''affichage des bons ouverts '
  '(useTickets.ts). Synchronisé automatiquement par trg_sync_server_mapping.';

-- Index partiel : la caisse ne lit que les mappings actifs.
CREATE INDEX IF NOT EXISTS idx_server_mappings_bar_active
  ON public.server_name_mappings(bar_id)
  WHERE is_active = TRUE;

-- =====================================================
-- ÉTAPE 2 — Fonction de synchronisation
-- =====================================================
-- Règle : un mapping est actif si et seulement si le membre correspondant est
-- un SERVEUR ACTIF. Cette condition couvre d'un seul tenant le retrait
-- (is_active = FALSE) et la promotion (role <> 'serveur').
--
-- Garde user_id IS NOT NULL : bar_members.user_id est NULLABLE depuis
-- 20260116000000 (serveurs « virtuels » du mode simplifié, mécanisme abandonné —
-- 0 occurrence de virtual_server_name dans src/ hors types générés). Une ligne
-- résiduelle produirait un WHERE user_id = NULL qui ne matche rien. Le trigger
-- sync_bar_member_role_to_auth_metadata (20251221) présente exactement cette
-- faiblesse ; on ne la reproduit pas.

CREATE OR REPLACE FUNCTION public.sync_server_mapping_on_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Lignes sans compte utilisateur : rien à synchroniser.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'serveur' AND NEW.is_active = TRUE THEN
    -- Serveur actif → mapping actif.
    -- Couvre la réintégration : add_bar_member_v2 fait un UPSERT
    -- (DO UPDATE SET is_active = TRUE) qui déclenche ce trigger.
    UPDATE public.server_name_mappings
    SET is_active  = TRUE,
        updated_at = NOW()
    WHERE bar_id = NEW.bar_id
      AND user_id = NEW.user_id
      AND is_active = FALSE;

  ELSIF NEW.role <> 'serveur' THEN
    -- Promu gérant/promoteur/super_admin → SUPPRESSION.
    -- L'option native « Moi (Nom) » du sélecteur (CartDrawer.tsx:94) couvre
    -- déjà son besoin d'encaisser : le mapping ne serait qu'un doublon.
    DELETE FROM public.server_name_mappings
    WHERE bar_id = NEW.bar_id
      AND user_id = NEW.user_id;

  ELSE
    -- Serveur retiré (role = 'serveur' ET is_active = FALSE) → DÉSACTIVATION.
    -- On conserve la ligne : les bons ouverts résolvent leur libellé via les
    -- mappings, un DELETE les anonymiserait.
    UPDATE public.server_name_mappings
    SET is_active  = FALSE,
        updated_at = NOW()
    WHERE bar_id = NEW.bar_id
      AND user_id = NEW.user_id
      AND is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_server_mapping_on_member_change IS
  'Maintient server_name_mappings.is_active aligné sur « membre = serveur actif ». '
  'Retrait → désactivation (préserve le libellé des bons ouverts). '
  'Promotion manager → suppression (doublon avec l''option « Moi » de la caisse). '
  'Réintégration → réactivation. Ignore les lignes user_id NULL.';

-- =====================================================
-- ÉTAPE 3 — Trigger
-- =====================================================
-- INSERT OR UPDATE : add_bar_member_existing peut créer une ligne par INSERT pur,
-- sans passer par UPDATE. Un trigger UPDATE seul manquerait ce chemin.
--
-- Pas de clause WHEN sur (is_active, role) : l'UPSERT d'add_bar_member_v2 force
-- is_active = TRUE sur une ligne déjà TRUE lors d'un simple changement de rôle.
-- Une condition « IS DISTINCT FROM » ne se déclencherait pas dans ce cas précis —
-- exactement le scénario de la promotion serveur → gérant qu'on veut couvrir.
--
-- Nommage : les triggers de bar_members s'exécutent par ordre alphabétique
--   bar_members_updated_at (BEFORE)
--   trg_audit_member_change
--   trg_sync_server_mapping           ← ici
--   trigger_sync_role_to_auth_metadata
--   trigger_sync_role_update_to_auth_metadata
-- Aucune dépendance entre eux (cibles disjointes), mais la position est choisie :
-- après l'audit, avant la synchro auth.

DROP TRIGGER IF EXISTS trg_sync_server_mapping ON public.bar_members;

CREATE TRIGGER trg_sync_server_mapping
  AFTER INSERT OR UPDATE ON public.bar_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_server_mapping_on_member_change();

-- =====================================================
-- ÉTAPE 4 — add_bar_member_v2 : réactivation du mapping
-- =====================================================
-- Base : corps réel lu en prod le 2026-07-27 via pg_get_functiondef
-- (= 20260402000000_enforce_plan_member_limit.sql, vérifié identique).
--
-- DEUX corrections, tout le reste est repris à l'identique :
--
--   (a) ON CONFLICT ... DO NOTHING → DO UPDATE
--       Le DO NOTHING laissait un mapping désactivé dans son état lors d'une
--       réintégration. Le serveur réintégré serait resté invisible en caisse,
--       avec un mapping fantôme non réparable depuis l'UI.
--
--   (b) Contrôle de collision : ignorer les mappings inactifs
--       L'index unique porte sur (bar_id, server_name) SANS user_id : un mapping
--       désactivé OCCUPE le nom. Sans ce filtre, réembaucher quelqu'un portant le
--       prénom d'un ancien serveur devenait IMPOSSIBLE — rejet « Le nom X est
--       déjà utilisé », sur un mapping invisible dans l'UI. Aucun bar n'est dans
--       ce cas aujourd'hui (bloc 4 vide), mais l'étape 1 crée le risque.
--
-- ⚠️ SET search_path préservé : la Vague 4d (20260703050000) l'a posé sur cette
--    fonction. Un CREATE OR REPLACE sans cette clause annulerait le durcissement.

CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id        UUID,
  p_user_id       UUID,
  p_role          TEXT,
  p_assigned_by_id UUID  -- Conservé pour compatibilité ascendante, ignoré en interne
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_actor_id     UUID;
  v_user_name    TEXT;
  v_can_manage   BOOLEAN;
  v_member_id    UUID;
  v_action       TEXT;
  v_existing_role TEXT;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
  END IF;

  IF p_role NOT IN ('gerant', 'serveur') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Rôle invalide: "%s". Seuls gerant et serveur sont autorisés via ce RPC.', p_role)
    );
  END IF;

  IF p_role = 'gerant' THEN
    v_action := 'create_manager';
  ELSE
    v_action := 'create_server';
  END IF;

  v_can_manage := public.check_user_can_manage_members(p_bar_id, v_actor_id, v_action);
  IF NOT v_can_manage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée pour cette action');
  END IF;

  -- ⭐ PLAN LIMIT CHECK
  IF public.check_plan_member_limit(p_bar_id, p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Limite de membres atteinte pour le plan actuel. Contactez l''administrateur pour passer au plan supérieur.'
    );
  END IF;

  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  SELECT role INTO v_existing_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id;

  IF v_existing_role IS NOT NULL THEN
    IF v_existing_role IN ('promoteur', 'super_admin') THEN
      IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.bar_members
           WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
         ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format(
            'Impossible de modifier le rôle d''un %s. Seul le propriétaire ou un Super Admin peut effectuer cette action.',
            v_existing_role
          )
        );
      END IF;
    END IF;

    IF v_existing_role = 'gerant' AND p_role = 'serveur' THEN
      IF NOT EXISTS (SELECT 1 FROM public.bars WHERE id = p_bar_id AND owner_id = v_actor_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.bar_members
           WHERE user_id = v_actor_id AND role = 'super_admin' AND is_active = TRUE
         ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Seul le propriétaire ou un Super Admin peut modifier le rôle d''un gérant.'
        );
      END IF;
    END IF;
  END IF;

  IF p_role = 'serveur' THEN
    -- ⭐ (b) Collision avec un serveur ACTIF : rejet (comportement inchangé).
    IF EXISTS (
      SELECT 1 FROM public.server_name_mappings
      WHERE bar_id = p_bar_id
        AND server_name = v_user_name
        AND user_id != p_user_id
        AND is_active = TRUE
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Le nom "%s" est déjà utilisé par un autre serveur dans ce bar.', v_user_name)
      );
    END IF;

    -- ⭐ (c) Collision avec un mapping INACTIF appartenant à quelqu'un d'autre.
    -- L'UPSERT plus bas réassignerait cette ligne au nouveau venu (l'unicité
    -- porte sur (bar_id, server_name), pas sur user_id). Si l'ancien titulaire
    -- a des BONS OUVERTS, ils perdraient leur libellé (useTickets.ts:400 résout
    -- par userId) — exactement le dommage que cette migration évite.
    -- On refuse donc, avec un message actionnable.
    IF EXISTS (
      SELECT 1
      FROM public.server_name_mappings snm
      JOIN public.tickets t
        ON t.bar_id = snm.bar_id
       AND t.server_id = snm.user_id
       AND t.status = 'open'
      WHERE snm.bar_id = p_bar_id
        AND snm.server_name = v_user_name
        AND snm.user_id != p_user_id
        AND snm.is_active = FALSE
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Le nom "%s" appartient à un ancien serveur qui a encore des bons ouverts. '
          'Soldez ces bons avant de réutiliser ce nom.',
          v_user_name
        )
      );
    END IF;
  END IF;

  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  IF p_role = 'serveur' THEN
    -- ⭐ (a) DO UPDATE : réactive un mapping désactivé au lieu de l'ignorer.
    --
    -- Le DO UPDATE peut réassigner la ligne à un autre user_id (réembauche d'un
    -- homonyme). C'est voulu — c'est ce qui libère le nom — mais uniquement
    -- parce que les gardes (b) et (c) ci-dessus ont déjà écarté les deux cas
    -- dangereux : nom pris par un serveur actif, et nom pris par un ancien
    -- serveur ayant des bons ouverts.
    --
    -- Pas de clause WHERE sur le DO UPDATE : quand une telle clause est fausse,
    -- Postgres ignore la ligne SILENCIEUSEMENT — on retomberait sur le
    -- comportement DO NOTHING qu'on corrige, sans aucun signal. Les rejets
    -- doivent être explicites, d'où les gardes en amont.
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, is_active, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, TRUE, NOW(), NOW())
    ON CONFLICT (bar_id, server_name)
    DO UPDATE SET
      user_id    = EXCLUDED.user_id,
      is_active  = TRUE,
      updated_at = NOW();
  END IF;

  PERFORM public.internal_log_audit_event(
    'MEMBER_ADDED',
    'info',
    v_actor_id,
    p_bar_id,
    format('Ajout/mise à jour du membre %s (%s)', v_user_name, p_role),
    jsonb_build_object('target_user_id', p_user_id, 'role', p_role, 'member_id', v_member_id),
    p_user_id,
    'user'
  );

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.add_bar_member_v2 IS
  'Ajout/mise à jour atomique de membre. '
  'FIX 8: guard rôle existant avant UPSERT — bloque downgrade promoteur/gérant. '
  'FIX 2026-07-27: mapping en DO UPDATE (réactivation à la réintégration) + '
  'contrôle de collision ignorant les mappings inactifs (débloque la réembauche).';

-- ⚠️ CREATE OR REPLACE ne perd PAS les grants sur une fonction existante, mais
-- on les réaffirme : leçon des Vagues 1-4 (un DROP + CREATE les aurait perdus,
-- et rien ne garantit qu'une future reprise de ce fichier ne fasse pas un DROP).
REVOKE EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_bar_member_v2(uuid, uuid, text, uuid) TO authenticated;

-- =====================================================
-- ÉTAPE 5 — Backfill des orphelins diagnostiqués
-- =====================================================
-- Aucun ciblage nominatif : on applique la même règle que le trigger, à
-- l'existant. Les 6 lignes du diagnostic sont couvertes par ces deux requêtes.

-- 5a. Managers → DELETE (3 lignes attendues : Koto, Chabi BONI, Gerant Bar)
--     Vérifié avant migration : 0 bon ouvert, 0 vente attribuée par un tiers.
DELETE FROM public.server_name_mappings snm
USING public.bar_members bm
WHERE bm.bar_id = snm.bar_id
  AND bm.user_id = snm.user_id
  AND bm.role <> 'serveur';

-- 5b. Membres retirés ou disparus → DÉSACTIVATION
--     (3 lignes attendues : Bastou, Tata bignon, Serveur TEST4)
UPDATE public.server_name_mappings snm
SET is_active  = FALSE,
    updated_at = NOW()
WHERE snm.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.bar_members bm
    WHERE bm.bar_id = snm.bar_id
      AND bm.user_id = snm.user_id
      AND bm.role = 'serveur'
      AND bm.is_active = TRUE
  );

-- =====================================================
-- ÉTAPE 6 — Garde-fou : le backfill correspond-il au diagnostic ?
-- =====================================================
-- Le pré-vol du 2026-07-27 a recensé exactement 3 suppressions et
-- 3 désactivations. Si les chiffres réels s'écartent, c'est que la base a
-- changé depuis le diagnostic : on ROLLBACK plutôt que d'appliquer un backfill
-- non vérifié sur des données de production.
--
-- Marge : on tolère MOINS (des lignes ont pu être nettoyées entre-temps) mais
-- jamais PLUS que prévu.

DO $$
DECLARE
  v_supprimes    INT;
  v_desactives   INT;
  v_incoherents  INT;
BEGIN
  -- Plus aucun mapping ne doit pointer vers un non-serveur
  SELECT COUNT(*) INTO v_incoherents
  FROM public.server_name_mappings snm
  JOIN public.bar_members bm
    ON bm.bar_id = snm.bar_id AND bm.user_id = snm.user_id
  WHERE bm.role <> 'serveur';

  IF v_incoherents > 0 THEN
    RAISE EXCEPTION
      'ABANDON : % mapping(s) de manager subsistent après le backfill. État inattendu.',
      v_incoherents;
  END IF;

  -- Aucun mapping actif ne doit survivre à un membre non-serveur-actif
  SELECT COUNT(*) INTO v_incoherents
  FROM public.server_name_mappings snm
  WHERE snm.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = snm.bar_id
        AND bm.user_id = snm.user_id
        AND bm.role = 'serveur'
        AND bm.is_active = TRUE
    );

  IF v_incoherents > 0 THEN
    RAISE EXCEPTION
      'ABANDON : % mapping(s) actif(s) sans serveur actif correspondant.',
      v_incoherents;
  END IF;

  SELECT COUNT(*) INTO v_desactives
  FROM public.server_name_mappings
  WHERE is_active = FALSE;

  IF v_desactives > 3 THEN
    RAISE EXCEPTION
      'ABANDON : % mappings désactivés, 3 attendus selon le diagnostic. '
      'La base a changé depuis le pré-vol — relancer le pré-vol avant d''appliquer.',
      v_desactives;
  END IF;

  RAISE NOTICE 'Backfill conforme : % mapping(s) désactivé(s), 0 incohérence.', v_desactives;
END $$;

-- Recharger le cache de schéma PostgREST (nouvelle colonne is_active)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- POST-VOL : voir
--   supabase/checks/20260727_postvol_server_mappings.sql
-- Résultats attendus :
--   - 3 mappings de managers supprimés (total passe de N à N-3)
--   - 3 mappings désactivés (is_active = FALSE)
--   - 0 mapping actif dont le membre n'est pas serveur actif
--   - trigger trg_sync_server_mapping présent et actif
--   - add_bar_member_v2 : search_path conservé, anon sans EXECUTE
-- =====================================================
