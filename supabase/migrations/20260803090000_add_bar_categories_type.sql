-- ===================================================================
-- MIGRATION: bar_categories.type — étanchéité boissons / plats
-- DATE: 2026-08-03
-- AUTHOR: AI Assistant
-- PHASE: 2 du module restauration (§4, §13.10)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Les plats ont leurs propres catégories (Entrées, Grillades,
--   Accompagnements) qui n'ont rien à faire dans le catalogue de boissons.
--   Sans discriminant, « Grillades » apparaîtrait dans le sélecteur de
--   catégorie d'un produit brassicole.

-- SOLUTION: une colonne `type` sur la table EXISTANTE plutôt qu'une table
--   dish_categories séparée. Raisons vérifiées sur pièces :
--     1. UN SEUL abonnement Realtime (useStockQueries s'abonne déjà à
--        bar_categories) — une 2e table = un 2e canal, sur un projet qui a
--        mené 3 vagues d'optimisation egress pour descendre à ~200 MB/j.
--     2. Le sélecteur « Tout / Boissons / Plats » devient un filtre sur une
--        liste HOMOGÈNE déjà en cache, au lieu d'une fusion de deux formes.
--     3. §13.10 du plan le prescrit explicitement.

-- ⚠️ CE QUE CETTE MIGRATION NE FAIT **PAS** — correction d'une idée reçue
--   Le §15.2 du plan justifie cette colonne par l'étanchéité des PROMOTIONS.
--   VÉRIFICATION FAITE : c'est INEXACT en l'état du code.
--   `target_category_ids` n'est lu par AUCUNE fonction SQL — il n'apparaît
--   que dans 059_create_promotions_and_events.sql, qui crée la colonne.
--   Le ciblage est résolu CÔTÉ CLIENT, dans usePromotions.ts :
--       if (p.targetType === 'category'
--           && p.targetCategoryIds?.includes(product.categoryId)) ...
--   Cette fonction prend un `product: Product`. Un plat n'étant pas un
--   `Product`, il n'y entre jamais : l'étanchéité vient du TYPAGE TypeScript,
--   pas de la base.
--   ⭐ CONSÉQUENCE POUR LA PHASE 3 : quand les plats deviendront vendables,
--   vérifier qu'aucun cast (`as Product`) ne fait entrer un plat dans
--   usePromotions. Le garde-fou n'est PAS en base — cette colonne ne le crée
--   pas et ne prétend pas le créer.

-- IMPACT:
--   ⚠️ SEULE migration de la phase 2 touchant une table EXISTANTE, donc la
--   seule exposée au §3 (invariance des bars purs).
--   Neutralisée par DEFAULT 'product' : toute ligne existante et toute ligne
--   future insérée sans mention de `type` reste 'product'. Un bar pur
--   n'aura JAMAIS de ligne 'dish' — son comportement est inchangé même si un
--   filtre applicatif était oublié.

-- ⭐ VÉRIFIÉ — aucune RPC à adapter :
--   `setup_promoter_bar` (dernière version : 20260716000001) insère ainsi :
--       INSERT INTO bar_categories (bar_id, global_category_id, is_active)
--   Les colonnes sont NOMMÉES explicitement : le DEFAULT s'applique seul.
--   Aucun INSERT positionnel (`INSERT INTO bar_categories VALUES (...)`) dans
--   les migrations — un tel INSERT aurait cassé à l'ajout de la colonne.

-- BREAKING_CHANGE: NO
--   Ajout d'une colonne avec DEFAULT et backfill. Aucune contrainte durcie
--   sur les données existantes, aucune fonction remplacée.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.bar_categories DROP COLUMN IF EXISTS type;
--   ⚠️ Sans risque tant qu'aucune catégorie 'dish' n'existe. Après création
--   de catégories de plats, le DROP les rendrait indistinguables des
--   catégories de boissons — exporter d'abord.

