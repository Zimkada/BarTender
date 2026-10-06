-- ===================================================================
-- MIGRATION: comptoirs - etape 2/4, LES VENTES PORTENT LE COMPTOIR
-- DATE: 2026-10-04
-- AUTHOR: AI Assistant
-- ===================================================================

-- PREREQUIS : etape 1 (20261004090000_comptoirs_socle) EN PROD et certifiee.
--   Verifie le 04/10 : 13 bars -> 13 comptoirs primaires, 47 affectations,
--   0 orpheline sur les 7 tables, 0 incoherence comptoir/bar, stock inchange
--   (4 449 unites), 27 policies existantes intactes, smoke-test applicatif OK.

-- CE QUE FAIT CETTE MIGRATION :
--   1. garantit la CONCORDANCE vente <-> bon (TRIGGER, pas un CHECK :
--      PostgreSQL interdit les sous-requetes dans un CHECK)
--   2. ajoute `p_counter_id` a `create_sale_idempotent` + ecrit counter_id
--   3. cree `get_my_counters()` : les comptoirs ou la personne peut travailler
--   4. ajoute la couche RLS comptoir en RESTRICTIVE, sur l'ECRITURE SEULE
--      (voir les 2 avertissements ci-dessous : FOR ALL cassait la lecture)
--
-- ⛔ CE QU'ELLE NE FAIT PAS :
--   - pas de NOT NULL sur sales.counter_id : il viendra en etape 2bis, APRES
--     que le front deploye l'envoie systematiquement. Le rendre obligatoire
--     maintenant casserait toute vente depuis l'app actuellement en prod.
--   - ne touche PAS au stock (etape 3), ni aux 4 index uniques (etape 3)
--   - ne touche PAS a la cuisine : decision du 04/10, restaurant UNIQUE pour
--     tous les comptoirs. La commande cuisine herite son comptoir du bon.

-- ⚠️⚠️ POURQUOI DES POLICIES **RESTRICTIVES** ET NON UNE REECRITURE
--   Releve du 04/10 : les 27 policies des 7 tables sont toutes PERMISSIVES.
--   Les PERMISSIVES se CUMULENT en OR : une seule suffit a tout ouvrir. Si
--   j'ajoutais une policy permissive "et le comptoir doit correspondre", elle
--   s'ajouterait en OR aux existantes et n'interdirait RIEN.
--   Une policy RESTRICTIVE se combine en AND avec le resultat des permissives.
--   C'est le seul moyen d'ajouter une condition SANS reecrire les 27 policies
--   (donc sans risquer d'en casser une).
--   Meme mecanisme que les 3 policies RESTRICTIVES deja presentes sur
--   `bar_members` (cf. src/types/index.ts).

-- ⚠️ MODE SIMPLIFIE : le serveur virtuel n'a PAS de compte (bar_members.user_id
--   NULL), donc il ne peut pas etre affecte a un comptoir. Decision du 04/10 :
--   le comptoir vient du COMPTOIR ACTIF DU GERANT QUI SAISIT. C'est lui qui
--   appelle le RPC, donc `is_counter_member(p_counter_id)` le valide
--   naturellement. Aucun traitement particulier n'est necessaire ici.

-- BREAKING_CHANGE: NO - p_counter_id est un parametre OPTIONNEL en fin de
--   signature. L'app actuellement deployee continue d'appeler la fonction sans
--   lui et la vente part (counter_id reste NULL, comble par le defaut).

-- ROLLBACK_STRATEGY: bloc ROLLBACK en fin de fichier.

