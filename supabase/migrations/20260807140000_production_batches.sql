-- ===================================================================
-- MIGRATION: production_batches — les lots produits
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.1 du module restauration (§13.3, §16.8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- Le régime `batch_finish` (§16.8) consomme la matière EN DEUX TEMPS :
--   · production du lot (matin) → spaghetti secs, poulet cru, eau, sel
--   · finition (à la commande)  → portion du lot + huile, sauce, oignon
-- Cette table porte le premier temps : un lot daté, avec son coût figé et
-- son reliquat.

-- ⭐⭐ UN LOT EST UNE INSTANCE, PAS UN STOCK SCALAIRE
--   On aurait pu ajouter une colonne `portions_en_stock` sur `dishes`. Ce
--   serait faux : deux lots du même plat produits à deux moments n'ont NI le
--   même coût unitaire (les prix d'ingrédients bougent) NI la même date de
--   péremption. Un scalaire les moyennerait et perdrait les deux.
--   ⚠️ Même raisonnement que `ingredient_lots` : un journal auditable plutôt
--   qu'un compteur.

-- ⭐ `status` EN PLUS de `remaining_qty` (§13.3)
--   `remaining_qty = 0` ne distingue pas « épuisé par les ventes » de
--   « jeté » ni de « périmé » — trois situations aux conséquences
--   comptables DIFFÉRENTES (§8). Le chiffre dit combien, le statut dit
--   pourquoi.

-- ⭐ AUCUNE FERMETURE AUTOMATIQUE — arbitrage du 06/08/2026
--   Un lot reste `active` jusqu'à ce qu'un humain le termine ou déclare le
--   reste jeté. Ni cron, ni bascule à la journée commerciale.
--   ⚠️ La raison est métier : une sauce tomate se conserve trois jours, un
--   bouillon aussi. Clôturer à la journée compterait en perte ce qui est
--   encore en cuisine — et le cuisinier cesserait de croire le chiffre.
--   `expires_at` est donc INFORMATIF (il alimente une alerte), jamais un
--   déclencheur de changement d'état.

-- BREAKING_CHANGE: NO
--   Table NEUVE. Aucune table, vue ou RPC existante touchée. Un bar pur ne
--   la lit jamais (`enabled: hasRestaurant` côté client).

-- ROLLBACK_STRATEGY:
--   DROP TABLE IF EXISTS public.production_batches;
--   ⚠️ À ne faire que si AUCUN lot n'a été produit : la table porte le coût
--   matière réel de production, non reconstituable après coup.

-- TABLES_CREATED: production_batches
-- INDEXES_CREATED: idx_pb_idempotency (UNIQUE), idx_pb_bar_dish_active,
--   idx_pb_bar_date, idx_pb_expiring
-- RLS_CHANGES: RLS activée + 1 policy SELECT (écriture par RPC uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT to_regclass('public.production_batches') AS deja_la;
--    -- ATTENDU : NULL
--
-- 2) ⛔ BLOQUANT — dépendances :
--
--    SELECT to_regclass('public.dishes') AS t_dishes,
--           to_regclass('public.bars')   AS t_bars,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin',
--                                'update_updated_at_column')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 3
--
-- 3) ⚠️ INFORMATIF — y a-t-il des plats-bases pour produire des lots ?
--
--    SELECT count(*) AS plats_bases
--    FROM public.dishes WHERE is_active AND is_batch_base;
--    -- Si 0 : aucun lot ne pourra être produit tant qu'un plat n'est pas
--    -- déclaré « préparé d'avance » avec un nombre de portions.

DO $$
BEGIN
  IF to_regclass('public.dishes') IS NULL THEN
    RAISE EXCEPTION 'Table dishes absente — appliquer d''abord 20260803100000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'Fonction update_updated_at_column() absente — trigger updated_at impossible';
  END IF;
END $$;

BEGIN;

