-- ===================================================================
-- MIGRATION: Tables ingrédients — socle FEFO de la phase 1
-- DATE: 2026-08-02
-- AUTHOR: AI Assistant
-- PHASE: 1 du module restauration
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   La cuisine d'un bar est aujourd'hui une zone de dépense TOTALEMENT
--   invisible : rien ne suit ce qu'elle consomme. Le promoteur ne peut pas
--   savoir ce que lui coûte un plat, ni ce qu'il perd en péremption.

-- IMPACT:
--   ⭐ AUCUN bar existant. Tables NEUVES, lues uniquement quand
--   `hasRestaurant = true` (§3). Zéro reprise de données, zéro code existant
--   touché — c'est ce qui rend cette migration structurellement sûre.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION: trois tables + une vue d'audit.
--   1. ingredients            — le référentiel (+ cost_mode, §16.3)
--   2. ingredient_lots        — les lots datés, socle du FEFO (§16.13)
--   3. ingredient_stock_debts — les consommations sans stock (§13.2)
--   4. ingredient_stock_consistency_violations — détecteur de dérive (§13.11)

-- ⭐ POURQUOI FEFO ET NON CUMP (§16.13)
--   Les boissons gardent le CUMP (marchandises revendues en l'état, 601/701).
--   Les ingrédients sont des matières premières transformées (602/702), et
--   SYSCOHADA autorise les deux méthodes. L'argument décisif est la
--   PÉRISSABILITÉ : seul un stock par lots datés permet de dire « ce poisson
--   expire demain » et de chiffrer ce que la péremption coûte.
--   ⚠ Deux méthodes dans un même bilan est autorisé mais doit être DÉCLARÉ en
--   annexe comptable.

-- ⭐ POURQUOI DES DETTES ET NON DES LOTS NÉGATIFS (§13.2)
--   Le stock d'ingrédients n'est JAMAIS bloquant (§4.4) : on ne refuse pas de
--   servir parce que le stock théorique est à zéro. Mais en FEFO, consommer un
--   lot qui n'existe pas n'a aucune définition — à quel prix ?
--   Un lot à `remaining_qty < 0` serait un objet absurde (un lot est un stock
--   DISPONIBLE, pas un découvert). D'où une table dédiée : l'écart devient
--   VISIBLE au lieu d'être absorbé, et il alimente l'écart théorique/réel (§8).

-- BREAKING_CHANGE: NO
--   Création pure. Aucune table existante modifiée, aucune fonction remplacée.

-- ROLLBACK_STRATEGY:
--   DROP VIEW IF EXISTS public.ingredient_stock_consistency_violations;
--   DROP TABLE IF EXISTS public.ingredient_stock_debts;
--   DROP TABLE IF EXISTS public.ingredient_lots;
--   DROP TABLE IF EXISTS public.ingredients;
--   ⚠ Sans risque tant qu'aucune donnée n'a été saisie. Après saisie, exporter
--   d'abord — ces tables portent la valorisation du stock cuisine.

-- TABLES_CREATED: ingredients, ingredient_lots, ingredient_stock_debts
-- VIEWS_AFFECTED: + ingredient_stock_consistency_violations (nouvelle)
-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — aucune de ces tables ne doit déjà exister :
--
--    SELECT to_regclass('public.ingredients')            AS t_ingredients,
--           to_regclass('public.ingredient_lots')        AS t_lots,
--           to_regclass('public.ingredient_stock_debts') AS t_debts;
--    -- ATTENDU : les 3 à NULL.
--    -- ⛔ Si l'une existe, NE PAS APPLIQUER : la migration a déjà été jouée,
--    --    ou un objet homonyme occupe le nom. Diagnostiquer d'abord.
--
-- 2) Les dépendances existent bien :
--
--    SELECT to_regclass('public.bars')        AS t_bars,
--           to_regclass('public.bar_members') AS t_members,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--            WHERE n.nspname = 'public' AND p.proname = 'is_bar_member') AS fn_is_bar_member;
--    -- ATTENDU : bars et bar_members non NULL, fn_is_bar_member >= 1
--
-- 3) Photographier le nombre de tables (comparaison post-vol) :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname = 'public';

BEGIN;

