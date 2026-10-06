-- ===================================================================
-- MIGRATION: comptoirs - comptoir auto des NOUVEAUX bars + affectation auto
-- DATE: 2026-10-04
-- AUTHOR: AI Assistant
-- ===================================================================

-- PROBLEME - trou ouvert par l'etape 1, EXISTANT EN PROD DEPUIS AUJOURD'HUI.
--
--   L'etape 1 (socle) a affecte les 47 membres actifs au comptoir primaire de
--   leur bar. Mais elle n'a mis en place AUCUN mecanisme pour les suivants :
--   tout membre ajoute APRES cette migration arrive SANS affectation.
--
--   Consequence immediate : `get_my_counters()` lui renvoie 0 ligne. Des que
--   le front affichera le selecteur de comptoir (etape 2), ce membre n'aura
--   AUCUN comptoir selectionnable - donc aucune vente possible. Et aucun
--   message d'erreur : juste un selecteur vide.
--
--   ⚠️ Le defaut est deja la. Il ne se MANIFESTE qu'a l'etape 2, mais chaque
--   membre cree d'ici la accumule la dette.

-- POURQUOI UN TRIGGER ET PAS UNE MODIFICATION DES CHEMINS D'INSERTION
--   Releve du 04/10 : 27 points d'insertion dans `bar_members` repartis sur
--   les migrations et les edge functions (add_bar_member, add_bar_member_v2,
--   setup_promoter_bar, les RPC co-promoteur, l'onboarding, create-bar-member...).
--   Les modifier un par un garantit d'en oublier un - et l'oubli est
--   silencieux. Un trigger AFTER INSERT couvre les 27 d'un coup, present et
--   futur.
--
--   ⭐ Precedent dans ce projet : `trg_sync_server_mapping`
--   (20260727010000) applique exactement ce motif sur la meme table, pour
--   synchroniser les mappings de serveurs. On s'y conforme.

-- ⚠️ LEÇON DU 04/10 (revue de code de l'etape 2) : ne JAMAIS faire dependre
--   une LECTURE de l'affectation au comptoir. Ce trigger ne corrige pas ce
--   defaut - il le rend seulement moins probable. La regle reste : lecture au
--   niveau bar, ecriture au niveau comptoir.

-- BREAKING_CHANGE: NO - purement additif. Un membre qui recevait 0 affectation
--   en recoit maintenant 1. Aucun comportement existant n'est modifie.

-- ROLLBACK_STRATEGY: DROP du trigger + de la fonction. Les affectations deja
--   creees restent, et c'est voulu : les supprimer rendrait des membres
--   aveugles au selecteur.

-- TABLES_MODIFIED: aucune (2 triggers seuls)
-- FUNCTIONS_CREATED: create_primary_counter_for_bar,
--   assign_member_to_primary_counter
-- TRIGGERS_CREATED: trg_create_primary_counter (bars),
--   trg_assign_primary_counter (bar_members)
-- RLS_CHANGES: aucune
--
-- ⚠️ DEUX trous distincts sont colmates ici. Le 2e (affectation) est inutile
--    sans le 1er (comptoir du nouveau bar) : sans comptoir, rien a affecter.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ COMBIEN DE MEMBRES SONT DEJA SANS AFFECTATION ?
--    Mesure le trou accumule depuis l'etape 1.
--
-- SELECT COUNT(*) AS membres_sans_affectation
-- FROM bar_members bm
-- WHERE bm.is_active = true
--   AND bm.user_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM counter_assignments ca
--     WHERE ca.user_id = bm.user_id AND ca.bar_id = bm.bar_id AND ca.is_active
--   );
-- -- Attendu : un petit nombre (membres crees depuis l'etape 1), souvent 0.
-- -- NOTER ce nombre : le POST-VOL doit retrouver 0.
--
-- 2) Chaque bar a bien un comptoir primaire (sinon le trigger ne saura pas
--    ou affecter) :
--
-- SELECT COUNT(*) AS bars_sans_comptoir_primaire
-- FROM bars b
-- WHERE NOT EXISTS (
--   SELECT 1 FROM counters c WHERE c.bar_id = b.id AND c.is_primary AND c.is_active
-- );
-- -- NOTER ce nombre. Ce sont les bars crees APRES l'etape 1 : aucun code ne
-- --   leur a cree de comptoir (c'est le trou colmate par la section 1).
-- --   La migration les rattrape - le POST-VOL doit retrouver 0.
--
-- 3) Les DEUX triggers n'existent pas deja :
--
-- SELECT c.relname AS sur_table, t.tgname
-- FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE t.tgname IN ('trg_create_primary_counter','trg_assign_primary_counter');
-- -- Attendu : 0 ligne.
--
-- 4) ⛔ DES BARS PORTENT-ILS UN NOM VIDE OU BLANC ?
--    `bars.name` est TEXT NOT NULL sans contrainte de contenu, alors que
--    `counters.name` exige length(trim(name)) > 0. Le repli de la migration
--    traite ces cas, mais autant savoir s'il y en a :
--
-- SELECT id, quote_literal(name) AS nom
-- FROM bars WHERE trim(COALESCE(name, '')) = '';
-- -- Attendu : 0 ligne. Si > 0, ces bars recevront un comptoir nomme
-- --   'Comptoir principal' - et le vrai probleme est le nom du bar lui-meme.


