-- ===================================================================
-- 🛡️ CORRECTIF DE SÉCURITÉ — isolation multi-tenant sur bar_members (INSERT)
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- SÉVÉRITÉ: ÉLEVÉE — franchissement de frontière entre clients
-- ORIGINE: découvert lors de la préparation de l'étape 4 du chantier
--          co-promoteur. SANS RAPPORT avec ce chantier : faille préexistante
--          depuis 002_rls_policies.sql.
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LA FAILLE                                                       │
-- └─────────────────────────────────────────────────────────────────┘

-- La policy INSERT « Promoteurs can add bar members » sur public.bar_members
-- porte, EN PRODUCTION (relevé le 01/09/2026 via pg_policies) :
--
--   WITH CHECK (is_super_admin() OR is_promoteur_or_admin())
--
-- Or `is_promoteur_or_admin()` (relevé via pg_get_functiondef) NE FILTRE PAS
-- par bar_id :
--
--   SELECT EXISTS (SELECT 1 FROM bar_members
--                  WHERE user_id = auth.uid()
--                    AND role IN ('super_admin','promoteur')
--                    AND is_active = true);
--
-- Elle répond « cet utilisateur est-il promoteur QUELQUE PART », pas « sur CE
-- bar ». Aucune des deux expressions ne référence `bar_id`.
--
-- ⚠️ Les policies PostgreSQL sont PERMISSIVES par défaut : elles se combinent
--    par OR. Cette policy suffit donc À ELLE SEULE à autoriser l'INSERT.
--
-- IMPACT RÉEL :
--   N'importe lequel des promoteurs actifs peut, par un INSERT direct via
--   l'API REST (PostgREST), s'ajouter comme membre — DE N'IMPORTE QUEL RÔLE —
--   dans N'IMPORTE QUEL bar, y compris ceux d'un autre promoteur. Il accède
--   ensuite aux ventes, stocks et comptabilité de ce bar.
--   `authenticated` possède bien INSERT sur la table (vérifié le 01/09/2026 :
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE) — les RLS
--   sont donc la SEULE barrière.
--
-- MISE EN PERSPECTIVE (sans dramatiser) : exige un appel API délibéré, hors
--   interface. Aucun indice d'exploitation. Le risque est celui d'un compte
--   compromis ou d'un promoteur curieux, pas d'une attaque en cours.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POURQUOI LE CORRECTIF EST SANS RISQUE                           │
-- └─────────────────────────────────────────────────────────────────┘

-- 1. AUCUN flux applicatif ne dépend de cette policy. Balayage exhaustif des
--    17 accès `from('bar_members')` du front (01/09/2026) : **zéro INSERT
--    direct**. Les seules écritures directes sont deux UPDATE de `is_active`
--    (auth.service.ts:1031 deactivateMember / 1051 activateMember) — elles
--    passent par `bar_members_update_policy`, pas par celle-ci.
--    Tous les ajouts de membres transitent par des RPC SECURITY DEFINER
--    (add_bar_member_v2, add_bar_member_existing, setup_promoter_bar,
--    add_co_promoteur) qui CONTOURNENT les RLS par construction.
--
-- 2. La policy « Managers can add members » (INSERT) COEXISTE et couvre déjà
--    le besoin légitime, elle AVEC le filtre bar_id :
--      WITH CHECK (is_super_admin()
--                  OR get_user_role(bar_id) IN ('promoteur','gerant')
--                  OR is_impersonating())
--    Le chemin légitime reste donc ouvert après ce correctif.
--
--    ⚠️ TROUVÉ EN REVUE (01/09/2026) : cette policy conservée porte elle-même
--       une faille, via sa branche `OR is_impersonating()`. Cette fonction lit
--       `user_metadata.impersonation`, MODIFIABLE PAR L'UTILISATEUR — n'importe
--       quel compte pouvait s'auto-attribuer le privilège.
--       → Traité par la migration **20260901120000_neutralize_is_impersonating**,
--         à appliquer DANS LA FOULÉE de celle-ci. Le filtre bar_id ajouté ici ne
--         suffit pas seul : les deux correctifs vont ensemble.
--
-- → On SUPPRIME la policy défaillante plutôt que de la réécrire : elle est
--   entièrement redondante avec « Managers can add members », en moins sûr.
--   Moins de surface = moins à maintenir.

-- BREAKING_CHANGE: NO (aucun appelant identifié — cf. point 1)
-- ⚠ Si un flux inconnu s'appuyait dessus, il recevrait désormais une erreur RLS
--   à l'INSERT. Le rollback ci-dessous le rétablit en une commande.

