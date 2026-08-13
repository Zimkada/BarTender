-- ===================================================================
-- MIGRATION: kitchen_orders + kitchen_order_items + fulfillment_status
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§4, §6, §6.3, §16.4)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Un plat commandé n'existe nulle part entre la prise de commande et la
--   vente. Sans ces tables : pas de file de production pour le cuisinier, pas
--   de mesure du temps de préparation, et surtout AUCUNE trace des plats
--   PRODUITS MAIS NON SERVIS — la 4e métrique du §8, celle qui rend les pertes
--   cuisine attribuables plat par plat.

-- ⭐⭐ LE STATUT CANONIQUE VIT SUR LA LIGNE, PAS SUR LA COMMANDE (§4.3)
--   `kitchen_orders.status` et `kitchen_order_items.status` modifiables
--   indépendamment créeraient une classe entière de bugs de synchronisation.
--   Cas sans réponse au niveau parent : une commande de 2 plats dont l'un est
--   prêt et l'autre annulé — quel statut porte le parent ?
--   → `kitchen_orders` n'a DONC PAS de colonne `status`. Il est DÉRIVÉ par une
--     vue, jamais écrit. Une colonne stockée finirait par diverger de ses
--     lignes, et personne ne saurait laquelle croire.

-- ⭐⭐ LES DEUX HORODATAGES QUI PORTENT TOUT LE MODÈLE (§6)
--   `ready_at`  → moment de la CONSOMMATION de matière (décrément FEFO)
--   `served_at` → moment de la NAISSANCE du CA (création de la vente)
--   Leur DISSOCIATION est ce qui rend les pertes mesurables :
--       consumed_at IS NOT NULL AND sale_id IS NULL  ⟹  PERTE
--   Un plat cuisiné puis jamais servi a coûté sa matière sans produire un
--   franc. Aucun autre modèle ne capture cela.

-- ⭐ TICKETS — DEUX AXES, décision tranchée le 04/08/2026 (§6.3)
--   Le §6.3 posait la question « à trancher » : renommer `status` en
--   `payment_status`, ou ajouter une colonne ?
--   DÉCISION : AJOUTER `fulfillment_status`, ne rien renommer.
--     `tickets.status`      ('open' | 'paid')  → INCHANGÉ, porte le PAIEMENT
--     `fulfillment_status`  (NULL | pending | fulfilled) → NOUVEAU
--   ⭐ NULL = aucune ligne cuisine. Un bar pur garde donc NULL partout : ses
--   index, ses RPC et son code client sont rigoureusement inchangés (§3).
--   ⚠️ Renommer `status` aurait imposé de convertir 'open' → 'unpaid' sur tous
--   les tickets existants et d'adapter chaque lecteur — même profil de risque
--   que le renommage product_id → item_id, écarté pour les mêmes raisons.
--   Un ticket est CLOS si : status='paid' AND fulfillment_status IS DISTINCT FROM 'pending'

-- BREAKING_CHANGE: NO
--   Deux tables NEUVES + une colonne NULLABLE sans défaut sur `tickets`.
--   Aucune requête existante ne lit `fulfillment_status` : leur résultat est
--   rigoureusement identique.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.tickets DROP COLUMN IF EXISTS fulfillment_status;
--   DROP VIEW IF EXISTS public.kitchen_order_status;
--   DROP TABLE IF EXISTS public.kitchen_order_items;
--   DROP TABLE IF EXISTS public.kitchen_orders;
--   ⚠️ Sans risque tant qu'aucune commande n'est passée. Après, exporter :
--   ces tables portent la traçabilité des pertes cuisine.

