-- =====================================================
-- Fix handle_new_user Trigger to Bypass RLS
-- Date: 25 Novembre 2025
-- Description: Ajoute SECURITY DEFINER au trigger pour permettre
--              l'insertion automatique dans public.users malgré les RLS
-- =====================================================

-- Recréer la fonction avec SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- Permet de bypasser RLS
SET search_path = public
AS $$
BEGIN
  -- Log pour debugging
  RAISE NOTICE '[handle_new_user] Creating profile for user: %', NEW.id;

  -- Insérer le profil dans public.users
  INSERT INTO public.users (
    id,
    email,
    username,
    name,
    phone,
    is_active,
    first_login
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = COALESCE(EXCLUDED.username, users.username),
    name = COALESCE(EXCLUDED.name, users.name),
    phone = COALESCE(EXCLUDED.phone, users.phone);

  RAISE NOTICE '[handle_new_user] ✓ Profile created successfully';

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Error creating profile: %', SQLERRM;
    RETURN NEW; -- Continue quand même pour ne pas bloquer l'inscription
END;
$$;

-- Vérifier que le trigger existe, sinon le créer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_user();
    
    RAISE NOTICE '[Migration 037] ✓ Trigger created';
  ELSE
    RAISE NOTICE '[Migration 037] Trigger already exists';
  END IF;
END $$;

-- Notifier le rechargement du schéma
NOTIFY pgrst, 'reload schema';

RAISE NOTICE '✅ Migration 037 completed - Trigger now bypasses RLS';