CREATE TABLE public.production_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⭐ bar_id explicite bien que dérivable : convention d'isolation du
  -- projet, les policies RLS en dépendent.
  bar_id        UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- ⚠️ Le plat-BASE (`is_batch_base = TRUE`), jamais le plat vendu. Le
  -- spaghetti-poulet ne produit pas de lot : il prélève dans celui des
  -- « spaghetti cuits ». Vérifié par le RPC, pas par la base — une contrainte
  -- figerait `is_batch_base` alors qu'il peut légitimement changer.
  -- ⚠️ RESTRICT : supprimer un plat qui a produit des lots doit ÉCHOUER.
  -- Un CASCADE effacerait l'historique de production ET son coût matière.
  dish_id       UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,

  produced_qty  NUMERIC(10,3) NOT NULL CHECK (produced_qty > 0),

  -- ⚠️ Décrémenté au prélèvement (3B.2). Peut atteindre 0, jamais moins :
  -- une portion prélevée sans stock devient une DETTE, pas un lot négatif —
  -- même principe que `ingredient_lots` (§13.2).
  remaining_qty NUMERIC(10,3) NOT NULL CHECK (remaining_qty >= 0),

  -- ⭐⭐ COÛT FIGÉ À LA PRODUCTION, jamais recalculé.
  -- C'est le coût matière RÉEL du lot / portions produites. Le recalculer
  -- plus tard donnerait un autre chiffre (les prix bougent) et fausserait
  -- rétroactivement la marge de plats déjà vendus.
  unit_cost     NUMERIC(12,4) NOT NULL CHECK (unit_cost >= 0),

  -- ⭐ §13.3 — l'état métier a son champ, `remaining_qty` n'en est pas un.
  --   active    : en cours d'utilisation
  --   depleted  : épuisé par les ventes — le cas nominal
  --   expired   : périmé sans être écoulé
  --   discarded : jeté volontairement (reste de service)
  --   closed    : clôturé par le cuisinier sans autre qualification
  -- ⚠️ `depleted` est posé automatiquement quand remaining_qty atteint 0 ;
  -- les trois autres sont des DÉCISIONS humaines (arbitrage du 06/08/2026).
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','depleted','expired','discarded','closed')),

  produced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  produced_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- ⚠️ Journée COMMERCIALE de production — le lot du matin après une nuit de
  -- service appartient à la journée en cours, pas à la précédente. Posée par
  -- le RPC (même formule que le trigger 067), jamais par un DEFAULT : un
  -- DEFAULT ne connaît pas le `closing_hour` du bar.
  business_date DATE NOT NULL,

  -- ⚠️ INFORMATIF : alimente une alerte, ne déclenche AUCUN changement de
  -- statut. Voir l'en-tête — la fermeture est toujours humaine.
  expires_at    TIMESTAMPTZ,

  -- Reste jeté = perte valorisée (discarded_qty × unit_cost).
  discarded_qty NUMERIC(10,3) CHECK (discarded_qty IS NULL OR discarded_qty > 0),
  discarded_at  TIMESTAMPTZ,
  discard_reason TEXT,

  notes         TEXT,

  -- ⭐⭐ CLÉ D'IDEMPOTENCE — sans elle, un double-clic sur « Produire »
  -- créerait DEUX lots. `consume_ingredients_fefo` est certes idempotente et
  -- ne double-décrémenterait pas la matière — mais le second lot existerait
  -- quand même, avec un coût réel de zéro : un lot FANTÔME qui fausserait
  -- toutes les portions qu'il sert.
  -- ⚠️ Portée par la TABLE et non seulement par le RPC : l'unicité est
  -- garantie par la base, seul endroit où deux transactions concurrentes ne
  -- peuvent pas passer entre les mailles.
  idempotency_key TEXT NOT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⛔ On ne peut pas avoir prélevé plus qu'on n'a produit.
  CONSTRAINT pb_remaining_lte_produced CHECK (remaining_qty <= produced_qty),

  -- ⚠️ Cohérence du rejet : les trois champs vont ensemble ou aucun.
  -- Sans cette contrainte, un `discarded_qty` sans date rendrait la perte
  -- impossible à dater, donc absente des métriques d'une période.
  CONSTRAINT pb_discard_coherence CHECK (
    (discarded_qty IS NULL     AND discarded_at IS NULL)
    OR (discarded_qty IS NOT NULL AND discarded_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.production_batches IS
  '§16.8 — lots produits pour les régimes batch et batch_finish. Une INSTANCE datée, jamais '
  'un stock scalaire : deux lots du même plat n''ont ni le même coût unitaire ni la même '
  'péremption, un compteur les moyennerait et perdrait les deux. '
  '⭐ AUCUNE fermeture automatique : un lot reste actif jusqu''à décision humaine (une sauce '
  'se conserve trois jours — clôturer à la journée compterait en perte ce qui est encore en '
  'cuisine).';

COMMENT ON COLUMN public.production_batches.dish_id IS
  'Le plat-BASE qui PRODUIT le lot (is_batch_base), jamais le plat vendu. Le spaghetti-poulet '
  'prélève dans le lot des « spaghetti cuits » — il ne produit rien lui-même.';

COMMENT ON COLUMN public.production_batches.unit_cost IS
  '⭐ Coût matière RÉEL du lot / portions produites, FIGÉ à la production. Le recalculer plus '
  'tard donnerait un autre chiffre (les prix bougent) et fausserait rétroactivement la marge '
  'de plats déjà vendus.';

COMMENT ON COLUMN public.production_batches.status IS
  '§13.3 — l''état métier a son champ. remaining_qty = 0 ne distingue pas « épuisé par les '
  'ventes » de « jeté » ni de « périmé », trois situations aux conséquences comptables '
  'différentes (§8). Seul `depleted` est automatique ; les autres sont des décisions humaines.';

COMMENT ON COLUMN public.production_batches.expires_at IS
  '⚠️ INFORMATIF — alimente une alerte, ne déclenche AUCUN changement de statut. La fermeture '
  'd''un lot est toujours une décision humaine (arbitrage du 06/08/2026).';

-- ⭐⭐ UNICITÉ DE LA CLÉ D'IDEMPOTENCE, PAR BAR.
-- ⚠️ C'est CET index qui rend le garde du RPC infaillible : deux requêtes
-- concurrentes passeraient toutes deux le `SELECT ... IF FOUND` avant que
-- l'une n'ait inséré. Seule une contrainte d'unicité en base les départage.
-- ⚠️ Par BAR et non global : deux bars peuvent générer la même clé sans se
-- gêner, et l'index reste utilisable pour la recherche du RPC.
CREATE UNIQUE INDEX idx_pb_idempotency
  ON public.production_batches (bar_id, idempotency_key);

-- ⭐ L'index de la question la plus fréquente : « quels lots actifs pour ce
-- plat ? », posée à chaque prélèvement et à chaque affichage de l'écran
-- Production.
-- ⚠️ PARTIEL sur `active` : les lots clos s'accumulent indéfiniment et ne
-- sont jamais prélevés — les indexer serait du volume mort.
CREATE INDEX idx_pb_bar_dish_active
  ON public.production_batches (bar_id, dish_id, produced_at)
  WHERE status = 'active';

-- Métriques et écran Production bornés sur une période.
CREATE INDEX idx_pb_bar_date
  ON public.production_batches (bar_id, business_date);

-- ⭐ Alerte de péremption : uniquement les lots actifs qui ont une date.
CREATE INDEX idx_pb_expiring
  ON public.production_batches (bar_id, expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE TRIGGER production_batches_updated_at
  BEFORE UPDATE ON public.production_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ RLS — lecture seule pour le client, écriture par RPC              │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ Même régime que `dishes`, `dish_ingredients` et
-- `dish_recipe_components`. Un INSERT direct permettrait de créer un lot
-- SANS consommer d'ingrédients : de la matière apparaîtrait de nulle part,
-- avec un `unit_cost` inventé. Tout passe par `produce_batch`.

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_batches_bar_members_select"
  ON public.production_batches FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.production_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_batches TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la table existe :
--
--    SELECT to_regclass('public.production_batches') AS t;
--    -- ATTENDU : non NULL
--
-- 2) ⛔⛔ BLOQUANT — RLS ACTIVE :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname = 'production_batches';
--    -- ATTENDU : true
--
-- 3) ⛔⛔ BLOQUANT — `authenticated` ne peut QUE lire :
--
--    SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_name='production_batches'
--    ORDER BY privilege_type;
--    -- ATTENDU : SELECT, et RIEN d'autre.
--    -- ⛔ Un INSERT permettrait de créer un lot SANS consommer d'ingrédients :
--    --    de la matière apparaîtrait de nulle part, avec un coût inventé.
--
-- 4) ⛔ BLOQUANT — les contraintes rejettent l'incohérent. Tests ACTIFS en
--    transaction annulée, donc sans effet. ⚠️ Adapter le bar_id :
--
--    BEGIN;
--      -- 4a. prélevé plus que produit → doit ÉCHOUER
--      INSERT INTO public.production_batches
--        (bar_id, dish_id, produced_qty, remaining_qty, unit_cost, business_date)
--      SELECT d.bar_id, d.id, 10, 12, 100, CURRENT_DATE
--      FROM public.dishes d LIMIT 1;
--      -- ATTENDU : ERREUR « pb_remaining_lte_produced »
--    ROLLBACK;
--
--    BEGIN;
--      -- 4b. rejet sans date → doit ÉCHOUER
--      INSERT INTO public.production_batches
--        (bar_id, dish_id, produced_qty, remaining_qty, unit_cost, business_date, discarded_qty)
--      SELECT d.bar_id, d.id, 10, 5, 100, CURRENT_DATE, 5
--      FROM public.dishes d LIMIT 1;
--      -- ATTENDU : ERREUR « pb_discard_coherence »
--    ROLLBACK;
--
-- 5) ⚠️ Index et trigger :
--
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='production_batches'
--    ORDER BY indexname;
--    -- ATTENDU : idx_pb_bar_date, idx_pb_bar_dish_active, idx_pb_expiring,
--    --           idx_pb_idempotency (+ production_batches_pkey)
--
-- 5bis) ⛔⛔ BLOQUANT — L'UNICITÉ DE LA CLÉ D'IDEMPOTENCE EST EN BASE.
--    C'est elle, et non le SELECT du RPC, qui départage deux requêtes
--    concurrentes : elles passeraient toutes deux le contrôle applicatif
--    avant qu'aucune n'ait inséré.
--
--    SELECT indexdef FROM pg_indexes
--    WHERE schemaname='public' AND indexname='idx_pb_idempotency';
--    -- ATTENDU : contient « UNIQUE » et « (bar_id, idempotency_key) »
--    -- ⛔ Sans l'unicité, un double-clic créerait un lot FANTÔME dont la
--    --    matière aurait déjà été consommée par le premier.
--
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.production_batches'::regclass AND NOT tgisinternal;
--    -- ATTENDU : production_batches_updated_at
