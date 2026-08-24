-- =====================================================
-- PROBLEM : constate en usage reel (24/08/2026) - le bot analyste ne sait
--   pas repondre aux questions sur les jours passes ("quel CA hier ?",
--   "combien j'ai fait cette semaine ?"). Cause directe : le tool
--   obtenir_stats_bar n'expose AUCUN parametre et appelle
--   get_bar_daily_stats, filtre sur UNE business_date unique - celle du
--   jour en cours, calculee cote Edge Function.
--
--   Ce n'est pas un defaut de get_bar_daily_stats : c'est la consequence
--   du correctif de la veille (20260823100000), qui avait remplace
--   get_bar_admin_stats (cumul de TOUT l'historique, repondait "113 ventes"
--   a une question sur aujourd'hui) par un filtre sur la journee courante.
--   Le defaut "chiffre qui n'a rien a voir avec la question" a bien ete
--   corrige, mais la capacite de repondre sur le passe a disparu avec.
--
--   Le comportement observe est donc CORRECT au sens strict (Claude ne peut
--   pas inventer un chiffre, le prompt le lui interdit) - c'est la capacite
--   qui manque, pas la justesse.
--
-- IMPACT : aucune donnee modifiee. get_bar_daily_stats N'EST PAS touche et
--   reste utilise pour la journee en cours (cas le plus frequent, un seul
--   parametre, aucune ambiguite). get_bar_admin_stats n'est toujours pas
--   touche non plus (interdiction ferme du §6 : jamais de modification d'un
--   RPC partage avec l'app web).
--
-- SOLUTION : get_bar_period_stats(p_bar_id, p_start_date, p_end_date) -
--   memes 4 mesures que get_bar_daily_stats, agregees sur une PLAGE de
--   business_date au lieu d'un jour unique. Un seul appel RPC couvre
--   "hier", "cette semaine", "les 30 derniers jours" - contrairement a
--   l'alternative (un parametre de date unique sur le tool existant), qui
--   aurait exige 7 appels sequentiels pour une semaine, or la boucle de
--   tools est plafonnee a MAX_TOOL_ROUNDS = 4.
--
--   Corps repris a l'identique de get_bar_daily_stats (20260823100000),
--   seul le filtre de date change (= p_business_date devient BETWEEN
--   p_start_date AND p_end_date) : les memes questions doivent donner les
--   memes chiffres, une divergence de calcul entre les deux RPC serait
--   exactement le genre d'incoherence que le prompt analyste interdit.
--
--   business_date en parametres OBLIGATOIRES, jamais calculee ici (meme
--   regle absolue que get_bar_daily_stats/get_daily_scope_totals) :
--   l'heure de cloture (bars.closing_hour) differe par bar, un repli code
--   en dur produirait un chiffre faux silencieusement pour tout bar qui ne
--   ferme pas a 6h.
-- =====================================================

BEGIN;

-- --- Pre-vol ---
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bar_period_stats'
  ) INTO v_exists;
  RAISE NOTICE 'PRE-VOL: get_bar_period_stats existe deja ? % (attendu false).', v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'ECHEC: get_bar_period_stats existe deja - CREATE OR REPLACE perdrait les GRANTS.';
  END IF;
END $$;

CREATE FUNCTION public.get_bar_period_stats(
  p_bar_id UUID,
  p_start_date DATE,
  p_end_date DATE
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
  -- Meme guard que get_bar_daily_stats/get_bar_admin_stats/
  -- get_bar_server_performance - jamais de guard plus faible sur un
  -- nouveau RPC.
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

  -- Plage inversee = probablement une erreur d'appelant. Echouer plutot que
  -- retourner 0 partout, qui serait indistinguable d'une periode reellement
  -- sans vente - et donc un chiffre trompeur communique au promoteur.
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) posterieure a p_end_date (%)', p_start_date, p_end_date
      USING ERRCODE = '22007';
  END IF;

  RETURN QUERY
  SELECT
    -- total_products reste un cumul non date (etat actuel du catalogue) -
    -- identique a get_bar_daily_stats et get_bar_admin_stats. Il n'y a pas
    -- de notion de "produits actifs pendant une periode passee" qui aurait
    -- un sens ici.
    (SELECT COUNT(*)::bigint FROM public.bar_products
      WHERE bar_id = p_bar_id AND is_active = true) AS total_products,
    (SELECT COUNT(*)::bigint FROM public.sales
      WHERE bar_id = p_bar_id AND status = 'validated'
        AND business_date >= p_start_date AND business_date <= p_end_date) AS total_sales,
    (SELECT COALESCE(SUM(total), 0)::numeric FROM public.sales
      WHERE bar_id = p_bar_id AND status = 'validated'
        AND business_date >= p_start_date AND business_date <= p_end_date) AS total_revenue,
    (SELECT COUNT(*)::bigint FROM public.sales
      WHERE bar_id = p_bar_id AND status = 'pending'
        AND business_date >= p_start_date AND business_date <= p_end_date) AS pending_sales;
END;
$$;

COMMENT ON FUNCTION public.get_bar_period_stats(UUID, DATE, DATE) IS
'Statistiques du bar agregees sur une PLAGE de journees commerciales (bornes incluses, '
'business_date obligatoire des deux cotes, jamais calculee ici - heure de cloture propre a '
'chaque bar, meme regle que get_bar_daily_stats/get_daily_scope_totals). '
'Memes 4 mesures et meme corps que get_bar_daily_stats, seul le filtre de date differe : '
'les memes questions doivent donner les memes chiffres. '
'total_products reste un cumul non date (etat actuel du catalogue). '
'Ecrit pour le tool obtenir_stats_bar du mode analyste WhatsApp, qui ne savait repondre que '
'sur la journee en cours (constate en usage reel le 24/08/2026).';

REVOKE ALL ON FUNCTION public.get_bar_period_stats(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bar_period_stats(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_period_stats(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- --- Post-vol ---
DO $$
DECLARE
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_bar_period_stats(uuid,date,date)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.get_bar_period_stats(uuid,date,date)', 'EXECUTE') INTO v_auth_fn;

  RAISE NOTICE 'POST-VOL: get_bar_period_stats -- anon: % (attendu false), authenticated: % (attendu true)', v_anon_fn, v_auth_fn;

  IF v_anon_fn THEN
    RAISE EXCEPTION 'ECHEC: get_bar_period_stats accessible par anon.';
  END IF;
  IF NOT v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: authenticated ne peut pas executer get_bar_period_stats.';
  END IF;

  RAISE NOTICE 'OK get_bar_period_stats disponible, filtre par plage de business_date obligatoire.';
END $$;

COMMIT;