-- TABLES_MODIFIED: bar_categories (+1 colonne)
-- TABLES_CREATED: aucune · FUNCTIONS_MODIFIED: aucune · VIEWS_AFFECTED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la colonne ne doit pas déjà exister :
--
--    SELECT column_name, data_type, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'bar_categories'
--    ORDER BY ordinal_position;
--    -- ATTENDU : AUCUNE ligne nommée 'type'.
--    -- ⛔ Si 'type' existe déjà, NE PAS APPLIQUER : migration déjà jouée ou
--    --    colonne homonyme à usage différent. Diagnostiquer d'abord.
--
-- 2) ⭐ Photographier le volume AVANT backfill (comparaison post-vol) :
--
--    SELECT count(*) AS total_categories FROM public.bar_categories;
--    -- NOTER CE NOMBRE : le post-vol vérifie que type='product' le retrouve
--    --   à l'identique. C'est la preuve qu'aucune ligne n'a été manquée.
--
-- 3) ⚠️ Aucun INSERT positionnel dans les RPC (casserait à l'ajout) :
--
--    SELECT p.proname
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prokind = 'f'   -- ⚠️ INDISPENSABLE : pg_get_functiondef() REFUSE
--                            --    de s'appliquer à un agrégat et lève
--                            --    « ERROR 42809: "array_agg" is an aggregate
--                            --    function ». Sans ce filtre, la requête
--                            --    échoue avant de rien vérifier.
--      AND pg_get_functiondef(p.oid) ILIKE '%INSERT INTO bar_categories%'
--      AND pg_get_functiondef(p.oid) NOT ILIKE '%INSERT INTO bar_categories (%';
--    -- ATTENDU : 0 ligne.
--    -- ⛔ Toute ligne = un INSERT sans liste de colonnes, qui casserait.
--    --    Corriger la fonction AVANT d'appliquer.
--
-- 4) État de la table (son historique est mouvementé — cf. 20251216060000
--    puis 20251217000001, qui se contredisent sur `name`) :
--
--    SELECT conname, pg_get_constraintdef(oid) AS def
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_categories'::regclass
--    ORDER BY conname;
--    -- INFORMATIF : photographier avant/après pour prouver qu'on n'a rien cassé.

BEGIN;

-- Garde-fou : échouer franchement plutôt que de laisser un ADD COLUMN
-- IF NOT EXISTS produire un schéma partiellement conforme.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bar_categories'
      AND column_name = 'type'
  ) THEN
    RAISE EXCEPTION
      'bar_categories.type existe déjà — migration probablement déjà appliquée. Diagnostiquer avant de rejouer.';
  END IF;

  -- La table doit exister (dépendance 001_initial_schema).
  IF to_regclass('public.bar_categories') IS NULL THEN
    RAISE EXCEPTION 'Table bar_categories absente — dépendance 001_initial_schema non satisfaite';
  END IF;
END $$;

-- =====================================================
-- 1. La colonne + son backfill implicite
-- =====================================================

-- ⭐ DEFAULT 'product' + NOT NULL en une passe : PostgreSQL applique le
-- DEFAULT à toutes les lignes existantes. C'est le backfill du §13.10 point 1
-- (« toutes les catégories existantes → type = 'product' »), sans UPDATE
-- séparé donc sans fenêtre où des lignes seraient à NULL.
-- ⚠️ Depuis PG 11, ADD COLUMN ... DEFAULT ne réécrit PAS la table : pas de
-- verrou long, opération sûre même en journée. (Le projet est sur PG 15+.)
ALTER TABLE public.bar_categories
  ADD COLUMN type TEXT NOT NULL DEFAULT 'product';

-- Contrainte SÉPARÉE de la colonne : un CHECK nommé est lisible dans
-- pg_constraint et modifiable sans toucher à la colonne.
ALTER TABLE public.bar_categories
  ADD CONSTRAINT bar_categories_type_check
  CHECK (type IN ('product', 'dish'));

COMMENT ON COLUMN public.bar_categories.type IS
  '§13.10 — ''product'' (boissons, défaut) | ''dish'' (plats). Une catégorie n''est JAMAIS '
  'mixte : c''est ce qui permet au catalogue de séparer les deux univers et au sélecteur '
  'Tout/Boissons/Plats d''être un simple filtre sur une liste homogène. '
  '⚠️ DEFAULT ''product'' : toute ligne existante ou insérée sans mention reste une '
  'catégorie de boissons — un bar pur n''aura jamais de ligne ''dish'' (§3). '
  '⚠️ Ne garantit PAS l''étanchéité des promotions : leur ciblage par catégorie est '
  'résolu côté client (usePromotions.ts) et repose sur le typage TypeScript, pas sur '
  'cette colonne.';

-- =====================================================
-- 2. Index — le catalogue filtrera systématiquement dessus
-- =====================================================

-- ⚠️ Index PARTIEL sur 'dish' uniquement, et non (bar_id, type) complet :
--   - les requêtes 'product' balaient la quasi-totalité de la table, où
--     l'index existant idx_bar_categories_bar suffit ;
--   - les catégories 'dish' sont une petite minorité (seuls les bars-restos
--     en ont), donc un index partiel est à la fois plus petit et plus
--     sélectif ;
--   - sur un bar pur, cet index reste VIDE : aucun coût de maintenance à
--     l'écriture (§3, niveau performance).
CREATE INDEX idx_bar_categories_dish
  ON public.bar_categories (bar_id)
  WHERE type = 'dish';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La colonne existe, avec le bon défaut et NOT NULL :
