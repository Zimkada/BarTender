-- ═══════════════════════════════════════════════════════════════════════
-- GARDE DE RÔLE SUR LES ÉCRITURES CUISINE — §19.7
-- 11/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ LE DÉFAUT, remonté par un audit externe du module et VÉRIFIÉ.
--
-- QUATORZE RPC d'écriture du module cuisine ne vérifient QUE `is_bar_member`.
-- Or `is_bar_member` ne teste que l'appartenance au bar et `is_active` : il
-- ne regarde AUCUN rôle. Un serveur est membre actif de son bar - il passe.
--
-- Les permissions `canManageRecipes` et `canManageIngredientStock` sont bien
-- à `false` pour le rôle serveur, mais UNIQUEMENT CÔTÉ CLIENT (routes
-- protégées + masquage UI). Le jeton d'un serveur est un JWT Supabase
-- valide : un `supabase.rpc('upsert_dish', ...)` depuis la console du
-- navigateur passerait aujourd'hui.
--
-- ⚠️ CE N'EST PAS THÉORIQUE. `upsert_dish` écrit le PRIX DE VENTE, et
-- `record_batch_loss` / `record_ingredient_lot_loss` déclarent des PERTES :
-- les deux ont un effet comptable direct.
--
-- ⭐ POURQUOI C'EST UN OUBLI ET NON UN ARBITRAGE : neuf RPC voisines du MÊME
-- module portent la garde (`receive_ingredient_supply`,
-- `replace_dish_price_options`, `recover_cancelled_dish`, les quatre du
-- rapprochement…). Aucun document ne mentionne une délégation assumée du
-- contrôle au client. C'est une dérive d'homogénéité, ces RPC ayant été
-- écrites sur plusieurs jours.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POURQUOI UN HELPER ET NON DIX RÉÉCRITURES                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ Reprendre ces fonctions par `CREATE OR REPLACE` demanderait de
-- réécrire ~1 500 lignes de PL/pgSQL. C'est exactement ce qui a fait PERDRE
-- CINQ ÉLÉMENTS sur `create_kitchen_order` le 10/08 - dont l'`UPDATE tickets`
-- sans lequel un ticket devient clôturable alors que ses plats cuisent.
--
-- ⭐ Un HELPER change la donne : les fonctions ne sont pas réécrites, on leur
-- ajoute UNE LIGNE d'appel. Le risque de perte tombe à zéro, et la règle vit
-- à UN endroit - la durcir demain ne demandera qu'une migration.
--
-- ⚠️ Ce fichier ne fait donc QUE créer le helper. L'ajout de la ligne dans
-- chaque RPC se fait dans la migration suivante, fonction par fonction, avec
-- son propre post-vol.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les helpers dont celui-ci s'inspire existent
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('is_bar_member','is_super_admin')
--     AND pronamespace = 'public'::regnamespace
--   ORDER BY proname;
--   -- ATTENDU : 2 lignes
--
--   -- 2. Le helper n'existe pas déjà
--   SELECT proname FROM pg_proc
--   WHERE proname = 'can_write_kitchen' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : aucune ligne
--
--   -- 3. ⚠ Les rôles réellement présents en base — la liste blanche doit les
--   --    couvrir, sinon on verrouille un utilisateur légitime.
--   SELECT role, count(*) FROM public.bar_members
--   WHERE is_active = TRUE GROUP BY role ORDER BY role;
--   -- ATTENDU : super_admin / promoteur / gerant / serveur (+ cuisinier)

BEGIN;

/**
 * L'appelant peut-il ÉCRIRE sur la cuisine de ce bar ?
 *
 * ⭐ LISTE BLANCHE, jamais une liste noire : un rôle ajouté plus tard est
 * REFUSÉ par défaut. C'est la règle appliquée partout dans le module -
 * l'inverse (« tout sauf serveur ») ouvrirait silencieusement les portes au
 * prochain rôle créé.
 *
 * ⭐ UN SEUL HELPER, et non deux comme dans ma première version. J'avais
 * séparé « gérer la carte » de « opérer le service » pour exclure le
 * cuisinier du premier - la matrice ayant tranché l'inverse (cf. ci-dessous),
 * les deux listes devenaient identiques. Deux helpers au contenu identique
 * finiraient par diverger sans que rien ne le signale.
 *
 * ⭐ `auth.uid()`, en alignement avec `is_bar_member` (024_fix_all_permissions)
 * et les neuf gardes de rôle existantes du module.
 *
 * ⚠️ NE PAS SE FIER À LA MIGRATION 004, qui utilisait `get_current_user_id()` :
 * cette fonction a été SUPPRIMÉE par 009, et `is_bar_member` redéfinie trois
 * fois depuis (009, 016, 024). Lire une migration ancienne au lieu de la DERNIÈRE est
 * précisément le piège que ce projet documente - les fichiers de migration ne
 * reflètent pas l'état courant.
 *
 * ⚠️ STABLE et non IMMUTABLE : le résultat dépend de la session et de l'état
 * de `bar_members`. IMMUTABLE autoriserait PostgreSQL à mettre le résultat en
 * cache entre deux appels - une permission gelée serait une faille.
 *
 * ⭐ SECURITY DEFINER, comme `is_bar_member` depuis la migration 016 : lire
 * `bar_members` doit fonctionner quelle que soit la RLS de cette table.
 * ⭐ Le risque est NUL : la fonction ne prend qu'un `bar_id`, ne retourne
 * qu'un booléen sur l'appelant COURANT (`auth.uid()`, jamais le
 * définisseur), n'expose aucune donnée et n'écrit rien.
 */