-- TABLES_CREATED: kitchen_orders, kitchen_order_items
-- TABLES_MODIFIED: tickets (+1 colonne nullable)
-- VIEWS_AFFECTED: + kitchen_order_status (nouvelle)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister :
--
--    SELECT to_regclass('public.kitchen_orders')      AS t_orders,
--           to_regclass('public.kitchen_order_items') AS t_items,
--           EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_schema='public' AND table_name='tickets'
--                     AND column_name='fulfillment_status') AS col_existe;
--    -- ATTENDU : NULL | NULL | false
--
-- 2) Dépendances :
--
--    SELECT to_regclass('public.tickets') AS t_tickets,
--           to_regclass('public.dishes')  AS t_dishes,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 2
--
-- 3) ⭐ Photographier les tickets (le post-vol doit les retrouver intacts) :
--
--    SELECT count(*) AS nb_tickets,
--           count(*) FILTER (WHERE status='open') AS ouverts
--    FROM public.tickets;
--
-- 4) Photographier le nombre de tables :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname='public';

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kitchen_orders') IS NOT NULL
     OR to_regclass('public.kitchen_order_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Une table cuisine existe déjà — migration probablement déjà appliquée.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tickets' AND column_name='fulfillment_status'
  ) THEN
    RAISE EXCEPTION 'tickets.fulfillment_status existe déjà — diagnostiquer avant de rejouer.';
  END IF;

  IF to_regclass('public.tickets') IS NULL THEN
    RAISE EXCEPTION 'Table tickets absente — dépendance 20260204000000 non satisfaite';
  END IF;

  IF to_regclass('public.dishes') IS NULL THEN
    RAISE EXCEPTION 'Table dishes absente — appliquer d''abord 20260803100000';
  END IF;

  -- ⚠️ Compter les noms DISTINCTS : la présence d'un seul helper suffirait
  -- sinon à passer le garde (leçon de la phase 1).
  IF (
    SELECT count(DISTINCT p.proname) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('is_bar_member','is_super_admin')
  ) < 2 THEN
    RAISE EXCEPTION 'Helpers RLS absents — policies impossibles';
  END IF;
END $$;

-- =====================================================
-- 1. tickets.fulfillment_status — §6.3
-- =====================================================

-- ⚠️ NULLABLE et SANS DÉFAUT, contrairement à bar_categories.type.
-- NULL porte une information : « ce ticket n'a AUCUNE ligne cuisine ». Un
-- défaut 'pending' rendrait tous les tickets existants — et tous ceux des
-- bars purs — éternellement « en attente », donc jamais clos.
ALTER TABLE public.tickets
  ADD COLUMN fulfillment_status TEXT
  CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilled'));

COMMENT ON COLUMN public.tickets.fulfillment_status IS
  '§6.3 — SECOND AXE du ticket, distinct du paiement porté par `status`. '
  'NULL = aucune ligne cuisine (bar pur, ou ticket sans plat) — l''absence est une '
  'information, pas un défaut de saisie. pending = au moins une ligne non servie. '
  '⭐ Un ticket est CLOS si status=''paid'' ET fulfillment_status IS DISTINCT FROM ''pending''. '
  'Les 4 combinaisons sont légitimes, dont paid+pending = emporté payé d''avance (§16.2). '
  '⚠️ Écrit UNIQUEMENT par RPC (§13.7), jamais par le client.';

-- Index PARTIEL : seuls les tickets AYANT des lignes cuisine nous intéressent.
-- ⭐ Sur un bar pur cet index reste VIDE — aucun coût de maintenance à
-- l'écriture, §3 au niveau performance.
CREATE INDEX idx_tickets_fulfillment_pending
  ON public.tickets (bar_id)
  WHERE fulfillment_status = 'pending';

-- =====================================================
-- 2. kitchen_orders — extension du ticket
-- =====================================================

CREATE TABLE public.kitchen_orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⭐ bar_id porté explicitement bien que dérivable via ticket_id :
  -- convention d'isolation multi-tenant du projet. Les policies RLS et les
  -- filtres Realtime en dépendent — dériver par jointure alourdirait chaque
  -- policy et chaque filtre.
  bar_id     UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,

  -- ⭐ §15.1 — `delivery` HORS V1 : il supposerait une adresse, un livreur et
  -- un statut de course. Catégorie déclarée, non implémentable en V1.
  service_mode TEXT NOT NULL DEFAULT 'dine_in'
               CHECK (service_mode IN ('dine_in', 'takeaway')),

  -- Priorité manuelle : un client pressé, une tablée qui attend depuis 40 min.
  priority   INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,

  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- ⛔⛔ AUCUNE COLONNE `status` — §4.3, décision structurante.
  -- Le statut d'une commande est DÉRIVÉ de ses lignes (cf. vue
  -- `kitchen_order_status` plus bas). Le stocker créerait deux sources de
  -- vérité qui divergeraient au premier bug de synchronisation — et la
  -- question « une commande de 2 plats dont l'un est prêt et l'autre annulé »
  -- n'a pas de réponse au niveau parent.
);