-- Garde-fou : refuser si une table cible existe déjà. Mieux vaut échouer
-- franchement que de retomber sur un CREATE IF NOT EXISTS silencieux qui
-- laisserait un schéma partiellement conforme.
DO $$
BEGIN
  IF to_regclass('public.ingredients') IS NOT NULL
     OR to_regclass('public.ingredient_lots') IS NOT NULL
     OR to_regclass('public.ingredient_stock_debts') IS NOT NULL THEN
    RAISE EXCEPTION
      'Une table ingrédients existe déjà — migration probablement déjà appliquée. Diagnostiquer avant de rejouer.';
  END IF;

  -- Dépendances externes : mieux vaut un message clair qu'une erreur Postgres
  -- brute au milieu de la transaction.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'Fonction update_updated_at_column() absente (001_initial_schema) — trigger updated_at impossible';
  END IF;

  -- ⚠️ Les DEUX helpers sont requis : compter les noms DISTINCTS, sinon la
  -- présence d'un seul suffirait à passer le garde.
  IF (
    SELECT count(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('is_bar_member', 'is_super_admin')
  ) < 2 THEN
    RAISE EXCEPTION 'Helpers RLS is_bar_member et/ou is_super_admin absents — policies impossibles';
  END IF;
END $$;

-- =====================================================
-- 1. ingredients — le référentiel
-- =====================================================

CREATE TABLE public.ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id      UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  -- Unité de STOCK (kg, L, pièce). La saisie en portions (§16.6) est une
  -- couche d'affichage, elle ne change pas l'unité de référence.
  unit        TEXT NOT NULL,

  -- ⭐ §16.3 — remplace le booléen `is_transversal`, qui était un BIAIS
  -- SYSTÉMATIQUE de marge : traiter l'huile de friture comme le sel
  -- sous-estime la marge des plats frits (alloco, poisson) et surestime celle
  -- des mijotés. Le classement des plats par rentabilité — livrable de la
  -- phase 2 — en serait faussé.
  --   direct         : décrémenté par recette, coût FEFO réel
  --   global         : stock simple + alerte, charge indirecte cuisine
  --   per_dish_flat  : forfait par plat (huile, charbon, emballage)
  --   cost_only      : non suivi en stock, mais inclus au coût
  cost_mode   TEXT NOT NULL DEFAULT 'direct'
              CHECK (cost_mode IN ('direct', 'global', 'per_dish_flat', 'cost_only')),

  -- Forfait unitaire, utilisé UNIQUEMENT par cost_mode = 'per_dish_flat'.
  flat_cost_per_dish NUMERIC(12, 2),

  -- ⚠️ CACHE D'AFFICHAGE — voir COMMENT ON COLUMN ci-dessous.
  current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,

  -- Dernier prix d'achat connu : sert à valoriser une DETTE (§13.2) quand
  -- aucun lot n'est disponible.
  last_unit_cost NUMERIC(12, 2),

  -- Seuil d'alerte de réapprovisionnement (NULL = pas d'alerte).
  min_stock_alert NUMERIC(14, 3),

  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⚠️ Cohérence interne : un forfait n'a de sens que pour per_dish_flat, et
  -- ce mode EXIGE un forfait — sinon le coût du plat serait silencieusement nul.
  CONSTRAINT ingredients_flat_cost_coherence CHECK (
    (cost_mode = 'per_dish_flat' AND flat_cost_per_dish IS NOT NULL AND flat_cost_per_dish >= 0)
    OR (cost_mode <> 'per_dish_flat' AND flat_cost_per_dish IS NULL)
  )
);

COMMENT ON TABLE public.ingredients IS
  'Référentiel des ingrédients cuisine. Valorisation FEFO via ingredient_lots (§16.13) — '
  'distinct du CUMP des boissons (bar_products), les deux méthodes étant autorisées par '
  'SYSCOHADA pour des natures de stock différentes. À DÉCLARER en annexe comptable.';

COMMENT ON COLUMN public.ingredients.current_stock IS
  '⚠️ CACHE D''AFFICHAGE, écrit UNIQUEMENT par les RPC qui touchent aux lots — jamais par '
  'un trigger (leçon vague 4c : deux écrivains créent des divergences). '
  'SOURCE DE VÉRITÉ : Σ(ingredient_lots.remaining_qty WHERE status=''active'') '
  '− Σ(ingredient_stock_debts.qty_owed − settled_qty WHERE status=''open''). '
  'Le filtre status=''active'' sur les lots est SANS EFFET par construction : la contrainte '
  'ingredient_lots_closed_is_empty force remaining_qty = 0 dès qu''un lot quitte l''état actif. '
  'Divergence détectée par la vue ingredient_stock_consistency_violations (§13.11).';

COMMENT ON COLUMN public.ingredients.cost_mode IS
  '§16.3 — typologie à 4 niveaux remplaçant le booléen is_transversal, qui biaisait '
  'systématiquement la marge des plats frits. per_dish_flat évite la fausse précision '
  '(personne ne pèse l''huile) tout en attribuant le coût aux plats qui le supportent.';

