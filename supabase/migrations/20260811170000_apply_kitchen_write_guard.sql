-- ═══════════════════════════════════════════════════════════════════════
-- BRANCHEMENT DE LA GARDE D'ÉCRITURE CUISINE — §19.7
-- 11/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- Seconde moitié de la correction. `20260811150000` a créé
-- `can_write_kitchen` ; ce fichier le BRANCHE dans les RPC qui ne
-- vérifiaient que `is_bar_member` - lequel ne teste AUCUN rôle.
--
-- ⛔ MESURE DU DÉFAUT, relevée sur la base de production au pré-vol :
-- 21 SERVEURS actifs peuvent aujourd'hui modifier un prix de vente ou
-- déclarer une fausse perte par appel RPC direct. Les permissions client ne
-- protègent rien contre un JWT valide.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐⭐ SUBSTITUTION AUTOMATIQUE, ET NON RÉÉCRITURE MANUELLE         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ RÉÉCRIRE CES FONCTIONS À LA MAIN SERAIT LE VRAI RISQUE de cette
-- correction. Le 10/08, reprendre `create_kitchen_order` par transformation
-- de texte a fait PERDRE CINQ ÉLÉMENTS - dont l'`UPDATE tickets` sans lequel
-- un ticket devient clôturable alors que ses plats cuisent. Rien n'échouait :
-- le défaut était SILENCIEUX, rattrapé par une relecture ligne à ligne.
--
-- ⭐ CE FICHIER NE RÉÉCRIT AUCUN CORPS. Il relit chaque fonction depuis
-- `pg_get_functiondef` - donc l'état RÉEL de la production, pas un fichier de
-- migration qui pourrait en diverger - et n'y remplace QUE la ligne de garde.
-- Tout le reste du corps est réinjecté à l'identique, caractère pour
-- caractère. Le risque de perte tombe structurellement à zéro.
--
-- ⚠️ CE QUI REND CETTE SUBSTITUTION SÛRE : le motif est UNIFORME sur les
-- treize fonctions, et présent UNE SEULE FOIS dans chacune - vérifié une par
-- une avant écriture :
--     IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
-- ⚠️ Certains FICHIERS contiennent deux occurrences, mais ce sont deux
-- FONCTIONS distinctes du même fichier - jamais deux gardes dans un même
-- corps. Le `replace()` reste donc chirurgical.
--
-- ⛔⛔ GARDE-FOU : si le motif est INTROUVABLE dans une fonction, la migration
-- ÉCHOUE au lieu de passer silencieusement. Une fonction non protégée qui
-- passerait inaperçue serait pire que pas de migration du tout.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUI CHANGE, ET CE QUI NE CHANGE PAS                           │
-- └─────────────────────────────────────────────────────────────────┘
--
-- AVANT : is_bar_member(p_bar_id) OR is_super_admin()
-- APRÈS : can_write_kitchen(p_bar_id)
--
-- ⭐ `is_super_admin()` DISPARAÎT du test, et ce n'est pas une perte :
-- `can_write_kitchen` inclut `super_admin` dans sa liste blanche. La
-- différence est qu'il exige désormais que le super_admin soit MEMBRE du bar,
-- comme les autres rôles - ce qu'il est déjà par construction dans ce projet
-- (`is_super_admin()` lit `bar_members`).
--
-- ⚠️ AUCUNE DONNÉE N'EST TOUCHÉE. Ni schéma, ni ligne : uniquement le corps de
-- treize fonctions.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Le helper existe (migration 20260811150000 appliquée)
--   SELECT proname FROM pg_proc
--   WHERE proname = 'can_write_kitchen' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : 1 ligne
--
--   -- 2. ⛔ LE MOTIF EST PRÉSENT DANS LES DIX FONCTIONS.
--   --    Une seule à 0 ferait échouer la migration — mieux vaut le savoir avant.
--   SELECT proname,
--          (pg_get_functiondef(oid) LIKE '%is_bar_member(p_bar_id) OR is_super_admin()%')
--            AS motif_present
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('upsert_dish','upsert_ingredient','replace_dish_recipe',
--                     'replace_dish_components','set_dish_active','set_ingredient_active',
--                     'produce_batch','close_batch','record_batch_loss',
--                     'record_ingredient_lot_loss','accept_kitchen_item',
--                     'mark_kitchen_item_ready','force_item_on_order')
--   ORDER BY proname;
--   -- ATTENDU : 13 lignes, motif_present = true partout
--
--   -- 2bis. ⛔⛔ LE MOTIF DE LISTE BLANCHE, tel que PostgreSQL le RESTITUE.
--   --
--   -- ⚠️ `pg_get_functiondef` peut NORMALISER l'espacement du corps. Si le
--   --    résultat est `false`, NE PAS APPLIQUER : la substitution des quatre
--   --    RPC échouerait sur son garde-fou (ce qui est le comportement voulu,
--   --    mais autant le savoir avant d'ouvrir la fenêtre).
--   SELECT proname,
--          (pg_get_functiondef(oid) LIKE '%''super_admin'',''promoteur'',''gerant''%')
--            AS motif_liste_blanche
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('replace_dish_price_options','replace_ingredient_sizes',
--                     'record_lot_counts','set_price_option_size')
--   ORDER BY proname;
--   -- ATTENDU : 4 lignes, true partout
--
--   -- 3. ⚠ Aucune SURCHARGE homonyme : la substitution viserait la mauvaise.
--   SELECT proname, count(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('upsert_dish','upsert_ingredient','replace_dish_recipe',
--                     'replace_dish_components','set_dish_active','set_ingredient_active',
--                     'produce_batch','close_batch','record_batch_loss',
--                     'record_ingredient_lot_loss','accept_kitchen_item',
--                     'mark_kitchen_item_ready','force_item_on_order')
--   GROUP BY proname HAVING count(*) > 1;
--   -- ATTENDU : aucune ligne

BEGIN;

DO $do$
DECLARE
  v_fn      TEXT;
  v_def     TEXT;
  v_new     TEXT;
  v_oid     OID;
  v_count   INTEGER;
  v_total   INTEGER := 0;
  /**
   * ⛔⛔ `pg_get_functiondef` NE RESTITUE PAS LES COMMENT - défaut trouvé à la
   * code review. Plusieurs de ces fonctions en portent un (`produce_batch`,
   * `set_dish_active`…), et ce ne sont pas des notes cosmétiques : c'est la
   * documentation métier consultable EN BASE, celle qu'on lit quand on
   * inspecte la production sans avoir le dépôt sous la main.
   *
   * ⭐ On le sauvegarde AVANT le remplacement et on le repose APRÈS.
   */
  v_comment TEXT;
  /**
   * ⚠️ LISTE EXPLICITE, jamais un balayage par motif.
   *
   * Sélectionner « toutes les fonctions contenant `is_bar_member` » toucherait
   * des RPC hors cuisine - ventes, tickets, abonnements - dont le périmètre de
   * rôle est DIFFÉRENT. Un serveur DOIT pouvoir créer une vente.
   *
   * ⭐ TROIS EXCLUSIONS VOLONTAIRES, pour qu'aucun relecteur n'ait à
   * s'interroger :
   *   · `create_kitchen_order` — prendre une commande EST le métier du
   *     serveur. La garder ouverte est le comportement voulu.
   *   · `recover_cancelled_dish` — son exclusion du cuisinier est un
   *     arbitrage DOCUMENTÉ (useBatchQueries.ts:81 : « décider qu'un plat
   *     reste servable est une décision sanitaire »). On ne l'aligne pas au
   *     passage.
   *   · `derive_dish_production_mode` — porte le motif, mais n'est GRANT
   *     qu'à `service_role` : aucun client ne peut l'appeler. La garder sans
   *     garde de rôle est sans conséquence.
   */
  v_targets TEXT[] := ARRAY[
    'upsert_dish',
    'upsert_ingredient',
    'replace_dish_recipe',
    'replace_dish_components',
    'set_dish_active',
    'set_ingredient_active',
    'produce_batch',
    'close_batch',
    'record_batch_loss',
    'record_ingredient_lot_loss',
    /**
     * ⛔⛔ LES TROIS RPC DE LA MACHINE D'ÉTAT - AJOUTÉES APRÈS UNE SECONDE
     * CERTIFICATION, et leur omission était le défaut le plus grave de ma
     * première version.
     *
     * `canUpdateKitchenOrderStatus` est `false` pour le SERVEUR
     * (types/index.ts:906) avec ce commentaire : « il voit la file mais ne
     * fait PAS avancer la production ». Et `true` pour le cuisinier - donc
     * `can_write_kitchen` porte exactement le bon périmètre, sans variante.
     *
     * ⚠️ `mark_kitchen_item_ready` N'EST PAS UNE ÉCRITURE ANODINE : elle
     * appelle `consume_ingredients_fefo`, prélève dans les lots, crée des
     * DETTES d'ingrédients et FIGE le coût matière. Un serveur l'appelant
     * directement décrémenterait le stock cuisine et fausserait la marge -
     * un effet comptable plus lourd qu'une fausse perte.
     *
     * ⭐ CE QUI AURAIT RENDU L'OMISSION DANGEREUSE : le post-vol aurait
     * affiché 10/10 en vert, le smoke-test serait passé, et la correction
     * aurait été considérée acquise avec trois portes encore ouvertes. Un
     * défaut qu'on croit corrigé est pire qu'un défaut connu.
     *
     * ⚠️ `serve_kitchen_item` et `cancel_kitchen_item`, du MÊME fichier, ont
     * déjà une garde de rôle : le clivage à l'intérieur d'un même groupe
     * confirme la dérive d'homogénéité plutôt qu'un arbitrage.
     */
    'accept_kitchen_item',
    'mark_kitchen_item_ready',
    'force_item_on_order'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_targets
  LOOP
    /**
     * ⛔ UNE SEULE fonction par nom, sinon on ne sait pas laquelle on modifie.
     * Le pré-vol n°3 le vérifie, mais une migration ne doit pas dépendre d'un
     * contrôle que quelqu'un pourrait sauter.
     */
    SELECT count(*) INTO v_count
    FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;

    IF v_count = 0 THEN
      RAISE EXCEPTION 'Fonction introuvable : %. Une migration antérieure manque-t-elle ?', v_fn;
    END IF;

    IF v_count > 1 THEN
      RAISE EXCEPTION 'SURCHARGES pour % (% versions) : la substitution viserait la mauvaise. Traiter à la main.', v_fn, v_count;
    END IF;

    SELECT oid, pg_get_functiondef(oid) INTO v_oid, v_def
    FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;

    /**
     * ⭐ IDEMPOTENCE - une fonction DÉJÀ gardée est ignorée, pas refusée.
     *
     * Sans ce test, un rejeu ferait ÉCHOUER toute la migration sur la
     * première fonction traitée : le motif d'origine a disparu, donc le
     * garde-fou ci-dessous lèverait. Or rejouer une migration ne doit rien
     * casser - le SQL Editor n'empêche personne de la relancer.
     */
    IF position('can_write_kitchen(p_bar_id)' IN v_def) > 0 THEN
      RAISE NOTICE '% : déjà gardée, ignorée', v_fn;
      CONTINUE;
    END IF;

    /**
     * ⛔⛔ LE GARDE-FOU CENTRAL. Si le motif a changé - une migration
     * ultérieure l'aurait réécrit autrement - on REFUSE plutôt que de laisser
     * la fonction sans protection. Une RPC qu'on croit gardée et qui ne l'est
     * pas est le pire des deux mondes.
     */
    IF position('is_bar_member(p_bar_id) OR is_super_admin()' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Motif de garde INTROUVABLE dans % — la fonction a dérivé, substitution refusée.', v_fn;
    END IF;

    -- ⭐ SEULE la garde change. Tout le reste du corps est réinjecté à
    -- l'identique par `pg_get_functiondef`.
    v_new := replace(
      v_def,
      'is_bar_member(p_bar_id) OR is_super_admin()',
      'can_write_kitchen(p_bar_id)'
    );

    -- ⭐ Sauvegarde AVANT : `CREATE OR REPLACE` conserve le COMMENT en
    -- pratique, mais rien ne le garantit et la perte serait silencieuse.
    v_comment := obj_description(v_oid, 'pg_proc');

    EXECUTE v_new;

    IF v_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                     v_fn, pg_get_function_identity_arguments(v_oid), v_comment);
    END IF;

    /**
     * ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS — leçon des vagues 1-4 du
     * durcissement RPC, et `pg_get_functiondef` ne les restitue PAS. Sans ces
     * trois lignes, la fonction deviendrait inappelable par `authenticated` :
     * le module entier cesserait de fonctionner.
     *
     * ⚠️ `pg_get_function_identity_arguments` et NON `oidvectortypes` : il
     * OMET les valeurs par défaut, ce qu'exigent précisément REVOKE et GRANT.
     * `produce_batch` porte cinq paramètres DEFAULT - avec la mauvaise
     * fonction, la signature reconstruite serait invalide.
     */
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
                   v_fn, pg_get_function_identity_arguments(v_oid));
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                   v_fn, pg_get_function_identity_arguments(v_oid));
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                   v_fn, pg_get_function_identity_arguments(v_oid));

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'Garde branchée sur % fonctions', v_total;
END
$do$;

