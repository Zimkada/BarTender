-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: get_kitchen_queue_shortfalls
-- Ce qui MANQUERA pour la file en cours - un seul appel (§4.4, §9).
-- ═══════════════════════════════════════════════════════════════════
--
-- ⭐⭐ POURQUOI CETTE RPC EXISTE
-- Le serveur ne bloque JAMAIS sur un ingrédient manquant : il crée une DETTE
-- (§4.4). Le cuisinier lance donc sa préparation, elle réussit, et l'anomalie
-- n'apparaît que dans un écran qu'il n'ouvre pas. Cette fonction rend l'écart
-- visible AVANT le geste.
--
-- ⛔ ELLE NE BLOQUE RIEN et ne doit jamais servir à bloquer. Son résultat est
--    un AVERTISSEMENT. Le §4.4 est explicite : « en cuisine réelle, le
--    cuisinier voit ce qu'il a. Un stock théorique à 0 ne doit pas empêcher un
--    plat de sortir. »
--
-- ⭐ POURQUOI CÔTÉ SERVEUR ET NON EN TS
-- `useDishRecipe` charge UNE recette par appel : une file de 20 plats aurait
-- fait 20 requêtes (N+1) sur l'écran le plus sollicité, après 3 vagues
-- d'optimisation d'egress. Ici : UN appel pour toute la file.
--
-- ⚠️ LECTURE SEULE, STABLE. Aucun UPDATE, aucun verrou, aucune dette créée.
--    Ne consomme rien : elle SIMULE.
--
-- ⚠️ CE N'EST PAS UN CALCUL FEFO. Le vrai prélèvement se fait lot par lot avec
--    `FOR UPDATE` ; ici on compare des TOTAUX. C'est suffisant pour dire « il
--    manquera ~X », et c'est délibérément moins précis : répliquer le FEFO
--    créerait une seconde implémentation de la même règle, et c'est justement
--    l'écart théorique/réel qui est la métrique du module (§8).
--
-- ⛔ AUCUN MONTANT DANS LA SORTIE (§8). Le cuisinier voit des QUANTITÉS. Cette
--    fonction lui est destinée en priorité : y mettre un coût lui exposerait
--    un chiffre d'argent que son rôle exclut.
--
-- BREAKING_CHANGE: NO - création pure, aucune signature existante touchée.
--
-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_kitchen_queue_shortfalls(uuid);
--
-- FUNCTIONS_CREATED: public.get_kitchen_queue_shortfalls
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL - à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
-- SELECT to_regclass('public.kitchen_order_items')  AS t_items,
--        to_regclass('public.dish_ingredients')     AS t_recipe,
--        to_regclass('public.ingredient_lots')      AS t_lots,
--        to_regclass('public.ingredients')          AS t_ingredients,
--        to_regclass('public.dishes')               AS t_dishes;
--   → les 5 doivent être NON NULL.
--
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'get_kitchen_queue_shortfalls';
--   → 0 ligne attendue (création pure). Si une ligne sort, cette migration a
--     DÉJÀ été appliquée : ne pas la rejouer sans lire le post-vol.
--
-- -- Colonnes indispensables (une absence ferait échouer la fonction à l'appel,
-- -- pas à la création) :
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='kitchen_order_items'
--    AND column_name IN ('status','dish_id','quantity','forced_on_order','bar_id');
--   → 5 lignes attendues. `forced_on_order` vient de 20260808090000 : si elle
--     manque, appliquer d'abord cette migration.
--
-- -- Helpers de la garde multi-tenant (mêmes que get_kitchen_production) :
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin');
--   → 2 lignes attendues.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ FONCTION                                                         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_kitchen_queue_shortfalls(
  p_bar_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- ⭐⭐ ISOLATION MULTI-TENANT. En `SECURITY DEFINER` la RLS des tables lues
  --    NE S'APPLIQUE PAS : sans cette garde, tout utilisateur authentifié
  --    lirait le stock d'un autre bar en passant son UUID.
  -- ⚠️ `is_bar_member` / `is_super_admin` — mêmes helpers que
  --    `get_kitchen_production` (20260806140000). Réécrire la requête à la
  --    main créerait une seconde définition de « membre du bar ».
  -- ⚠️ Enveloppe { success: false } et NON une exception : motif de toutes les
  --    RPC de LECTURE du module. Le client teste `success`, il n'attrape pas.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  WITH
  /**
   * ⭐ LA FILE EN COURS - ce qui n'est pas encore prêt.
   *
   * ⛔ `pending` et `accepted` SEULEMENT. Un item `preparing` a déjà été
   *    démarré, `ready` a DÉJÀ consommé sa matière : l'inclure ferait compter
   *    deux fois un stock déjà sorti, et afficherait un manque imaginaire.
   */
  queue AS (
    SELECT koi.dish_id,
           koi.quantity,
           koi.forced_on_order
    FROM public.kitchen_order_items koi
    WHERE koi.bar_id = p_bar_id
      AND koi.status IN ('pending', 'accepted')
  ),

  /**
   * ⭐ RÉGIME du plat - il commande le filtre de stade ci-dessous.
   * ⚠️ `production_mode` est NOT NULL DEFAULT 'on_order' (20260803100000) :
   *    aucun COALESCE nécessaire. Il est DÉRIVÉ de la recette par
   *    `replace_dish_recipe`, jamais écrit à la main.
   */
  modes AS (
    SELECT d.id AS dish_id,
           d.production_mode AS mode
    FROM public.dishes d
    WHERE d.bar_id = p_bar_id
  ),

  /**
   * ⭐⭐ BESOIN TOTAL PAR INGRÉDIENT - réplique EXACTE de la sélection de
   * `mark_ready_kitchen_item` (20260808090000, lignes 430-440).
   *
   * ⛔ LE FILTRE DE STADE EST CONDITIONNÉ, JAMAIS GLOBAL. `consumed_at_stage`
   *    a pour défaut 'batch' : un `WHERE consumed_at_stage = 'finish'`
   *    inconditionnel écarterait les ingrédients de TOUS les plats existants
   *    et annoncerait « rien ne manque » en permanence.
   *
   * ⭐ `forced_on_order` : une ligne basculée consomme la recette ENTIÈRE,
   *    comme un plat `on_order` (§16.9, 3C.1).
   *
   * ⛔ `is_optional` N'EST PAS FILTRÉ, contrairement au calcul de coût qui
   *    l'exclut. `mark_ready` prélève les lignes optionnelles : les écarter
   *    ici tairait un manque qui deviendra une vraie dette.
   *
   * ⭐ QUANTITÉ BRUTE = quantity / yield_factor (DIVISION). 0.8 = 20 % de
   *    perte : il faut sortir 125 g pour en utiliser 100.
   * ⚠️ NULLIF sur yield_factor : une valeur à 0 donnerait une division par
   *    zéro. COALESCE à 1 = pas de perte, le repli sûr.
   */
  needs AS (
    SELECT di.ingredient_id,
           SUM(
             ROUND(
               (di.quantity / COALESCE(NULLIF(di.yield_factor, 0), 1)) * q.quantity,
               3
             )
           ) AS required
    FROM queue q
    JOIN modes m ON m.dish_id = q.dish_id
    JOIN public.dish_ingredients di
      ON di.dish_id = q.dish_id
     AND di.bar_id = p_bar_id
    WHERE (q.forced_on_order
           OR m.mode <> 'batch_finish'
           OR di.consumed_at_stage = 'finish')
    GROUP BY di.ingredient_id
  ),

  /**
   * ⭐⭐ DISPONIBLE = Σ des LOTS ACTIFS, jamais `ingredients.current_stock`.
   *
   * ⛔ `current_stock` est un CACHE - son propre commentaire le dit :
   *    « Source de vérité : Σ lots actifs − Σ dettes ouvertes ». Un cache
   *    désynchronisé ferait dire à l'alerte l'inverse de la réalité.
   *
   * ⚠️ Mêmes prédicats que la boucle FEFO : `status = 'active'` ET
   *    `remaining_qty > 0`. Un lot 'depleted' ou périmé n'est plus prélevable.
   *
   * ⚠️ LEFT JOIN : un ingrédient sans AUCUN lot doit apparaître avec 0, pas
   *    disparaître. C'est précisément le cas le plus grave - jamais approvisionné.
   */
  available AS (
    SELECT i.id AS ingredient_id,
           i.name,
           i.unit,
           i.cost_mode,
           /**
            * ⭐⭐ FORMULE EXACTE de la source de vérité :
            *     Σ lots actifs − Σ dettes OUVERTES
            * (`consume_ingredients_fefo`, 20260802160000, lignes 431-441).
            *
            * ⛔ DÉFAUT CORRIGÉ à la code review du 08/08/2026 : la première
            *    version s'arrêtait à Σ lots. Un bar portant déjà une dette de
            *    5 kg de riz l'aurait ignorée, et l'alerte aurait SOUS-ESTIMÉ
            *    le manque d'autant — l'erreur la plus grave possible ici,
            *    puisqu'elle rassure à tort.
            *
            * ⚠️ Sous-requête et non un second LEFT JOIN : joindre deux tables
            *    à cardinalités différentes sur le même GROUP BY multiplierait
            *    les lignes (3 lots × 2 dettes = 6), gonflant les deux sommes.
            *
            * ⚠️ `qty_owed - settled_qty` : une dette partiellement régularisée
            *    ne pèse que pour son RESTE.
            */
           COALESCE(SUM(l.remaining_qty), 0) - COALESCE((
             SELECT SUM(d.qty_owed - d.settled_qty)
             FROM public.ingredient_stock_debts d
             WHERE d.ingredient_id = i.id
               AND d.bar_id = p_bar_id
               AND d.status = 'open'
           ), 0) AS in_stock
    FROM public.ingredients i
    LEFT JOIN public.ingredient_lots l
      ON l.ingredient_id = i.id
     AND l.bar_id = p_bar_id
     AND l.status = 'active'
     AND l.remaining_qty > 0
    WHERE i.bar_id = p_bar_id
    GROUP BY i.id, i.name, i.unit, i.cost_mode
  )

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'ingredient_id', a.ingredient_id,
             'name',          a.name,
             'unit',          a.unit,
             'required',      n.required,
             'available',     a.in_stock,
             'missing',       ROUND(n.required - a.in_stock, 3)
           )
           ORDER BY (n.required - a.in_stock) DESC
         ), '[]'::JSONB)
  INTO v_result
  FROM needs n
  JOIN available a ON a.ingredient_id = n.ingredient_id
  /**
   * ⛔ SEUL `direct` DÉCRÉMENTE (§16.3, §4.4). `global` (sel, eau),
   *    `per_dish_flat` (huile) et `cost_only` ne touchent pas au stock :
   *    personne ne pèse l'huile. Les signaler serait une alerte sur une
   *    quantité que le serveur ne prélèvera jamais - et une fausse alerte
   *    apprend à ignorer les vraies.
   */
  WHERE a.cost_mode = 'direct'
    AND n.required > a.in_stock;

  RETURN jsonb_build_object(
    'success', TRUE,
    'shortfalls', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) IS
  'Ingrédients qui manqueront pour la file en cours (pending + accepted). '
  'AVERTISSEMENT SEULEMENT : le service ne bloque jamais sur un stock à 0, il '
  'crée une dette (§4.4). Lecture seule, ne consomme rien. Compare des TOTAUX '
  'et non un FEFO lot par lot : volontairement une estimation (§8). '
  'AUCUN MONTANT dans la sortie - destinée au cuisinier, qui ne voit pas les '
  'coûts (§8). Ne retourne que les ingrédients cost_mode = direct.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRIVILÈGES                                                       │