-- TABLES_MODIFIED: sales (+1 trigger)
-- FUNCTIONS_MODIFIED: create_sale_idempotent (+1 parametre, A LA MAIN)
-- FUNCTIONS_CREATED: get_my_counters, counter_belongs_to_bar, can_write_on_counter,
--   enforce_sale_counter_matches_ticket
-- TRIGGERS_CREATED: trg_sale_counter_matches_ticket (sales)
-- RLS_CHANGES: +3 policies RESTRICTIVES sur sales, en ECRITURE SEULEMENT
--   (INSERT / UPDATE / DELETE - jamais FOR ALL, qui engloberait le SELECT).
--   La LECTURE reste au niveau bar. Les 27 permissives existantes ne sont
--   PAS touchees. Rien sur `tickets` (ses ecritures passent par des
--   SECURITY DEFINER qui contournent RLS).


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) L'etape 1 est bien en place :
--
-- SELECT
--   (SELECT COUNT(*) FROM counters WHERE is_primary) AS comptoirs_primaires,
--   (SELECT COUNT(*) FROM bars)                      AS bars,
--   (SELECT COUNT(*) FROM sales WHERE counter_id IS NULL) AS ventes_sans_comptoir;
-- -- Attendu : comptoirs_primaires = bars = 13, ventes_sans_comptoir = 0.
--
-- 2) ⛔ AUCUNE vente ne doit deja contredire la concordance qu'on va imposer.
--    Si cette requete retourne autre chose que 0, la contrainte ECHOUERA :
--
-- SELECT COUNT(*) AS discordances
-- FROM sales s JOIN tickets t ON t.id = s.ticket_id
-- WHERE s.counter_id IS NOT NULL AND t.counter_id IS NOT NULL
--   AND s.counter_id <> t.counter_id;
-- -- Attendu : 0. (sinon le trigger refusera toute MAJ de ces lignes)
--
-- 3) Signature exacte de create_sale_idempotent AVANT (pour le rollback) :
--
-- SELECT pg_get_function_identity_arguments(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
-- -- ⚠️ NOTER CE RESULTAT : le rollback doit recreer EXACTEMENT cette signature.
--
-- 4) Privileges actuels (a reposer a l'identique apres CREATE OR REPLACE) :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema='public' AND routine_name='create_sale_idempotent';
-- -- Attendu : authenticated + service_role. PAS anon, PAS PUBLIC.


BEGIN;

-- ===================================================================
-- 1. CONCORDANCE VENTE <-> BON
-- ===================================================================
-- Mesure du 04/10 : 110 ventes sur 24 379 portent un ticket_id (0,5 %). C'est
-- precisement parce que le bon est marginal que cette contrainte est sans
-- risque sur l'existant - et c'est aussi pourquoi `sales.counter_id` ne peut
-- PAS etre derive du bon : 99,5 % des ventes n'en ont aucun.

CREATE OR REPLACE FUNCTION public.counter_belongs_to_bar(
  p_counter_id UUID,
  p_bar_id     UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p_counter_id IS NULL OR EXISTS (
    SELECT 1 FROM counters c
    WHERE c.id = p_counter_id AND c.bar_id = p_bar_id
  );
$function$;

COMMENT ON FUNCTION public.counter_belongs_to_bar IS
  'Le comptoir appartient-il bien a ce bar ? Retourne TRUE si p_counter_id est '
  'NULL (colonne encore nullable en etape 2). Garde-fou anti-fuite cross-bar.';

REVOKE ALL ON FUNCTION public.counter_belongs_to_bar(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_belongs_to_bar(UUID, UUID)
  TO authenticated, service_role;

-- ⛔ PAS DE CONTRAINTE CHECK ICI - PostgreSQL l'INTERDIT.
--
-- Ma 1re redaction de cette migration ecrivait :
--   ALTER TABLE sales ADD CONSTRAINT ... CHECK (
--     counter_id = (SELECT t.counter_id FROM tickets t WHERE t.id = ticket_id))
-- -> `ERROR: cannot use subquery in check constraint`. Un CHECK ne voit QUE
--    les colonnes de sa propre ligne, jamais une autre table.
--
-- La concordance inter-tables se porte donc par un TRIGGER BEFORE. C'est la
-- seule construction qui peut lire `tickets` au moment de l'ecriture.
--
-- ⚠️ Le trigger est BEFORE INSERT OR UPDATE OF counter_id, ticket_id : il ne
-- se declenche PAS sur les autres UPDATE (validation de vente, annulation...),
-- donc il n'alourdit pas le chemin chaud. Et il ne touche AUCUNE ligne
-- existante - contrairement a une contrainte, qui aurait exige un rescan ou
-- un NOT VALID.

CREATE OR REPLACE FUNCTION public.enforce_sale_counter_matches_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ticket_counter UUID;
BEGIN
  -- Rien a verifier : pas de bon, ou comptoir pas encore renseigne
  -- (la colonne est nullable pendant la transition de l'etape 2).
  IF NEW.ticket_id IS NULL OR NEW.counter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.counter_id INTO v_ticket_counter
  FROM tickets t WHERE t.id = NEW.ticket_id;

  -- Bon dont le comptoir n'est pas encore renseigne : on laisse passer,
  -- meme raison que ci-dessus.
  IF v_ticket_counter IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.counter_id <> v_ticket_counter THEN
    RAISE EXCEPTION
      'Vente et bon sur des comptoirs differents (vente %, bon %)',
      NEW.counter_id, v_ticket_counter;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_sale_counter_matches_ticket IS
  'Une vente rattachee a un bon doit porter le MEME comptoir que lui. '
  'Implemente en trigger et non en CHECK : PostgreSQL interdit les '
  'sous-requetes dans un CHECK. Tolere les NULL pendant la transition '
  'de l''etape 2 comptoirs.';

CREATE TRIGGER trg_sale_counter_matches_ticket
  BEFORE INSERT OR UPDATE OF counter_id, ticket_id ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sale_counter_matches_ticket();


-- ===================================================================
-- 2. LES COMPTOIRS OU JE PEUX TRAVAILLER
-- ===================================================================
-- Calque sur get_my_bars() : meme principe, un niveau plus bas.
--
-- ⚠️ LEÇON 23/09/2026 (souriciere du selecteur de bar) : cette fonction ne
-- depend d'AUCUNE permission de role. Elle ne lit que les affectations. Une
-- personne ne peut donc jamais perdre l'acces au selecteur de comptoir en
-- basculant de comptoir - le piege qui avait fige un gerant multi-bar.
--
-- Le promoteur / co-promoteur / super_admin voit TOUS les comptoirs de son
-- bar sans affectation explicite : il supervise, il n'est pas "en poste".

CREATE OR REPLACE FUNCTION public.get_my_counters(p_bar_id UUID)
RETURNS TABLE (
  id         UUID,
  bar_id     UUID,
  name       TEXT,
  is_primary BOOLEAN,
  is_active  BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.id, c.bar_id, c.name, c.is_primary, c.is_active
  FROM counters c
  WHERE c.bar_id = p_bar_id
    AND c.is_active = true
    AND (
      -- superviseurs : tous les comptoirs du bar
      get_user_role(p_bar_id) = ANY (ARRAY['promoteur','co_promoteur','super_admin'])
      OR is_super_admin()
      -- les autres : uniquement leurs affectations
      OR EXISTS (
        SELECT 1 FROM counter_assignments ca
        WHERE ca.counter_id = c.id
          AND ca.user_id = auth.uid()
          AND ca.is_active = true
      )
    )
  ORDER BY c.is_primary DESC, c.name;
$function$;

COMMENT ON FUNCTION public.get_my_counters IS
  'Comptoirs ou la personne courante peut travailler dans ce bar. Superviseurs '
  '(promoteur/co_promoteur/super_admin) : tous. Gerant/serveur : leurs '
  'affectations. ⚠️ Ne depend d''AUCUNE permission de role conditionnant la '
  'bascule elle-meme (lecon de la souriciere du 23/09/2026).';

REVOKE ALL ON FUNCTION public.get_my_counters(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_counters(UUID) TO authenticated, service_role;


-- ===================================================================
-- 3. LA COUCHE RLS COMPTOIR - EN RESTRICTIVE
-- ===================================================================
-- Se combine en AND avec les 27 permissives existantes, qui restent intactes.
--
-- Regle : on peut ecrire sur une ligne dont le comptoir est NULL (transition
-- etape 2) ou un comptoir ou l'on est habilite. Les superviseurs passent
-- partout dans leur bar.

-- ⛔⛔ DEUX DEFAUTS BLOQUANTS TROUVES EN REVUE DE CODE (04/10) SUR MA 1re
--     REDACTION, QUI POSAIT UNE RESTRICTIVE **FOR ALL** :
--
--   A. UN NOUVEAU MEMBRE NE VERRAIT PLUS AUCUNE VENTE.
--      FOR ALL couvre le SELECT. Or l'etape 1 a rempli counter_id sur les
--      24 378 ventes existantes : la tolerance `counter_id IS NULL` ne les
--      protege donc PAS. Pour un serveur, le seul chemin passant devient
--      `is_counter_member`. Les 47 membres presents a l'etape 1 ont ete
--      affectes, donc ils passent - mais TOUT MEMBRE CREE APRES n'a aucune
--      affectation (rien dans le code applicatif n'en cree encore). Ecran
--      d'historique VIDE, sans message d'erreur. Panne silencieuse.
--
--   B. UN ACCES BASE PAR LIGNE LUE.
--      La fonction enchainait get_user_role + is_super_admin +
--      is_counter_member, 3 fonctions SECURITY DEFINER lisant chacune une
--      table. Evaluee par ligne de sales. `is_counter_member(counter_id)`
--      recoit un argument QUI VARIE par ligne -> aucune memoisation possible
--      malgre STABLE -> 1 SELECT sur counter_assignments PAR LIGNE LUE.
--      Sur une page d'historique de 50 ventes : 150+ appels.
--      ⚠️ C'est EXACTEMENT le profil de l'alerte Disk IO de septembre : un
--      cout couple au chemin le plus frequent de l'app.
--
-- CORRECTIF : SEPARER LECTURE ET ECRITURE.
--   - LECTURE : reste au niveau BAR. Les 27 permissives existantes la gerent
--     deja correctement (is_bar_member / get_user_role). On n'y touche PAS.
--     Le filtrage par comptoir de l'ECRAN du gerant devient une clause WHERE
--     cote client - de l'affichage, pas de la securite par ligne.
--     => annule A et B d'un coup.
--   - ECRITURE : controlee par comptoir. Rare (quelques centaines de ventes
--     par jour) comparee a la lecture, donc le cout des 3 fonctions est sans
--     consequence. Et une ecriture refusee est VISIBLE immediatement, jamais
--     silencieuse.
--
-- ⚠️ Ce que ce choix implique, assume : un serveur du comptoir A peut LIRE
--    les ventes du comptoir B de son bar (via l'API, pas via l'ecran). Ce
--    n'est pas une fuite multi-tenant - il est membre du bar et y avait deja
--    acces avant ce chantier. L'isolation qui compte, celle entre BARS, reste
--    portee par les permissives existantes.

CREATE OR REPLACE FUNCTION public.can_write_on_counter(
  p_counter_id UUID,
  p_bar_id     UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    -- ⚠️ counter_id NULL tolere : la colonne est encore nullable en etape 2,
    -- et l'app deployee n'envoie pas encore le comptoir. A RETIRER en
    -- etape 2bis, en meme temps que le NOT NULL - sinon cette tolerance
    -- devient un trou permanent.
    p_counter_id IS NULL
    -- Superviseurs : ecrivent sur tous les comptoirs de leur bar.
    -- (is_super_admin() est redondant avec le role 'super_admin' ci-dessus,
    --  mais get_user_role lit bar_members et un super_admin n'est pas
    --  forcement membre du bar concerne. Les deux sont necessaires.)
    OR get_user_role(p_bar_id) = ANY (ARRAY['promoteur','co_promoteur','super_admin'])
    OR is_super_admin()
    -- Gerant / serveur : uniquement leurs comptoirs d'affectation.
    OR is_counter_member(p_counter_id);
$function$;

COMMENT ON FUNCTION public.can_write_on_counter IS
  'Couche comptoir des policies RESTRICTIVES, sur l''ECRITURE SEULEMENT. '
  '⛔ Ne JAMAIS l''utiliser dans un USING de SELECT : elle appelle 3 fonctions '
  'SECURITY DEFINER avec un argument variable par ligne, donc non memoisable, '
  'soit 1 acces base par ligne lue (profil de l''alerte Disk IO de 09/2026). '
  'La LECTURE reste au niveau bar, portee par les permissives existantes.';

REVOKE ALL ON FUNCTION public.can_write_on_counter(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_on_counter(UUID, UUID)
  TO authenticated, service_role;

-- ⚠️ FOR INSERT, FOR UPDATE, FOR DELETE - et surtout **PAS** FOR ALL, qui
-- engloberait le SELECT (defauts A et B ci-dessus).
--
-- ⚠️ FOR INSERT n'accepte QUE WITH CHECK (il n'y a pas de ligne "avant").
--    FOR DELETE n'accepte QUE USING (il n'y a pas de ligne "apres").
--    FOR UPDATE prend les DEUX : sans WITH CHECK, rien ne verifierait la
--    ligne APRES ecriture et on pourrait deplacer une vente vers un comptoir
--    ou l'on n'est pas habilite. C'est exactement la dette constatee le
--    04/10 sur 5 policies UPDATE existantes - on ne la reproduit pas ici.

CREATE POLICY "Counter write scope on sales insert"
  ON public.sales AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (can_write_on_counter(counter_id, bar_id));

CREATE POLICY "Counter write scope on sales update"
  ON public.sales AS RESTRICTIVE FOR UPDATE TO authenticated
  USING      (can_write_on_counter(counter_id, bar_id))
  WITH CHECK (can_write_on_counter(counter_id, bar_id));

CREATE POLICY "Counter write scope on sales delete"
  ON public.sales AS RESTRICTIVE FOR DELETE TO authenticated
  USING (can_write_on_counter(counter_id, bar_id));

-- ⛔ PAS de restrictive sur `tickets` : releve du 04/10, cette table n'a
-- qu'UNE policy permissive (SELECT). Ses INSERT/UPDATE passent par
-- create_ticket / pay_ticket en SECURITY DEFINER, qui s'executent en tant que
-- proprietaire et CONTOURNENT donc RLS. Une restrictive n'y changerait rien :
-- le controle du comptoir sur les bons doit etre fait DANS ces deux RPC.
-- A traiter quand les bons passeront au comptoir (etape 2, cote RPC).

-- ⛔ Volontairement PAS de restrictive sur bar_products / supplies /
-- stock_adjustments / returns / consignments : c'est l'etape 3 (stock). Les
-- ajouter maintenant filtrerait le stock alors que le front ne sait pas encore
-- quel comptoir demander -> ecrans vides.


-- ===================================================================
-- 4. create_sale_idempotent ACCEPTE LE COMPTOIR
-- ===================================================================
-- ⚠️ On ne REECRIT PAS la fonction : 400+ lignes de logique (promotions,
-- stock, plats, idempotence) qu'il serait absurde de retranscrire. On ajoute
-- un parametre en FIN de signature et on ecrit counter_id.
--
-- ⚠️ CREATE OR REPLACE avec une signature DIFFERENTE cree une SURCHARGE, elle
-- ne remplace pas. Les deux versions coexisteraient et PostgREST choisirait
-- selon les parametres envoyes. C'est VOULU pendant la transition : l'app
-- deployee appelle l'ancienne, la nouvelle app appellera la nouvelle.
-- ⛔ L'ancienne surcharge devra etre DROPee en etape 2bis, sinon elle reste un
-- chemin d'ecriture qui ignore le comptoir.

DO $do$
DECLARE
  v_src  TEXT;
  v_args TEXT;
BEGIN
  -- On part du corps REEL en base, pas d'une copie du depot (lecon projet :
  -- les fichiers de migration ne refletent pas toujours la prod).
  SELECT p.prosrc, pg_get_function_identity_arguments(p.oid)
    INTO v_src, v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_sale_idempotent'
    AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%counter_id%'
  ORDER BY length(pg_get_function_identity_arguments(p.oid)) DESC
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'create_sale_idempotent introuvable - etape 1 appliquee ?';
  END IF;

  -- Le corps insere dans `sales`. On ajoute counter_id a cet INSERT.
  -- ⚠️ Si ce remplacement ne trouve pas sa cible, on ECHOUE : mieux vaut
  -- interrompre la migration que creer une fonction qui ignore le comptoir.
  IF position('INSERT INTO public.sales' IN v_src) = 0
     AND position('INSERT INTO sales' IN v_src) = 0 THEN
    RAISE EXCEPTION
      'Le corps de create_sale_idempotent ne contient pas l''INSERT attendu. '
      'Patcher la fonction a la main plutot que de deviner.';
  END IF;

  RAISE NOTICE 'Signature source : %', v_args;
  RAISE NOTICE 'ETAPE MANUELLE REQUISE : voir le bloc ci-dessous.';
END
$do$;

-- ⛔⛔ ARRET VOLONTAIRE DE L'AUTOMATISATION ICI.
--
-- Je refuse de reecrire par programme le corps d'une fonction de 400+ lignes
-- qui porte la caisse, les promotions, le stock et l'idempotence. Un
-- `regexp_replace` sur du SQL genere est exactement le genre de raccourci qui
-- casse une vente en pleine soiree.
--
-- La fonction doit etre patchee A LA MAIN, en 3 modifications mecaniques :
--
--   1. AJOUTER en DERNIER parametre (apres p_source_return_id) :
--          p_counter_id uuid DEFAULT NULL::uuid
--
--   2. AJOUTER dans le bloc SECURITY CHECK, juste APRES le guard de role
--      (`IF v_caller_role NOT IN (...)`) :
--
--          -- Le comptoir doit appartenir au bar, et la personne doit y etre
--          -- habilitee. NULL tolere pendant la transition de l'etape 2.
--          IF p_counter_id IS NOT NULL THEN
--              IF NOT counter_belongs_to_bar(p_counter_id, p_bar_id) THEN
--                  RAISE EXCEPTION 'Access denied: counter does not belong to this bar';
--              END IF;
--              IF NOT can_write_on_counter(p_counter_id, p_bar_id) THEN
--                  RAISE EXCEPTION 'Access denied: not assigned to this counter';
--              END IF;
--          END IF;
--
--   3. AJOUTER `counter_id` dans la liste de colonnes de l'INSERT INTO sales
--      et `p_counter_id` dans la liste VALUES correspondante.
--
--      ⚠️ Si la vente est rattachee a un bon, le comptoir doit etre celui du
--      bon (la contrainte sales_counter_matches_ticket le refuserait sinon).
--      Preferer :  COALESCE(
--                    (SELECT t.counter_id FROM tickets t WHERE t.id = p_ticket_id),
--                    p_counter_id
--                  )
--
--   4. Reposer les privileges a l'identique (ils ne survivent PAS a un
--      CREATE OR REPLACE sur une nouvelle signature) :
--
--          REVOKE ALL ON FUNCTION public.create_sale_idempotent(<nouvelle signature>) FROM PUBLIC;
--          REVOKE ALL ON FUNCTION public.create_sale_idempotent(<nouvelle signature>) FROM anon;
--          GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(<nouvelle signature>)
--            TO authenticated, service_role;
--
--      (Lecon du durcissement RPC du 04/07/2026 : CREATE OR REPLACE perd les
--       grants. Toujours re-REVOKE/GRANT + post-vol has_function_privilege.)

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 3 nouvelles fonctions existent et anon ne peut PAS les executer :
--
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname IN ('get_my_counters','can_write_on_counter','counter_belongs_to_bar');
-- -- Attendu : anon_peut = false ET auth_peut = true sur les 3.
-- -- ⚠️ Verifier les DEUX colonnes : ne controler que les refus laisserait
-- --    passer une fonction qui bloque tout le monde.
--
-- 2) ⛔ LES 3 POLICIES SONT RESTRICTIVES, ET AUCUNE NE COUVRE LE SELECT :
--
-- SELECT tablename, policyname, permissive, cmd
-- FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE 'Counter write scope%'
-- ORDER BY cmd;
-- -- Attendu : EXACTEMENT 3 lignes, toutes permissive = 'RESTRICTIVE',
-- --   cmd = 'DELETE', 'INSERT', 'UPDATE'.
-- -- ⛔ Si une ligne porte cmd = 'ALL' ou 'SELECT' : la lecture est filtree
-- --    par comptoir. Tout membre cree apres l'etape 1 (donc sans affectation)
-- --    verrait un historique VIDE, sans message d'erreur. SUPPRIMER
-- --    IMMEDIATEMENT cette policy.
-- -- ⛔ Si permissive = 'PERMISSIVE', la policy n'interdit RIEN (elle s'ajoute
-- --    en OR aux 27 existantes) : la supprimer et la recreer.
--
-- 2bis) La lecture n'est PAS filtree par comptoir - controle direct :
--
-- SELECT COUNT(*) AS policies_select_comptoir
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='sales'
--   AND permissive='RESTRICTIVE' AND cmd IN ('ALL','SELECT');
-- -- Attendu : 0.
--
-- 3) Les 27 permissives existantes sont intactes :
--
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname='public'
--   AND permissive='PERMISSIVE'
--   AND tablename IN ('sales','bar_products','supplies','stock_adjustments',
--                     'returns','consignments','tickets');
-- -- Attendu : 27.
--
-- 4) Le trigger de concordance vente/bon est en place ET ACTIF :
--
-- SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
-- FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname = 'sales' AND t.tgname = 'trg_sale_counter_matches_ticket';
-- -- Attendu : 1 ligne, tgenabled = 'O' (actif).
-- -- ⚠️ Il doit porter `UPDATE OF counter_id, ticket_id` et non `UPDATE` nu :
-- --    sinon il se declencherait sur chaque validation de vente.
--
-- 4bis) Il refuse bien une discordance (test en transaction annulee) :
--
-- BEGIN;
--   -- prendre une vente avec un bon, et lui mettre un comptoir different
--   UPDATE sales SET counter_id = (
--     SELECT c.id FROM counters c
--     WHERE c.bar_id = sales.bar_id AND c.id <> sales.counter_id LIMIT 1)
--   WHERE ticket_id IS NOT NULL LIMIT 1;
-- ROLLBACK;
-- -- Attendu avec 2+ comptoirs sur le bar : ERROR 'Vente et bon sur des
-- --   comptoirs differents'. Avec 1 seul comptoir par bar (cas actuel),
-- --   la sous-requete rend NULL et rien ne se passe : test non concluant
-- --   a ce stade, a refaire quand un 2e comptoir existera.
--
-- 5) get_my_counters rend bien les comptoirs - a tester AVEC UN VRAI JWT
--    (dans le SQL Editor auth.uid() est NULL, donc la fonction renvoie vide
--     pour les non-superviseurs : c'est NORMAL, ce n'est pas un echec) :
--
-- SET LOCAL request.jwt.claims = '{"sub":"<user_id_d_un_gerant>"}';
-- SELECT * FROM get_my_counters('<bar_id>');
-- -- Attendu : le comptoir primaire de ce bar.
--
-- 6) ⛔ LE CONTROLE QUI COMPTE - LES VENTES PASSENT TOUJOURS.
--    Les 2 policies RESTRICTIVES s'appliquent a TOUTES les ventes, y compris
--    celles de l'app actuellement deployee qui n'envoie PAS de comptoir. La
--    tolerance `p_counter_id IS NULL` est censee les laisser passer.
--
--    DEPUIS L'APPLICATION (le SQL Editor ne peut pas tester les policies) :
--    - se connecter en SERVEUR -> vendre un article -> la vente doit PARTIR
--    - se connecter en GERANT  -> valider cette vente -> doit PASSER
--    - ouvrir l'Historique des ventes -> les ventes doivent s'AFFICHER
--    - enregistrer un retour
--    ⛔ Si une vente est refusee, la cause la plus probable est la tolerance
--       NULL de can_write_on_counter. ROLLBACK IMMEDIAT des 3 policies :
--         DROP POLICY "Counter write scope on sales insert" ON public.sales;
--         DROP POLICY "Counter write scope on sales update" ON public.sales;
--         DROP POLICY "Counter write scope on sales delete" ON public.sales;
--       (les 27 permissives reprennent seules, comportement d'avant)
--
-- 7) Aucune vente orpheline creee depuis la migration :
--
-- SELECT COUNT(*) FROM sales
-- WHERE counter_id IS NULL AND created_at > NOW() - INTERVAL '1 hour';
-- -- Attendu pendant la transition : > 0 est NORMAL (l'app deployee n'envoie
-- --   pas encore le comptoir). Ces lignes seront comblees en etape 2bis.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ROLLBACK                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- BEGIN;
--   DROP POLICY IF EXISTS "Counter write scope on sales insert" ON public.sales;
--   DROP POLICY IF EXISTS "Counter write scope on sales update" ON public.sales;
--   DROP POLICY IF EXISTS "Counter write scope on sales delete" ON public.sales;
--   DROP TRIGGER IF EXISTS trg_sale_counter_matches_ticket ON public.sales;
--   DROP FUNCTION IF EXISTS public.enforce_sale_counter_matches_ticket();
--   DROP FUNCTION IF EXISTS public.can_write_on_counter(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.counter_belongs_to_bar(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.get_my_counters(UUID);
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
--
-- ⚠️ Si la surcharge de create_sale_idempotent avec p_counter_id a ete creee
-- a la main, la DROPer explicitement par sa signature complete - sinon elle
-- reste un chemin d'ecriture actif.
--
-- Le socle de l'etape 1 (counters, counter_assignments, counter_id) reste en
-- place : il est invisible pour l'utilisateur et sans effet.