CREATE OR REPLACE FUNCTION public.can_write_kitchen(bar_id_param UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    /**
     * ⛔⛔ EXEMPTION `service_role` - angle mort trouvé à la certification.
     *
     * Les DOUZE gardes de rôle déjà en place dans le module commencent
     * toutes par `IF auth.role() <> 'service_role'`. Sous cette clé,
     * `auth.uid()` est NULL : sans l'exemption, mon helper aurait refusé
     * TOUT appel serveur - file offline, tâches de fond, scripts de
     * maintenance - alors que ces chemins sont légitimes et déjà autorisés
     * partout ailleurs.
     */
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.bar_members
      WHERE user_id = auth.uid()
        AND bar_id = bar_id_param
        AND is_active = TRUE
        /**
       * ⛔⛔ LE CUISINIER EST INCLUS - correction d'une contre-analyse, et
       * c'est le point qui décide de toute cette migration.
       *
       * Ma première version l'excluait (« fixer un prix n'est pas son
       * ressort »). LA MATRICE DIT L'INVERSE : `canManageRecipes: true` et
       * `canManageIngredientStock: true` pour le cuisinier
       * (types/index.ts:967-968), et la route `/dishes` est gardée par
       * `canManageRecipes` avec ce commentaire explicite : « gérant,
       * promoteur et cuisinier ; PAS le serveur ».
       *
       * ⚠️ L'exclure aurait CASSÉ SON PROPRE ÉCRAN : il ouvre légitimement
       * Plats et Ingrédients, l'UI l'y autorise, et chaque enregistrement
       * aurait été rejeté par la base. Ce n'est pas un durcissement, c'est
       * une régression silencieuse.
       *
       * ⭐ Le défaut d'origine ne visait QUE le serveur. C'est lui qu'il faut
       * exclure, et lui seul.
       */
      AND role IN ('super_admin', 'promoteur', 'gerant', 'cuisinier')
    );
$$;

COMMENT ON FUNCTION public.can_write_kitchen(UUID) IS
  '§19.7 — l''appelant peut-il ÉCRIRE sur la cuisine de ce bar (carte, recettes, ingrédients) ? '
  '⛔ `is_bar_member` ne suffit PAS pour une écriture : il ne teste aucun rôle, et un SERVEUR est '
  'membre actif de son bar. Les permissions client (`canManageRecipes`…) ne protègent rien contre '
  'un appel RPC direct avec un jeton valide. '
  '⭐ Liste BLANCHE : un rôle ajouté plus tard est refusé par défaut. '
  '⭐ Le CUISINIER est INCLUS : la matrice lui donne `canManageRecipes` et '
  '`canManageIngredientStock`, et la route /dishes le laisse passer explicitement. L''exclure '
  'casserait son propre écran — l''UI l''autorise, la base le refuserait. '
  '⛔ Le SERVEUR est le SEUL exclu : c''est précisément le défaut que cette garde corrige.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRIVILÈGES                                                       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ `authenticated` doit pouvoir APPELER ces helpers : ils sont invoqués
-- DEPUIS les RPC, qui s'exécutent en SECURITY DEFINER — mais les RLS
-- policies pourraient aussi vouloir les utiliser un jour.
-- ⛔ `anon` non : personne d'anonyme n'a de rôle dans un bar.

REVOKE ALL ON FUNCTION public.can_write_kitchen(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_kitchen(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_kitchen(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Le helper existe
--   SELECT proname, provolatile FROM pg_proc
--   WHERE proname = 'can_write_kitchen'
--     AND pronamespace = 'public'::regnamespace
--   ORDER BY proname;
--   -- ATTENDU : 1 ligne, provolatile = 's' (STABLE)
--
--   -- 2. ⛔ LA LISTE BLANCHE EXACTE.
--   --
--   -- ⚠️ Test POSITIF sur la clause `role IN` elle-meme, et NON par absence
--   --    du mot « serveur » dans le corps : ce dernier apparait trois fois
--   --    dans les commentaires /** */ que `pg_get_functiondef` restitue
--   --    INTEGRALEMENT (la regex ne retire que les `--`). Le controle aurait
--   --    affiche false sur une migration saine - un faux echec en pleine
--   --    fenetre d application coute plus cher qu un controle absent.
--   --
--   -- ⭐ Un seul test verifie tout : cuisinier INCLUS et serveur EXCLU.
--   SELECT pg_get_functiondef(oid) LIKE '%role IN (''super_admin'', ''promoteur'', ''gerant'', ''cuisinier'')%'
--            AS liste_blanche_exacte
--   FROM pg_proc
--   WHERE proname = 'can_write_kitchen' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 2bis. ⛔ L'EXEMPTION `service_role` est presente (sans elle, tout
--   --       appel serveur serait refuse)
--   SELECT regexp_replace(pg_get_functiondef(oid), '--[^' || chr(10) || ']*', '', 'g') LIKE '%service_role%' AS exempte
--   FROM pg_proc
--   WHERE proname = 'can_write_kitchen' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 3. `anon` ne peut pas les appeler
--   SELECT has_function_privilege('anon','public.can_write_kitchen(uuid)','EXECUTE') AS anon_peut;
--   -- ATTENDU : false
--
-- ⚠️⚠️ CETTE MIGRATION NE PROTÈGE ENCORE RIEN. Elle crée le helper ; c'est la
-- SUIVANTE qui le branche dans les RPC, une ligne par fonction. Appliquer
-- celle-ci seule est SANS RISQUE et sans effet — c'est le but du découpage.