-- ⚠️ Sans ce trigger, `updated_at` resterait FIGÉ à la date de création : la
-- colonne existerait sans jamais être juste. Réutilise update_updated_at_column()
-- (001_initial_schema.sql), déjà utilisée par `promotions` — on ne duplique pas.
-- ⚠️ Seule `ingredients` en a besoin : lots et dettes sont append-only, leurs
-- modifications passent par des RPC qui horodatent explicitement.
CREATE TRIGGER ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_ingredients_bar_active
  ON public.ingredients (bar_id, is_active)
  WHERE is_active = TRUE;

-- Unicité du nom par bar, sur les seuls ingrédients actifs : un ingrédient
-- désactivé ne doit pas bloquer la re-création d'un homonyme.
CREATE UNIQUE INDEX idx_ingredients_unique_name_per_bar
  ON public.ingredients (bar_id, lower(name))
  WHERE is_active = TRUE;

-- =====================================================
-- 2. ingredient_lots — socle du FEFO
-- =====================================================

CREATE TABLE public.ingredient_lots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,

  initial_qty   NUMERIC(14, 3) NOT NULL CHECK (initial_qty > 0),
  -- ⚠️ JAMAIS négatif : un lot est un stock DISPONIBLE, pas un découvert.
  -- Une consommation sans stock crée une DETTE (§13.2), pas un lot négatif.
  remaining_qty NUMERIC(14, 3) NOT NULL CHECK (remaining_qty >= 0),

  unit_cost     NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),

  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ⭐ Cœur du FEFO : NULL = ne périme pas (sel, épices).
  expires_at    DATE,

  business_date DATE NOT NULL,

  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'depleted', 'expired', 'discarded')),

  -- Traçabilité de la perte : rempli quand status ∈ ('expired','discarded').
  discarded_qty NUMERIC(14, 3) CHECK (discarded_qty IS NULL OR discarded_qty >= 0),
  discarded_at  TIMESTAMPTZ,

  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ingredient_lots_remaining_lte_initial CHECK (remaining_qty <= initial_qty),

  -- ⚠️ Un lot SORTI du stock ne peut plus rien contenir de disponible.
  -- Sans cette garde, un lot 'expired' gardant remaining_qty > 0 serait exclu
  -- de la vue d'audit (qui ne somme que les 'active') tout en ayant été compté
  -- dans current_stock — une divergence INVISIBLE, exactement ce que §13.11
  -- veut détecter. La quantité perdue se lit dans discarded_qty, pas ici.
  CONSTRAINT ingredient_lots_closed_is_empty CHECK (
    status = 'active' OR remaining_qty = 0
  ),

  -- Une perte doit être horodatée et chiffrée : sans cela, « ce que la
  -- péremption coûte » (§16.13) ne serait pas calculable.
  CONSTRAINT ingredient_lots_discard_coherence CHECK (
    (status IN ('expired', 'discarded') AND discarded_qty IS NOT NULL AND discarded_at IS NOT NULL)
    OR (status IN ('active', 'depleted') AND discarded_qty IS NULL AND discarded_at IS NULL)
  )
);

COMMENT ON TABLE public.ingredient_lots IS
  'Lots d''ingrédients — SOURCE DE VÉRITÉ du stock. Consommation en FEFO : '
  'ORDER BY expires_at NULLS LAST, received_at (§16.13). FEFO et non FIFO strict : '
  'un lot acheté plus tard peut expirer plus tôt, et en cuisine c''est la date de '
  'péremption qui commande — obligation sanitaire autant que comptable.';

COMMENT ON COLUMN public.ingredient_lots.expires_at IS
  'NULL = denrée non périssable (sel, épices). L''ordre FEFO place ces lots EN DERNIER '
  '(NULLS LAST) : ce qui périme se consomme d''abord.';

-- ⭐ Index de l'ordre FEFO — la requête la plus fréquente du module.
-- Partiel sur les lots consommables : inutile d'indexer l'historique soldé.
CREATE INDEX idx_ingredient_lots_fefo
  ON public.ingredient_lots (ingredient_id, expires_at NULLS LAST, received_at)
  WHERE status = 'active' AND remaining_qty > 0;

CREATE INDEX idx_ingredient_lots_bar_date
  ON public.ingredient_lots (bar_id, business_date DESC);

-- =====================================================
-- 3. ingredient_stock_debts — §13.2
-- =====================================================

