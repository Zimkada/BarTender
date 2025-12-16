-- Migration: Amélioration de la fonction RPC admin_send_password_reset pour gérer les emails placeholders.
-- Date: 2025-12-15 20:00:00
-- Description: La fonction vérifie si l'email de l'utilisateur est un placeholder (@bartender.app) avant d'envoyer le lien de réinitialisation.

CREATE OR REPLACE FUNCTION admin_send_password_reset(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_admin_id UUID := auth.uid();
  is_super_admin BOOLEAN := FALSE;
  user_email TEXT;
  reset_link_response JSONB;
BEGIN
  -- Vérification de sécurité: Seuls les super admins peuvent exécuter cette fonction.
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = current_admin_id AND role = 'super_admin' AND is_active = TRUE
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Permission denied: only super admins can send password reset links.';
  END IF;

  -- Obtenir l'email de l'utilisateur à partir de la table d'authentification Supabase (auth.users)
  SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;

  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User with ID % not found in auth.users or has no email.', p_user_id;
  END IF;

  -- NOUVELLE LOGIQUE: Vérifier si l'email est un placeholder
  IF user_email LIKE '%@bartender.app' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'L''email ' || user_email || ' est un placeholder. Aucun lien de réinitialisation envoyé.'
    );
  END IF;

  -- Appeler la fonction d'administration de Supabase pour générer et envoyer le lien
  -- Supabase Auth est configuré pour envoyer l'email directement.
  SELECT auth.admin_generate_link('password_reset', user_email, null, null) INTO reset_link_response;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Lien de réinitialisation envoyé à ' || user_email
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Accorder la permission d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION admin_send_password_reset(UUID) TO authenticated;

-- Notifier Supabase de recharger le schéma pour PostgREST
NOTIFY pgrst, 'reload schema';
