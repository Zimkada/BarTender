-- Create RPC function to check if a specific user is a super_admin
-- This is needed for Edge Functions that use service_role_key and can't rely on auth.uid()

CREATE OR REPLACE FUNCTION public.is_user_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bar_members
    WHERE user_id = p_user_id
      AND role = 'super_admin'
      AND is_active = true
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_super_admin(UUID) TO authenticated;

-- Grant execute permission to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION public.is_user_super_admin(UUID) TO service_role;

-- Add comment documenting the function
COMMENT ON FUNCTION public.is_user_super_admin(UUID) IS
  'Check if a specific user has an active super_admin role. '
  'Used by Edge Functions with service_role_key that cannot rely on auth.uid() context.';