CREATE TABLE public.ingredient_stock_debts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,

  -- Quantité consommée sans stock disponible. TOUJOURS POSITIVE : c'est une
  -- dette, sa nature porte le signe, pas la valeur.
  qty_owed      NUMERIC(14, 3) NOT NULL CHECK (qty_owed > 0),

  -- Valorisation au dernier prix connu, faute de lot réel.
  estimated_unit_cost NUMERIC(12, 2) NOT NULL CHECK (estimated_unit_cost >= 0),

  incurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  business_date DATE NOT NULL,

  settled_qty   NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (settled_qty >= 0),
  settled_at    TIMESTAMPTZ,

  -- Écart entre coût estimé et coût réel constaté à l'appro. C'est CE chiffre
  -- qui rend l'anomalie exploitable plutôt que seulement visible.
  price_variance NUMERIC(12, 2),

  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),

  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ingredient_debts_settled_lte_owed CHECK (settled_qty <= qty_owed),
  -- Une dette soldée doit être intégralement soldée et horodatée : sans cette
  -- garde, un `status='settled'` partiel fausserait current_stock.
  CONSTRAINT ingredient_debts_settled_coherence CHECK (
    (status = 'settled' AND settled_qty = qty_owed AND settled_at IS NOT NULL)
    OR (status = 'open')
  )
);

COMMENT ON TABLE public.ingredient_stock_debts IS
  '§13.2 — consommations sans stock disponible. Remplace les « lots négatifs », qui '
  'n''ont aucune définition en FEFO (à quel prix consommer un lot inexistant ?). '
  'Préserve la règle « stock jamais bloquant » (§4.4) tout en gardant le FEFO honnête : '
  'l''écart devient VISIBLE au lieu d''être absorbé. '
  '⚠️ Une dette soldée n''est JAMAIS supprimée — la trace de l''anomalie EST le signal.';

CREATE INDEX idx_ingredient_debts_open
  ON public.ingredient_stock_debts (ingredient_id, incurred_at)
  WHERE status = 'open';

CREATE INDEX idx_ingredient_debts_bar_date
  ON public.ingredient_stock_debts (bar_id, business_date DESC);

-- =====================================================
-- 4. Vue d'audit — §13.11
-- =====================================================

-- ⭐ Un cache sans détecteur de divergence est une bombe à retardement : la
-- leçon du CUMP (vague 4c) est qu'un écart silencieux se découvre des mois plus
-- tard, sur des données déjà corrompues.
-- ⚠️⚠️ `security_invoker = true` OBLIGATOIRE — convention établie par
-- 20260107_convert_views_to_security_invoker.sql, qui a converti TOUTES les
-- vues du projet. Sans cette option, la vue s'exécute avec les droits de son
-- CRÉATEUR : la RLS des tables sous-jacentes est contournée et tout membre
-- d'un bar verrait les ingrédients de TOUS les bars — brèche d'isolation
-- multi-tenant. Avec, la RLS de chaque table s'applique normalement.
CREATE VIEW public.ingredient_stock_consistency_violations
WITH (security_invoker = true)
AS
SELECT
  i.id            AS ingredient_id,
  i.bar_id,
  i.name,
  i.current_stock AS cached_stock,
  COALESCE(lots.total_remaining, 0) - COALESCE(debts.total_owed, 0) AS computed_stock,
  i.current_stock - (COALESCE(lots.total_remaining, 0) - COALESCE(debts.total_owed, 0)) AS drift
FROM public.ingredients i
LEFT JOIN (
  SELECT ingredient_id, SUM(remaining_qty) AS total_remaining
  FROM public.ingredient_lots
  WHERE status = 'active'
  GROUP BY ingredient_id
) lots ON lots.ingredient_id = i.id
LEFT JOIN (
  SELECT ingredient_id, SUM(qty_owed - settled_qty) AS total_owed
  FROM public.ingredient_stock_debts
  WHERE status = 'open'
  GROUP BY ingredient_id
) debts ON debts.ingredient_id = i.id
-- Tolérance 0.001 : les NUMERIC(14,3) peuvent produire un écart d'arrondi
-- sans qu'il y ait de vraie divergence.
WHERE ABS(
  i.current_stock - (COALESCE(lots.total_remaining, 0) - COALESCE(debts.total_owed, 0))
) > 0.001;

COMMENT ON VIEW public.ingredient_stock_consistency_violations IS
  '§13.11 — détecteur de dérive du cache ingredients.current_stock. '
  'Toute ligne retournée est une ANOMALIE : le cache diverge de la source de vérité '
  '(Σ lots actifs − Σ dettes ouvertes). Vue VIDE = cohérence. À surveiller périodiquement.';

