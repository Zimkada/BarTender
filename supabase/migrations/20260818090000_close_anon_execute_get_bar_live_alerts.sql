-- MIGRATION : Fermer l'accès anon sur get_bar_live_alerts (ACL par défaut)
-- DATE: 2026-08-18
-- AUTHOR: BarTender
--
-- PROBLEM: get_bar_live_alerts(p_bar_id) n'a jamais eu de GRANT/REVOKE explicite
--          depuis sa création (20251215170000_fixup_and_finalize_stats_objects.sql).
--          Elle n'a pas non plus été couverte par les vagues de durcissement
--          4a-4e (20260703...) qui ont corrigé le même motif sur cancel_sale et
--          pay_ticket. Trouvé en contre-certification de l'étude agent WhatsApp
--          analyste (whatsapp-agent/ETUDE_AGENT_ANALYSTE.md, 2026-07-28).
-- IMPACT:  proacl = NULL en base → EXECUTE hérité de l'ACL par défaut Postgres,
--          qui accorde le privilège à PUBLIC (donc à anon, sans authentification).
--          Confirmé par diagnostic en prod le 2026-07-28 :
--            anon_can_execute = true, authenticated_can_execute = true.
--          N'importe qui pouvait appeler get_bar_live_alerts(bar_id) pour
--          N'IMPORTE QUEL bar_id et obtenir son nombre de produits en stock bas,
--          sans être membre du bar ni même authentifié.
-- SOLUTION: REVOKE PUBLIC + anon, GRANT authenticated uniquement (la RLS de
--           bar_products fait ensuite le filtrage par bar pour ce rôle, via
--           is_bar_member(bar_id) OR is_super_admin() — 024_fix_all_permissions).
--           service_role NON grantée : cette fonction n'a aucun guard interne,
--           un appel serveur sans session bypasserait la RLS et fuirait tout
--           bar_id — voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md avant d'y
--           toucher pour un usage service_role futur.
--
-- BREAKING_CHANGE: NO — seul consommateur applicatif identifié :
--   src/components/BarStatsModal.tsx:60 (supabase.rpc('get_bar_live_alerts', ...)),
--   toujours appelé en session authenticated côté client. Non affecté par ce
--   REVOKE puisque authenticated garde EXECUTE.
-- TABLES_MODIFIED: aucune (grants sur fonction uniquement)
-- RLS_CHANGES: aucun (la RLS de bar_products existante n'est pas modifiée,
--   elle redevient simplement le seul filtre actif, comme prévu à l'origine)
-- À EXÉCUTER À LA MAIN dans le SQL Editor.
--
-- ============ PRÉ-VOL (exécuter seul AVANT, vérifier les résultats) ============
-- Confirmer l'état de la faille avant correction (anon_can_execute attendu true) :
--   SELECT
--     p.proacl,
--     has_function_privilege('anon', 'public.get_bar_live_alerts(uuid)', 'EXECUTE') AS anon_can_execute,
--     has_function_privilege('authenticated', 'public.get_bar_live_alerts(uuid)', 'EXECUTE') AS authenticated_can_execute
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'get_bar_live_alerts';
-- ==============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.get_bar_live_alerts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bar_live_alerts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bar_live_alerts(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_bar_live_alerts(uuid) IS
'Retourne le nombre en temps réel de produits dont le stock est bas pour un bar spécifique.
Accès anon fermé le 2026-08-18 (même motif que cancel_sale/pay_ticket, vague4a) :
ACL par défaut Postgres accordait EXECUTE à PUBLIC en l''absence de GRANT explicite.
Protection résiduelle = RLS de bar_products (is_bar_member OR is_super_admin), donc
SANS grant service_role : un appel serveur sans session échouerait silencieusement
(RLS bypass service_role) et retournerait une fuite, pas une erreur — voir étude
whatsapp-agent/ETUDE_AGENT_ANALYSTE.md avant d''envisager un accès service_role ici.';

-- Vérification intra-transaction : échoue et annule automatiquement le COMMIT
-- si le résultat n'est pas celui attendu, plutôt que de découvrir le problème
-- seulement au post-vol séparé.
DO $$
DECLARE
  v_anon_execute BOOLEAN;
  v_auth_execute BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_bar_live_alerts(uuid)', 'EXECUTE')
    INTO v_anon_execute;
  SELECT has_function_privilege('authenticated', 'public.get_bar_live_alerts(uuid)', 'EXECUTE')
    INTO v_auth_execute;

  RAISE NOTICE 'anon EXECUTE: % (attendu: false)', v_anon_execute;
  RAISE NOTICE 'authenticated EXECUTE: % (attendu: true)', v_auth_execute;

  IF v_anon_execute THEN
    RAISE EXCEPTION 'ÉCHEC: anon peut toujours exécuter get_bar_live_alerts après REVOKE';
  END IF;
  IF NOT v_auth_execute THEN
    RAISE EXCEPTION 'ÉCHEC: authenticated ne peut plus exécuter get_bar_live_alerts (régression BarStatsModal.tsx)';
  END IF;

  RAISE NOTICE '✅ Correctif appliqué : anon bloqué, authenticated fonctionnel.';
END $$;

COMMIT;

-- ============ POST-VOL (exécuter APRÈS, vérifier chaque résultat) =============
-- SELECT
--   has_function_privilege('anon', 'public.get_bar_live_alerts(uuid)', 'EXECUTE') AS anon_blocked,          -- false attendu
--   has_function_privilege('authenticated', 'public.get_bar_live_alerts(uuid)', 'EXECUTE') AS auth_ok;      -- true attendu
--
-- Smoke-test applicatif : ouvrir BarStatsModal (page admin, détail d'un bar) connecté
-- en tant qu'utilisateur authentifié → les alertes stock bas doivent toujours s'afficher.
-- ==============================================================================
