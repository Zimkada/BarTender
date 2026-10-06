-- ===================================================================
-- MIGRATION: socle comptoirs - etape 1/4 (INVISIBLE pour l'utilisateur)
-- DATE: 2026-10-04
-- AUTHOR: AI Assistant
-- ===================================================================

-- BESOIN : gerer un bar a plusieurs comptoirs, chacun avec son gerant et son
--   stock, les serveuses pouvant intervenir des deux cotes. Stock SEPARE par
--   defaut, stock UNIQUE configurable.

-- CE QUE FAIT CETTE MIGRATION - et rien de plus :
--   1. cree `counters` (le comptoir) + `counter_assignments` (qui y travaille)
--   2. cree le drapeau de mode de stock sur `bars`
--   3. retro-remplit UN comptoir par bar existant, portant le nom du bar
--   4. y affecte tous les membres actifs
--   5. ajoute `counter_id` NULLABLE sur les 7 tables qui descendent, et le
--      remplit avec le comptoir unique du bar
--
-- ⛔ CE QU'ELLE NE FAIT PAS, VOLONTAIREMENT :
--   - aucun NOT NULL sur counter_id (etape 2, une fois le code qui l'ecrit
--     deploye - sinon toute insertion par l'app actuelle echouerait)
--   - aucune modification des 4 index uniques a descendre (etape 3 : les
--     descendre MAINTENANT, alors que tous les produits sont sur un comptoir
--     unique, ne change rien et ajoute du risque pour rien)
--   - aucune modification des 27 policies RLS (releve du 04/10 : AUCUNE ne
--     nomme une colonne de stock, toutes passent par bar_id + 4 helpers.
--     Elles survivent telles quelles a cette etape)
--   - aucune modification des 21 triggers
--   - aucune modification du CUMP (etape 3)
--
-- RESULTAT ATTENDU POUR L'UTILISATEUR : strictement rien ne change. Chaque bar
--   a 1 comptoir, tout le monde y est affecte, l'app se comporte a l'identique.
--   C'est l'interet : toute regression observee est imputable a CETTE migration.

-- ⚠️ POURQUOI L'AFFECTATION EST UNE TABLE A PART, ET PAS UNE COLONNE SUR
--   `bar_members` : releve du 04/10/2026 - `get_user_role(bar_id)` fait
--   `SELECT role FROM bar_members WHERE user_id=... AND bar_id=... LIMIT 1`
--   SANS ORDER BY. Il est deterministe uniquement parce que l'index unique
--   (bar_id, user_id) garantit UNE SEULE ligne. Mettre le comptoir dans
--   `bar_members` creerait N lignes par (user, bar) et ce helper renverrait un
--   role AU HASARD - un gerant du comptoir A pourrait heriter de son role du
--   comptoir B. 11 policies en dependent. Interdit.

-- ⚠️ LEÇON 23/09/2026 (souriciere du selecteur de bar) : ne JAMAIS conditionner
--   l'acces au mecanisme de bascule par une permission que la bascule elle-meme
--   peut retirer. L'affectation ci-dessous ne porte AUCUN role et ne conditionne
--   aucun acces : elle delimite un perimetre de travail, pas un droit.

-- VOLUMETRIE MESUREE le 04/10 : sales 23 480 lignes / 39 MB, supplies 3 529,
--   returns 1 371, stock_adjustments 1 265, bar_products 231, tickets 75,
--   consignments 25. Migration A CHAUD, aucune fenetre d'intervention requise.

-- BREAKING_CHANGE: NO - tout est additif et nullable.

-- ROLLBACK_STRATEGY: voir le bloc ROLLBACK en fin de fichier (commente).
--   Les 7 ALTER ... DROP COLUMN counter_id + DROP des 2 tables + DROP de la
--   colonne de mode suffisent. Aucune donnee metier n'est modifiee par cette
--   migration : elle n'ecrit que dans des colonnes qu'elle vient de creer.

-- TABLES_CREATED: counters, counter_assignments
-- TABLES_MODIFIED: bars (+2 col), sales, bar_products, supplies,
--   stock_adjustments, returns, consignments, tickets (+1 col chacune)
-- FUNCTIONS_CREATED: is_counter_member, resolve_stock_counter
-- RLS_CHANGES: RLS activee sur les 2 nouvelles tables uniquement.
--   Les 27 policies existantes ne sont PAS touchees.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 2 tables ne doivent pas deja exister :
--
-- SELECT tablename FROM pg_tables
-- WHERE schemaname='public' AND tablename IN ('counters','counter_assignments');
-- -- Attendu : 0 ligne.
--
-- 2) Aucune des 7 tables ne doit deja porter counter_id :
--
-- SELECT table_name FROM information_schema.columns
-- WHERE table_schema='public' AND column_name='counter_id';
-- -- Attendu : 0 ligne.
--
-- 2bis) ⛔ NOTER LE NOMBRE DE LIGNES D'AUDIT PRODUIT AVANT.
--    La 1re version de cette migration en creait 231 fausses (trigger
--    FOR EACH ROW sur UPDATE). Le POST-VOL doit retrouver EXACTEMENT ce
--    nombre : si l'ecart est non nul, la neutralisation des triggers n'a
--    pas fonctionne et l'historique est pollue de facon IRREVERSIBLE.
--
-- SELECT COUNT(*) AS audit_produits_avant FROM bar_product_audit_log;
--
-- 2ter) Verifier qu'on est bien proprietaire des tables (sinon le
--    DISABLE TRIGGER echouera) :
--
-- SELECT tablename, tableowner FROM pg_tables
-- WHERE schemaname='public' AND tablename IN ('sales','bar_products','supplies',
--   'stock_adjustments','returns','consignments','tickets');
-- -- Attendu : tableowner = le role courant (postgres dans le SQL Editor).
--
-- 3) Compter les bars et membres actifs, pour verifier le retro-remplissage :
--
-- SELECT COUNT(*) AS bars FROM bars;
-- SELECT COUNT(*) AS membres_actifs FROM bar_members WHERE is_active;
-- -- Noter ces 2 nombres : le POST-VOL doit retrouver exactement
-- --   1 comptoir par bar, et 1 affectation par membre actif.
--
-- 4) Noter les totaux de stock AVANT, pour prouver qu'ils ne bougent pas :
--
-- SELECT COUNT(*) AS produits, SUM(stock) AS stock_total FROM bar_products;
-- SELECT COUNT(*) AS ventes FROM sales;