BEGIN;

-- ===================================================================
-- 1. LE COMPTOIR PRIMAIRE D'UN **NOUVEAU** BAR
-- ===================================================================
-- ⛔⛔ TROU PLUS GRAVE QUE CELUI DES AFFECTATIONS, trouve en revue de cette
--     migration meme (04/10) :
--
--     L'etape 1 a cree un comptoir primaire pour les 13 bars EXISTANTS, par
--     retro-remplissage. Mais **AUCUN code ne cree de comptoir pour un
--     NOUVEAU bar** : `setup_promoter_bar()`, l'onboarding et les RPC admin
--     inserent dans `bars` sans rien savoir de `counters` (releve : 1 seule
--     occurrence d'INSERT INTO counters dans tout le depot, celle de
--     l'etape 1).
--
--     Consequence en cascade : un bar cree apres l'etape 1 n'a aucun
--     comptoir -> aucun de ses membres ne peut etre affecte -> a l'etape 2,
--     ce bar ne peut PLUS VENDRE DU TOUT. Un bar neuf, inutilisable.
--
--     Le trigger d'affectation (section 2) ne sert a rien sans celui-ci :
--     il n'aurait aucun comptoir vers lequel affecter.
--
-- ⚠️ Meme logique que la section 2 : un trigger plutot que la modification de
--    chaque chemin de creation de bar. On ne sait pas combien il y en a, et
--    un oubli serait silencieux.

-- ⛔⛔ DEFAUT BLOQUANT TROUVE EN REVUE DE CODE (04/10) SUR MA 1re REDACTION :
--     CE TRIGGER POUVAIT EMPECHER TOUTE CREATION DE BAR.
--
--   `bars.name` est `TEXT NOT NULL` - aucune contrainte de CONTENU : une
--   chaine vide ou faite d'espaces y est LEGALE. Or `counters.name` porte
--   `CHECK (length(trim(name)) > 0)`, pose par l'etape 1.
--
--   Ma 1re version recopiait NEW.name tel quel. Avec un nom vide ou blanc :
--   le CHECK refuse le comptoir -> l'exception remonte -> **la creation du
--   bar echoue entierement**, le trigger etant dans la meme transaction.
--   Un bar qui se creait avant ne se creait plus.
--
--   ⚠️ C'est le MEME motif que le defaut de l'etape 2, a l'envers : une
--   garantie plus stricte en aval (counters) qu'en amont (bars). Regle a
--   retenir : un trigger de propagation ne doit JAMAIS etre plus exigeant
--   que la table source, sinon il casse l'ecriture sur celle-ci.
--
-- CORRECTIFS :
--   1. repli sur un libelle par defaut si le nom du bar est vide ou blanc ;
--   2. gestion des DEUX index uniques partiels de counters, pas d'un seul
--      (voir le bloc EXCEPTION).

CREATE OR REPLACE FUNCTION public.create_primary_counter_for_bar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_name TEXT;
BEGIN
  -- Le comptoir porte le nom du bar : l'utilisateur d'un bar mono-comptoir ne
  -- voit jamais apparaitre un objet "comptoir" qu'il n'a pas demande.
  -- Repli si ce nom ne satisfait pas le CHECK de counters (voir ci-dessus).
  v_name := NULLIF(trim(COALESCE(NEW.name, '')), '');
  IF v_name IS NULL THEN
    v_name := 'Comptoir principal';
  END IF;

  -- ⚠️ counters porte DEUX index uniques partiels (etape 1) :
  --   A) idx_counters_unique_name_per_bar  (bar_id, lower(name)) WHERE is_active
  --   B) idx_counters_one_primary_per_bar  (bar_id)              WHERE is_primary
  -- Un ON CONFLICT ne peut cibler qu'UN SEUL index. Cibler B laissait une
  -- violation de A remonter en exception, donc casser la creation du bar.
  -- Le bloc EXCEPTION couvre les deux, quel que soit l'index viole.
  BEGIN
    INSERT INTO counters (bar_id, name, is_primary, is_active, created_by)
    VALUES (NEW.id, v_name, true, true, NEW.owner_id);
  EXCEPTION
    WHEN unique_violation THEN
      -- Le comptoir primaire existe deja (rejeu, ou nom deja pris dans ce
      -- bar). Dans les deux cas il n'y a rien a faire : ne JAMAIS faire
      -- echouer la creation du bar pour cela.
      RAISE WARNING
        'Comptoir primaire non cree pour le bar % (conflit d''unicite) : %',
        NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_primary_counter_for_bar IS
  'Cree le comptoir primaire de tout nouveau bar, portant son nom. '
  'Sans cela un bar cree apres le socle comptoirs (04/10/2026) n''aurait '
  'aucun comptoir, donc aucun membre affectable, donc aucune vente possible '
  'des l''etape 2. Aucun chemin de creation de bar ne connait counters.';