-- =====================================================
-- 5. RLS — chaque table, filtrée par bar_id
-- =====================================================
-- ⚠️ Pattern du projet (cf. tickets, 20260204000000) : LECTURE par RLS pour
-- les membres du bar, ÉCRITURE réservée aux RPC SECURITY DEFINER (phase 1b).
-- Aucun GRANT INSERT/UPDATE/DELETE à `authenticated` : le client n'écrit
-- jamais directement dans ces tables.

ALTER TABLE public.ingredients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_lots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_stock_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_bar_members_select"
  ON public.ingredients FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "ingredient_lots_bar_members_select"
  ON public.ingredient_lots FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "ingredient_debts_bar_members_select"
  ON public.ingredient_stock_debts FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.ingredients            TO authenticated;
GRANT SELECT ON public.ingredient_lots        TO authenticated;
GRANT SELECT ON public.ingredient_stock_debts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_lots        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_stock_debts TO service_role;

-- La vue d'audit est un outil de diagnostic : lecture par les membres du bar
-- (RLS des tables sous-jacentes s'applique), écriture impossible par nature.
GRANT SELECT ON public.ingredient_stock_consistency_violations TO authenticated;
GRANT SELECT ON public.ingredient_stock_consistency_violations TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 3 tables + la vue existent :
--
--    SELECT to_regclass('public.ingredients')            AS t_ingredients,
--           to_regclass('public.ingredient_lots')        AS t_lots,
--           to_regclass('public.ingredient_stock_debts') AS t_debts,
--           to_regclass('public.ingredient_stock_consistency_violations') AS v_audit;
--    -- ATTENDU : les 4 non NULL
--
-- 2) ⚠ CRITIQUE — RLS ACTIVE sur les 3 tables :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('ingredients','ingredient_lots','ingredient_stock_debts');
--    -- ATTENDU : relrowsecurity = true sur les 3.
--    -- ⛔ Si false : BRÈCHE d'isolation multi-tenant. Rejouer les ALTER.
--
-- 3) ⚠ CRITIQUE — `authenticated` ne peut QUE lire :
--
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'authenticated'
--      AND table_name IN ('ingredients','ingredient_lots','ingredient_stock_debts')
--    ORDER BY table_name, privilege_type;
--    -- ATTENDU : uniquement SELECT sur les 3.
--    -- ⛔ Tout INSERT/UPDATE/DELETE ici = le client pourrait écrire sans passer
--    --    par les RPC, donc sans le calcul FEFO ni le cache current_stock.
--
-- 3bis) ⚠ CRITIQUE — la vue d'audit est en security_invoker :
--
--    SELECT c.relname, c.reloptions
--    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname = 'ingredient_stock_consistency_violations';
--    -- ATTENDU : reloptions contenant security_invoker=true
--    -- ⛔ Si absent : la vue contourne la RLS et expose les ingrédients de
--    --    TOUS les bars à n'importe quel membre. Recréer la vue.
--
-- 4) Une policy SELECT par table :
--
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('ingredients','ingredient_lots','ingredient_stock_debts');
--    -- ATTENDU : 3 lignes, cmd = SELECT
--
-- 5) L'index FEFO est bien créé (perf de la requête la plus fréquente) :
--
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'ingredient_lots' AND indexname = 'idx_ingredient_lots_fefo';
--    -- ATTENDU : 1 ligne
--
-- 6) ⭐ La vue d'audit est VIDE (aucune donnée, donc aucune dérive) :
--
--    SELECT count(*) AS violations FROM public.ingredient_stock_consistency_violations;
--    -- ATTENDU : 0
--
-- 7) Aucune table existante altérée (comparer au pré-vol 3) :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname = 'public';
--    -- ATTENDU : pré-vol + 3
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Cette migration ne peut PAS casser l'invariance : elle ne touche aucune
--    table existante et aucun code ne lit encore ces tables. Le risque §3 est
--    intégralement CÔTÉ CLIENT, en phase 1b :
--
-- ☐ Chaque query cuisine porte `enabled: !!barId && hasRestaurant`
-- ☐ Chaque subscription Realtime cuisine est conditionnée de même
-- ☐ Aucun préchargement de la route Cuisine si hasRestaurant = false (§3)
-- ☐ Test : monter l'app avec hasRestaurant = false → AUCUNE requête ingredients
--
-- ⚠ Le niveau RÉSEAU est le plus insidieux : une requête qui part « pour rien »
--   sur tous les bars annulerait une partie des 3 vagues d'optimisation egress,
--   sans que personne ne le remarque avant la facture Supabase.