-- └─────────────────────────────────────────────────────────────────┘
-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4 du
--    durcissement RPC. Toujours re-REVOKE puis re-GRANT explicitement.
-- ⚠️ REVOKE sur PUBLIC et anon : une fonction SECURITY DEFINER exposée à
--    `anon` serait lisible sans authentification, et `auth.uid()` y vaut NULL
--    - la garde bar_members ci-dessus la refuserait, mais on ne laisse pas la
--    surface ouverte pour autant.
REVOKE ALL ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_queue_shortfalls(UUID) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL - à exécuter APRÈS, dans le SQL Editor                 │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1. La fonction existe, en UN SEUL exemplaire (pas de surcharge) :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        p.provolatile, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → 1 ligne. args = 'p_bar_id uuid'. provolatile = 's' (STABLE).
--     prosecdef = true (SECURITY DEFINER).
--
-- 2. Privilèges - `anon` NE DOIT PAS pouvoir exécuter :
-- SELECT has_function_privilege('anon',
--          'public.get_kitchen_queue_shortfalls(uuid)', 'EXECUTE')        AS anon_peut,
--        has_function_privilege('authenticated',
--          'public.get_kitchen_queue_shortfalls(uuid)', 'EXECUTE')        AS auth_peut;
--   → anon_peut = false, auth_peut = true. Si anon_peut = true : ARRÊTER,
--     rejouer le bloc REVOKE/GRANT ci-dessus.
--
-- 3. ⚠️ AUCUNE ÉCRITURE dans le corps. Les commentaires contiennent les mots
--    UPDATE/INSERT : les retirer AVANT de chercher, sinon faux positif
--    (leçon du post-vol `loss_cost`).
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~* '(INSERT|UPDATE|DELETE)\s' AS ecrit_en_base
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_kitchen_queue_shortfalls';
--   → ecrit_en_base = false. Si true : ARRÊTER, la fonction n'est pas en
--     lecture seule.
--
-- 4. SMOKE TEST - remplacer <BAR_ID> par un bar RÉEL.
--    ⚠️ Dans le SQL Editor `auth.uid()` vaut NULL : la garde DOIT refuser.
--    C'est le comportement ATTENDU, et c'est ce qui prouve l'isolation.
-- SELECT public.get_kitchen_queue_shortfalls('<BAR_ID>'::uuid);
--   → {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--   → Une liste `shortfalls` ici signifierait que la garde ne filtre PAS :
--     ARRÊTER et vérifier is_bar_member/is_super_admin.
--
-- 5. Le test réel se fait DEPUIS L'UI, connecté (leçon : le SQL Editor ne peut
--    pas tester une garde sur auth.uid()) :
--    a. mettre un ingrédient d'un plat à 0 (ou en dessous du besoin) ;
--    b. envoyer ce plat en cuisine ;
--    c. l'écran Service doit afficher le manque AVANT « Commencer » ;
--    d. lancer quand même : la production doit RÉUSSIR (§4.4 - jamais bloquant)
--       et créer une dette dans `ingredient_stock_debts`.
