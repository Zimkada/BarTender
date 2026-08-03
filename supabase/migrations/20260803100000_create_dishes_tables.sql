-- ===================================================================
-- MIGRATION: dishes + dish_ingredients — socle recette de la phase 2
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration (§4.1, §4.5, §16.8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   La phase 1 a rendu le stock d'ingrédients visible. Mais tant qu'aucune
--   RECETTE ne relie un plat à ses ingrédients, le promoteur ne peut pas
--   savoir ce que lui coûte un poulet braisé — donc ni sa marge, ni quels
--   plats le font vivre. C'est le livrable qui rend la phase 2 utile :
--   « le promoteur découvre la marge réelle de ses plats ».

-- IMPACT:
--   ⭐ AUCUN bar existant. Deux tables NEUVES, lues uniquement quand
--   `hasRestaurant = true` (§3). Aucune table existante modifiée, aucune
--   fonction remplacée — contrairement à 20260803090000 (bar_categories.type),
--   celle-ci ne peut structurellement pas casser un bar pur.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐⭐ INVARIANT CENTRAL DU MODULE (§4.1) — À NE JAMAIS VIOLER
--   « Le coût d'un plat est DÉRIVÉ de sa recette, JAMAIS stocké comme un
--     coût d'achat. »
--   Il n'y a donc AUCUNE colonne `cost` / `current_average_cost` sur `dishes`.
--   Ce n'est pas un oubli : un coût stocké se désynchronise de la recette dès
--   qu'un prix d'ingrédient bouge, et personne ne s'en aperçoit. Le coût se
--   calcule à la demande depuis dish_ingredients × lots FEFO.
--   ⚠️ Le SEUL coût figé du module est `kitchen_order_items.computed_cost`
--      (phase 3), snapshot au moment du service — ce qui a été RÉELLEMENT
--      consommé, pas une estimation.

-- ⭐ POURQUOI `dishes` AUTONOME ET NON `bar_products.is_dish` (§4.5)
--   1. bar_products impose CHECK (stock >= 0). Un plat n'a pas de stock : le
--      champ resterait à 0 en permanence — un champ MENSONGER structurel.
--   2. Un invariant global/custom y est déjà gravé, et a DÉJÀ causé une
--      corruption de données héritée. Y injecter une 3e nature d'objet ajoute
--      du risque sur un invariant fragile.
--   3. Au moins 10 tables ont une FK ON DELETE CASCADE vers bar_products
--      (supplies, returns, stock_adjustments, purchase_orders...). Chacune
--      hériterait des plats — un plat pourrait apparaître dans un bon de
--      commande FOURNISSEUR.
--   4. Le coût de l'héritage est RÉCURRENT (filtrer is_dish=false partout,
--      indéfiniment, y compris par des développeurs qui ignoreront pourquoi),
--      celui de l'autonomie est PONCTUEL.

-- BREAKING_CHANGE: NO — création pure.

-- ROLLBACK_STRATEGY:
--   DROP TABLE IF EXISTS public.dish_ingredients;
--   DROP TABLE IF EXISTS public.dishes;
--   ⚠️ Sans risque tant qu'aucune recette n'est saisie. Après saisie,
--   exporter d'abord — ces tables portent le savoir-faire du cuisinier.

-- TABLES_CREATED: dishes, dish_ingredients
-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune · VIEWS_AFFECTED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — aucune de ces tables ne doit exister :
--
--    SELECT to_regclass('public.dishes')           AS t_dishes,
--           to_regclass('public.dish_ingredients') AS t_dish_ingredients;
--    -- ATTENDU : les 2 à NULL.
--
-- 2) Les dépendances de la phase 1 et de la migration précédente existent :
--
--    SELECT to_regclass('public.ingredients')    AS t_ingredients,
--           to_regclass('public.bar_categories') AS t_categories,
--           EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_schema='public' AND table_name='bar_categories'
--                     AND column_name='type')    AS categories_typees;
--    -- ATTENDU : les 2 tables non NULL, categories_typees = true.
--    -- ⛔ Si categories_typees = false, appliquer d'abord 20260803090000.
--
-- 3) Helpers RLS présents (mêmes que la phase 1) :
--
--    SELECT count(DISTINCT p.proname) AS helpers
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin');
--    -- ATTENDU : 2
--
-- 4) Photographier le nombre de tables (comparaison post-vol) :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname='public';

