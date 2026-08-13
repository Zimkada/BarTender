-- ===================================================================
-- MIGRATION: get_daily_scope_totals — ventilation Bar / Restau du jour
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Le sélecteur de portée du Dashboard (Tout / Bar / Restau) doit ventiler le
--   CA et le nombre d'articles. Or `useDashboardAnalytics` charge les ventes
--   avec `includeItems: false` — une optimisation d'egress DÉLIBÉRÉE (le
--   Dashboard n'affiche que des totaux).
--   Ventiler côté client exigerait donc de charger le détail de TOUTES les
--   ventes du jour : sur un bar à 200 tickets, c'est exactement ce que
--   `includeItems: false` évite.

-- ⭐ SOLUTION — agrégation SERVEUR, une seule ligne retournée
--   Le §9 l'autorise explicitement : « une query initiale agrégée
--   supplémentaire est autorisée quand has_restaurant = true ». Ce RPC EST
--   cette query : il renvoie 4 nombres au lieu de 200 tickets détaillés.
--   ⚠️ Et il est appelé UNE FOIS : « changer de portée ne déclenche aucune
--   requête » (§9). Les trois portées se servent du même résultat.

-- ⭐ POURQUOI CE RPC EST DÉFINITIF
--   Les métriques de la phase 3B (marge matière, plat le plus rentable, temps
--   moyen de préparation) s'ajouteront ICI plutôt que d'exiger un second
--   appel. La structure de retour est un objet JSONB : y ajouter des clés ne
--   casse aucun appelant existant.

-- ⚠️ LA JOURNÉE COMPTABLE EST PASSÉE EN PARAMÈTRE, jamais calculée ici.
--   Un bar ferme souvent après minuit : une vente à 2 h appartient à la veille.
--   L'heure de clôture est propre à chaque bar (`bars.closingHour`), et le
--   client la connaît déjà (`getCurrentBusinessDateString`). Recalculer côté
--   serveur avec un seuil codé en dur ferait diverger les deux — le Dashboard
--   afficherait un CA différent de la liste des ventes de la même journée.
--   ⛔ NE PAS ajouter de repli `CURRENT_DATE - 6h` : il serait FAUX pour un bar
--      fermant à 4 h, et l'erreur serait silencieuse.

-- BREAKING_CHANGE: NO — fonction NEUVE.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_daily_scope_totals(UUID, DATE);
--   Sans risque : lecture seule, aucun effet de bord.

-- FUNCTIONS_CREATED: get_daily_scope_totals
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction ne doit pas exister :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_daily_scope_totals';
--    -- ATTENDU : 0 ligne. (CREATE OR REPLACE perdrait les GRANTS.)
--
-- 2) Helper RLS présent (SECURITY DEFINER → filtrage explicite obligatoire) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='is_bar_member';
--    -- ATTENDU : >= 1
--
-- 3) ⭐ Photographier un CA de référence — le RPC devra le retrouver :
--
--    SELECT business_date,
--           count(*) AS nb_ventes,
--           sum(total) AS ca_brut
--    FROM public.sales
--    WHERE status = 'validated'
--    GROUP BY business_date
--    ORDER BY business_date DESC
--    LIMIT 3;
--    -- NOTER une date et son ca_brut : le post-vol vérifie que
--    --   revenue_bar + revenue_kitchen = ce montant, aux retours près.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_daily_scope_totals'
  ) THEN
    RAISE EXCEPTION
      'get_daily_scope_totals existe déjà — CREATE OR REPLACE perdrait les GRANTS.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — filtrage d''accès impossible';
  END IF;
END $$;

