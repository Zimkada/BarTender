
-- Création ou modification d'une politique RLS pour la table 'sales'
-- Cette politique permet aux utilisateurs avec le rôle 'gerant' ou 'promoteur'
-- de voir toutes les ventes (y compris celles en 'pending') des membres de leur bar.

-- Étape 1: Assurez-vous que RLS est activé pour la table 'sales'
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Étape 2: Créez une nouvelle politique permissive pour les promoteurs et gérants
-- Cette politique s'ajoute aux autres politiques SELECT existantes pour les utilisateurs authentifiés.
CREATE POLICY "Managers and Promoters can view all sales in their bar"
ON public.sales FOR SELECT
TO authenticated -- S'applique aux utilisateurs authentifiés
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE public.bar_members.user_id = auth.uid()
      AND public.bar_members.bar_id = sales.bar_id
      AND (public.bar_members.role = 'gerant' OR public.bar_members.role = 'promoteur')
  )
);

-- Note: Si une politique précédente "Bar members can view sales" existait et était trop restrictive,
-- cette nouvelle politique permissive s'ajoutera. Si vous avez besoin de la remplacer spécifiquement,
-- vous devrez d'abord la supprimer:
-- DROP POLICY IF EXISTS "Bar members can view sales" ON public.sales;
-- Ou ajuster l'expression USING de la politique existante "Bar members can view sales"
-- pour inclure la logique ci-dessus.
-- Cette approche est plus sûre car elle ajoute une permission sans modifier une existante directement.
