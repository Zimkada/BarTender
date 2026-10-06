-- ===================================================================
-- MIGRATION: comptoirs - create_sales_batch transmet le comptoir
-- DATE: 2026-10-05
-- AUTHOR: AI Assistant
-- ===================================================================

-- PREREQUIS : 20261005090000_comptoirs_create_sale appliquee EN PREMIER.
--   Cette migration appelle create_sale_idempotent avec 14 arguments. Si la
--   signature a 14 parametres n'existe pas encore, la fonction compilera
--   quand meme (plpgsql ne resout qu'a l'execution) mais ECHOUERA au premier
--   rejeu offline. ⛔ Verifier le PRE-VOL 1.

-- POURQUOI CETTE MIGRATION EXISTE - defaut trouve en revue de code (05/10) :
--
--   `create_sales_batch` est le RPC que le SyncManager utilise pour rejouer
--   la FILE OFFLINE (src/services/SyncManager.ts). Il appelle
--   `create_sale_idempotent` avec 12 arguments POSITIONNELS, s'arretant a
--   `p_ticket_id`.
--
--   Consequence : meme apres le deploiement du front qui envoie le comptoir,
--   TOUTE VENTE ENREGISTREE HORS RESEAU repartirait SANS comptoir. Son Z de
--   caisse ne serait attribue a aucun comptoir, et a l'etape 2bis (NOT NULL)
--   elle serait purement REFUSEE.
--
--   C'est exactement le defaut que le plan du 04/10 qualifiait de
--   « corruption silencieuse » : la vente hors reseau atterrit au mauvais
--   endroit, sans aucune erreur visible.

-- ⚠️⚠️ DEUX CORRECTIONS DANS LA MEME INSTRUCTION - la 2e est HORS PERIMETRE
--   du chantier comptoirs, et signalee comme telle au promoteur.
--
--   (A) p_counter_id — l'objet de cette migration.
--
--   (B) p_source_return_id — ⛔ BUG PREEXISTANT, sans rapport avec les
--       comptoirs. Le builder TypeScript (`buildCreateSaleParams`) envoie
--       bien `p_source_return_id` dans le JSON, mais ce SQL ne le lit PAS.
--       Donc toute vente d'ECHANGE (flux « Magic Swap ») rejouee hors ligne
--       PERD son lien vers le retour d'origine.
--       La documentation du projet affirme que « les IDs stables garantissent
--       la tracabilite meme en mode offline » : cette garantie est FAUSSE sur
--       le chemin du batch depuis l'origine.
--       Corrige ici car c'est l'instruction exacte qu'on modifie, et que le
--       cout est d'une ligne. Pour s'en tenir strictement au comptoir,
--       retirer la ligne `p_source_return_id` ci-dessous.

-- ⚠️ LE RESTE DU CORPS EST REPRIS LIGNE POUR LIGNE depuis
--   `pg_get_functiondef` en prod (releve du 05/10). Le bloc EXCEPTION par
--   vente (succes partiel du batch) est INCHANGE : c'est lui qui evite qu'une
--   vente en erreur bloque les autres du lot.

-- BREAKING_CHANGE: NO - signature (p_bar_id, p_sales) inchangee. Aucune
--   surcharge creee, donc aucune ambiguite possible.

-- ROLLBACK_STRATEGY: recreer le corps a 12 arguments depuis la copie
--   sauvegardee au PRE-VOL 3. La signature ne change pas, donc un simple
--   CREATE OR REPLACE suffit — pas de DROP, pas de privileges a reposer.