-- ROLLBACK_STRATEGY:
--   CREATE POLICY "Promoteurs can add bar members"
--     ON public.bar_members FOR INSERT
--     WITH CHECK (is_super_admin() OR is_promoteur_or_admin());
--   ⚠ Rétablit la faille. N'utiliser qu'en cas de régression avérée, et
--     corriger alors par ajout du filtre bar_id plutôt qu'en restaurant tel quel.

-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune
-- RLS_CHANGES: DROP de la policy INSERT « Promoteurs can add bar members »

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les DEUX policies INSERT sont bien présentes (on en supprime UNE) :
--
--    SELECT policyname, cmd, with_check
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='bar_members' AND cmd='INSERT';
--    -- ATTENDU : 2 lignes — « Managers can add members » (avec bar_id)
--    --           et « Promoteurs can add bar members » (SANS bar_id)
--    -- ⛔ Si « Managers can add members » est ABSENTE : NE PAS EXÉCUTER,
--    --    on supprimerait le seul chemin d'INSERT légitime.
--
-- 2) Aucun membre suspect déjà inséré par cette voie — un promoteur membre
--    d'un bar dont il n'est ni propriétaire ni promoteur déclaré :
--
--    SELECT bm.user_id, bm.bar_id, bm.role, bm.joined_at, b.name AS bar
--    FROM public.bar_members bm
--    JOIN public.bars b ON b.id = bm.bar_id
--    WHERE bm.is_active = true
--      AND bm.user_id IN (SELECT user_id FROM public.bar_members
--                         WHERE role = 'promoteur' AND is_active = true)
--      AND b.owner_id <> bm.user_id
--    ORDER BY bm.joined_at DESC;
--    -- ⚠ Des lignes ici ne sont PAS forcément une intrusion : un promoteur
--    --   peut légitimement être gérant d'un autre bar. Vérifier les cas
--    --   inattendus avec le promoteur concerné avant de conclure.

BEGIN;

-- 🛡️ Garde : ne jamais supprimer le dernier chemin d'INSERT légitime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bar_members'
      AND policyname = 'Managers can add members'
      AND cmd        = 'INSERT'
  ) THEN
    RAISE EXCEPTION
      'Policy « Managers can add members » absente — supprimer l''autre policy '
      'INSERT retirerait le seul chemin légitime. Migration interrompue.';
  END IF;
END $$;

-- Suppression de la policy défaillante.
--   Redondante avec « Managers can add members », mais SANS filtre bar_id :
--   c'est exactement la faille d'isolation. Rien ne la rattrape puisque les
--   policies permissives se combinent par OR.
DROP POLICY IF EXISTS "Promoteurs can add bar members" ON public.bar_members;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Il ne reste qu'UNE policy INSERT, et elle filtre bien par bar_id :
--
--    SELECT policyname, with_check
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='bar_members' AND cmd='INSERT';
--    -- ATTENDU : 1 seule ligne — « Managers can add members »
--    --           with_check CONTENANT « get_user_role(bar_id) »
--
-- 2) Plus aucune policy d'écriture ne s'appuie sur is_promoteur_or_admin()
--    pour bar_members :
--
--    SELECT policyname, cmd
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='bar_members'
--      AND COALESCE(qual,'')||COALESCE(with_check,'') ILIKE '%is_promoteur_or_admin%';
--    -- ATTENDU : 0 ligne
--
-- 3) ⭐ NON-RÉGRESSION — l'ajout de membre fonctionne toujours.
--    Depuis l'UI (pas le SQL Editor : auth.uid() y est NULL) :
--      · promoteur → ajoute un gérant  → doit RÉUSSIR
--      · promoteur → ajoute un serveur → doit RÉUSSIR
--      · gérant    → ajoute un serveur → doit RÉUSSIR
--    Ces flux passent par add_bar_member_v2 (SECURITY DEFINER, hors RLS) :
--    ils ne devraient PAS être affectés. Le test confirme l'analyse.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⚠️ CE QUE CE CORRECTIF NE RÈGLE **PAS**                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- `is_promoteur_or_admin()` reste défaillante (pas de filtre bar_id). Elle
-- n'est plus utilisée par aucune policy d'écriture sur bar_members après cette
-- migration, mais elle subsiste ailleurs :
--   · « bars / Promoteurs can create bars » (INSERT) — sans objet, la création
--     de bars est réservée au SuperAdmin par le flux applicatif ;
--   · « users / Admins can create users » (INSERT) — À AUDITER : un promoteur
--     peut-il créer un utilisateur arbitraire ? Hors périmètre ici.
--
-- → Auditer ces deux usages dans une passe dédiée. Ne PAS corriger la fonction
--   elle-même sans ce recensement : d'autres appelants pourraient en dépendre.
--
-- Voir aussi la mémoire `project_is_super_admin_fragile` : `is_super_admin()`
-- souffre d'un défaut de la même famille (LIMIT 1 sans ORDER BY ni filtre),
-- hérité des mêmes migrations d'origine.
