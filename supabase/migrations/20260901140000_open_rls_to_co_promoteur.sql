-- ===================================================================
-- MIGRATION: Ouverture des RLS métier au rôle co_promoteur
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 4b/8 du chantier co-promoteur
-- ORDRE: 4b/8 — APRÈS 20260901130000 (policies restrictives)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ OBJET                                                           │
-- └─────────────────────────────────────────────────────────────────┘

-- Donner au rôle `co_promoteur` les mêmes droits RLS que `promoteur`, en
-- application des décisions du 01/09/2026 :
--   n°2 accès financier COMPLET (compta SYSCOHADA, Z de caisse, capital)
--   n°3 salaires INCLUS
--   + `canCancelSales` (annuler une vente validée — motif d'urgence n°1)
--   + ajustements de stock (casse, écart d'inventaire en l'absence du promoteur)
--
-- ⭐ RELEVÉ EN PROD le 01/09/2026 (pg_policies, pas les fichiers) :
--    **52** policies mentionnent 'promoteur' hors bar_members,
--    dont **48 à modifier** (52 moins les 4 exclues ci-dessous),
--    réparties sur 17 tables.
--
--    ⚠️ ERREUR DE MÉTHODE CORRIGÉE : un premier relevé annonçait 50/46. Il
--    comptait les LIGNES AFFICHÉES par le SQL Editor, qui tronque son retour.
--    Le pré-vol, lui, fait un `count(*)` — d'où l'écart. Le contrôle a joué son
--    rôle : il a arrêté avant l'écriture. **Pour un décompte, toujours count(*),
--    jamais un comptage visuel de lignes.**
--    Les 2 policies manquantes sont de catégorie B (`Managers can…` en
--    `IN ('promoteur','gerant')`) : ajout mécanique, aucune décision produit
--    nouvelle, aucune table inattendue.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ MÉTHODE — réécriture générique, PAS 48 policies à la main       │
-- └─────────────────────────────────────────────────────────────────┘

-- Réécrire 48 policies à la main serait long et propice à l'erreur (une
-- expression recopiée de travers = une faille silencieuse). On procède par
-- substitution TEXTUELLE sur l'expression RÉELLE lue dans `pg_policy` :
--
--   `get_user_role(X) = 'promoteur'`        → `... = ANY (ARRAY['promoteur','co_promoteur'])`
--   `ARRAY['promoteur','gerant']`           → `ARRAY['promoteur','co_promoteur','gerant']`
--   `role = 'promoteur'` (sous-requêtes)    → `role = ANY (ARRAY['promoteur','co_promoteur'])`
--   `ARRAY['promoteur','super_admin']`      → `ARRAY['promoteur','co_promoteur','super_admin']`
--   `ARRAY['gerant','promoteur','super_admin']` → idem avec co_promoteur
--
-- ⭐ GARANTIE : le reste de chaque expression est CONSERVÉ À L'IDENTIQUE —
--    notamment `check_bar_has_feature(bar_id,'accounting')` (décision n°4 :
--    le co-promoteur ne contourne PAS le gating par plan), `is_super_admin()`,
--    `created_by = auth.uid()`, les clauses `status = 'validated'`, etc.
--
-- ⭐ VÉRIFICATION INTÉGRÉE : chaque policy réécrite est recontrôlée après
--    coup ; si son expression ne contient pas 'co_promoteur', la migration
--    ÉCHOUE (RAISE EXCEPTION) et la transaction est annulée en entier.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⛔ LES 4 POLICIES VOLONTAIREMENT EXCLUES                         │
-- └─────────────────────────────────────────────────────────────────┘

--  1. `bars | INSERT | Promoteurs can create bars`
--     → `canCreateBars: false` (décision n°1). La création de bars reste au
--       SuperAdmin. Le patrimoine n'est pas l'exploitation.
--
--  2. `users | INSERT | Admins can create users`
--     → utilise `is_promoteur_or_admin()`, la fonction SANS filtre bar_id dont
--       un usage a déjà été retiré pour faille d'isolation (20260901110000).
--       L'ouvrir étendrait une faille connue. **À auditer séparément.**
--
--  3. `bar_events | ALL | Admins can manage events for their bars`
--  4. `promotions | ALL | Admins can manage promotions for their bars`
--     → motif LEGACY `role IN ('admin','owner','promoteur')` : les rôles
--       `admin` et `owner` n'existent plus dans le système. Pour `promotions`,
--       les 3 policies « Managers can… » (modifiées ici) couvrent déjà le
--       besoin. Pas de nettoyage opportuniste au milieu d'un chantier.
--       ⚠ `bar_events` reste donc FERMÉE au co-promoteur — à traiter dans une
--         passe dédiée si le besoin apparaît.

