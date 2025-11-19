-- =====================================================
-- MIGRATION 005: Add RLS Policies for bar_members
-- Date: 19 Novembre 2025
-- =====================================================

-- RLS Policies pour bar_members
CREATE POLICY "Users can view own bar memberships"
  ON bar_members FOR SELECT
  USING (
    is_super_admin() OR
    user_id = get_current_user_id() OR
    is_bar_member(bar_id)
  );

CREATE POLICY "Promoteurs can add bar members"
  ON bar_members FOR INSERT
  WITH CHECK (
    is_super_admin() OR
    is_promoteur_or_admin()
  );

CREATE POLICY "Promoteurs can update bar members"
  ON bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant')
  );

CREATE POLICY "Promoteurs can delete bar members"
  ON bar_members FOR DELETE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) = 'promoteur'
  );