BEGIN;

-- Garde-fou : échouer franchement plutôt que de laisser un CREATE IF NOT
-- EXISTS produire un schéma partiellement conforme.
DO $$
BEGIN
  IF to_regclass('public.dishes') IS NOT NULL
     OR to_regclass('public.dish_ingredients') IS NOT NULL THEN
    RAISE EXCEPTION
      'Une table plats existe déjà — migration probablement déjà appliquée. Diagnostiquer avant de rejouer.';
  END IF;

  IF to_regclass('public.ingredients') IS NULL THEN
    RAISE EXCEPTION 'Table ingredients absente — appliquer d''abord 20260802140000 (phase 1)';
  END IF;

  -- La colonne `type` conditionne l'étanchéité des catégories de plats.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bar_categories' AND column_name='type'
  ) THEN
    RAISE EXCEPTION 'bar_categories.type absente — appliquer d''abord 20260803090000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'Fonction update_updated_at_column() absente — trigger updated_at impossible';
  END IF;

  -- ⚠️ Compter les noms DISTINCTS : sinon la présence d'un seul helper
  -- suffirait à passer le garde (leçon de la phase 1).
  IF (
    SELECT count(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin')
  ) < 2 THEN
    RAISE EXCEPTION 'Helpers RLS is_bar_member et/ou is_super_admin absents — policies impossibles';
  END IF;
END $$;

-- =====================================================
-- 1. dishes — le plat vendable
-- =====================================================

CREATE TABLE public.dishes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id      UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,

  -- ⚠️ FK vers bar_categories SANS garantie de type au niveau SQL : PostgreSQL
  -- n'a pas de FK conditionnelle. La contrainte « catégorie de type dish »
  -- est APPLICATIVE (§13.10 point 3) — cf. requête de contrôle au post-vol.
  -- ⭐ ON DELETE RESTRICT — ALIGNÉ sur fk_bar_products_local_category
  --    (20251216030000), qui protège déjà le lien produit → catégorie.
  --    SET NULL avait été envisagé ici puis ÉCARTÉ à la certification : il
  --    ferait perdre SILENCIEUSEMENT la catégorie d'un plat lors d'une
  --    suppression de catégorie — exactement le type de perte invisible que
  --    ce projet combat. En pratique la contrainte ne se déclenchera presque
  --    jamais : CategoriesService.deleteCategory fait un SOFT delete
  --    (is_active = false), pas un DELETE.
  category_id UUID REFERENCES public.bar_categories(id) ON DELETE RESTRICT,

  -- Prix de vente TTC en XOF. NUMERIC(12,2) comme partout dans le projet,
  -- même si le franc CFA n'a pas de subdivision en pratique.
  price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),

  -- ⭐ §16.8 — TROIS régimes en V1. `precooked` a été RETIRÉ du périmètre :
  --   ce n'est pas un plat mais un produit fini revendu en l'état (stock
  --   dénombrable, retour possible, aucune production) — donc un bar_product.
  --   Un maquis qui vend des beignets les saisit comme PRODUITS aujourd'hui,
  --   sans le module cuisine. Le classer comme plat était une erreur de
  --   catégorisation.
  --   on_order     : préparé à la commande (poulet braisé)          — 20-40 min
  --   batch        : cuisiné en grande quantité le matin (riz gras) — service immédiat
  --   batch_finish : précuit puis fini à la commande (spaghetti)    — 5-10 min
  -- ⚠️ Remplace un booléen `requires_preparation`, trop binaire pour décrire
  --    le cas MAJORITAIRE en maquis béninois (le plat cuisiné d'avance).
  production_mode TEXT NOT NULL DEFAULT 'on_order'
                  CHECK (production_mode IN ('on_order', 'batch', 'batch_finish')),

  -- Calibre les seuils d'alerte de retard (phase 3). NULL = non renseigné.
  preparation_time_min INTEGER CHECK (preparation_time_min IS NULL OR preparation_time_min > 0),

  -- ⭐ Plat-BASE : un lot est produit puis prélevé (riz cuit, poulet bouilli).
  -- Sert aussi de base réutilisable pour les sous-recettes (§13.8).
  is_batch_base BOOLEAN NOT NULL DEFAULT FALSE,
  -- Rendement du lot : 5 kg de riz ≈ 20 portions. Sert à calculer le coût
  -- unitaire d'une portion (coût du lot / portions_per_batch).
  portions_per_batch INTEGER CHECK (portions_per_batch IS NULL OR portions_per_batch > 0),

  -- Le cuisinier coupe un plat (rupture, plus de matière) sans le supprimer.
  is_available BOOLEAN NOT NULL DEFAULT TRUE,

  photo_url   TEXT,

  -- Soft delete, comme bar_products : l'historique des ventes doit continuer
  -- de référencer un plat retiré du menu.
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⚠️ Cohérence des régimes à lot : un rendement n'a de sens que pour un
  -- plat-base, et un plat-base l'EXIGE — sinon le coût de la portion serait
  -- une division par NULL, donc silencieusement NULL.
  CONSTRAINT dishes_batch_portions_coherence CHECK (
    (is_batch_base = TRUE  AND portions_per_batch IS NOT NULL)
    OR (is_batch_base = FALSE AND portions_per_batch IS NULL)
  )

  -- ⚠️⚠️ PAS de contrainte « production_mode <> on_order ⇒ is_batch_base ».
  -- Elle paraissait évidente et elle est FAUSSE — elle interdirait le cas
  -- CENTRAL du régime batch_finish (§16.8) :
  --   « spaghetti-poulet » prélève une portion dans le lot d'un AUTRE plat
  --   (le plat-base « spaghetti cuits »), puis ajoute ses ingrédients de
  --   finition (huile, sauce, oignon). Il n'est donc PAS lui-même un
  --   plat-base : il n'a pas de lot propre, il consomme celui d'un autre.
  -- Les deux axes sont INDÉPENDANTS :
  --   is_batch_base   = « ce plat PRODUIT un lot » (riz cuit, poulet bouilli)
  --   production_mode = « comment ce plat est SERVI »
  -- Un plat peut produire un lot sans être vendu (base pure), en consommer un
  -- sans en produire (batch_finish), ou les deux (riz gras vendu à la portion).
  -- Le lien plat composé → plat-base vit dans dish_recipe_components (§13.8),
  -- table reportée. Une contrainte ici présumerait de sa forme.
);

