-- Migration: Fix add_bar_member_v2 — bloquer downgrade via UPSERT
-- Date: 2026-02-27
--
-- FAILLE RÉSIDUELLE identifiée après 20260227100000 :
--
-- add_bar_member_v2 valide p_role (gerant|serveur) et les permissions de l'acteur
-- sur le rôle CIBLE, mais ne vérifie pas le rôle EXISTANT du membre ciblé.
-- Un gérant autorisé à 'create_server' peut appeler le RPC avec
--   p_user_id = <uuid d'un promoteur>, p_role = 'serveur'
-- → la permission check passe (gérant peut créer des serveurs)
-- → l'INSERT déclenche ON CONFLICT DO UPDATE SET role = 'serveur'
-- → le promoteur est rétrogradé en serveur sans contrôle.
--
-- FIX 8 : insérer un guard AVANT l'UPSERT qui lit le rôle courant de la cible
--   et applique les restrictions équivalentes à remove_bar_member_v2 :
--   - promoteur / super_admin → seul owner ou super_admin acteur peut modifier
--   - gerant → seul owner ou super_admin acteur peut rétrograder

CREATE OR REPLACE FUNCTION public.add_bar_member_v2(
  p_bar_id        UUID,
  p_user_id       UUID,
  p_role          TEXT,
  p_assigned_by_id UUID  -- Conservé pour compatibilité ascendante, ignoré en interne
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id     UUID;
  v_user_name    TEXT;
  v_can_manage   BOOLEAN;
  v_member_id    UUID;
  v_action       TEXT;
  v_existing_role TEXT;  -- FIX 8 : rôle courant du membre cible (NULL si nouveau membre)
BEGIN
  -- FIX 1 : utiliser auth.uid() comme acteur réel, ignorer p_assigned_by_id
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentification requise');
  END IF;

  -- FIX 2 : rejeter tout rôle hors du périmètre autorisé
  IF p_role NOT IN ('gerant', 'serveur') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Rôle invalide: "%s". Seuls gerant et serveur sont autorisés via ce RPC.', p_role)
    );
  END IF;

  -- Déterminer l'action selon le rôle cible
  IF p_role = 'gerant' THEN
    v_action := 'create_manager';
  ELSE
    v_action := 'create_server';
  END IF;

  -- Vérifier les permissions de l'acteur réel
  v_can_manage := public.check_user_can_manage_members(p_bar_id, v_actor_id, v_action);
  IF NOT v_can_manage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission refusée pour cette action');
  END IF;

  -- Récupérer le nom de l'utilisateur cible
  SELECT name INTO v_user_name FROM public.users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  -- FIX 8 : lire le rôle existant du membre cible
  SELECT role INTO v_existing_role
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE;

  IF v_existing_role IS NOT NULL THEN

    -- Cas 1 : cible est promoteur ou super_admin
    -- → seul owner ou super_admin acteur peut modifier ce membre
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

    -- Cas 2 : cible est gérant, acteur veut le rétrograder en serveur
    -- → seul owner ou super_admin peut rétrograder un gérant
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

  -- Détection de collision sur les mappings de nom serveur
  IF p_role = 'serveur' THEN
    IF EXISTS (
      SELECT 1 FROM public.server_name_mappings
      WHERE bar_id = p_bar_id
        AND server_name = v_user_name
        AND user_id != p_user_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Le nom "%s" est déjà utilisé par un autre serveur dans ce bar.', v_user_name)
      );
    END IF;
  END IF;

  -- Insert / Upsert membre
  INSERT INTO public.bar_members (bar_id, user_id, role, assigned_by, is_active, joined_at)
  VALUES (p_bar_id, p_user_id, p_role, v_actor_id, TRUE, NOW())
  ON CONFLICT (bar_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET
    role        = EXCLUDED.role,
    is_active   = TRUE,
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO v_member_id;

  -- Auto-créer le mapping serveur
  IF p_role = 'serveur' THEN
    INSERT INTO public.server_name_mappings (bar_id, user_id, server_name, created_at, updated_at)
    VALUES (p_bar_id, p_user_id, v_user_name, NOW(), NOW())
    ON CONFLICT (bar_id, server_name) DO NOTHING;
  END IF;

  -- Audit log (acteur réel = v_actor_id)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.add_bar_member_v2 IS
  'Ajout/mise à jour atomique de membre. '
  'FIX 8: guard rôle existant avant UPSERT — bloque downgrade promoteur/gérant via create_server. '
  'Complète le hardening de 20260227100000 (anti-spoof, p_role borné).';