/**
 * ⭐ ALIGNEMENT DES CINQ RPC QUI EXCLUAIENT LE CUISINIER À TORT.
 *
 * `replace_dish_price_options` et les quatre RPC du rapprochement portent une
 * garde de rôle ÉCRITE À LA MAIN qui exclut le cuisinier. Or elles sont
 * appelées depuis `DishesTab` et `IngredientsPage` - écrans qu'il ouvre
 * légitimement. Un cuisinier qui enregistre un format de prix reçoit
 * aujourd'hui « Seul le gérant peut configurer les formats de prix ».
 *
 * ⚠️ C'est la MÊME incohérence que celle corrigée ci-dessus, en sens inverse :
 * là une garde manquait, ici elle est trop stricte. Les deux produisent un
 * écran qui ment sur ce qu'il autorise.
 *
 * ⛔ `recover_cancelled_dish` N'EST PAS dans cette liste : son exclusion du
 * cuisinier est un arbitrage DOCUMENTÉ (useBatchQueries.ts:81 - « décider
 * qu'un plat reste servable est une décision sanitaire »). On ne l'aligne pas
 * au passage.
 */
DO $do$
DECLARE
  v_fn      TEXT;
  v_def     TEXT;
  v_oid     OID;
  -- ⭐ Même sauvegarde que le bloc A : `pg_get_functiondef` ne restitue
  -- pas les COMMENT.
  v_comment TEXT;
  v_targets TEXT[] := ARRAY[
    'replace_dish_price_options',
    'replace_ingredient_sizes',
    'record_lot_counts',
    'set_price_option_size'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_targets
  LOOP
    SELECT oid, pg_get_functiondef(oid) INTO v_oid, v_def
    FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'Fonction introuvable : %', v_fn;
    END IF;

    /**
     * ⛔⛔ IDEMPOTENCE - défaut trouvé à la code review, et il était SILENCIEUX.
     *
     * Le motif cherché (`'super_admin','promoteur','gerant'`) est un PRÉFIXE
     * de la liste déjà corrigée (`…,'cuisinier'`). Un rejeu aurait donc
     * produit `'gerant','cuisinier','cuisinier'` - syntaxiquement VALIDE,
     * donc appliqué sans erreur, et invisible jusqu'à ce que quelqu'un lise
     * la définition.
     *
     * ⭐ On sort AVANT toute écriture si le cuisinier y est déjà. Rejouer
     * cette migration devient alors sans effet, ce qu'une migration doit
     * être - le SQL Editor n'empêche personne de la relancer.
     */
    IF position('''cuisinier''' IN v_def) > 0 THEN
      RAISE NOTICE '% : cuisinier déjà présent, ignorée', v_fn;
      CONTINUE;
    END IF;

    -- ⛔ Même garde-fou : motif absent = refus, jamais de passage silencieux.
    IF position('''super_admin'',''promoteur'',''gerant''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Liste blanche INTROUVABLE dans % — substitution refusée.', v_fn;
    END IF;

    v_def := replace(
      v_def,
      '''super_admin'',''promoteur'',''gerant''',
      '''super_admin'',''promoteur'',''gerant'',''cuisinier'''
    );

    v_comment := obj_description(v_oid, 'pg_proc');

    EXECUTE v_def;

    IF v_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                     v_fn, pg_get_function_identity_arguments(v_oid), v_comment);
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
                   v_fn, pg_get_function_identity_arguments(v_oid));
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                   v_fn, pg_get_function_identity_arguments(v_oid));
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                   v_fn, pg_get_function_identity_arguments(v_oid));
  END LOOP;
END
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ LES DIX FONCTIONS APPELLENT LA GARDE, et plus `is_bar_member` seul
--   SELECT proname,
--          (pg_get_functiondef(oid) LIKE '%can_write_kitchen(p_bar_id)%') AS gardee
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('upsert_dish','upsert_ingredient','replace_dish_recipe',
--                     'replace_dish_components','set_dish_active','set_ingredient_active',
--                     'produce_batch','close_batch','record_batch_loss',
--                     'record_ingredient_lot_loss','accept_kitchen_item',
--                     'mark_kitchen_item_ready','force_item_on_order')
--   ORDER BY proname;
--   -- ATTENDU : 13 lignes, gardee = true partout
--
--   -- 2. ⛔ AUCUNE n'a gardé l'ancien motif
--   SELECT count(*) AS restantes FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND pg_get_functiondef(oid) LIKE '%is_bar_member(p_bar_id) OR is_super_admin()%'
--     AND proname IN ('upsert_dish','upsert_ingredient','replace_dish_recipe',
--                     'replace_dish_components','set_dish_active','set_ingredient_active',
--                     'produce_batch','close_batch','record_batch_loss',
--                     'record_ingredient_lot_loss','accept_kitchen_item',
--                     'mark_kitchen_item_ready','force_item_on_order');
--   -- ATTENDU : 0
--
--   -- 3. ⛔⛔ LE PLUS IMPORTANT — LES GRANTS ONT SURVÉCU.
--   --    `CREATE OR REPLACE` les perd ; sans eux le module est MORT.
--   --
--   -- ⚠️ PAR OID, et non par signature reconstruite — défaut trouvé à
--   --    l'exécution du post-vol : `pg_get_function_identity_arguments`
--   --    retourne « p_bar_id uuid », AVEC le nom du paramètre, que
--   --    `has_function_privilege` refuse (« invalid type name »).
--   --    REVOKE/GRANT l'acceptent, lui non. L'oid évite toute
--   --    reconstruction — et la migration, elle, était correcte.
--   SELECT p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_peut,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut
--   FROM pg_proc p
--   WHERE p.pronamespace = 'public'::regnamespace
--     AND p.proname IN ('upsert_dish','upsert_ingredient','replace_dish_recipe',
--                     'replace_dish_components','set_dish_active','set_ingredient_active',
--                     'produce_batch','close_batch','record_batch_loss',
--                     'record_ingredient_lot_loss','accept_kitchen_item',
--                     'mark_kitchen_item_ready','force_item_on_order',
--                     'replace_dish_price_options','replace_ingredient_sizes',
--                     'record_lot_counts','set_price_option_size')
--   ORDER BY p.proname;
--   -- ATTENDU : 17 lignes, auth_peut = true PARTOUT, anon_peut = false PARTOUT
--
--   -- 4. Le cuisinier est aligné sur les quatre RPC qui l'excluaient
--   SELECT proname,
--          (pg_get_functiondef(oid) LIKE '%''cuisinier''%') AS inclut_cuisinier
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('replace_dish_price_options','replace_ingredient_sizes',
--                     'record_lot_counts','set_price_option_size')
--   ORDER BY proname;
--   -- ATTENDU : 4 lignes, true partout
--
--   -- 5. ⚠ `recover_cancelled_dish` reste INCHANGÉE (exclusion documentée)
--   SELECT pg_get_functiondef(oid) LIKE '%''cuisinier''%' AS inclut_cuisinier
--   FROM pg_proc
--   WHERE proname = 'recover_cancelled_dish' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : false
--
-- ⚠️⚠️ SMOKE-TEST OBLIGATOIRE APRÈS. PL/pgSQL ne résout ses requêtes qu'à
-- l'exécution : ces contrôles prouvent que les fonctions EXISTENT et sont
-- GARDÉES, pas qu'elles RÉPONDENT. Créer un plat, saisir un appro et produire
-- un lot depuis l'UI - avec un compte GÉRANT - avant de considérer la
-- correction acquise.