--
--    SELECT column_name, data_type, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'bar_categories'
--      AND column_name = 'type';
--    -- ATTENDU : text | 'product'::text | NO
--
-- 2) ⚠️ CRITIQUE — le backfill est COMPLET (comparer au pré-vol 2) :
--
--    SELECT type, count(*) AS nb
--    FROM public.bar_categories
--    GROUP BY type ORDER BY type;
--    -- ATTENDU : UNE SEULE ligne → type='product', nb = 85
--    --   (85 = valeur relevée au pré-vol du 03/08/2026, figée ici pour que la
--    --    vérification ne dépende pas d'une note prise à part).
--    -- ⛔ Toute ligne 'dish' ici = anomalie (aucun plat n'existe encore).
--    -- ⛔ nb ≠ 85 = des lignes ont été perdues OU créées entre-temps.
--    --    Recompter avant de conclure : count(*) total doit valoir nb.
--
-- 3) Aucune valeur NULL (garantie par NOT NULL, vérifiée par acquit) :
--
--    SELECT count(*) AS null_types
--    FROM public.bar_categories WHERE type IS NULL;
--    -- ATTENDU : 0
--
-- 4) La contrainte CHECK est en place et REJETTE bien l'invalide :
--
--    SELECT conname, pg_get_constraintdef(oid) AS def
--    FROM pg_constraint
--    WHERE conrelid = 'public.bar_categories'::regclass
--      AND conname = 'bar_categories_type_check';
--    -- ATTENDU : CHECK ((type = ANY (ARRAY['product'::text, 'dish'::text])))
--
--    -- ⭐ Test ACTIF de la contrainte (doit ÉCHOUER) — dans une transaction
--    --    annulée, donc sans effet :
--    BEGIN;
--      UPDATE public.bar_categories SET type = 'invalide'
--      WHERE id = (SELECT id FROM public.bar_categories LIMIT 1);
--    ROLLBACK;
--    -- ATTENDU : ERROR ... violates check constraint "bar_categories_type_check"
--    -- ⛔ Si l'UPDATE PASSE, la contrainte ne protège rien. Investiguer.
--    -- (Le ROLLBACK annule tout, y compris en cas de succès inattendu.)
--
-- 5) L'index partiel existe :
--
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'bar_categories' AND indexname = 'idx_bar_categories_dish';
--    -- ATTENDU : 1 ligne, indexdef contenant WHERE (type = 'dish'::text)
--
-- 6) ⭐ NON-RÉGRESSION — la création de bar fonctionne toujours.
--    `setup_promoter_bar` insère des catégories : c'est LE chemin de code que
--    cette migration pourrait casser.
--
--    SELECT pg_get_functiondef(p.oid) ILIKE '%INSERT INTO bar_categories (%'
--             AS insert_avec_colonnes_nommees
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'setup_promoter_bar';
--    -- ATTENDU : true — les colonnes sont nommées, le DEFAULT s'applique.
--    -- ⛔ Si false : l'INSERT est positionnel et la création de bar est CASSÉE.
--
-- 7) Les contraintes existantes sont intactes (comparer au pré-vol 4) :
--
--    SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.bar_categories'::regclass
--    ORDER BY conname;
--    -- ATTENDU : pré-vol 4 + bar_categories_type_check, rien de disparu.
--
-- 8) ⚠️ CRITIQUE — les privilèges d'écriture sont INCHANGÉS.
--    ⭐ Contrairement aux tables ingrédients (écriture réservée aux RPC), le
--    CLIENT insère ici DIRECTEMENT : CategoriesService.createCustomCategory et
--    linkGlobalCategory font un .insert() depuis le navigateur. `authenticated`
--    DOIT donc conserver INSERT/UPDATE — les retirer casserait la création de
--    catégorie dans l'UI.
--
--    SELECT privilege_type
--    FROM information_schema.role_table_grants
--    WHERE grantee = 'authenticated' AND table_name = 'bar_categories'
--    ORDER BY privilege_type;
--    -- ATTENDU : identique à AVANT la migration (un ADD COLUMN ne touche pas
--    --   aux privilèges de table). SELECT + INSERT + UPDATE au minimum.
--    -- ⛔ Toute disparition = création de catégorie cassée dans l'UI.
--
--    -- ⭐ Les INSERT du client nomment leurs colonnes (payload typé
--    --    BarCategoryInsert) : le DEFAULT 'product' s'applique, et une
--    --    catégorie créée depuis l'UI catalogue reste bien une catégorie de
--    --    boissons. Aucun code client à modifier pour CE point.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- NIVEAU DONNÉES  ✅ garanti par cette migration
--   Un bar pur n'a que des lignes type='product'. Aucune requête existante
--   ne mentionne `type` : leur résultat est rigoureusement identique.
--
-- NIVEAU PERFORMANCE  ✅ garanti
--   L'index partiel reste vide sur un bar pur — aucun coût à l'écriture.
--   L'ADD COLUMN ... DEFAULT ne réécrit pas la table (PG 11+).
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐ RELEVÉ EN PROD AU PRÉ-VOL (03/08/2026) — à connaître phase 2  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Le pré-vol a montré que 001_initial_schema.sql NE REFLÈTE PAS la prod :
--
--   ATTENDU d'après le fichier   RÉEL en production
--   UNIQUE (bar_id, global_category_id)   ❌ n'existe PAS
--   —                                     ✅ UNIQUE (bar_id, name)
--                                            [bar_categories_bar_id_name_key]
--
-- Colonnes réelles : id, bar_id, name, color, icon, order_index, is_custom,
--   created_at, updated_at, global_category_id, custom_name, custom_color,
--   is_active.  (`name` ET `custom_name` coexistent — héritage des correctifs
--   20251216060000 / 20251217000001 qui se contredisent sur la nullabilité.)
--
-- ⚠️ CONSÉQUENCE POUR LE FORMULAIRE DE PLAT (phase 2, code) :
--   `UNIQUE (bar_id, name)` NE CONNAÎT PAS `type`. Une catégorie de plats
--   « Grillades » et une catégorie de boissons « Grillades » ne peuvent donc
--   PAS coexister dans le même bar — l'INSERT échouera sur violation
--   d'unicité, avec un message Postgres brut.
--   ☐ Le formulaire de catégorie de plat DOIT intercepter l'erreur 23505 et
--     afficher un message métier (« ce nom est déjà utilisé par une catégorie
--     de boissons »), et non l'erreur technique.
--   ⚠️ NE PAS « corriger » l'unicité en y ajoutant `type` : ce serait une
--     modification de contrainte sur une table en production, hors périmètre,
--     et le recoupement de noms plats/boissons est en pratique très rare.
--
-- 85 catégories en base au moment du pré-vol (toutes des boissons).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LIMITE ASSUMÉE — étanchéité produit → catégorie                 │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ Cette migration ne peut PAS empêcher un `bar_product` de pointer vers
--    une catégorie type='dish'. La FK existante
--        fk_bar_products_local_category (20251216030000)
--        bar_products.local_category_id → bar_categories(id) ON DELETE RESTRICT
--    référence la CLÉ, pas le type : PostgreSQL n'a pas de FK conditionnelle.
--
-- Le §13.10 point 3 confie cette garde à « l'UI et les RPC ». Deux options
-- existaient pour la mettre en BASE, toutes deux écartées ICI :
--   a) trigger BEFORE INSERT/UPDATE sur bar_products vérifiant le type de la
--      catégorie visée — ajoute un trigger sur la table la PLUS chaude du
--      projet (chaque vente la touche), pour un cas qui n'existe pas encore ;
--   b) clé composite (id, type) + FK partielle — impose de modifier la PK de
--      bar_categories, donc toutes ses FK entrantes. Disproportionné.
--
-- ⭐ DÉCISION : garde APPLICATIVE en phase 2, réévaluée en phase 3.
--    Justification : tant qu'aucune catégorie 'dish' n'existe, le cas est
--    INATTEIGNABLE. Le risque n'apparaît qu'avec le formulaire de plat, qui
--    proposera exclusivement des catégories 'dish' — et le formulaire produit
--    exclusivement des 'product'. Ajouter un trigger sur bar_products
--    aujourd'hui ferait payer un coût permanent à TOUS les bars, y compris
--    purs, pour un scénario que seule une écriture SQL manuelle produirait.
--    ⚠️ À rouvrir si un import CSV ou une RPC d'écriture en masse arrive.
--
-- ☐ PHASE 3 — vérifier qu'aucun produit ne pointe vers une catégorie 'dish' :
--      SELECT p.id, p.local_category_id
--      FROM public.bar_products p
--      JOIN public.bar_categories c ON c.id = p.local_category_id
--      WHERE c.type <> 'product';
--      -- ATTENDU : 0 ligne. Toute ligne = étanchéité violée.
--
-- NIVEAU APPLICATIF  ☐ À FAIRE dans le commit de code qui suit
--   ⚠️ `CategoriesService.getCategories` fait `select('*')` SANS filtre, et
--      alimente `useCategories` → tout le catalogue de boissons.
--      Sans filtre `type='product'`, les catégories de plats y remonteraient
--      pour les bars-restos.
--   ⚠️ Le risque est BORNÉ : un seul consommateur
--      (useStockQueries.ts:323), et son mapper ne recopie que 5 champs.
--   ☐ Ajouter .eq('type', 'product') dans getCategories
--   ☐ Ajouter .eq('type', 'product') dans getBarCategoriesWithGlobal
--   ☐ Régénérer database.types.ts (npm run gen:types — JAMAIS `>` en
--      PowerShell : produit de l'UTF-16 qui casse ESLint)