BEGIN;

-- ===================================================================
-- 1. LE COMPTOIR
-- ===================================================================

CREATE TABLE public.counters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id     UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),

  -- Le comptoir cree par cette migration pour un bar existant. Sert de
  -- reference en mode stock unique, et de cible par defaut.
  -- Un seul par bar (index unique partiel plus bas).
  is_primary BOOLEAN NOT NULL DEFAULT false,

  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_counters_bar        ON public.counters(bar_id);
CREATE INDEX idx_counters_bar_active ON public.counters(bar_id, is_active);

-- Deux comptoirs actifs d'un meme bar ne peuvent pas porter le meme nom.
-- ⚠️ Index unique PARTIEL : toute insertion ON CONFLICT visant cet index
-- devra repeter EXACTEMENT le meme WHERE (lecon projet sur bar_products).
CREATE UNIQUE INDEX idx_counters_unique_name_per_bar
  ON public.counters (bar_id, lower(name))
  WHERE (is_active = true);

-- Un seul comptoir primaire par bar.
CREATE UNIQUE INDEX idx_counters_one_primary_per_bar
  ON public.counters (bar_id)
  WHERE (is_primary = true);

COMMENT ON TABLE public.counters IS
  'Comptoir : unite d''inventaire autonome dans un bar. Le bar reste l''entite '
  'economique (facturation, comptabilite, personnel, cuisine). Cree le 04/10/2026.';
COMMENT ON COLUMN public.counters.is_primary IS
  'Comptoir de reference du bar. Cible du mode stock unique, et comptoir par '
  'defaut. Un seul par bar.';


-- ===================================================================
-- 2. QUI TRAVAILLE A QUEL COMPTOIR
-- ===================================================================
-- Table SEPAREE de bar_members : voir l'avertissement en tete de fichier.
-- Ne porte AUCUN role. L'appartenance au bar et le role restent dans
-- bar_members, inchanges.

