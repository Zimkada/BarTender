-- ============================================================================
-- Migration: Update plan member limits (starter 2 → 3)
--
-- Cf. MARKETING.md §4 — refonte du pricing : segmentation par taille d'équipe
-- uniquement (promoteur inclus dans le compteur), toutes features actives partout.
--
-- Plan limits (NOUVEAUX SEUILS) :
--   starter    → 3 members  (était 2)  → force upsell Pro au 4ᵉ membre
--   pro        → 8 members  (inchangé) → force upsell Max au 9ᵉ membre
--   enterprise → 20 members (inchangé) → limite dure, custom au-delà
--   (unknown/null) → defaults to starter (3)
--
-- Side note : aucune contrainte ajoutée pour empêcher les bars Starter existants
-- qui auraient déjà 3 membres actifs : ils restent valides. La limite ne s'applique
-- qu'aux ajouts futurs (check_plan_member_limit s'exécute avant INSERT).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_plan_member_limit(p_bar_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
  v_max_members INT;
  v_active_count INT;
  v_already_member BOOLEAN;
BEGIN
  -- If user is already an active member of this bar, no limit check needed (role update)
  SELECT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_id = p_bar_id AND user_id = p_user_id AND is_active = TRUE
  ) INTO v_already_member;

  IF v_already_member THEN
    RETURN FALSE; -- Not exceeding limit, it's a role update
  END IF;

  -- Read plan from bar settings + lock row to serialize concurrent member additions
  SELECT COALESCE(settings->>'plan', 'starter')
  INTO v_plan
  FROM public.bars
  WHERE id = p_bar_id
  FOR UPDATE;

  -- Map plan to max members (NEW LIMITS — starter raised from 2 to 3)
  v_max_members := CASE v_plan
    WHEN 'enterprise' THEN 20
    WHEN 'pro' THEN 8
    ELSE 3  -- starter or unknown
  END;

  -- Count current active members
  SELECT COUNT(*)
  INTO v_active_count
  FROM public.bar_members
  WHERE bar_id = p_bar_id AND is_active = TRUE;

  RETURN v_active_count >= v_max_members;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
