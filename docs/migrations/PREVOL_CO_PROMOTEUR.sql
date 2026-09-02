-- =====================================================================
-- PRE-VOL CO-PROMOTEUR - SQL Editor Supabase
-- Date : 01/09/2026
-- LECTURE SEULE - aucune ecriture, executable en plein service
-- =====================================================================
--
-- ⚠️ Le SQL Editor n'affiche que le resultat de la DERNIERE requete quand
-- on execute plusieurs instructions d'un coup. Ce script est donc decoupe
-- en DEUX blocs a executer separement :
--
--   BLOC 1 : tout l'inventaire en UNE requete (UNION ALL) -> un seul tableau
--   BLOC 2 : les definitions de fonctions (trop volumineuses pour le tableau)
--
-- Selectionner un bloc, Ctrl+Entree, copier le resultat. Deux fois.
-- =====================================================================


-- =====================================================================
-- ############ BLOC 1 - selectionner d'ici jusqu'a "FIN BLOC 1" ############
-- =====================================================================
-- Colonnes : verif = quelle verification / objet / detail
-- Trier mentalement par `verif` : chaque section est autonome.

-- (1) CONTRAINTES CHECK mentionnant un role
--     ENJEU : les CHECK de `users` et `user_onboarding` n'ont jamais ete mis
--     a jour pour 'cuisinier' dans les fichiers. S'ils sont actifs et sans
--     'cuisinier', ils bloqueront aussi 'co_promoteur'.
--     A SURVEILLER AUSSI : wa_bar_links.role_snapshot (promoteur/gerant/serveur)
SELECT
  '1-CHECK'                                   AS verif,
  conrelid::regclass::text                    AS objet,
  conname || ' :: ' || pg_get_constraintdef(oid) AS detail
FROM pg_constraint
WHERE contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%promoteur%'

UNION ALL

-- (2) DOUBLONS bar_members - risque get_user_role() LIMIT 1 sans ORDER BY
--     ATTENDU : AUCUNE ligne '2-DOUBLON'. Si une ligne apparait, NE PAS migrer
--     avant resolution (le role retourne serait non deterministe).
SELECT
  '2-DOUBLON'                                 AS verif,
  bar_id::text                                AS objet,
  'user=' || user_id::text || ' nb=' || COUNT(*)::text
    || ' roles=' || array_agg(role)::text     AS detail
FROM public.bar_members
WHERE is_active = true
GROUP BY bar_id, user_id
HAVING COUNT(*) > 1

UNION ALL

-- (3) INDEX UNIQUES sur bar_members
--     ATTENDU : idx_unique_bar_member_user et/ou idx_bar_members_bar_user_unique,
--     avec WHERE user_id IS NOT NULL et SANS is_active. C'est ce qui justifie
--     "promouvoir = UPDATE, jamais INSERT".
SELECT
  '3-INDEX'                                   AS verif,
  indexname                                   AS objet,
  indexdef                                    AS detail
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'bar_members'
  AND indexdef ILIKE '%unique%'

UNION ALL

-- (4) ROLES REELLEMENT PRESENTS en base
--     ATTENDU : super_admin, promoteur, gerant, serveur (+ cuisinier si des
--     bars restauration tournent). Tout role inattendu = a investiguer.
SELECT
  '4-ROLES'                                   AS verif,
  role                                        AS objet,
  'total=' || COUNT(*)::text
    || ' actifs=' || COUNT(*) FILTER (WHERE is_active)::text AS detail
FROM public.bar_members
GROUP BY role

UNION ALL

-- (5) WHITELISTS LITTERALES DE ROLES dans les fonctions en PROD
--     C'est le defaut BLOQUANT n°2 : ces RPC echouent FERME sur tout role
--     non liste. Source de verite superieure au grep sur les fichiers.
--     'ECHEC-FERME' = a traiter obligatoirement, sinon le co-promoteur est
--     rejete (dont create_sale : il ne pourrait pas encaisser).
SELECT
  '5-RPC'                                     AS verif,
  p.proname                                   AS objet,
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%NOT IN (%promoteur%'
      THEN 'ECHEC-FERME (whitelist) -> A TRAITER'
    WHEN pg_get_functiondef(p.oid) ILIKE '%role IN (%promoteur%'
      THEN 'filtre role IN -> a examiner'
    ELSE 'mention simple -> a verifier'
  END                                         AS detail
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND pg_get_functiondef(p.oid) ILIKE '%promoteur%'

UNION ALL

-- (6) POLICIES RLS mentionnant un role
--     Verifie l'affirmation corrigee du plan §3.1 : l'acces passe par une
--     disjonction is_bar_member OR owner OR super_admin, et is_bar_member
--     ne filtre pas par role.
SELECT
  '6-RLS'                                     AS verif,
  tablename || ' / ' || policyname            AS objet,
  cmd || ' :: ' || left(COALESCE(qual,'') || ' | WC:' || COALESCE(with_check,''), 300) AS detail
FROM pg_policies
WHERE schemaname = 'public'
  AND (COALESCE(qual,'') || COALESCE(with_check,'')) ILIKE '%promoteur%'

ORDER BY 1, 2;

-- ############ FIN BLOC 1 ############


-- =====================================================================
-- ############ BLOC 2 - selectionner d'ici jusqu'a la fin ############
-- =====================================================================
-- Definitions completes des 3 fonctions cles. Volumineux : c'est pourquoi
-- elles sont isolees du tableau precedent.
--
-- A LIRE :
--   * resolve_wa_bar_link  -> la clause "AND bm.role IN (...)" : etat REEL de
--     l'allowlist du bot (20260822090001 a retire super_admin ensuite).
--   * get_user_role        -> confirmer le LIMIT 1 sans ORDER BY.
--   * is_bar_member        -> confirmer qu'elle ne filtre PAS par role
--     (c'est ce qui fait heriter le co-promoteur de l'acces aux 20 RPC).

SELECT
  p.proname AS fonction,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('resolve_wa_bar_link', 'get_user_role', 'is_bar_member')
ORDER BY p.proname;

-- ############ FIN BLOC 2 ############