COMMENT ON TABLE public.kitchen_orders IS
  'Extension cuisine d''un ticket — PAS un doublon : le ticket porte l''addition, celle-ci porte '
  'la production. ⛔ AUCUNE colonne `status` : il est DÉRIVÉ de ses lignes (§4.3), sinon deux '
  'sources de vérité finiraient par diverger.';

CREATE INDEX idx_kitchen_orders_ticket ON public.kitchen_orders (ticket_id);
CREATE INDEX idx_kitchen_orders_bar_date ON public.kitchen_orders (bar_id, created_at DESC);

-- ⚠️ UN SEUL kitchen_order par ticket : deux commandes cuisine sur la même
-- addition rendraient le statut dérivé ambigu, et le serveur ne saurait pas
-- laquelle regarder.
CREATE UNIQUE INDEX idx_kitchen_orders_unique_ticket ON public.kitchen_orders (ticket_id);

-- =====================================================
-- 3. kitchen_order_items — LE porteur du statut canonique
-- =====================================================

CREATE TABLE public.kitchen_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id           UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  kitchen_order_id UUID NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,

  -- ⚠️ RESTRICT et non CASCADE : supprimer un plat encore en production doit
  -- ÉCHOUER. Un CASCADE effacerait des lignes de service en cours, et la
  -- matière déjà consommée deviendrait introuvable.
  dish_id          UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),

  -- ⭐⭐ STATUT CANONIQUE (§6.1). Toute transition passe par un RPC : l'UI ne
  -- choisit jamais un statut, elle déclenche une ACTION.
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','preparing','ready','served','cancelled')),

  accepted_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at      TIMESTAMPTZ,

  -- ⭐ `ready` = moment de la CONSOMMATION de matière (§6).
  ready_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ready_at         TIMESTAMPTZ,

  -- ⭐ `served` = moment de la NAISSANCE du CA (§6).
  served_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  served_at        TIMESTAMPTZ,

  cancelled_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at     TIMESTAMPTZ,

  -- ⭐ §16.4 — ENUM, jamais du texte libre. Sans énumération, impossible de
  -- distinguer une FUITE DE STOCK d'un problème d'ORGANISATION ou d'une
  -- mauvaise CARTE. C'est la structure qui rend les annulations analysables.
  cancel_reason    TEXT CHECK (cancel_reason IS NULL OR cancel_reason IN (
                     'ingredient_shortage',   -- rupture → signal d'appro
                     'kitchen_overloaded',    -- délai → signal d'organisation
                     'dish_unavailable',      -- plat coupé encore visible → signal de carte
                     'server_input_error',
                     'customer_cancelled',
                     'substitution_offered'
                   )),
  -- ⚠️ Complément du motif structuré, JAMAIS son remplaçant.
  cancel_note      TEXT,

  -- Relances du serveur vers la cuisine — alimente les alertes de retard.
  reminder_count   INTEGER NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
  last_reminder_at TIMESTAMPTZ,

  -- « sans piment », « bien cuit » : l'information qui coûte le plus cher
  -- quand elle est manquée (§9).
  modifiers        JSONB,

  -- Prix figé à la commande : le plat peut être re-tarifé ensuite.
  unit_price       NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),

  -- ⭐ Snapshot du coût matière, figé à `ready` (§6). C'est le coût RÉELLEMENT
  -- consommé — pas l'estimation de `calculate_dish_cost`, qui bouge avec les lots.
  computed_cost    NUMERIC(14, 2),
  -- ⭐ Horodatage du décrément — sert aussi de garde d'IDEMPOTENCE : un second
  -- `mark_ready` ne doit pas consommer la matière deux fois.
  consumed_at      TIMESTAMPTZ,

  -- ⭐ FK NULLABLE : NULL si `ready` mais jamais servi = PERTE (§8, 4e métrique).
  sale_id          UUID REFERENCES public.sales(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⚠️ INVARIANTS DU §6.1 — gravés en base, pas seulement dans les RPC.
  -- Un RPC peut être contourné par un accès direct ; une contrainte, non.

  -- `sale_id IS NOT NULL` ⟺ statut = 'served'
  CONSTRAINT koi_sale_iff_served CHECK (
    (status = 'served' AND sale_id IS NOT NULL)
    OR (status <> 'served' AND sale_id IS NULL)
  ),

  -- ⭐ `consumed_at` renseigné ⟺ la matière est partie. Vrai pour 'ready',
  -- 'served', et 'cancelled' APRÈS ready (la matière n'est jamais restituée).
  -- ⚠️ Un 'cancelled' AVANT ready n'a rien consommé — d'où le OR.
  CONSTRAINT koi_consumed_coherence CHECK (
    (status IN ('ready','served') AND consumed_at IS NOT NULL)
    OR (status IN ('pending','accepted','preparing') AND consumed_at IS NULL)
    OR status = 'cancelled'
  ),

  -- Un motif d'annulation n'a de sens que sur une ligne annulée, et une ligne
  -- annulée DOIT en porter un — sinon la métrique des pertes est aveugle.
  CONSTRAINT koi_cancel_coherence CHECK (
    (status = 'cancelled' AND cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancel_reason IS NULL AND cancelled_at IS NULL)
  ),

  -- Le coût figé accompagne la consommation.
  CONSTRAINT koi_cost_with_consumption CHECK (
    (consumed_at IS NULL AND computed_cost IS NULL)
    OR (consumed_at IS NOT NULL AND computed_cost IS NOT NULL)
  )
);

COMMENT ON TABLE public.kitchen_order_items IS
  '⭐ PORTEUR DU STATUT CANONIQUE (§4.3) — le statut de la commande parente en est DÉRIVÉ. '
  '⭐⭐ La dissociation ready_at / served_at est le cœur du modèle : `ready` consomme la '
  'MATIÈRE, `served` crée le CA. Une ligne avec consumed_at renseigné et sale_id NULL est une '
  'PERTE mesurable (§8, 4e métrique) — aucun autre modèle ne capture cela.';

COMMENT ON COLUMN public.kitchen_order_items.consumed_at IS
  'Horodatage du décrément FEFO. Sert de garde d''IDEMPOTENCE : un second mark_ready ne doit '
  'pas consommer la matière deux fois. ⚠️ Reste renseigné après une annulation post-ready — '
  'la matière n''est JAMAIS restituée (§6.1).';

-- ⭐ Index de l'écran Service — la requête la plus fréquente du module :
-- « que reste-t-il à produire dans ce bar ? ». Partiel sur les lignes ACTIVES :
-- l'historique servi/annulé n'a pas à être indexé pour cet usage.
CREATE INDEX idx_koi_active_by_bar
  ON public.kitchen_order_items (bar_id, created_at)
  WHERE status IN ('pending','accepted','preparing','ready');

CREATE INDEX idx_koi_order ON public.kitchen_order_items (kitchen_order_id);

-- ⭐ Index des PERTES (§8) : consumed_at renseigné, sale_id absent.
-- Partiel et donc minuscule — les pertes sont rares par construction.
CREATE INDEX idx_koi_losses
  ON public.kitchen_order_items (bar_id, ready_at)
  WHERE sale_id IS NULL AND consumed_at IS NOT NULL;

-- =====================================================
-- 4. Vue du statut DÉRIVÉ — §4.3 et §6.2
-- =====================================================

-- ⚠️⚠️ `security_invoker = true` OBLIGATOIRE — convention établie par
-- 20260107_convert_views_to_security_invoker.sql. Sans cette option, la vue
-- s'exécute avec les droits de son CRÉATEUR : la RLS des tables sous-jacentes
-- est contournée et tout membre d'un bar verrait les commandes de TOUS les
-- bars.
CREATE VIEW public.kitchen_order_status
WITH (security_invoker = true)
AS
SELECT
  ko.id AS kitchen_order_id,
  ko.bar_id,
  ko.ticket_id,
  -- ⭐ DÉRIVATION du §6.2, dans l'ordre EXACT du plan. L'ordre compte : une
  -- commande dont toutes les lignes sont annulées est 'cancelled', pas
  -- 'served' — d'où le test le plus restrictif en premier.
  CASE
    -- ⚠️ CAS DES 0 LIGNE — défaut trouvé à la code review.
    -- `create_kitchen_order` créera la commande PUIS ses lignes. Entre les
    -- deux, ou si la seconde étape échoue, la commande existe sans ligne.
    -- Avec un JOIN, elle DISPARAISSAIT de la vue : orpheline invisible,
    -- aucun signal. Avec un LEFT JOIN sans ce cas, elle tomberait dans le
    -- ELSE et s'afficherait comme « en attente » — un faux plat à produire.
    -- ⭐ `count(koi.id)` et non `count(*)` : count(*) vaut 1 sur la ligne
    -- NULL du LEFT JOIN, count(colonne) ignore les NULL.
    WHEN count(koi.id) = 0 THEN 'empty'
    WHEN count(*) FILTER (WHERE koi.status = 'cancelled') = count(koi.id) THEN 'cancelled'
    WHEN count(*) FILTER (WHERE koi.status IN ('served','cancelled')) = count(koi.id) THEN 'served'
    WHEN count(*) FILTER (WHERE koi.status = 'ready') > 0
         AND count(*) FILTER (WHERE koi.status IN ('pending','accepted','preparing')) = 0 THEN 'ready'
    WHEN count(*) FILTER (WHERE koi.status = 'preparing') > 0 THEN 'preparing'
    ELSE 'pending'
  END AS status,
  count(koi.id) AS total_items,
  count(*) FILTER (WHERE koi.status IN ('pending','accepted','preparing')) AS items_in_progress,
  count(*) FILTER (WHERE koi.status = 'ready') AS items_ready,
  min(koi.created_at) AS first_item_at
-- ⚠️ LEFT JOIN et non JOIN : une commande sans ligne doit rester VISIBLE.
-- Une anomalie qu'on ne voit pas est pire qu'une anomalie affichée.
FROM public.kitchen_orders ko
LEFT JOIN public.kitchen_order_items koi ON koi.kitchen_order_id = ko.id
GROUP BY ko.id, ko.bar_id, ko.ticket_id;

COMMENT ON VIEW public.kitchen_order_status IS
  '§4.3/§6.2 — statut DÉRIVÉ d''une commande, jamais stocké. `kitchen_orders` n''a '
  'volontairement pas de colonne `status` : deux sources de vérité finiraient par diverger, et '
  '« une commande de 2 plats dont l''un est prêt et l''autre annulé » n''a pas de réponse au '
  'niveau parent. ⚠️ L''ORDRE des CASE compte — tout annulé prime sur tout servi.';

-- =====================================================
-- 5. RLS
-- =====================================================
-- ⚠️ Pattern du projet : LECTURE par RLS pour les membres du bar, ÉCRITURE
-- réservée aux RPC SECURITY DEFINER. Aucun GRANT INSERT/UPDATE/DELETE à
-- `authenticated` — une transition de statut écrite en direct contournerait la
-- machine d'état, le décrément FEFO et la création de vente.

ALTER TABLE public.kitchen_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitchen_orders_bar_members_select"
  ON public.kitchen_orders FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "kitchen_order_items_bar_members_select"
  ON public.kitchen_order_items FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.kitchen_orders      TO authenticated;
GRANT SELECT ON public.kitchen_order_items TO authenticated;
GRANT SELECT ON public.kitchen_order_status TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_orders      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_order_items TO service_role;
GRANT SELECT ON public.kitchen_order_status TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les objets existent :
--
--    SELECT to_regclass('public.kitchen_orders')       AS t_orders,
--           to_regclass('public.kitchen_order_items')  AS t_items,
--           to_regclass('public.kitchen_order_status') AS v_status;
--    -- ATTENDU : les 3 non NULL
--
-- 2) ⚠️ CRITIQUE — les TICKETS sont intacts (comparer au pré-vol 3) :
--
--    SELECT count(*) AS nb_tickets,
--           count(*) FILTER (WHERE status='open') AS ouverts,
--           count(*) FILTER (WHERE fulfillment_status IS NOT NULL) AS avec_fulfillment
--    FROM public.tickets;
--    -- ATTENDU : nb_tickets et ouverts IDENTIQUES au pré-vol,
--    --           avec_fulfillment = 0 (la colonne est nullable sans défaut).
--    -- ⛔ avec_fulfillment > 0 : un DEFAULT s'est glissé — tous les tickets
--    --    seraient marqués « en attente » et ne pourraient jamais être clos.
--
-- 3) ⚠️ CRITIQUE — RLS active et `authenticated` en LECTURE SEULE :
--
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('kitchen_orders','kitchen_order_items');
--    -- ATTENDU : true sur les 2
--
--    SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated'
--      AND table_name IN ('kitchen_orders','kitchen_order_items')
--    ORDER BY table_name, privilege_type;
--    -- ATTENDU : uniquement SELECT.
--    -- ⛔ Tout UPDATE ici = la machine d'état est contournable.
--
-- 4) ⚠️ CRITIQUE — la vue est en security_invoker :
--
--    SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname='kitchen_order_status';
--    -- ATTENDU : {security_invoker=true}
--    -- ⛔ Absent = tout membre verrait les commandes de TOUS les bars.
--
-- 5) ⭐ Les INVARIANTS du §6.1 rejettent l'incohérent — tests ACTIFS, annulés.
--    ⚠️ Nécessitent un bar et un plat réels ; adapter les sous-requêtes.
--
--    BEGIN;
--      -- 5a. 'served' SANS sale_id → doit ÉCHOUER (koi_sale_iff_served)
--      INSERT INTO public.kitchen_orders (bar_id, ticket_id)
--      SELECT t.bar_id, t.id FROM public.tickets t LIMIT 1;
--      INSERT INTO public.kitchen_order_items
--        (bar_id, kitchen_order_id, dish_id, quantity, status, unit_price, consumed_at, computed_cost)
--      SELECT ko.bar_id, ko.id, d.id, 1, 'served', 1000, NOW(), 500
--      FROM public.kitchen_orders ko, public.dishes d
--      WHERE d.bar_id = ko.bar_id LIMIT 1;
--    ROLLBACK;
--    -- ATTENDU : ERROR ... "koi_sale_iff_served"
--
--    BEGIN;
--      -- 5b. 'cancelled' SANS motif → doit ÉCHOUER (koi_cancel_coherence)
--      INSERT INTO public.kitchen_orders (bar_id, ticket_id)
--      SELECT t.bar_id, t.id FROM public.tickets t LIMIT 1;
--      INSERT INTO public.kitchen_order_items
--        (bar_id, kitchen_order_id, dish_id, quantity, status, unit_price, cancelled_at)
--      SELECT ko.bar_id, ko.id, d.id, 1, 'cancelled', 1000, NOW()
--      FROM public.kitchen_orders ko, public.dishes d
--      WHERE d.bar_id = ko.bar_id LIMIT 1;
--    ROLLBACK;
--    -- ATTENDU : ERROR ... "koi_cancel_coherence"
--    -- ⛔ Si l'un de ces INSERT PASSE, l'invariant ne protège rien.
--
-- 5bis) ⭐ Une commande SANS ligne reste VISIBLE — défaut trouvé à la review.
--
--    BEGIN;
--      INSERT INTO public.kitchen_orders (bar_id, ticket_id)
--      SELECT t.bar_id, t.id FROM public.tickets t LIMIT 1;
--      SELECT status, total_items FROM public.kitchen_order_status
--      WHERE kitchen_order_id = (SELECT id FROM public.kitchen_orders
--                                ORDER BY created_at DESC LIMIT 1);
--    ROLLBACK;
--    -- ATTENDU : status = 'empty', total_items = 0
--    -- ⛔ 0 ligne retournée : le JOIN a été rétabli — une commande orpheline
--    --    serait INVISIBLE, sans aucun signal.
--    -- ⛔ status = 'pending' : `count(*)` a remplacé `count(koi.id)` — la
--    --    commande vide s'afficherait comme un plat à produire.
--
-- 6) ⭐ Un seul kitchen_order par ticket :
--
--    SELECT indexdef FROM pg_indexes
--    WHERE tablename='kitchen_orders' AND indexname='idx_kitchen_orders_unique_ticket';
--    -- ATTENDU : UNIQUE sur (ticket_id)
--
-- 7) Aucune table existante altérée (comparer au pré-vol 4) :
--
--    SELECT count(*) AS nb_tables FROM pg_tables WHERE schemaname='public';
--    -- ATTENDU : pré-vol + 2
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Deux tables NEUVES : aucun bar pur ne les lira jamais.
-- ⭐ `tickets.fulfillment_status` est NULLABLE SANS DÉFAUT : les tickets
--    existants et ceux des bars purs gardent NULL. Aucune requête actuelle ne
--    lit cette colonne — leur résultat est rigoureusement identique (post-vol 2).
-- ⭐ L'index partiel `idx_tickets_fulfillment_pending` reste VIDE sur un bar
--    pur : aucun coût de maintenance à l'écriture.
--
-- ☐ CÔTÉ CLIENT : queries `enabled: !!barId && hasRestaurant`
-- ☐ Realtime : NE PAS ajouter ces tables à la publication sans mesurer — le
--   projet a mené 3 vagues d'optimisation egress. L'écran Service en aura
--   besoin, mais c'est une décision à prendre avec la mesure sous les yeux.