DROP TRIGGER IF EXISTS trg_create_primary_counter ON public.bars;

CREATE TRIGGER trg_create_primary_counter
  AFTER INSERT ON public.bars
  FOR EACH ROW
  EXECUTE FUNCTION public.create_primary_counter_for_bar();

-- Rattrapage : les bars crees entre l'etape 1 et maintenant.
-- ⚠️ Meme repli de nom que le trigger : un bar existant peut tres bien
-- porter un nom vide ou blanc, et le CHECK de counters le refuserait -
-- faisant echouer TOUTE la migration sur cette seule ligne.
INSERT INTO counters (bar_id, name, is_primary, is_active, created_by)
SELECT
  b.id,
  COALESCE(NULLIF(trim(COALESCE(b.name, '')), ''), 'Comptoir principal'),
  true, true, b.owner_id
FROM bars b
WHERE NOT EXISTS (
  SELECT 1 FROM counters c WHERE c.bar_id = b.id AND c.is_primary = true
)
-- Couvre le cas d'un comptoir ACTIF deja homonyme dans ce bar (index A).
-- L'index B (un seul primaire) est deja exclu par le NOT EXISTS ci-dessus.
ON CONFLICT DO NOTHING;


-- ===================================================================
-- 2. AFFECTATION AUTOMATIQUE DU MEMBRE AU COMPTOIR PRIMAIRE
-- ===================================================================

