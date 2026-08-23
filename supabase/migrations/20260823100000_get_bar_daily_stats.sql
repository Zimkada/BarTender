-- =====================================================
-- PROBLEM : le tool obtenir_stats_bar (mode analyste WhatsApp,
--   whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §10 etape 3) utilisait
--   get_bar_admin_stats, qui cumule TOUT l'historique du bar (aucun
--   filtre de date, confirme dans son corps : COUNT(*)/SUM(total) sans
--   WHERE sur business_date). Premier test terrain reel (23/08/2026) :
--   un promoteur a demande "que s'est-il passe dans mon bar aujourd'hui"
--   et a recu 113 ventes / 166 300 F alors que le Dashboard (filtre sur
--   la journee du 23 aout) affichait 0 partout - le chiffre n'etait pas
--   FAUX en soi (c'est bien le cumul reel depuis toujours) mais ne
--   repondait pas a la question posee, dans un contexte ou le prompt
--   analyste impose "jamais de chiffre qui induit en erreur".
--
-- IMPACT : aucune donnee modifiee. get_bar_admin_stats N'EST PAS touche
--   (interdiction ferme du §6 : jamais d'exemption/modification sur un
--   RPC partage avec l'app web) - nouveau RPC dedie, distinct.
--
-- SOLUTION : get_bar_daily_stats(p_bar_id, p_business_date) filtre sur
--   sales.business_date = p_business_date (colonne deja calculee et
--   stockee par trigger a la creation de la vente, 067_add_business_date.sql
--   - pas de recalcul cote SQL). Meme regle absolue que get_daily_scope_totals
--   (20260804110000) : business_date est un PARAMETRE obligatoire, jamais
--   calcule dans le RPC - l'heure de cloture (bars.closing_hour) differe
--   par bar, un repli code en dur produirait un chiffre faux
--   silencieusement pour tout bar qui ne ferme pas a 6h. Le calcul du jour
--   courant se fait cote Edge Function (wa-webhook), qui lit closing_hour
--   puis reproduit calculateBusinessDate (src/utils/businessDateHelpers.ts)
--   en TypeScript avant d'appeler ce RPC.
-- =====================================================

BEGIN;

-- --- Pre-vol ---
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bar_daily_stats'
  ) INTO v_exists;
  RAISE NOTICE 'PRE-VOL: get_bar_daily_stats existe deja ? % (attendu false).', v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'ECHEC: get_bar_daily_stats existe deja - CREATE OR REPLACE perdrait les GRANTS.';
  END IF;
END $$;

CREATE FUNCTION public.get_bar_daily_stats(
  p_bar_id UUID,
  p_business_date DATE
)
RETURNS TABLE (
  total_products BIGINT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  pending_sales BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Meme guard que get_bar_admin_stats (is_bar_member OR owner OR
  -- super_admin) - coherent avec le RPC dont celui-ci reprend la forme,
  -- jamais de guard plus faible sur un nouveau RPC.
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  -- business_date OBLIGATOIRE, jamais calculee ici (meme regle que
  -- get_daily_scope_totals, 20260804110000) : un repli sur CURRENT_DATE
  -- serait faux pour tout bar dont closing_hour differe de la valeur par
  -- defaut, et l'erreur serait silencieuse.
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'p_business_date est obligatoire' USING ERRCODE = '22004';
  END IF;

  RETURN QUERY
  SELECT
    -- total_products reste un cumul (pas de notion de "produits actifs
    -- aujourd'hui" qui aurait un sens) - coherent avec get_bar_admin_stats.
    (SELECT COUNT(*)::bigint FROM public.bar_products WHERE bar_id = p_bar_id AND is_active = true) AS total_products,
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated' AND business_date = p_business_date) AS total_sales,
    (SELECT COALESCE(SUM(total), 0)::numeric FROM public.sales WHERE bar_id = p_bar_id AND status = 'validated' AND business_date = p_business_date) AS total_revenue,
    (SELECT COUNT(*)::bigint FROM public.sales WHERE bar_id = p_bar_id AND status = 'pending' AND business_date = p_business_date) AS pending_sales;
END;
$$;

COMMENT ON FUNCTION public.get_bar_daily_stats(UUID, DATE) IS
'Statistiques du bar filtrees sur UNE journee commerciale (business_date obligatoire, jamais '
'calculee ici - heure de cloture propre a chaque bar, meme regle que get_daily_scope_totals). '
'total_products reste un cumul (produits actifs actuellement, pas une notion datee). '
'Distinct de get_bar_admin_stats (cumul total, jamais filtre) - jamais modifier ce dernier '
'pour ce cas d''usage (interdiction ferme, whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §6). '
'Ecrit pour le tool obtenir_stats_bar du mode analyste WhatsApp (§10 etape 3).';

REVOKE ALL ON FUNCTION public.get_bar_daily_stats(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bar_daily_stats(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_daily_stats(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_bar_daily_stats(uuid,date)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.get_bar_daily_stats(uuid,date)', 'EXECUTE') INTO v_auth_fn;

  RAISE NOTICE 'POST-VOL: get_bar_daily_stats -- anon: % (attendu false), authenticated: % (attendu true)', v_anon_fn, v_auth_fn;

  IF v_anon_fn THEN
    RAISE EXCEPTION 'ECHEC: get_bar_daily_stats accessible par anon.';
  END IF;
  IF NOT v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: authenticated ne peut pas executer get_bar_daily_stats.';
  END IF;

  RAISE NOTICE '✅ get_bar_daily_stats disponible, filtre par business_date obligatoire.';
END $$;

COMMIT;
