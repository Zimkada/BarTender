-- =====================================================
-- PROBLEM : le 4e tool du mode analyste WhatsApp (whatsapp-agent/
--   ETUDE_AGENT_ANALYSTE.md §10 etape 4) doit repondre a "qui vend le
--   plus" - aucun RPC existant ne fait cette agregation. get_top_products_by_server
--   (deja en prod) classe des PRODUITS filtres par un serveur donne, pas
--   des SERVEURS classes entre eux - nom trompeur par rapport au besoin
--   reel. Le seul calcul equivalent existant (src/hooks/useTeamPerformance.ts)
--   tourne cote client, en memoire, sur des ventes deja chargees par React
--   Query - inutilisable tel quel dans une Edge Function qui n'a pas cet etat.
--
-- IMPACT : aucune donnee modifiee - nouveau RPC dedie, aucun RPC existant
--   touche (interdiction ferme du §6 : jamais d'exemption/modification sur
--   un RPC partage avec l'app web).
--
-- SOLUTION : get_bar_server_performance(p_bar_id, p_start_date, p_end_date)
--   reproduit cote SQL l'agregation deja faite cote client par
--   useTeamPerformance.ts : CA/nombre de ventes/articles PAR SERVEUR, sur
--   les ventes validees de la periode.
--
--   ⚠️ CORRECTIF (code review, 24/08/2026, avant execution) : la premiere
--   version de ce fichier utilisait COALESCE(server_id, sold_by) - ordre
--   INVERSE de ce que ce commentaire affirmait deja a tort. Verifie par
--   lecture directe : useSalesMutations.ts:229-230 calcule
--   soldByValue = isSimplifiedMode && serverId ? serverId : <utilisateur
--   connecte> AVANT l'appel RPC - sold_by porte donc deja l'attribution
--   metier correcte au moment de l'ecriture. create_sale (derniere
--   version, 20260804100000) rend p_sold_by OBLIGATOIRE (NOT NULL,
--   exception explicite si absent) et p_server_id optionnel (DEFAULT
--   NULL) - sold_by est TOUJOURS rempli, server_id pas garanti.
--   20260103_backfill_sold_by_from_server_id.sql a d'ailleurs deja
--   corrige des ventes historiques ou sold_by divergeait a tort de
--   server_id (gerant enregistre comme vendeur au lieu du vrai serveur
--   en mode simplifie) - la aussi sold_by porte la correction, pas
--   server_id. get_top_products_by_server (RPC existant) filtre sur
--   sold_by (via l'OR avec server_id, mais sold_by en tete). Ordre
--   corrige en COALESCE(sold_by, server_id) - sold_by prioritaire,
--   server_id en repli seulement si sold_by est NULL (ne devrait
--   jamais arriver vu la contrainte NOT NULL de create_sale, mais un
--   repli reste plus sur qu'aucun filet pour des ventes tres anciennes
--   anterieures a cette contrainte).
--
--   business_date en parametre obligatoire (memes regles que
--   get_bar_daily_stats/get_daily_scope_totals) - jamais calcule ici.
--   Restriction canViewAnalytics deja garantie en amont par construction :
--   seuls promoteur/gerant atteignent ce tool (allowlist de
--   resolve_wa_bar_link), et role.canViewAnalytics=true pour ces deux
--   roles, false pour serveur - pas de filtre de role supplementaire
--   necessaire dans ce RPC.
-- =====================================================

BEGIN;

-- --- Pre-vol ---
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bar_server_performance'
  ) INTO v_exists;
  RAISE NOTICE 'PRE-VOL: get_bar_server_performance existe deja ? % (attendu false).', v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'ECHEC: get_bar_server_performance existe deja - CREATE OR REPLACE perdrait les GRANTS.';
  END IF;
END $$;