CREATE OR REPLACE FUNCTION public.assign_member_to_primary_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_counter_id UUID;
BEGIN
  -- ⚠️ Serveur virtuel du mode simplifie : user_id est NULL, il n'y a
  -- personne a affecter. Decision du 04/10 : en mode simplifie, le comptoir
  -- de la vente vient du COMPTOIR ACTIF DU GERANT QUI SAISIT, pas du serveur
  -- nomme. Rien a faire ici, et ce n'est pas un oubli.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Un membre inactif ne travaille pas : pas d'affectation.
  -- ⚠️ Couvre aussi la REACTIVATION (UPDATE is_active false -> true), d'ou le
  -- declenchement sur UPDATE et pas seulement sur INSERT.
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_counter_id
  FROM counters c
  WHERE c.bar_id = NEW.bar_id
    AND c.is_primary = true
    AND c.is_active = true;

  -- ⚠️ Bar sans comptoir primaire : on NE BLOQUE PAS l'ajout du membre.
  -- Refuser ici casserait la creation de bar et l'onboarding pour un defaut
  -- de donnees reparable. On trace et on laisse passer - le POST-VOL et la
  -- requete de controle periodique reperent ces cas.
  IF v_counter_id IS NULL THEN
    RAISE WARNING
      'Aucun comptoir primaire actif sur le bar % : membre % non affecte',
      NEW.bar_id, NEW.user_id;
    RETURN NEW;
  END IF;

  -- Reactivation d'une affectation existante, ou creation.
  -- ON CONFLICT cible la contrainte UNIQUE (counter_id, user_id) de l'etape 1.
  INSERT INTO counter_assignments (bar_id, counter_id, user_id, is_active, assigned_by)
  VALUES (NEW.bar_id, v_counter_id, NEW.user_id, true, NEW.assigned_by)
  ON CONFLICT (counter_id, user_id)
    DO UPDATE SET is_active = true;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.assign_member_to_primary_counter IS
  'Affecte automatiquement tout nouveau membre actif au comptoir primaire de '
  'son bar. Couvre les 27 points d''insertion dans bar_members d''un seul '
  'endroit. Ignore les serveurs virtuels (user_id NULL) : en mode simplifie, '
  'le comptoir vient du gerant qui saisit. Ne bloque JAMAIS l''ajout d''un '
  'membre, meme si le bar n''a pas de comptoir primaire (WARNING seulement).';


-- ===================================================================
-- 2. LE TRIGGER
-- ===================================================================
-- AFTER INSERT OR UPDATE OF is_active : couvre la creation ET la
-- reactivation d'un membre. Pas de declenchement sur les autres UPDATE
-- (changement de role notamment), qui n'affectent pas le comptoir.

DROP TRIGGER IF EXISTS trg_assign_primary_counter ON public.bar_members;

CREATE TRIGGER trg_assign_primary_counter
  AFTER INSERT OR UPDATE OF is_active ON public.bar_members
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_member_to_primary_counter();


-- ===================================================================
-- 3. RATTRAPAGE DU TROU DEJA ACCUMULE
-- ===================================================================
-- Les membres crees entre l'etape 1 et maintenant. Idempotent.
--
-- ⚠️ Pas besoin de neutraliser les triggers ici : on INSERE dans
-- counter_assignments (table neuve, aucun trigger) et non dans bar_members.
-- C'est la difference avec l'etape 1, ou l'UPDATE de masse sur 7 tables
-- auditees exigeait un DISABLE TRIGGER.

INSERT INTO counter_assignments (bar_id, counter_id, user_id, is_active)
SELECT bm.bar_id, c.id, bm.user_id, true
FROM bar_members bm
JOIN counters c
  ON c.bar_id = bm.bar_id AND c.is_primary = true AND c.is_active = true
WHERE bm.is_active = true
  AND bm.user_id IS NOT NULL
ON CONFLICT (counter_id, user_id) DO NOTHING;