CREATE TABLE public.counter_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id      UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  counter_id  UUID NOT NULL REFERENCES public.counters(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  is_active   BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Une personne peut etre affectee a PLUSIEURS comptoirs (le cas des
  -- serveuses qui interviennent des deux cotes), mais une seule fois a chacun.
  CONSTRAINT counter_assignments_unique UNIQUE (counter_id, user_id)
);

CREATE INDEX idx_counter_assign_user    ON public.counter_assignments(user_id);
CREATE INDEX idx_counter_assign_counter ON public.counter_assignments(counter_id);
CREATE INDEX idx_counter_assign_bar     ON public.counter_assignments(bar_id, is_active);

COMMENT ON TABLE public.counter_assignments IS
  'Affectation d''une personne a un comptoir. Delimite un PERIMETRE DE TRAVAIL, '
  'jamais un droit : le role reste dans bar_members. Volontairement SEPAREE de '
  'bar_members, car N lignes par (user, bar) casseraient get_user_role() qui '
  'fait LIMIT 1 sans ORDER BY.';


-- ===================================================================
-- 3. LE MODE DE STOCK, SUR LE BAR
-- ===================================================================

ALTER TABLE public.bars
  ADD COLUMN IF NOT EXISTS stock_mode TEXT NOT NULL DEFAULT 'separate'
    CHECK (stock_mode IN ('separate', 'shared'));