-- TABLES_MODIFIED: aucune
-- FUNCTIONS_MODIFIED: create_sales_batch (corps seul, signature inchangee)
-- RLS_CHANGES: aucune
-- ⛔ PRIVILEGES_CHANGES: OUI — `EXECUTE` retire a PUBLIC, accorde
--   explicitement a authenticated + service_role. Decouvert au PRE-VOL du
--   06/10 : la fonction etait executable SANS AUTHENTIFICATION alors qu'elle
--   est SECURITY DEFINER (donc hors RLS). Voir PRE-VOL 4.


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ ⛔⛔ ORDRE DE DEPLOIEMENT - A LIRE AVANT TOUTE CHOSE              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
--
--   1. 20261005090000_comptoirs_create_sale  (la fonction unitaire)
--   2. CETTE MIGRATION                        (le rejeu par lot)
--   3. PUIS SEULEMENT le deploiement du front
--
-- ⛔ L'INVERSE ARRETE LA CAISSE, ET CE N'EST PAS UN RISQUE : C'EST UNE
--    CERTITUDE.
--
--   A comptoir unique, `CounterProvider` resout TOUJOURS un comptoir (il
--   retombe sur le comptoir primaire du bar). Donc des le deploiement du
--   front, `p_counter_id` est renseigne et part dans le corps de CHAQUE
--   appel RPC.
--
--   Si la fonction en base n'accepte pas encore ce parametre, PostgREST ne
--   trouve aucune signature correspondante :
--       PGRST202 — Could not find the function public.create_sale_idempotent(
--                  ..., p_counter_id, ...) in the schema cache
--   => AUCUNE VENTE NE PASSE PLUS, sur tous les bars, immediatement.
--
-- ⚠️ Rappel projet : DEUX projets Vercel deploient ce depot, et seul
--    `bar-tender` sert `bartenderpro-africa.com`. Un deploiement vert sur
--    l'autre ne prouve RIEN. Verifier ce qui tourne reellement :
--        https://bartenderpro-africa.com/version.json
--    Comparer son `buildTime` a la date du dernier commit pousse.
--
-- ⚠️ L'inverse (migrations appliquees, front PAS encore deploye) est SANS
--    RISQUE : `p_counter_id` a une valeur par defaut, les appels a 13
--    arguments nommes continuent de fonctionner. C'est precisement pourquoi
--    cet ordre-la est le bon.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ create_sale_idempotent accepte-t-elle DEJA 14 parametres ?
--
-- SELECT pg_get_function_identity_arguments(p.oid) AS signature
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
-- -- Attendu : 1 SEULE ligne, terminant par `p_counter_id uuid`.
-- -- ⛔ Si la signature n'a que 13 parametres : appliquer d'abord
-- --   20261005090000_comptoirs_create_sale. Sinon le rejeu offline echouera.
-- -- ⛔ Si 2 lignes : ambiguite de surcharge, les ventes sont DEJA cassees.
--
-- 2) Signature de create_sales_batch (doit rester inchangee) :
--
-- SELECT pg_get_function_identity_arguments(p.oid) AS signature
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sales_batch';
-- -- Attendu : `p_bar_id uuid, p_sales jsonb`.
--
-- 3) ⛔ SAUVEGARDER LE CORPS ACTUEL (necessaire au rollback) :
--
-- SELECT pg_get_functiondef(p.oid) FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sales_batch';
-- -- COPIER le resultat avant d'executer.
--
-- 4) ⛔⛔ PRIVILEGES ACTUELS - RELEVE REEL DU 06/10/2026 :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema='public' AND routine_name='create_sales_batch';
-- -- Releve : **PUBLIC** + postgres. PAS `authenticated`, PAS `service_role`.
--
-- ⚠️ CE N'EST PAS CE QUE J'AVAIS SUPPOSE EN ECRIVANT CE FICHIER. La fonction
--    est executable par PUBLIC — donc par `anon`, sans authentification.
--    `authenticated` et `service_role` ne peuvent l'executer aujourd'hui que
--    PAR HERITAGE de ce droit PUBLIC, pas par un grant propre.
--
-- ⛔ C'est une FAILLE REELLE, pas une coquetterie : cette fonction est
--    SECURITY DEFINER, donc elle CONTOURNE la RLS. Avec le droit PUBLIC,
--    n'importe qui pouvait creer des ventes, sur n'importe quel bar, sans
--    etre authentifie. Les gardes internes de `create_sale_idempotent`
--    limitaient les degats (membership, role, prix) mais la porte etait
--    ouverte.
--
-- ⚠️ Il s'agit du motif documente dans la memoire projet : 162 fonctions
--    heritent d'un `EXECUTE` PUBLIC par defaut (`proacl =X/postgres`), a
--    durcir AU CAS PAR CAS. On en durcit UNE ici, parce que c'est celle
--    qu'on modifie — pas par un balayage opportuniste.
--
-- 5) Verifier qu'AUCUN autre appelant ne depend du droit PUBLIC.
--    Recherche faite le 06/10 dans : src/, supabase/functions/, les autres
--    fonctions SQL et les jobs cron. Resultat : UN SEUL appelant,
--    `SyncManager.ts`, qui utilise le client supabase standard — donc le
--    role `authenticated`, couvert par le GRANT ci-dessous.
--
-- SELECT jobname, command FROM cron.job WHERE command ILIKE '%create_sales_batch%';
-- -- Attendu : 0 ligne.