CREATE FUNCTION public.get_bar_server_performance(
  p_bar_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  user_id UUID,
  server_name TEXT,
  role TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  total_items INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
PARALLEL SAFE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Meme guard que get_bar_admin_stats/get_bar_daily_stats/get_top_products_aggregated.
  IF NOT (
    is_bar_member(p_bar_id)
    OR EXISTS (SELECT 1 FROM public.bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this bar' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date et p_end_date sont obligatoires' USING ERRCODE = '22004';
  END IF;

  RETURN QUERY
  WITH sales_by_server AS (
    SELECT
      -- COALESCE(sold_by, server_id) - sold_by EN TETE (corrige, voir
      -- commentaire en tete de fichier) : porte l'attribution metier
      -- correcte au moment de l'ecriture (useSalesMutations.ts), rendu
      -- obligatoire par create_sale (NOT NULL) contrairement a server_id
      -- (optionnel). server_id en repli uniquement pour des lignes tres
      -- anciennes ou sold_by serait NULL - ne devrait plus arriver depuis
      -- la contrainte NOT NULL de create_sale, filet de securite seulement.
      COALESCE(s.sold_by, s.server_id) AS effective_server_id,
      s.id AS sale_id,
      s.total AS sale_total,
      s.items AS sale_items
    FROM public.sales s
    WHERE s.bar_id = p_bar_id
      AND s.status = 'validated'
      AND s.business_date >= p_start_date
      AND s.business_date <= p_end_date
      AND COALESCE(s.sold_by, s.server_id) IS NOT NULL
  ),
  aggregated AS (
    SELECT
      sbs.effective_server_id,
      COUNT(DISTINCT sbs.sale_id)::BIGINT AS total_sales,
      COALESCE(SUM(sbs.sale_total), 0)::NUMERIC AS total_revenue,
      -- Articles = somme des quantites de chaque ligne de vente, pas le
      -- nombre de ventes - coherent avec items_bar/items_total de
      -- get_daily_scope_totals (meme convention "un plat est un article vendu").
      COALESCE(SUM(
        (SELECT SUM((item->>'quantity')::INTEGER) FROM jsonb_array_elements(sbs.sale_items) item)
      ), 0)::INTEGER AS total_items
    FROM sales_by_server sbs
    GROUP BY sbs.effective_server_id
  )
  SELECT
    a.effective_server_id AS user_id,
    -- COALESCE(u.name, 'Utilisateur supprimé') : un serveur peut avoir été
    -- retiré du bar (bar_members.is_active=false) ou son compte supprimé
    -- (users.id encore réferencé par sales.server_id via ON DELETE SET
    -- NULL sur users, mais l'historique de vente reste) - ne jamais
    -- planter sur une jointure manquante pour une donnée historique.
    COALESCE(u.name, 'Utilisateur supprimé') AS server_name,
    COALESCE(bm.role, 'inconnu') AS role,
    a.total_sales,
    a.total_revenue,
    a.total_items
  FROM aggregated a
  LEFT JOIN public.users u ON u.id = a.effective_server_id
  LEFT JOIN public.bar_members bm ON bm.user_id = a.effective_server_id AND bm.bar_id = p_bar_id
  ORDER BY a.total_revenue DESC;
END;
$$;

COMMENT ON FUNCTION public.get_bar_server_performance(UUID, DATE, DATE) IS
'Performance par serveur (CA, nombre de ventes, articles vendus) sur une periode - '
'business_date obligatoire, jamais calculee ici (meme regle que get_bar_daily_stats). '
'Reproduit cote SQL l''agregation deja faite cote client par useTeamPerformance.ts. '
'Restriction canViewAnalytics deja garantie en amont (seuls promoteur/gerant atteignent '
'ce RPC via le mode analyste WhatsApp) - pas de filtre de role supplementaire ici. '
'Ecrit pour le tool obtenir_performance_serveurs du mode analyste WhatsApp (§10 etape 4).';

REVOKE ALL ON FUNCTION public.get_bar_server_performance(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bar_server_performance(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_server_performance(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_bar_server_performance(uuid,date,date)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.get_bar_server_performance(uuid,date,date)', 'EXECUTE') INTO v_auth_fn;

  RAISE NOTICE 'POST-VOL: get_bar_server_performance -- anon: % (attendu false), authenticated: % (attendu true)', v_anon_fn, v_auth_fn;

  IF v_anon_fn THEN
    RAISE EXCEPTION 'ECHEC: get_bar_server_performance accessible par anon.';
  END IF;
  IF NOT v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: authenticated ne peut pas executer get_bar_server_performance.';
  END IF;

  RAISE NOTICE '✅ get_bar_server_performance disponible, filtre par business_date obligatoire.';
END $$;

COMMIT;