-- Comptoir dont le stock fait reference quand stock_mode = 'shared'.
-- NULL en mode 'separate'. Resolu par resolve_stock_counter() plus bas.
ALTER TABLE public.bars
  ADD COLUMN IF NOT EXISTS shared_stock_counter_id UUID
    REFERENCES public.counters(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bars.stock_mode IS
  'separate (defaut) = chaque comptoir tient son stock. shared = tous les '
  'comptoirs lisent le stock de shared_stock_counter_id. ⛔ shared est un '
  'AIGUILLAGE DE LECTURE, jamais une duplication de lignes de stock : une '
  'divergence de stock sur un point de vente est un ecart de caisse.';


-- ===================================================================
-- 4. RETRO-REMPLISSAGE : UN COMPTOIR PAR BAR EXISTANT
-- ===================================================================
-- Porte le nom du bar : l'utilisateur retrouve ce qu'il connait.

INSERT INTO public.counters (bar_id, name, is_primary, is_active)
SELECT b.id, b.name, true, true
FROM public.bars b
WHERE NOT EXISTS (
  SELECT 1 FROM public.counters c WHERE c.bar_id = b.id
);

-- Tous les membres ACTIFS sont affectes au comptoir de leur bar.
-- (les membres inactifs ne le sont pas : ils ne travaillent pas)
INSERT INTO public.counter_assignments (bar_id, counter_id, user_id, is_active)
SELECT bm.bar_id, c.id, bm.user_id, true
FROM public.bar_members bm
JOIN public.counters c ON c.bar_id = bm.bar_id AND c.is_primary = true
WHERE bm.is_active = true
  AND bm.user_id IS NOT NULL          -- exclut les serveurs virtuels (mode simplifie)
ON CONFLICT (counter_id, user_id) DO NOTHING;


-- ===================================================================
-- 5. counter_id SUR LES 7 TABLES QUI DESCENDENT
-- ===================================================================
-- NULLABLE a cette etape : l'app deployee n'ecrit pas encore cette colonne.
-- Le NOT NULL viendra a l'etape 2, apres deploiement du code qui la remplit.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.bar_products
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.supplies
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.consignments
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS counter_id UUID REFERENCES public.counters(id) ON DELETE RESTRICT;

-- ⚠️ ON DELETE RESTRICT, pas CASCADE : supprimer un comptoir ne doit JAMAIS
-- effacer des ventes. Un comptoir se desactive (is_active = false), il ne se
-- supprime pas.

-- ⛔⛔ REMPLISSAGE : LES TRIGGERS DOIVENT ETRE NEUTRALISES
--
-- Defaut BLOQUANT trouve en revue de code (04/10/2026) sur la 1re version de
-- cette migration : un UPDATE de masse reveille les triggers FOR EACH ROW qui
-- reagissent a UPDATE. Releve en prod le 04/10, 21 triggers actifs sur ces 7
-- tables. Les 3 consequences mesurees :
--
--   1. ⛔ `trg_audit_bar_product_changes` (AFTER INSERT OR UPDATE OR DELETE,
--      FOR EACH ROW) ecrirait 231 lignes dans bar_product_audit_log : une
--      fausse "modification de produit", attribuee a personne, le meme jour,
--      sur TOUT le catalogue. C'est une CORRUPTION D'HISTORIQUE, et le
--      ROLLBACK de cette migration ne la defait PAS.
--   2. `after_sale_refresh_daily_summary` + les 2 triggers product_stats
--      emettraient ~23 480 x3 pg_notify pour rien.
--   3. `trg_supplies_after_update` recalculerait le CUMP 3 529 fois, alors
--      qu'aucun cout ne change.
--
-- ⚠️ Verifie : `trg_auto_restock_on_approval` porte un WHEN (OLD.status =
--    'pending' AND NEW.status IN ('approved','restocked')). Notre UPDATE ne
--    touche pas `status`, donc il ne se declenche PAS. Aucun stock ne bouge.
--    Les triggers BEFORE INSERT (business_date) et AFTER INSERT
--    (update_bar_activity) ne sont pas concernes non plus.
--
-- ⚠️ ALTER TABLE ... DISABLE TRIGGER USER exige d'etre proprietaire de la
--    table. Dans le SQL Editor Supabase on est `postgres`, donc OK. Si un
--    jour cette migration tournait avec un role moindre, elle echouerait ICI,
--    dans la transaction, sans rien laisser a moitie fait.
--
-- ⚠️ DISABLE TRIGGER USER ne desactive QUE les triggers utilisateur : les
--    contraintes de cle etrangere (triggers internes) restent actives. Le
--    REFERENCES counters(id) est donc toujours verifie.

ALTER TABLE public.sales             DISABLE TRIGGER USER;
ALTER TABLE public.bar_products      DISABLE TRIGGER USER;
ALTER TABLE public.supplies          DISABLE TRIGGER USER;
ALTER TABLE public.stock_adjustments DISABLE TRIGGER USER;
ALTER TABLE public.returns           DISABLE TRIGGER USER;
ALTER TABLE public.consignments      DISABLE TRIGGER USER;
ALTER TABLE public.tickets           DISABLE TRIGGER USER;

-- Tout l'existant appartient au comptoir unique de son bar.
UPDATE public.sales s
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = s.bar_id AND c.is_primary = true AND s.counter_id IS NULL;

UPDATE public.bar_products p
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = p.bar_id AND c.is_primary = true AND p.counter_id IS NULL;

UPDATE public.supplies sp
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = sp.bar_id AND c.is_primary = true AND sp.counter_id IS NULL;

UPDATE public.stock_adjustments sa
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = sa.bar_id AND c.is_primary = true AND sa.counter_id IS NULL;

UPDATE public.returns r
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = r.bar_id AND c.is_primary = true AND r.counter_id IS NULL;

UPDATE public.consignments cg
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = cg.bar_id AND c.is_primary = true AND cg.counter_id IS NULL;

UPDATE public.tickets t
  SET counter_id = c.id
  FROM public.counters c
  WHERE c.bar_id = t.bar_id AND c.is_primary = true AND t.counter_id IS NULL;

-- ⛔ REACTIVATION - dans la MEME transaction que la desactivation. Si quoi que
-- ce soit echoue au-dessus, le ROLLBACK implicite restaure les triggers : il
-- est IMPOSSIBLE de sortir de cette migration avec des triggers desactives.
ALTER TABLE public.sales             ENABLE TRIGGER USER;
ALTER TABLE public.bar_products      ENABLE TRIGGER USER;
ALTER TABLE public.supplies          ENABLE TRIGGER USER;
ALTER TABLE public.stock_adjustments ENABLE TRIGGER USER;
ALTER TABLE public.returns           ENABLE TRIGGER USER;
ALTER TABLE public.consignments      ENABLE TRIGGER USER;
ALTER TABLE public.tickets           ENABLE TRIGGER USER;

-- Index de lecture par comptoir (les ecrans gerant filtreront dessus).
CREATE INDEX IF NOT EXISTS idx_sales_counter             ON public.sales(counter_id);
CREATE INDEX IF NOT EXISTS idx_bar_products_counter      ON public.bar_products(counter_id);
CREATE INDEX IF NOT EXISTS idx_supplies_counter          ON public.supplies(counter_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_counter ON public.stock_adjustments(counter_id);
CREATE INDEX IF NOT EXISTS idx_returns_counter           ON public.returns(counter_id);
CREATE INDEX IF NOT EXISTS idx_consignments_counter      ON public.consignments(counter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_counter           ON public.tickets(counter_id);


-- ===================================================================
-- 6. LES DEUX HELPERS
-- ===================================================================
-- Calques sur is_bar_member() dont le releve du 04/10 a confirme la sante :
-- meme forme, meme STABLE SECURITY DEFINER, meme search_path figé.

CREATE OR REPLACE FUNCTION public.is_counter_member(counter_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM counter_assignments ca
    WHERE ca.counter_id = counter_id_param
      AND ca.user_id = auth.uid()
      AND ca.is_active = true
  );
$function$;

COMMENT ON FUNCTION public.is_counter_member IS
  'La personne courante est-elle affectee a ce comptoir ? Ne dit RIEN de son '
  'role (qui reste dans bar_members via get_user_role). A combiner avec les '
  'policies existantes a l''etape 2, jamais a les remplacer.';

-- Resolution du comptoir de stock : le coeur du mode 'shared'.
CREATE OR REPLACE FUNCTION public.resolve_stock_counter(counter_id_param UUID)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN b.stock_mode = 'shared' AND b.shared_stock_counter_id IS NOT NULL
      THEN b.shared_stock_counter_id
    ELSE c.id
  END
  FROM counters c
  JOIN bars b ON b.id = c.bar_id
  WHERE c.id = counter_id_param;
$function$;

COMMENT ON FUNCTION public.resolve_stock_counter IS
  'Quel comptoir porte le stock a lire/ecrire pour ce comptoir ? En mode '
  'separate : lui-meme. En mode shared : le comptoir de reference du bar. '
  'UNE SEULE source de verite - ne JAMAIS dupliquer les lignes de stock.';

REVOKE ALL ON FUNCTION public.is_counter_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_stock_counter(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_counter_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stock_counter(UUID) TO authenticated, service_role;


-- ===================================================================
-- 7. RLS SUR LES DEUX NOUVELLES TABLES
-- ===================================================================
-- ⚠️ Les 27 policies existantes ne sont PAS touchees (releve du 04/10 :
-- aucune ne nomme une colonne de stock). Seules les 2 nouvelles tables
-- recoivent des policies, calquees sur l'existant.

ALTER TABLE public.counters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_assignments ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre du bar voit les comptoirs de son bar.
CREATE POLICY "Bar members can view counters"
  ON public.counters FOR SELECT TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Ecriture : promoteur et co-promoteur seulement. PAS le gerant : creer un
-- comptoir engage la structure du bar, et touche aux plafonds d'abonnement.
CREATE POLICY "Promoters can create counters"
  ON public.counters FOR INSERT TO authenticated
  WITH CHECK (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur']))
    OR is_super_admin()
  );

-- ⚠️ USING **ET** WITH CHECK sur l'UPDATE. Le releve du 04/10 a montre que 4
-- policies UPDATE existantes (sales, bar_products, supplies, returns,
-- consignments) ont un WITH CHECK VIDE : rien ne verifie la ligne APRES
-- modification, donc un bar_id peut y etre deplace vers un autre bar. Dette
-- existante, signalee, hors perimetre de ce chantier - mais on ne la reproduit
-- PAS sur les tables neuves.
CREATE POLICY "Promoters can update counters"
  ON public.counters FOR UPDATE TO authenticated
  USING (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur']))
    OR is_super_admin()
  )
  WITH CHECK (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur']))
    OR is_super_admin()
  );

-- Pas de policy DELETE : un comptoir se desactive, il ne se supprime pas
-- (des ventes y sont rattachees en ON DELETE RESTRICT).

CREATE POLICY "Bar members can view counter assignments"
  ON public.counter_assignments FOR SELECT TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Affecter quelqu'un a un comptoir : gerant inclus (c'est de l'organisation
-- de service quotidienne, pas de la structure).
CREATE POLICY "Managers can create counter assignments"
  ON public.counter_assignments FOR INSERT TO authenticated
  WITH CHECK (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur','gerant']))
    OR is_super_admin()
  );

CREATE POLICY "Managers can update counter assignments"
  ON public.counter_assignments FOR UPDATE TO authenticated
  USING (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur','gerant']))
    OR is_super_admin()
  )
  WITH CHECK (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur','gerant']))
    OR is_super_admin()
  );

CREATE POLICY "Managers can delete counter assignments"
  ON public.counter_assignments FOR DELETE TO authenticated
  USING (
    (get_user_role(bar_id) = ANY (ARRAY['promoteur','co_promoteur','gerant']))
    OR is_super_admin()
  );

-- ⚠️ Les GRANT de table sont NECESSAIRES en plus des policies : RLS filtre les
-- LIGNES, le GRANT autorise l'OPERATION. Une table avec de bonnes policies mais
-- sans GRANT refuse tout. (Lecon du chantier bot WhatsApp : service_role
-- contourne RLS mais PAS les GRANT de table.)
-- Pas de DELETE sur counters : un comptoir se desactive, il ne se supprime pas.
GRANT SELECT, INSERT, UPDATE         ON public.counters            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.counter_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.counters            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.counter_assignments TO service_role;

-- ⛔ anon ne doit RIEN avoir sur ces 2 tables.
REVOKE ALL ON public.counters            FROM anon;
REVOKE ALL ON public.counter_assignments FROM anon;

COMMIT;

-- ⚠️ INDISPENSABLE : sans ce signal, PostgREST continuerait a servir un schema
-- sans counters ni counter_id.
NOTIFY pgrst, 'reload schema';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) UN comptoir primaire par bar, ni zero ni deux :
--
-- SELECT
--   (SELECT COUNT(*) FROM bars)                                   AS bars,
--   (SELECT COUNT(*) FROM counters WHERE is_primary)              AS comptoirs_primaires,
--   (SELECT COUNT(*) FROM counters)                               AS comptoirs_total;
-- -- Attendu : les 3 nombres EGAUX au nombre de bars du PRE-VOL.
--
-- 2) Chaque membre actif (hors serveur virtuel) est affecte :
--
-- SELECT
--   (SELECT COUNT(*) FROM bar_members WHERE is_active AND user_id IS NOT NULL) AS membres_actifs,
--   (SELECT COUNT(*) FROM counter_assignments WHERE is_active)                 AS affectations;
-- -- Attendu : egaux.
--
-- 3) ⛔ LE CONTROLE CRITIQUE - aucune ligne orpheline sur les 7 tables :
--
-- SELECT 'sales' AS t, COUNT(*) AS orphelines FROM sales WHERE counter_id IS NULL
-- UNION ALL SELECT 'bar_products',      COUNT(*) FROM bar_products      WHERE counter_id IS NULL
-- UNION ALL SELECT 'supplies',          COUNT(*) FROM supplies          WHERE counter_id IS NULL
-- UNION ALL SELECT 'stock_adjustments', COUNT(*) FROM stock_adjustments WHERE counter_id IS NULL
-- UNION ALL SELECT 'returns',           COUNT(*) FROM returns           WHERE counter_id IS NULL
-- UNION ALL SELECT 'consignments',      COUNT(*) FROM consignments      WHERE counter_id IS NULL
-- UNION ALL SELECT 'tickets',           COUNT(*) FROM tickets           WHERE counter_id IS NULL;
-- -- Attendu : 0 PARTOUT. Une seule ligne non nulle = retro-remplissage
-- --   incomplet, ne PAS passer a l'etape 2.
--
-- 4) ⛔ Le comptoir de chaque ligne appartient bien au bar de la ligne :
--
-- SELECT COUNT(*) AS incoherences FROM sales s
-- JOIN counters c ON c.id = s.counter_id WHERE c.bar_id <> s.bar_id;
-- -- Attendu : 0. (repeter pour les 6 autres tables si doute)
--
-- 5) AUCUN ECART DE STOCK - comparer aux nombres du PRE-VOL :
--
-- SELECT COUNT(*) AS produits, SUM(stock) AS stock_total FROM bar_products;
-- SELECT COUNT(*) AS ventes FROM sales;
-- -- Attendu : IDENTIQUES au PRE-VOL. Cette migration ne touche aucune
-- --   colonne metier.
--
-- 5bis) ⛔ TOUS LES TRIGGERS SONT REACTIVES - controle non negociable.
--    Un trigger reste desactive = les ventes cessent silencieusement
--    d'alimenter les vues, le CUMP cesse d'etre recalcule, l'audit cesse
--    d'enregistrer. Panne invisible, decouverte des semaines plus tard.
--
-- SELECT c.relname AS table_name, t.tgname, t.tgenabled
-- FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname='public' AND NOT t.tgisinternal
--   AND c.relname IN ('sales','bar_products','supplies','stock_adjustments',
--                     'returns','consignments','tickets')
--   AND t.tgenabled = 'D';
-- -- Attendu : 0 ligne. Toute ligne retournee = trigger reste desactive,
-- --   le reactiver IMMEDIATEMENT :
-- --   ALTER TABLE public.<table> ENABLE TRIGGER USER;
--
-- 5ter) ⛔ L'HISTORIQUE D'AUDIT N'A PAS ETE POLLUE :
--
-- SELECT COUNT(*) AS audit_produits_apres FROM bar_product_audit_log;
-- -- Attendu : EXACTEMENT le nombre note au PRE-VOL (2bis).
-- --   Un ecart de +231 (ou +nb de produits) signifie que le trigger d'audit
-- --   s'est declenche. Ces lignes ne sont PAS defaites par le ROLLBACK :
-- --   il faudrait les supprimer a la main, en les identifiant par leur
-- --   horodatage et leur absence d'auteur.
--
-- 6) Les 27 policies existantes sont intactes :
--
-- SELECT COUNT(*) FROM pg_policies WHERE schemaname='public'
--   AND tablename IN ('sales','bar_products','supplies','stock_adjustments',
--                     'returns','consignments','tickets');
-- -- Attendu : 27 (le nombre releve le 04/10). Cette migration n'en touche aucune.
--
-- 7) Privileges des 2 nouveaux helpers - PAS anon, PAS PUBLIC :
--
-- SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname IN ('is_counter_member','resolve_stock_counter');
-- -- Attendu : anon_peut = false sur les deux.
--
-- 8) Les helpers REQUIS fonctionnent (ne verifier QUE les refus laisserait
--    passer un helper qui bloque tout - lecon du chantier bot WhatsApp) :
--
-- SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname='is_counter_member';
-- -- Attendu : true.
--
-- 9) Le mode par defaut est bien 'separate' partout :
--
-- SELECT stock_mode, COUNT(*) FROM bars GROUP BY stock_mode;
-- -- Attendu : une seule ligne, 'separate' = nombre de bars.
--
-- 10) SMOKE-TEST DEPUIS L'APPLICATION (le SQL Editor a auth.uid() NULL, il ne
--     peut PAS tester les policies) :
--     - se connecter en promoteur -> l'app doit fonctionner A L'IDENTIQUE
--     - vendre un article -> la vente part, le stock decremente
--     - valider une vente en tant que gerant
--     - ouvrir Inventaire, Historique des ventes, Comptabilite
--     ⛔ Tout comportement different de l'avant-migration est une regression
--        de CETTE migration : rien ici n'est censé changer pour l'utilisateur.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ROLLBACK (a executer tel quel en cas de probleme)                │
-- └─────────────────────────────────────────────────────────────────┘
--
-- BEGIN;
--   ALTER TABLE public.sales             DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.bar_products      DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.supplies          DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.stock_adjustments DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.returns           DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.consignments      DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.tickets           DROP COLUMN IF EXISTS counter_id;
--   ALTER TABLE public.bars DROP COLUMN IF EXISTS shared_stock_counter_id;
--   ALTER TABLE public.bars DROP COLUMN IF EXISTS stock_mode;
--   DROP FUNCTION IF EXISTS public.resolve_stock_counter(UUID);
--   DROP FUNCTION IF EXISTS public.is_counter_member(UUID);
--   DROP TABLE IF EXISTS public.counter_assignments;
--   DROP TABLE IF EXISTS public.counters;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
--
-- Aucune donnee metier a restaurer : cette migration n'ecrit que dans des
-- colonnes et des tables qu'elle vient de creer.