COMMIT;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ PLUS AUCUN MEMBRE ACTIF SANS AFFECTATION :
--
-- SELECT COUNT(*) AS membres_sans_affectation
-- FROM bar_members bm
-- WHERE bm.is_active = true
--   AND bm.user_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM counter_assignments ca
--     WHERE ca.user_id = bm.user_id AND ca.bar_id = bm.bar_id AND ca.is_active
--   );
-- -- Attendu : 0.
-- -- ⚠️ Si > 0, lister les bars concernes - ce sont ceux sans comptoir
-- --   primaire actif (PRE-VOL 2) :
-- --   SELECT DISTINCT bm.bar_id FROM bar_members bm WHERE ... (meme clause)
--
-- 1bis) ⛔ CHAQUE BAR A UN COMPTOIR PRIMAIRE ACTIF :
--
-- SELECT COUNT(*) AS bars_sans_comptoir_primaire
-- FROM bars b
-- WHERE NOT EXISTS (
--   SELECT 1 FROM counters c WHERE c.bar_id = b.id AND c.is_primary AND c.is_active
-- );
-- -- Attendu : 0. Un bar sans comptoir primaire ne pourra PLUS VENDRE
-- --   des l'etape 2.
--
-- 2) Les DEUX triggers sont en place ET actifs :
--
-- SELECT c.relname AS sur_table, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
-- FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE t.tgname IN ('trg_create_primary_counter','trg_assign_primary_counter');
-- -- Attendu : 2 lignes, tgenabled = 'O' sur les deux.
-- -- ⚠️ trg_assign_primary_counter doit porter `UPDATE OF is_active`, pas
-- --    `UPDATE` nu (sinon il se declenche a chaque changement de role).
--
-- 3) Les autres triggers de bar_members sont intacts (notamment
--    trg_sync_server_mapping et les triggers d'audit) :
--
-- SELECT t.tgname, t.tgenabled FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname = 'bar_members' AND NOT t.tgisinternal
-- ORDER BY t.tgname;
-- -- ⛔ Aucun ne doit avoir tgenabled = 'D'.
--
-- 4) Les affectations n'ont pas explose (1 par membre actif, pas plus) :
--
-- SELECT
--   (SELECT COUNT(*) FROM bar_members WHERE is_active AND user_id IS NOT NULL) AS membres,
--   (SELECT COUNT(*) FROM counter_assignments WHERE is_active)                 AS affectations;
-- -- Attendu : egaux (1 comptoir par bar aujourd'hui). Quand un 2e comptoir
-- --   existera, affectations POURRA depasser membres - c'est normal, une
-- --   serveuse pouvant etre affectee a plusieurs comptoirs.
--
-- 5) SMOKE-TEST DEPUIS L'APPLICATION - le controle qui compte :
--    - ⛔ creer un NOUVEAU BAR en SuperAdmin, puis verifier immediatement :
--        SELECT * FROM counters WHERE bar_id = '<le nouveau bar>';
--      Attendu : 1 ligne, is_primary = true, name = nom du bar.
--      C'est le test du trou le plus grave colmate par cette migration.
--    - creer un nouveau serveur depuis l'ecran Equipe
--    - verifier qu'il recoit une affectation :
--        SELECT * FROM counter_assignments
--        WHERE user_id = '<le nouvel utilisateur>';
--      Attendu : 1 ligne, is_active = true
--    - desactiver puis reactiver ce membre -> l'affectation doit revenir
--      a is_active = true
--    ⛔ La creation de membre ne doit PAS echouer. Si elle echoue, le trigger
--       est en cause : le desactiver immediatement
--       (ALTER TABLE public.bar_members DISABLE TRIGGER trg_assign_primary_counter;)
--       puis diagnostiquer.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ROLLBACK                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_assign_primary_counter ON public.bar_members;
--   DROP FUNCTION IF EXISTS public.assign_member_to_primary_counter();
--   DROP TRIGGER IF EXISTS trg_create_primary_counter ON public.bars;
--   DROP FUNCTION IF EXISTS public.create_primary_counter_for_bar();
-- COMMIT;
--
-- ⚠️ On NE SUPPRIME NI les comptoirs NI les affectations deja crees : ils sont
-- corrects, et les retirer rendrait des bars invendables et des membres
-- aveugles au selecteur.
--
-- ⚠️ Apres ce rollback, tout nouveau bar repart SANS comptoir : c'est le trou
-- d'origine. Ne rollbacker que pour diagnostiquer, et recoller ensuite.
