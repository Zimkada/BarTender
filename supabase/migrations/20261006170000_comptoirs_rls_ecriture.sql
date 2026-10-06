-- ===================================================================
-- MIGRATION: comptoirs - RLS d'ECRITURE + concordance vente/bon
-- DATE: 2026-10-06
-- AUTHOR: AI Assistant
-- ===================================================================

-- ⛔ REMPLACE `20261004120000_comptoirs_ventes.sql`, QUI NE DOIT **JAMAIS**
--    ETRE EXECUTEE. Ce fichier-la a ete ecrit le 04/10, avant que le chantier
--    ne prenne un autre chemin, et il est devenu FAUX :
--
--    - il contient un bloc `DO` qui cherche une signature de
--      `create_sale_idempotent` SANS `p_counter_id`. Depuis
--      20261005090000 (en prod), la seule signature existante EN PORTE un.
--      Le bloc ne trouve donc rien et leve `RAISE EXCEPTION
--      'create_sale_idempotent introuvable - etape 1 appliquee ?'`.
--      => la migration ECHOUE ENTIEREMENT, avec un message TROMPEUR qui
--         accuse l'etape 1 alors que le travail a deja ete fait ailleurs.
--    - il cree `get_my_counters()` : code MORT des sa creation. Le perimetre
--      de travail est calcule cote client (`CountersService.getMyCounters`),
--      decision prise le 05/10 faute de RPC deploye a ce moment-la.
--    - il cree `counter_belongs_to_bar()` : redondant, ce controle est deja
--      DANS `create_sale_idempotent` depuis 20261005090000.
--
--    ⚠️ Supprimer le fichier 20261004120000 serait pire que le garder : un
--    fichier absent ne previent personne. Il reste au depot avec cet
--    avertissement, et ne doit pas etre joue.

-- PREREQUIS EN PROD, tous verifies le 06/10 :
--   - 20261004090000 socle (counters, counter_assignments, counter_id)
--   - 20261004140000 triggers de maintien (comptoir auto + affectation auto)
--   - 20261005090000 create_sale_idempotent a 14 parametres
--   - 20261005100000 create_sales_batch transmet le comptoir
--   - FRONT DEPLOYE depuis 16h16 : verifie, une vente de 16h20 porte bien
--     son comptoir. C'est CE fait qui rend la presente migration utile —
--     avant lui, ces policies n'auraient rien eu a controler.

-- CE QUE FAIT CETTE MIGRATION :
--   1. un TRIGGER garantissant qu'une vente rattachee a un BON porte le
--      meme comptoir que lui
--   2. `can_write_on_counter()` : la couche comptoir des policies
--   3. TROIS policies RESTRICTIVES sur `sales`, en ECRITURE SEULEMENT

-- ⚠️⚠️ PORTEE REELLE DE CES POLICIES - A LIRE, defaut de documentation
--      trouve en revue de code (06/10) sur ma 1re redaction, qui les
--      presentait comme « la couche de securite du comptoir ». C'est FAUX.
--
--   `create_sale_idempotent`, `validate_sale`, `reject_sale`, `cancel_sale`
--   sont toutes SECURITY DEFINER. Elles s'executent donc en tant que
--   PROPRIETAIRE (postgres), qui a BYPASSRLS sur Supabase.
--   ⛔ LE CHEMIN NORMAL DE VENTE NE PASSE PAS PAR CES POLICIES.
--
--   Ce qu'elles couvrent REELLEMENT : les ecritures DIRECTES sur la table
--   via PostgREST. Recherche faite le 06/10 dans tout `src/` : il en existe
--   UNE SEULE, `supabase.from('sales').delete()` dans
--   `SalesService` (~ligne 482). Tous les autres `.from('sales')` du front
--   sont des LECTURES.
--
--   ⭐ Elles gardent donc leur utilite, mais comme FILET :
--     - elles ferment la suppression directe, aujourd'hui non controlee ;
--     - elles protegent d'avance toute ecriture directe qu'on ajouterait
--       demain sans y penser.
--
--   ⛔ LE VRAI CONTROLE DU COMPTOIR EST AILLEURS : dans le guard de
--   `create_sale_idempotent` (20261005090000), qui verifie que le comptoir
--   appartient au bar et que l'appelant y est habilite. Ne JAMAIS retirer ce
--   guard en croyant que « la RLS s'en charge » : elle ne s'en charge pas.
--
-- ⚠️ LE TRIGGER, LUI, S'APPLIQUE PARTOUT. Un trigger se declenche meme sous
--    un role BYPASSRLS. C'est donc la seule piece de cette migration qui
--    protege le chemin normal de vente. Elle est volontairement separee des
--    policies pour cette raison.