-- IMPACT: aucune donnée. Aucun co_promoteur n'existe encore → effet nul jusqu'à
--   la première nomination (après l'étape 8).
-- BREAKING_CHANGE: NO — strictement additif : chaque expression gagne une
--   valeur de rôle, aucune n'en perd. Les droits existants sont INCHANGÉS.

-- ROLLBACK_STRATEGY:
--   Symétrique — rejouer la même boucle en remplaçant
--   `ARRAY['promoteur'::text, 'co_promoteur'::text]` par `'promoteur'::text`, etc.
--   ⚠ PLUS SIMPLE ET PLUS SÛR : restaurer depuis l'archive du pré-vol 2, qui
--     capture les 48 expressions AVANT modification. **Ne pas sauter ce pré-vol.**

-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune
-- RLS_CHANGES: 48 policies réécrites (expressions élargies, aucune supprimée)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Décompte de référence (à comparer au post-vol) :
--
--    SELECT count(*) AS policies_avec_promoteur
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename <> 'bar_members'
--      AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%promoteur%';
--    -- ATTENDU : 52
--
-- 2) ⭐ ARCHIVE DE ROLLBACK — capturer les expressions AVANT (NE PAS SAUTER) :
--
--    SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename <> 'bar_members'
--      AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%promoteur%'
--    ORDER BY tablename, policyname;
--    -- Sauvegarder ce résultat hors de la base (fichier local).
--
-- 3) Aucune policy ne connaît encore co_promoteur :
--
--    SELECT count(*) FROM pg_policies
--    WHERE schemaname='public'
--      AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%co_promoteur%';
--    -- ATTENDU : 3 (les restrictives de l'étape 4a sur bar_members, exclues ici)

BEGIN;

DO $$
DECLARE
  r            RECORD;
  v_qual       TEXT;
  v_check      TEXT;
  v_sql        TEXT;
  v_modifiees  INT := 0;
  v_verif      TEXT;
  v_comment    TEXT;

  -- ⛔ Liste d'exclusion — voir le bloc « 4 POLICIES EXCLUES » ci-dessus.
  c_exclues CONSTANT TEXT[] := ARRAY[
    'bars|Promoteurs can create bars',
    'users|Admins can create users',
    'bar_events|Admins can manage events for their bars',
    'promotions|Admins can manage promotions for their bars'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename <> 'bar_members'          -- traitée à l'étape 4a
      AND (COALESCE(qual,'') || COALESCE(with_check,'')) ILIKE '%promoteur%'
      AND (COALESCE(qual,'') || COALESCE(with_check,'')) NOT ILIKE '%co_promoteur%'
      AND (tablename || '|' || policyname) <> ALL (c_exclues)
    ORDER BY tablename, policyname
  LOOP
    v_qual  := r.qual;
    v_check := r.with_check;

    -- Substitutions appliquees aux DEUX clauses via une fonction locale
    -- (repetition assumee : 2 blocs identiques valent mieux qu'une boucle
    --  FOREACH avec DECLARE imbrique, fragile en PL/pgSQL).
    -- Ordre important : motifs ARRAY d'abord (plus specifiques), sinon la
    -- regle « = 'promoteur' » toucherait l'interieur des ARRAY.

    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual, '''promoteur''::text, ''gerant''::text',
                                '''promoteur''::text, ''co_promoteur''::text, ''gerant''::text');
      v_qual := replace(v_qual, '''gerant''::text, ''promoteur''::text',
                                '''gerant''::text, ''promoteur''::text, ''co_promoteur''::text');
      v_qual := replace(v_qual, '''promoteur''::text, ''super_admin''::text',
                                '''promoteur''::text, ''co_promoteur''::text, ''super_admin''::text');
      v_qual := replace(v_qual, 'get_user_role(bar_id) = ''promoteur''::text',
                                'get_user_role(bar_id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_qual := replace(v_qual, 'get_user_role(id) = ''promoteur''::text',
                                'get_user_role(id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_qual := replace(v_qual, 'get_user_role(po.bar_id) = ''promoteur''::text',
                                'get_user_role(po.bar_id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_qual := replace(v_qual, 'bar_members.role = ''promoteur''::text',
                                'bar_members.role = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_qual := replace(v_qual, 'bm.role = ''promoteur''::text',
                                'bm.role = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, '''promoteur''::text, ''gerant''::text',
                                  '''promoteur''::text, ''co_promoteur''::text, ''gerant''::text');
      v_check := replace(v_check, '''gerant''::text, ''promoteur''::text',
                                  '''gerant''::text, ''promoteur''::text, ''co_promoteur''::text');
      v_check := replace(v_check, '''promoteur''::text, ''super_admin''::text',
                                  '''promoteur''::text, ''co_promoteur''::text, ''super_admin''::text');
      v_check := replace(v_check, 'get_user_role(bar_id) = ''promoteur''::text',
                                  'get_user_role(bar_id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_check := replace(v_check, 'get_user_role(id) = ''promoteur''::text',
                                  'get_user_role(id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_check := replace(v_check, 'get_user_role(po.bar_id) = ''promoteur''::text',
                                  'get_user_role(po.bar_id) = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_check := replace(v_check, 'bar_members.role = ''promoteur''::text',
                                  'bar_members.role = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
      v_check := replace(v_check, 'bm.role = ''promoteur''::text',
                                  'bm.role = ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])');
    END IF;

    -- 🛡️ GARDE RENFORCEE (skill code-review, 01/09/2026) — F1.
    --
    --   Tester « l'expression contient co_promoteur » etait INSUFFISANT : une
    --   clause portant PLUSIEURS predicats de role de formes differentes
    --   passait des qu'UN SEUL etait elargi, les autres restant silencieusement
    --   fermes au co-promoteur. Le controle post-creation et les requetes de
    --   post-vol utilisaient le meme test : aucun ne pouvait le detecter.
    --
    --   On verifie donc qu'il ne subsiste AUCUNE mention de 'promoteur' NON
    --   suivie de 'co_promoteur' : on neutralise d'abord toutes les occurrences
    --   de 'co_promoteur' dans une copie, puis on cherche un 'promoteur'
    --   residuel. S'il en reste un, un predicat a echappe aux substitutions.
    --   ⚠️ CORRIGE (faux positif rencontre a l'execution) : neutraliser
    --   '''co_promoteur''::text' NE SUFFIT PAS — '''promoteur''::text' en est une
    --   SOUS-CHAINE, donc le couple legitime
    --   ARRAY['promoteur'::text, 'co_promoteur'::text] laissait un residu et
    --   declenchait la garde a tort. On neutralise donc d'abord les COUPLES
    --   valides (les 5 formes produites par les substitutions), puis on cherche
    --   un 'promoteur' vraiment orphelin.
    IF replace(replace(replace(replace(replace(
         COALESCE(v_qual,'') || ' ' || COALESCE(v_check,''),
         '''promoteur''::text, ''co_promoteur''::text, ''gerant''::text', '@@OK@@'),
         '''gerant''::text, ''promoteur''::text, ''co_promoteur''::text', '@@OK@@'),
         '''promoteur''::text, ''co_promoteur''::text, ''super_admin''::text', '@@OK@@'),
         'ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])', '@@OK@@'),
         '''co_promoteur''::text', '@@OK@@') ILIKE '%''promoteur''::text%'
    THEN
      RAISE EXCEPTION
        'Predicat de role NON elargi sur %.% — il subsiste un ''promoteur'' sans '
        '''co_promoteur''. AVANT : % | %. APRES : % | %. '
        'Migration interrompue : traiter cette policy a la main.',
        r.tablename, r.policyname,
        COALESCE(r.qual,'(null)'), COALESCE(r.with_check,'(null)'),
        COALESCE(v_qual,'(null)'), COALESCE(v_check,'(null)');
    END IF;

    -- 🛡️ F4 (skill code-review) — un DROP/CREATE PERD le COMMENT ON POLICY.
    --   Le depot en compte 16, dont 2 dans ce perimetre (sur public.sales).
    --   On le capture AVANT le DROP pour le restaurer apres le CREATE.
    SELECT obj_description(pol.oid, 'pg_policy') INTO v_comment
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = r.tablename
      AND c.relnamespace = 'public'::regnamespace
      AND pol.polname = r.policyname;

    -- Recréation : DROP puis CREATE avec l'expression élargie.
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    -- 🛡️ F3 (skill code-review) — les noms de role passaient en %s (brut).
    --   Un role exigeant des guillemets aurait fait echouer le CREATE APRES
    --   que le DROP soit deja passe. Sans danger avec les roles Supabase
    --   actuels (minuscules), mais on n'en depend plus : quote_ident sur
    --   chacun. 'public' est un mot-cle SQL et ne doit PAS etre quote.
    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    r.policyname, r.tablename,
                    r.permissive,                       -- PERMISSIVE / RESTRICTIVE
                    CASE r.cmd WHEN 'ALL' THEN 'ALL' ELSE r.cmd END,
                    (SELECT string_agg(
                              CASE WHEN x = 'public' THEN 'public' ELSE quote_ident(x) END,
                              ', ')
                     FROM unnest(r.roles) AS x));

    IF v_qual  IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual);  END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;

    EXECUTE v_sql;

    -- Restauration du commentaire (F4).
    IF v_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
                     r.policyname, r.tablename, v_comment);
    END IF;

    v_modifiees := v_modifiees + 1;

    -- Contrôle immédiat : la policy recréée connaît-elle bien le rôle ?
    SELECT COALESCE(qual,'') || COALESCE(with_check,'') INTO v_verif
    FROM pg_policies
    WHERE schemaname='public' AND tablename=r.tablename AND policyname=r.policyname;

    IF replace(replace(replace(replace(replace(v_verif,
         '''promoteur''::text, ''co_promoteur''::text, ''gerant''::text', '@@OK@@'),
         '''gerant''::text, ''promoteur''::text, ''co_promoteur''::text', '@@OK@@'),
         '''promoteur''::text, ''co_promoteur''::text, ''super_admin''::text', '@@OK@@'),
         'ANY (ARRAY[''promoteur''::text, ''co_promoteur''::text])', '@@OK@@'),
         '''co_promoteur''::text', '@@OK@@') ILIKE '%''promoteur''::text%' THEN
      RAISE EXCEPTION
        'Policy %.% recreee avec un ''promoteur'' residuel non elargi : %. '
        'Migration interrompue.', r.tablename, r.policyname, v_verif;
    END IF;
  END LOOP;

  RAISE NOTICE '[4b] % policies élargies au rôle co_promoteur', v_modifiees;

  -- 🛡️ F2 (skill code-review) — IDEMPOTENCE.
  --   La boucle exclut les policies contenant deja 'co_promoteur' : un 2e
  --   passage en selectionne 0. Sans ce cas particulier, l'assertion aurait
  --   annonce une « divergence » alors que la base est dans l'etat VOULU.
  IF v_modifiees = 0 THEN
    RAISE NOTICE '[4b] Aucune policy a modifier — migration DEJA APPLIQUEE (idempotent).';
  ELSIF v_modifiees <> 48 THEN
    RAISE EXCEPTION
      'ATTENDU 48 policies modifiees, % traitees. L''etat de la base diverge du '
      'releve du 01/09/2026 — migration interrompue, refaire le releve.', v_modifiees;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) 48 policies connaissent le rôle (hors bar_members) :
--
--    SELECT count(*) AS avec_co_promoteur
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename <> 'bar_members'
--      AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%co_promoteur%';
--    -- ATTENDU : 48
--
-- 2) ⛔ Les 4 exclusions sont RESTÉES fermées :
--
--    SELECT tablename, policyname,
--           (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%co_promoteur%' AS ouverte
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND (tablename||'|'||policyname) IN (
--            'bars|Promoteurs can create bars',
--            'users|Admins can create users',
--            'bar_events|Admins can manage events for their bars',
--            'promotions|Admins can manage promotions for their bars');
--    -- ATTENDU : 4 lignes, TOUTES `ouverte = false`
--    -- ⛔ Si l'une est true : le co-promoteur a reçu un droit non voulu.
--
-- 3) ⭐ Le gating par plan est INTACT (le co-promoteur ne contourne pas le plan) :
--
--    SELECT count(*) AS policies_avec_gating
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%check_bar_has_feature%';
--    -- ATTENDU : le MÊME nombre qu'avant la migration (relevé du pré-vol 2).
--    -- Les substitutions n'ont touché QUE les motifs de rôle.
--
-- 4) ⭐ NON-RÉGRESSION — les droits existants sont préservés.
--    Vérifier qu'aucune policy n'a PERDU 'promoteur' ou 'gerant' :
--
--    SELECT count(*) FILTER (WHERE e ILIKE '%''promoteur''%')      AS avec_promoteur,
--           count(*) FILTER (WHERE e ILIKE '%''gerant''%')          AS avec_gerant
--    FROM (SELECT COALESCE(qual,'')||COALESCE(with_check,'') AS e
--          FROM pg_policies
--          WHERE schemaname='public' AND tablename <> 'bar_members') s;
--    -- ATTENDU : `avec_promoteur` = 52 (inchangé), `avec_gerant` ≥ valeur d'avant.
--    -- La migration est ADDITIVE : rien ne doit avoir disparu.
--
-- 5) Test fonctionnel depuis l'UI (à faire, même si le rôle n'existe pas encore) :
--      · promoteur → compta, salaires, dépenses, annulation de vente → OK
--      · gérant    → inventaire, ventes, approvisionnements          → OK
--      · serveur   → encaisse                                        → OK
--    Ces droits ne doivent PAS avoir changé.
--
-- ⚠ RAPPEL : le rôle reste inexploitable côté application — RPC métier
--    (étapes 5-7) et front (étape 8) ne le connaissent pas encore.