COMMENT ON TABLE public.dishes IS
  '§4.5 — entité AUTONOME, volontairement séparée de bar_products : un plat n''a pas de '
  'stock (CHECK stock>=0 y serait un champ mensonger), et les ~10 FK ON DELETE CASCADE '
  'vers bar_products feraient hériter les plats de mécaniques absurdes (un plat dans un bon '
  'de commande fournisseur). '
  '⭐ AUCUNE colonne de coût : le coût d''un plat est DÉRIVÉ de sa recette (§4.1), jamais '
  'stocké — un coût stocké se désynchronise dès qu''un prix d''ingrédient bouge.';

COMMENT ON COLUMN public.dishes.production_mode IS
  '§16.8 — trois régimes V1 : on_order (à la commande) | batch (cuisiné d''avance, servi à '
  'la portion) | batch_finish (précuit puis fini). Remplace un booléen requires_preparation '
  'trop binaire : en maquis béninois, le plat cuisiné d''avance est le cas MAJORITAIRE. '
  '⏸ ''precooked'' retiré du périmètre V1 : c''est un bar_product, pas un plat (§12.4.c). '
  'Libellés UI en langage clair, JAMAIS le nom technique.';

COMMENT ON COLUMN public.dishes.category_id IS
  '⚠️ Doit référencer une bar_categories de type=''dish'' — garantie APPLICATIVE, pas SQL '
  '(PostgreSQL n''a pas de FK conditionnelle, cf. §13.10 point 3). Requête de contrôle '
  'fournie au post-vol de 20260803090000.';

CREATE TRIGGER dishes_updated_at
  BEFORE UPDATE ON public.dishes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_dishes_bar_active
  ON public.dishes (bar_id, is_active)
  WHERE is_active = TRUE;

-- Le menu du serveur ne liste que les plats servables : actifs ET disponibles.
CREATE INDEX idx_dishes_bar_available
  ON public.dishes (bar_id)
  WHERE is_active = TRUE AND is_available = TRUE;

-- ⚠️ Unicité sur les seuls plats ACTIFS : un plat retiré du menu ne doit pas
-- bloquer la re-création d'un homonyme (même motif que ingredients).
-- ⚠️ lower(name) : « Poulet braisé » et « poulet braisé » sont le même plat.
CREATE UNIQUE INDEX idx_dishes_unique_name_per_bar
  ON public.dishes (bar_id, lower(name))
  WHERE is_active = TRUE;