-- ⚠️⚠️ POURQUOI **RESTRICTIVES**, ET POURQUOI **PAS SUR LA LECTURE**
--
--   Releve du 04/10 : les 27 policies des 7 tables sont toutes PERMISSIVES.
--   Les permissives se CUMULENT en OR — une policy permissive de plus
--   n'interdirait RIEN. Seule une RESTRICTIVE se combine en AND. C'est le
--   seul moyen d'ajouter une condition SANS reecrire les 27 (donc sans
--   risquer d'en casser une).
--
--   ⛔ Et JAMAIS `FOR ALL`, qui engloberait le SELECT. Deux defauts trouves
--   en revue de code sur ma 1re redaction :
--
--   (A) UN NOUVEAU MEMBRE NE VERRAIT PLUS AUCUNE VENTE. Les 24 000+ ventes
--       existantes portent un comptoir (retro-remplissage de l'etape 1), donc
--       la tolerance NULL ne les protege pas. Pour un serveur, le seul chemin
--       passant devient `is_counter_member`. Un membre cree sans affectation
--       verrait un historique VIDE, sans message d'erreur.
--       (Les 2 triggers de 20261004140000 rendent ce cas improbable, mais
--        « improbable » n'est pas « impossible ».)
--
--   (B) UN ACCES BASE PAR LIGNE LUE. `can_write_on_counter` appelle 3
--       fonctions SECURITY DEFINER lisant chacune une table. Son argument
--       VARIE par ligne -> aucune memoisation possible malgre STABLE -> 1
--       SELECT sur counter_assignments PAR LIGNE DE VENTE LUE. Sur une page
--       d'historique de 50 ventes : 150+ appels. C'est le profil exact de
--       l'alerte Disk IO de septembre : un cout couple au chemin le plus
--       frequent de l'app.
--
--   D'ou la regle du chantier : **LECTURE au niveau bar, ECRITURE au niveau
--   comptoir**. La lecture reste portee par les 27 permissives existantes.
--   Le filtrage par comptoir des ECRANS est une clause WHERE cote client —
--   de l'affichage, pas de la securite par ligne.
--
-- ⚠️ Consequence ASSUMEE : un serveur du comptoir A peut LIRE les ventes du
--    comptoir B de son bar (via l'API, pas via l'ecran). Ce n'est pas une
--    fuite multi-tenant : il est membre du bar et y avait deja acces avant ce
--    chantier. L'isolation qui compte, celle entre BARS, reste intacte.

-- BREAKING_CHANGE: NO. Le risque de refus de vente est FAIBLE : le chemin
--   normal (RPC SECURITY DEFINER) contourne ces policies — voir la section
--   PORTEE REELLE ci-dessus. Le seul chemin reellement filtre est la
--   suppression directe de vente.
--   ⚠️ Le TRIGGER, en revanche, s'applique au chemin normal : s'il refusait
--   une vente, le message serait « Vente et bon sur des comptoirs
--   differents ». Le PRE-VOL 3 verifie qu'aucune donnee existante ne le
--   declenche. Rollback immediat dans les deux cas.

-- ROLLBACK_STRATEGY: DROP des 3 policies + du trigger + des 2 fonctions.
--   Les 27 permissives reprennent seules : comportement d'avant. Aucune
--   donnee a restaurer.

-- TABLES_MODIFIED: sales (+1 trigger)
-- FUNCTIONS_CREATED: enforce_sale_counter_matches_ticket, can_write_on_counter
-- TRIGGERS_CREATED: trg_sale_counter_matches_ticket (sales)
-- RLS_CHANGES: +3 policies RESTRICTIVES sur sales (INSERT/UPDATE/DELETE).
--   Les 27 permissives ne sont PAS touchees. RIEN sur la lecture.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les prerequis sont en place :
--
-- SELECT
--   (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='create_sale_idempotent')     AS nb_create_sale,
--   (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='is_counter_member')          AS helper_comptoir,
--   (SELECT COUNT(*) FROM counters WHERE is_primary)                        AS comptoirs_primaires,
--   (SELECT COUNT(*) FROM bars)                                            AS bars;
-- -- Attendu : nb_create_sale = 1 (⛔ si 2, ambiguite de surcharge),
-- --   helper_comptoir = 1, comptoirs_primaires = bars = 13.
--
-- 2) ⛔ LE FRONT ENVOIE-T-IL BIEN LE COMPTOIR ? Sans cela, ces policies
--    n'ont rien a controler et la tolerance NULL fait tout passer.
--
-- SELECT COUNT(*) AS ventes_1h, COUNT(counter_id) AS avec_comptoir_1h
-- FROM sales WHERE created_at > NOW() - INTERVAL '1 hour';
-- -- Attendu : les DEUX nombres EGAUX. S'ils diffèrent, une partie du parc
-- --   sert encore l'ancienne version (cache service worker d'un appareil) :
-- --   ATTENDRE, la tolerance NULL couvre ce cas mais autant le savoir.
--
-- 3) ⛔ AUCUNE DISCORDANCE VENTE/BON EXISTANTE (sinon le trigger refusera
--    toute future MAJ de ces lignes) :
--
-- SELECT COUNT(*) AS discordances
-- FROM sales s JOIN tickets t ON t.id = s.ticket_id
-- WHERE s.counter_id IS NOT NULL AND t.counter_id IS NOT NULL
--   AND s.counter_id <> t.counter_id;
-- -- Attendu : 0.
--
-- 4) Les 3 policies et le trigger n'existent pas deja :
--
-- SELECT policyname FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE 'Counter write scope%';
-- SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
-- WHERE c.relname='sales' AND t.tgname='trg_sale_counter_matches_ticket';
-- -- Attendu : 0 ligne chacune.
--
-- 5) Compter les permissives AVANT, pour prouver qu'on n'y touche pas :
--
-- SELECT COUNT(*) FROM pg_policies
-- WHERE schemaname='public' AND tablename='sales' AND permissive='PERMISSIVE';
-- -- NOTER ce nombre.