BEGIN;

CREATE OR REPLACE FUNCTION public.create_sales_batch(
    p_bar_id uuid,
    p_sales jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_sale_data JSONB;
    v_result JSONB;
    v_results JSONB := '[]'::jsonb;
    v_created_sale sales;
    v_error TEXT;
BEGIN
    -- Boucle sur chaque vente du tableau
    FOR v_sale_data IN SELECT * FROM jsonb_array_elements(p_sales)
    LOOP
        BEGIN
            -- Appel de la fonction atomique existante
            -- On extrait chaque champ du JSON object individuel
            SELECT * INTO v_created_sale
            FROM public.create_sale_idempotent(
                p_bar_id,
                v_sale_data->'p_items', -- JSON array of items
                v_sale_data->>'p_payment_method',
                (v_sale_data->>'p_sold_by')::UUID,
                v_sale_data->>'p_idempotency_key',
                (v_sale_data->>'p_server_id')::UUID,
                COALESCE(v_sale_data->>'p_status', 'validated'),
                v_sale_data->>'p_customer_name',
                v_sale_data->>'p_customer_phone',
                v_sale_data->>'p_notes',
                (v_sale_data->>'p_business_date')::DATE,
                (v_sale_data->>'p_ticket_id')::UUID,
                -- ⛔ (B) BUG PREEXISTANT CORRIGE (hors perimetre comptoirs).
                -- Cet argument n'etait PAS transmis : toute vente d'echange
                -- rejouee hors ligne perdait son lien vers le retour
                -- d'origine. Le builder TypeScript l'envoie pourtant depuis
                -- toujours. Retirer cette ligne pour s'en tenir strictement
                -- au comptoir.
                (v_sale_data->>'p_source_return_id')::UUID,
                -- ⭐ (A) L'OBJET DE CETTE MIGRATION : le comptoir, FIGE a la
                -- saisie cote client et transporte dans la file IndexedDB.
                -- Sans cette ligne, toute vente hors reseau repart sans
                -- comptoir, meme front deploye.
                (v_sale_data->>'p_counter_id')::UUID
            );

            -- Conservation du résultat SUCCÈS
            v_result := jsonb_build_object(
                'idempotency_key', v_sale_data->>'p_idempotency_key',
                'temp_id', v_sale_data->>'temp_id', -- Pass-through utility
                'success', true,
                'sale_id', v_created_sale.id
            );

        EXCEPTION WHEN OTHERS THEN
            -- Capture de l'erreur pour ne pas bloquer les autres ventes du batch
            v_error := SQLERRM;

            -- Conservation du résultat ÉCHEC
            v_result := jsonb_build_object(
                'idempotency_key', v_sale_data->>'p_idempotency_key',
                'temp_id', v_sale_data->>'temp_id',
                'success', false,
                'error', v_error
            );
        END;

        -- Ajout au tableau de résultats
        v_results := v_results || v_result;
    END LOOP;

    RETURN v_results;
END;
$function$;

-- ⛔⛔ CES 3 LIGNES CHANGENT LA SURFACE DE SECURITE - ce n'est PAS un geste
--     gratuit, contrairement a ce que ce fichier affirmait avant la revue
--     de code du 06/10.
--
--   Etat AVANT (releve reel) : EXECUTE a **PUBLIC** -> executable sans
--   authentification, sur une fonction SECURITY DEFINER qui contourne la RLS.
--   Etat APRES : PUBLIC retire, grant explicite a authenticated + service_role.
--
-- ⚠️ ORDRE IMPOSE : REVOKE **puis** GRANT. L'inverse laisserait l'heritage
--    PUBLIC en place sur les roles vises.
--
-- ⚠️ `authenticated` est INDISPENSABLE : le SyncManager utilise le client
--    supabase standard, donc ce role. L'omettre rendrait tout rejeu offline
--    impossible — panne qui ne se verrait qu'a la prochaine coupure reseau.
-- (Lecon du durcissement RPC du 04/07/2026 : toujours asserter les acces
--  REQUIS, pas seulement les acces refuses.)
REVOKE ALL ON FUNCTION public.create_sales_batch(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sales_batch(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sales_batch(uuid, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_sales_batch(uuid, jsonb) IS
  'Rejeu par lot de la file offline (SyncManager). Appelle '
  'create_sale_idempotent par vente, avec un bloc EXCEPTION individuel pour '
  'qu''une vente en erreur ne bloque pas les autres du lot. '
  'MAJ 05/10/2026 : transmet enfin p_counter_id (sinon toute vente hors '
  'reseau repartait sans comptoir) ET p_source_return_id (bug preexistant : '
  'les ventes d''echange perdaient leur tracabilite au rejeu).';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La signature n'a PAS change et les privileges tiennent :
--
-- SELECT
--   pg_get_function_identity_arguments(p.oid) AS signature,
--   has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_peut,
--   has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sales_batch';
-- -- Attendu : `p_bar_id uuid, p_sales jsonb`, anon_peut = **false**,
-- --   auth_peut = true, service_peut = true.
-- -- ⛔ `anon_peut` DOIT passer de true (etat avant migration, via PUBLIC) a
-- --   false. S'il reste true, le REVOKE FROM PUBLIC n'a pas pris effet.
-- -- ⚠️ `auth_peut = true` est CRITIQUE : c'est le role du SyncManager (client
-- --   supabase standard). A false, AUCUNE vente offline ne se synchronise
-- --   plus — et cela ne se verrait qu'a la prochaine coupure reseau.
--
-- 1bis) Confirmer que PUBLIC n'a plus rien :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema='public' AND routine_name='create_sales_batch';
-- -- Attendu : authenticated + service_role + postgres. PLUS de ligne PUBLIC.
--
-- 2) Le corps transmet bien les 14 arguments :
--
-- SELECT (length(p.prosrc) - length(replace(p.prosrc, 'p_counter_id', ''))) / length('p_counter_id') AS occurrences_counter
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sales_batch';
-- -- Attendu : >= 1.
--
-- 3) ⛔ LE CONTROLE QUI COMPTE - LE REJEU OFFLINE FONCTIONNE.
--    Impossible a tester en SQL : il faut passer par l'app.
--
--    DEPUIS L'APPLICATION, en coupant le reseau :
--    a. couper le reseau (mode avion, ou devtools « Offline »)
--    b. enregistrer 2 ou 3 ventes -> elles partent en file
--    c. verifier le badge de synchronisation : operations en attente
--    d. retablir le reseau -> la file se rejoue
--    e. verifier en base que les ventes sont arrivees :
--
--       SELECT id, counter_id, created_at FROM sales
--       WHERE bar_id = '<bar>' ORDER BY created_at DESC LIMIT 5;
--
--    ⚠️ `counter_id` restera NULL tant que le front deploye n'envoie pas le
--       comptoir : c'est NORMAL a ce stade. Ce qui compte ici est que les
--       ventes ARRIVENT, sans erreur.
--    ⛔ Si le rejeu echoue avec « function create_sale_idempotent(...) does
--       not exist » : la migration 20261005090000 n'a pas ete appliquee.
--       ROLLBACK immediat de celle-ci.
--
-- 4) ⭐ TEST DE L'ECHANGE (correction B), si le flux est utilisable :
--    faire un retour avec echange HORS RESEAU, puis resynchroniser.
--
--    SELECT r.id, r.linked_sale_id, s.source_return_id
--    FROM returns r LEFT JOIN sales s ON s.source_return_id = r.id
--    WHERE r.bar_id = '<bar>' ORDER BY r.created_at DESC LIMIT 3;
--    -- Attendu APRES correction : linked_sale_id et source_return_id
--    --   renseignes. AVANT, ils etaient perdus au rejeu.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ROLLBACK                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Recoller le corps sauvegarde au PRE-VOL 3 tel quel :
--
--   <COLLER LE pg_get_functiondef SAUVEGARDE>
--   NOTIFY pgrst, 'reload schema';
--
-- ⚠️ La signature ne changeant pas, aucun DROP et aucun GRANT a reposer.
-- ⚠️ Revenir en arriere REINTRODUIT les deux defauts : ventes offline sans
-- comptoir, et echanges sans tracabilite au rejeu.
