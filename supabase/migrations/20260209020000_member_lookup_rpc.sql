-- Function to lookup user by email or ID and call add_bar_member_v2
CREATE OR REPLACE FUNCTION public.add_bar_member_lookup(
  p_bar_id UUID,
  p_role TEXT,
  p_assigned_by_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target_user_id UUID;
BEGIN
  -- 1. Resolve User ID
  IF p_user_id IS NOT NULL THEN
    v_target_user_id := p_user_id;
  ELSIF p_email IS NOT NULL THEN
    SELECT id INTO v_target_user_id FROM public.users WHERE email = p_email OR username = p_email;
  END IF;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable (ID ou Email requis)');
  END IF;

  -- 2. Call the V2 function
  RETURN public.add_bar_member_v2(p_bar_id, v_target_user_id, p_role, p_assigned_by_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