CREATE FUNCTION public.get_daily_scope_totals(
  p_bar_id        UUID,
  p_business_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public   -- ⚠️ sans lui, un search_path manipulé ferait
                           --    résoudre `sales` vers une table pirate
AS $$
DECLARE
  v_revenue_bar     NUMERIC(14, 2) := 0;
  v_revenue_kitchen NUMERIC(14, 2) := 0;
  v_items_bar       BIGINT := 0;
  v_items_kitchen   BIGINT := 0;
  v_refunds         NUMERIC(14, 2) := 0;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS des tables lues
  -- NE S'APPLIQUE PAS. Sans ce garde, n'importe quel utilisateur authentifié
  -- lirait le chiffre d'affaires de TOUS les bars.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF p_business_date IS NULL THEN
    -- ⛔ PAS de repli sur CURRENT_DATE : l'heure de clôture est propre à chaque
    -- bar. Un repli codé en dur produirait un CA faux pour tout bar ne fermant
    -- pas à 6 h — et l'erreur serait SILENCIEUSE.
    RETURN jsonb_build_object('success', false, 'error', 'business_date est obligatoire');
  END IF;

  -- ⭐ VENTILATION — une seule passe sur les items du jour.
  -- ⚠️ `COALESCE(item->>'item_type', 'product')` : les 19 000+ ventes
  -- existantes ne portent pas le discriminant. L'absence se lit comme
  -- « produit », exactement comme côté client (`itemMatchesScope`). Toute
  -- autre lecture ferait diverger les deux.
  SELECT
    COALESCE(sum((item.value->>'total_price')::NUMERIC)
             FILTER (WHERE COALESCE(item.value->>'item_type', 'product') = 'product'), 0),
    COALESCE(sum((item.value->>'total_price')::NUMERIC)
             FILTER (WHERE COALESCE(item.value->>'item_type', 'product') = 'dish'), 0),
    COALESCE(sum((item.value->>'quantity')::INTEGER)
             FILTER (WHERE COALESCE(item.value->>'item_type', 'product') = 'product'), 0),
    COALESCE(sum((item.value->>'quantity')::INTEGER)
             FILTER (WHERE COALESCE(item.value->>'item_type', 'product') = 'dish'), 0)
  INTO v_revenue_bar, v_revenue_kitchen, v_items_bar, v_items_kitchen
  FROM public.sales s,
       LATERAL jsonb_array_elements(s.items) item(value)
  WHERE s.bar_id = p_bar_id
    AND s.business_date = p_business_date
    AND s.status = 'validated';

  -- ⚠️ INCOHÉRENCE PRÉEXISTANTE RELEVÉE, NON CORRIGÉE ICI :
  --   `saleHelpers.isConfirmedReturn` (client) accepte TROIS statuts —
  --   'approved', 'validated', 'restocked'.
  --   `daily_sales_summary_mat` (SQL) n'en accepte que DEUX : 'validated' y
  --   est absent.
  --   Ce RPC s'aligne sur le SQL, pour que le Dashboard concorde avec la vue
  --   matérialisée qu'il côtoie. Trancher l'écart relèverait d'un chantier
  --   dédié — l'arbitrer au passage, dans une migration sur un autre sujet,
  --   ferait bouger un chiffre financier sans que personne ne l'ait demandé.

  -- ⭐ RETOURS — NON ventilés, et c'est une LIMITE ASSUMÉE.
  --
  -- Un remboursement porte sur une VENTE entière (`returns.sale_id`), pas sur
  -- un item. Le ventiler exigerait de savoir quelle part du remboursement
  -- concerne les plats — information que la table ne porte pas.
  --
  -- ⚠️ La vue Analytics applique un ratio net/brut à chaque item ; c'est une
  -- APPROXIMATION qu'elle documente comme telle. La reproduire ici donnerait
  -- une fausse précision : mieux vaut retourner le montant BRUT ventilé et le
  -- total des retours à part, laissant l'appelant afficher ce qu'il sait être
  -- juste.
  -- ⚠️⚠️ CONDITION ALIGNÉE SUR `daily_sales_summary_mat` — défaut trouvé à la
  -- certification. Ma première version filtrait sur le seul `status`, ce qui
  -- aurait déduit des retours APPROUVÉS MAIS NON REMBOURSÉS : le CA net aurait
  -- été sous-évalué, et le Dashboard aurait affiché un montant différent de la
  -- vue matérialisée pour la même journée.
  -- ⭐ `is_refunded = true OR reason = 'exchange'` : un échange (Magic Swap)
  -- impacte les finances sans être un remboursement en espèces.
  SELECT COALESCE(sum(r.refund_amount), 0)
  INTO v_refunds
  FROM public.returns r
  WHERE r.bar_id = p_bar_id
    AND r.business_date = p_business_date
    AND r.status IN ('approved', 'restocked')
    AND r.refund_amount IS NOT NULL
    AND (r.is_refunded = true OR r.reason = 'exchange');

  RETURN jsonb_build_object(
    'success', true,
    'business_date', p_business_date,
    -- CA BRUT par portée (hors retours — cf. commentaire ci-dessus)
    'revenue_bar',     ROUND(v_revenue_bar, 2),
    'revenue_kitchen', ROUND(v_revenue_kitchen, 2),
    'revenue_total',   ROUND(v_revenue_bar + v_revenue_kitchen, 2),
    -- Articles vendus par portée. ⭐ Un plat EST un article vendu.
    'items_bar',       v_items_bar,
    'items_kitchen',   v_items_kitchen,
    'items_total',     v_items_bar + v_items_kitchen,
    -- ⚠️ Retours GLOBAUX, non ventilables. L'appelant les déduit du total.
    'refunds_total',   ROUND(v_refunds, 2)
  );
END;
$$;

COMMENT ON FUNCTION public.get_daily_scope_totals(UUID, DATE) IS
  '§9 — ventilation Bar / Restau du CA et des articles pour UNE journée comptable. '
  '⭐ Agrégation SERVEUR : renvoie 4 nombres au lieu de 200 tickets détaillés. Le Dashboard '
  'charge les ventes avec includeItems=false (optimisation egress délibérée) — ventiler côté '
  'client annulerait ce gain. '
  '⚠️ business_date OBLIGATOIRE, jamais calculée ici : l''heure de clôture est propre à chaque '
  'bar, un repli codé en dur produirait un CA faux silencieusement. '
  '⚠️ Les RETOURS ne sont PAS ventilés : un remboursement porte sur une vente entière, pas sur '
  'un item. Retournés à part plutôt qu''approximés — une fausse précision serait pire.';

REVOKE ALL ON FUNCTION public.get_daily_scope_totals(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_scope_totals(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_scope_totals(UUID, DATE) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Signature et attributs :
--
--    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--           p.prosecdef AS security_definer, p.provolatile AS volatilite,
--           p.proconfig AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_daily_scope_totals';
--    -- ATTENDU : 'p_bar_id uuid, p_business_date date' | true | 's' | {search_path=public}
--
-- 2) ⚠️ CRITIQUE — `anon` ne doit PAS pouvoir exécuter :
--
--    SELECT has_function_privilege('anon','public.get_daily_scope_totals(uuid,date)','EXECUTE') AS anon,
--           has_function_privilege('authenticated','public.get_daily_scope_totals(uuid,date)','EXECUTE') AS auth;
--    -- ATTENDU : false | true
--
-- 3) ⭐ COHÉRENCE DU CA — le contrôle qui compte.
--    Aucun plat n'existant aujourd'hui, revenue_kitchen DOIT valoir 0 et
--    revenue_bar DOIT égaler la somme des total_price des items.
--
--    -- Référence, calculée indépendamment du RPC :
--    SELECT sum((item.value->>'total_price')::NUMERIC) AS ca_items
--    FROM public.sales s, LATERAL jsonb_array_elements(s.items) item(value)
--    WHERE s.bar_id = '<bar>' AND s.business_date = '<date>' AND s.status = 'validated';
--
--    -- ⛔ Si revenue_bar <> ca_items : la ventilation est fausse.
--    -- ⛔ Si revenue_kitchen <> 0 : un item porte item_type='dish' alors
--    --    qu'aucun plat n'a été vendu — investiguer avant d'aller plus loin.
--
--    ⚠️ `revenue_total` peut différer de `sum(sales.total)` : ce dernier est le
--    montant enregistré de la vente, celui-ci la somme de ses lignes. Un écart
--    signalerait une incohérence de données PRÉEXISTANTE, pas un défaut du RPC.
--
-- 4) ⭐ business_date NULL est refusée :
--
--    -- Depuis l'app : appeler avec p_business_date = null
--    -- ATTENDU : { success: false, error: 'business_date est obligatoire' }
--    -- ⛔ Si un résultat est retourné, le repli silencieux est réapparu.
--
-- ⭐ TEST FONCTIONNEL — depuis l'APPLICATION (le SQL Editor a auth.uid() = NULL,
--    la fonction y répondrait « Accès refusé »).
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ Fonction NEUVE, appelée UNIQUEMENT derrière `hasRestaurant` (§9 : « une
--    query supplémentaire est autorisée QUAND has_restaurant = true »).
--    Sur un bar pur, elle n'est jamais appelée : zéro requête, zéro egress.
-- ☐ CÔTÉ CLIENT : la query doit porter `enabled: !!barId && hasRestaurant`
-- ☐ Test §3 à ajouter, sur le modèle de dishesInvariance.test.tsx