BEGIN;

-- ===================================================================
-- 1. CONCORDANCE VENTE <-> BON
-- ===================================================================
-- ⛔ PAS de contrainte CHECK : PostgreSQL INTERDIT les sous-requetes dans un
-- CHECK (`ERROR: cannot use subquery in check constraint`). Un CHECK ne voit
-- que les colonnes de SA ligne, jamais une autre table. Un TRIGGER BEFORE est
-- la seule construction capable de lire `tickets` au moment de l'ecriture.
--
-- ⚠️ `UPDATE OF counter_id, ticket_id` et non `UPDATE` nu : sans cette
-- restriction, le trigger se declencherait a CHAQUE validation ou annulation
-- de vente — sur le chemin le plus chaud de l'app, pour rien.
--
-- ⚠️ Il ne touche AUCUNE ligne existante (contrairement a une contrainte, qui
-- aurait exige un rescan des 24 000+ ventes ou un NOT VALID).

CREATE OR REPLACE FUNCTION public.enforce_sale_counter_matches_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ticket_counter UUID;
BEGIN
  -- Rien a verifier : pas de bon, ou comptoir pas encore renseigne.
  IF NEW.ticket_id IS NULL OR NEW.counter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.counter_id INTO v_ticket_counter
  FROM tickets t WHERE t.id = NEW.ticket_id;

  -- Bon dont le comptoir n'est pas encore renseigne : on laisse passer.
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
  'Trigger et non CHECK : PostgreSQL interdit les sous-requetes dans un '
  'CHECK. ⚠️ create_sale_idempotent fait deja prevaloir le comptoir du bon '
  '(COALESCE) : ce trigger garde les ecritures qui ne passent PAS par ce RPC.';

DROP TRIGGER IF EXISTS trg_sale_counter_matches_ticket ON public.sales;

CREATE TRIGGER trg_sale_counter_matches_ticket
  BEFORE INSERT OR UPDATE OF counter_id, ticket_id ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sale_counter_matches_ticket();


-- ===================================================================
-- 2. LA COUCHE COMPTOIR DES POLICIES
-- ===================================================================

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
    -- ⚠️ TOLERANCE DE TRANSITION : counter_id NULL passe.
    -- Necessaire tant qu'un appareil du parc peut servir l'ancienne version
    -- depuis son cache service worker (PWA). La retirer MAINTENANT refuserait
    -- les ventes de ces appareils.
    -- ⛔ Cette tolerance DOIT disparaitre a l'etape 2bis, avec le NOT NULL sur
    -- la colonne. Sinon elle devient un trou permanent : il suffirait
    -- d'omettre le comptoir pour contourner tout ce controle.
    p_counter_id IS NULL
    -- Superviseurs : ecrivent sur tous les comptoirs de leur bar.
    -- ⚠️ `is_super_admin()` n'est PAS redondant avec le role 'super_admin'
    -- ci-dessus : get_user_role() lit bar_members, et un super_admin n'est
    -- pas forcement membre du bar concerne.
    OR get_user_role(p_bar_id) = ANY (ARRAY['promoteur','co_promoteur','super_admin'])
    OR is_super_admin()
    -- Gerant / serveur : uniquement leurs comptoirs d'affectation.
    OR is_counter_member(p_counter_id);