-- =====================================================
-- 2. dish_ingredients — la recette
-- =====================================================

CREATE TABLE public.dish_ingredients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⭐ bar_id porté explicitement bien que dérivable via dish_id : convention
  -- d'isolation multi-tenant du projet. Les policies RLS et les filtres
  -- Realtime en dépendent — dériver par jointure alourdirait chaque policy,
  -- chaque index et chaque filtre.
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  dish_id       UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  -- ⚠️ RESTRICT et non CASCADE : supprimer un ingrédient encore utilisé dans
  -- une recette doit ÉCHOUER franchement. Un CASCADE viderait silencieusement
  -- des recettes, et le coût des plats concernés chuterait sans explication.
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,

  -- Quantité en usage_unit de l'ingrédient (g, ml, unité).
  quantity      NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),

  -- L'ingrédient peut être omis sans dénaturer le plat (garniture).
  is_optional   BOOLEAN NOT NULL DEFAULT FALSE,

  -- ⭐ Pertes de préparation : épluchage, parage, dégraissage. 0.8 = 20% de
  -- perte, donc il faut acheter 1/0.8 = 1.25× la quantité nette pour servir
  -- la recette. Sans ce facteur, le coût matière est SOUS-ESTIMÉ de façon
  -- systématique sur tous les plats à légumes ou à viande parée.
  -- ⚠️ Borne haute à 1 : un rendement > 100% n'a pas de sens physique.
  yield_factor  NUMERIC(5, 4) NOT NULL DEFAULT 1.0
                CHECK (yield_factor > 0 AND yield_factor <= 1),

  -- ⭐ §16.8 batch_finish — À QUEL MOMENT l'ingrédient est consommé :
  --   'batch'  : à la cuisson du lot le matin (spaghetti secs, poulet cru)
  --   'finish' : à la finition de l'assiette (huile, sauce, oignon)
  -- Pour on_order et batch, tout est consommé en une fois — la valeur reste
  -- 'batch' par défaut et n'est pas discriminante.
  consumed_at_stage TEXT NOT NULL DEFAULT 'batch'
                    CHECK (consumed_at_stage IN ('batch', 'finish')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.dish_ingredients IS
  'Recette d''un plat — la SOURCE du coût matière (§4.1), qui n''est jamais stocké sur dishes. '
  'Coût théorique d''une ligne = quantity / yield_factor × coût FEFO de l''ingrédient.';

COMMENT ON COLUMN public.dish_ingredients.yield_factor IS
  'Rendement après préparation : 0.8 = 20% de perte à l''épluchage/parage. La quantité BRUTE '
  'à sortir du stock est quantity / yield_factor. Sans ce facteur, le coût matière est '
  'SOUS-ESTIMÉ systématiquement sur les plats à légumes ou viande parée — donc la marge '
  'affichée serait trop belle, exactement le contraire du but du module.';

COMMENT ON COLUMN public.dish_ingredients.consumed_at_stage IS
  '§16.8 — discriminant du régime batch_finish, où la matière est consommée en DEUX temps : '
  '''batch'' à la cuisson du lot, ''finish'' à l''assiette. Sans lui, impossible de savoir '
  'ce qu''il reste à décrémenter au service d''un plat précuit.';

-- ⚠️⚠️ UNICITÉ SUR LE TRIPLET, PAS SUR LE COUPLE (dish_id, ingredient_id).
-- Un même ingrédient PEUT légitimement apparaître deux fois dans une recette
-- batch_finish : de l'huile à la cuisson du lot ET de l'huile à la finition.
-- Une contrainte sur le couple interdirait ce cas réel.
-- Le triplet empêche en revanche le VRAI doublon : deux lignes identiques au
-- même stade, qui double-compteraient la matière.
CREATE UNIQUE INDEX idx_dish_ingredients_unique
  ON public.dish_ingredients (dish_id, ingredient_id, consumed_at_stage);

CREATE INDEX idx_dish_ingredients_dish
  ON public.dish_ingredients (dish_id);

-- Requête clé : « quels plats utilisent cet ingrédient ? » — pour prévenir
-- avant de désactiver un ingrédient, et pour propager une hausse de prix.
CREATE INDEX idx_dish_ingredients_ingredient
  ON public.dish_ingredients (ingredient_id);

CREATE TRIGGER dish_ingredients_updated_at
  BEFORE UPDATE ON public.dish_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. RLS
-- =====================================================
-- ⚠️ Pattern du projet, identique à la phase 1 : LECTURE par RLS pour les
-- membres du bar, ÉCRITURE réservée aux RPC SECURITY DEFINER.
-- Aucun GRANT INSERT/UPDATE/DELETE à `authenticated`.
-- ⭐ Différence assumée avec bar_categories (où le client écrit en direct) :
--    une recette engage le calcul de coût et de marge. Elle passe par un RPC
--    qui valide la cohérence (ingrédient du même bar, stade compatible avec
--    le production_mode), ce qu'une policy RLS seule ne peut pas faire.

ALTER TABLE public.dishes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dishes_bar_members_select"
  ON public.dishes FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "dish_ingredients_bar_members_select"
  ON public.dish_ingredients FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.dishes           TO authenticated;
GRANT SELECT ON public.dish_ingredients TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dishes           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_ingredients TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 2 tables existent :
--
--    SELECT to_regclass('public.dishes')           AS t_dishes,
--           to_regclass('public.dish_ingredients') AS t_dish_ingredients;
--    -- ATTENDU : les 2 non NULL
--
-- 2) ⚠ CRITIQUE — RLS ACTIVE sur les 2 :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('dishes','dish_ingredients');
--    -- ATTENDU : relrowsecurity = true sur les 2.
--    -- ⛔ Si false : BRÈCHE d'isolation multi-tenant.
--
-- 3) ⚠ CRITIQUE — `authenticated` ne peut QUE lire :
--
--    SELECT table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name IN ('dishes','dish_ingredients')
--    ORDER BY table_name, privilege_type;
--    -- ATTENDU : uniquement SELECT sur les 2.
--    -- ⛔ Tout INSERT/UPDATE/DELETE = le client pourrait écrire une recette
--    --    sans validation de cohérence.
--
-- 4) Une policy SELECT par table :
--
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('dishes','dish_ingredients');
--    -- ATTENDU : 2 lignes, cmd = SELECT
--
-- 5) ⭐ Les contraintes de cohérence REJETTENT bien l'incohérent.
--    Test ACTIF dans une transaction annulée — sans effet.
--    ⚠️ Nécessite un bar_id réel ; adapter l'UUID.
--
--    BEGIN;
--      -- 5a. plat-base SANS rendement → doit ÉCHOUER
--      INSERT INTO public.dishes (bar_id, name, price, is_batch_base, production_mode)
--      VALUES ((SELECT id FROM public.bars LIMIT 1), 'TEST base sans portions', 1000, true, 'batch');
--    ROLLBACK;
--    -- ATTENDU : ERROR ... "dishes_batch_portions_coherence"
--
--    BEGIN;
--      -- 5b. ⭐ CAS INVERSE — un plat batch_finish SANS être plat-base doit
--      --     RÉUSSIR. C'est le cas central du régime (§16.8) : « spaghetti-
--      --     poulet » prélève dans le lot d'un AUTRE plat et n'a en propre
--      --     que des ingrédients de finition.
--      INSERT INTO public.dishes (bar_id, name, price, production_mode, is_batch_base)
--      VALUES ((SELECT id FROM public.bars LIMIT 1), 'TEST batch_finish', 1000, 'batch_finish', false);
--    ROLLBACK;
--    -- ATTENDU : INSERT 0 1 (SUCCÈS).
--    -- ⛔ Si ÉCHEC : une contrainte de trop empêche de saisir le régime
--    --    batch_finish. C'est le défaut trouvé à la relecture de cette
--    --    migration — une contrainte « batch ⇒ is_batch_base » paraissait
--    --    évidente et interdisait le cas le plus courant.
--
--    -- 5c. rendement > 1 → doit ÉCHOUER (pas de sens physique)
--    -- ⚠️ Exige AU MOINS UN ingrédient en base. S'il n'y en a aucun, ce test
--    --    n'est pas exécutable — le noter et le rejouer après la 1re saisie.
--    BEGIN;
--      INSERT INTO public.dishes (bar_id, name, price)
--      VALUES ((SELECT bar_id FROM public.ingredients LIMIT 1), 'TEST yield', 1000);
--      INSERT INTO public.dish_ingredients (bar_id, dish_id, ingredient_id, quantity, yield_factor)
--      SELECT i.bar_id, d.id, i.id, 100, 1.5
--      FROM public.ingredients i
--      CROSS JOIN public.dishes d
--      WHERE d.name = 'TEST yield'
--      LIMIT 1;
--    ROLLBACK;
--    -- ATTENDU : ERROR ... violates check constraint (yield_factor)
--    -- ⭐ bar_id pris depuis l'ingrédient, pas depuis bars : les deux DOIVENT
--    --    appartenir au même bar, sinon le test échouerait pour la mauvaise
--    --    raison et on croirait la contrainte vérifiée.
--    -- ⛔ Si l'INSERT PASSE, la contrainte ne protège rien.
--
-- 6) ⭐ L'unicité porte bien sur le TRIPLET (le même ingrédient doit pouvoir
--    apparaître à deux stades différents) :
--
--    SELECT indexdef FROM pg_indexes
--    WHERE tablename='dish_ingredients' AND indexname='idx_dish_ingredients_unique';
--    -- ATTENDU : (dish_id, ingredient_id, consumed_at_stage) — les TROIS.
--    -- ⛔ Si consumed_at_stage manque, une recette batch_finish utilisant de
--    --    l'huile à la cuisson ET à la finition serait REJETÉE à tort.
--
-- 7) Aucune table existante altérée (comparer au pré-vol 4) :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname='public';
--    -- ATTENDU : pré-vol + 2
--
-- 8) ⚠️ Les tables sont VIDES (aucune donnée créée par la migration) :
--
--    SELECT (SELECT count(*) FROM public.dishes)           AS nb_dishes,
--           (SELECT count(*) FROM public.dish_ingredients) AS nb_recettes;
--    -- ATTENDU : 0 et 0 — les tests 5a-5c sont tous annulés par ROLLBACK.
--    -- ⛔ Tout nombre > 0 = un ROLLBACK a été oublié. Supprimer les lignes
--    --    'TEST %' avant de continuer.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Cette migration ne peut PAS casser l'invariance : deux tables NEUVES,
--    aucune table existante touchée, aucun code ne les lit encore.
--
-- ✅ VÉRIFIÉ À LA CERTIFICATION — niveau RÉSEAU :
--    Le Realtime du projet est OPT-IN table par table (REPLICA IDENTITY FULL
--    posée explicitement par 20251218150000 sur sales, bar_products, supplies,
--    consignments). Il n'existe AUCUN balayage automatique de pg_tables qui
--    abonnerait les tables neuves. `dishes` et `dish_ingredients` n'émettront
--    donc RIEN tant qu'on ne les y ajoute pas explicitement — aucun octet
--    d'egress pour un bar pur.
--
--    Le risque §3 est intégralement CÔTÉ CLIENT, au commit de code suivant :
--
-- ☐ Chaque query plats porte `enabled: !!barId && hasRestaurant`
-- ☐ Chaque subscription Realtime plats est conditionnée de même
-- ☐ Test : monter l'app avec hasRestaurant = false → AUCUNE requête dishes
--
-- ⚠ Le niveau RÉSEAU est le plus insidieux : une requête qui part « pour rien »
--   sur tous les bars annulerait une partie des 3 vagues d'optimisation egress.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUI N'EST PAS DANS CETTE MIGRATION — et pourquoi              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⏸ `dish_recipe_components` (sous-recettes, §13.8) — table du MODÈLE de
--    sous-recette. Reportée : elle exige un RPC garantissant UN SEUL niveau
--    (une contrainte SQL pure ne suffit pas pour un graphe) et un test de
--    rejet de cycle. Livrable indépendant, à faire après le socle.
--
-- ⏸ `production_batches` (§16.8) — les lots réellement produits. Dépend du
--    socle recette, indépendant des sous-recettes.
--
-- ⏸ Le PRICE GUARD des plats (§15.5) — à DUPLIQUER dans le RPC de vente plat,
--    surtout PAS à généraliser depuis restore_strict_price_guard.sql.
--    ⚠️ Décision à assumer explicitement, sinon quelqu'un « factorisera » et
--       touchera au guard des BOISSONS, qui est dans le chemin critique des
--       bars purs (§3). Nécessaire seulement quand un plat devient vendable
--       — donc phase 3.