$function$;

COMMENT ON FUNCTION public.can_write_on_counter IS
  'Couche comptoir des policies RESTRICTIVES, sur l''ECRITURE SEULEMENT. '
  '⛔ Ne JAMAIS l''utiliser dans un USING de SELECT : 3 fonctions SECURITY '
  'DEFINER avec un argument variable par ligne, donc non memoisable = 1 acces '
  'base PAR LIGNE LUE (profil de l''alerte Disk IO de 09/2026). La LECTURE '
  'reste au niveau bar, portee par les policies permissives existantes.';

REVOKE ALL ON FUNCTION public.can_write_on_counter(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_on_counter(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_on_counter(UUID, UUID)
  TO authenticated, service_role;


-- ===================================================================
-- 3. LES TROIS POLICIES RESTRICTIVES - ECRITURE SEULEMENT
-- ===================================================================
-- ⛔ TROIS policies et non une seule `FOR ALL` : voir l'avertissement en tete
-- de fichier (FOR ALL engloberait le SELECT -> membre aveugle + 1 acces base
-- par ligne lue).
--
-- ⚠️ Formes imposees par PostgreSQL :
--   INSERT n'accepte QUE WITH CHECK (pas de ligne « avant »)
--   DELETE n'accepte QUE USING     (pas de ligne « apres »)
--   UPDATE prend les DEUX — et les deux sont NECESSAIRES : sans WITH CHECK,
--     rien ne verifierait la ligne APRES ecriture, et on pourrait DEPLACER
--     une vente vers un comptoir ou l'on n'est pas habilite. C'est exactement
--     la dette constatee le 04/10 sur 5 policies UPDATE existantes — on ne la
--     reproduit pas ici.

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

-- ⛔ RIEN sur `tickets` : releve du 04/10, cette table n'a qu'UNE policy
-- permissive (SELECT). Ses INSERT/UPDATE passent par create_ticket /
-- pay_ticket en SECURITY DEFINER, qui s'executent en tant que proprietaire et
-- CONTOURNENT donc RLS. Une restrictive n'y changerait rien : le controle du
-- comptoir sur les bons doit etre fait DANS ces deux RPC.
--
-- ⛔ RIEN sur bar_products / supplies / stock_adjustments / returns /
-- consignments : c'est l'etape 3 (stock). Les ajouter maintenant filtrerait
-- le stock alors que le front ne demande pas encore un comptoir precis
-- -> ecrans vides.

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔⛔ LES 3 POLICIES SONT RESTRICTIVES, ET AUCUNE NE TOUCHE LE SELECT :
--
-- SELECT tablename, policyname, permissive, cmd
-- FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE 'Counter write scope%'
-- ORDER BY cmd;
-- -- Attendu : EXACTEMENT 3 lignes, permissive='RESTRICTIVE',
-- --   cmd = DELETE, INSERT, UPDATE.
-- -- ⛔ Si une ligne porte cmd='ALL' ou 'SELECT' : la LECTURE est filtree par
-- --   comptoir. Tout membre sans affectation verrait un historique VIDE,
-- --   sans message d'erreur. SUPPRIMER cette policy IMMEDIATEMENT.
--
-- 1bis) Controle direct qu'aucune restrictive ne couvre la lecture :
--
-- SELECT COUNT(*) AS restrictives_sur_lecture
-- FROM pg_policies WHERE schemaname='public' AND tablename='sales'
--   AND permissive='RESTRICTIVE' AND cmd IN ('ALL','SELECT');
-- -- Attendu : 0.
--
-- 2) Les permissives existantes sont intactes :
--
-- SELECT COUNT(*) FROM pg_policies
-- WHERE schemaname='public' AND tablename='sales' AND permissive='PERMISSIVE';
-- -- Attendu : le nombre note au PRE-VOL 5.
--
-- 3) Le trigger est actif et correctement restreint :
--
-- SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
-- FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname='sales' AND t.tgname='trg_sale_counter_matches_ticket';
-- -- Attendu : 1 ligne, tgenabled='O', definition portant
-- --   `UPDATE OF counter_id, ticket_id` (PAS `UPDATE` nu).
--
-- 4) Privileges de can_write_on_counter, dans les DEUX sens :
--
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname='can_write_on_counter';
-- -- Attendu : anon_peut=false ET auth_peut=true.
-- -- ⚠️ auth_peut=false rendrait TOUTE VENTE impossible : la policy
-- --   appellerait une fonction interdite. Ne jamais ne verifier que les refus.
--
-- 5) ⛔⛔ LE CONTROLE QUI COMPTE - EN SERVICE REEL.
--    Le SQL Editor ne peut PAS tester les policies (auth.uid() y est NULL).
--    ⚠️ Le point a surveiller n'est PAS les 3 policies (le chemin normal les
--    contourne) mais le TRIGGER de concordance, qui s'applique partout —
--    et l'etape (f) ci-dessous, qui verifie qu'aucune restrictive n'a
--    atteint la LECTURE par erreur.
--
--    DEPUIS L'APPLICATION, avant le service du soir :
--    a. SERVEUR    -> vendre un article : la vente DOIT partir
--    b. GERANT     -> valider cette vente : DOIT passer
--    c. GERANT     -> annuler une vente recente : DOIT passer
--    d. PROMOTEUR  -> annuler une vente validee : DOIT passer
--    e. mode simplifie : le gerant attribue une vente a un serveur nomme
--    f. ouvrir l'Historique des ventes : les ventes DOIVENT s'afficher
--       (⛔ si la liste est vide, une restrictive touche le SELECT :
--        rollback immediat)
--
--    ⛔ TOUTE VENTE REFUSEE = ROLLBACK IMMEDIAT :
--       DROP POLICY "Counter write scope on sales insert" ON public.sales;
--       DROP POLICY "Counter write scope on sales update" ON public.sales;
--       DROP POLICY "Counter write scope on sales delete" ON public.sales;
--       NOTIFY pgrst, 'reload schema';
--    Les 27 permissives reprennent seules : comportement d'avant la migration.
--
-- 6) Puis SURVEILLER UN SERVICE COMPLET. Le lendemain matin :
--
-- SELECT COUNT(*) AS ventes_service, COUNT(counter_id) AS avec_comptoir
-- FROM sales WHERE business_date = CURRENT_DATE - 1;
-- -- Attendu : les deux nombres egaux, et coherents avec l'activite reelle du
-- --   bar. Un volume anormalement BAS signifierait des ventes refusees — le
-- --   symptome le plus insidieux, car personne ne remonte une vente qui
-- --   « n'a pas marche, j'ai recommence ».


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
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
--
-- ⚠️ Aucune donnee a restaurer : cette migration n'ecrit AUCUNE ligne.
-- ⚠️ `sales.counter_id` reste en place et rempli (il vient de l'etape 1).


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ETAPE 2BIS - QUAND TOUT LE PARC ENVOIE LE COMPTOIR               │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ NE PAS EXECUTER MAINTENANT.
--
-- 1. Verifier que plus AUCUNE vente n'arrive sans comptoir :
--
--    SELECT COUNT(*) FROM sales
--    WHERE counter_id IS NULL AND created_at > NOW() - INTERVAL '72 hours';
--    -- Attendu : 0. Sinon un appareil sert encore l'ancienne version depuis
--    --   son cache service worker : ATTENDRE.
--
-- 2. Combler les orphelines (99 au 06/10) puis rendre la colonne obligatoire :
--
--    UPDATE sales s SET counter_id = c.id FROM counters c
--    WHERE c.bar_id = s.bar_id AND c.is_primary AND s.counter_id IS NULL;
--    ALTER TABLE sales ALTER COLUMN counter_id SET NOT NULL;
--
--    ⚠️ Cet UPDATE touche ~99 lignes de `sales`, table portant 7 triggers
--    FOR EACH ROW (dont 3 de refresh de vue). A ce volume le cout est
--    negligeable, mais au-dela : DISABLE TRIGGER USER avant / ENABLE apres,
--    dans la MEME transaction (lecon de l'etape 1).
--
-- 3. Retirer la tolerance `p_counter_id IS NULL` de `can_write_on_counter`
--    ci-dessus ET du guard comptoir de `create_sale_idempotent`
--    (20261005090000). Sans cela, omettre le comptoir contourne tout.
