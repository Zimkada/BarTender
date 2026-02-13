-- ==============================================================================
-- MIGRATION: Fix Comptabilité Tickets & Dashboard
-- ==============================================================================
--
-- BUT :
-- 1. Corriger `pay_ticket` pour que le mode de paiement soit propagé aux ventes (sales).
-- 2. Corriger `daily_sales_summary` pour qu'elle calcule réellement les revenus par méthode (plus de 0 placeholders).
-- 3. Rattraper l'historique (Backfill) des tickets déjà payés.
--
-- PRECAUTIONS :
-- - Transaction unique (BEGIN/COMMIT).
-- - Gestion des dépendances de vues matérialisées (DROP CASCADE / RECREATE).
-- - Idempotence du Backfill.

BEGIN;

-- ==============================================================================
-- 1. CORRECTION RPC `pay_ticket`
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.pay_ticket(
    p_ticket_id      UUID,
    p_paid_by        UUID,
    p_payment_method TEXT
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
BEGIN
    SET LOCAL row_security = off;

    IF p_ticket_id IS NULL OR p_paid_by IS NULL OR p_payment_method IS NULL THEN
        RAISE EXCEPTION 'ticket_id, paid_by et payment_method sont requis';
    END IF;

    -- Lock the row to prevent concurrent modifications
    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket % non trouvé', p_ticket_id;
    END IF;

    IF v_ticket.status <> 'open' THEN
        RAISE EXCEPTION 'Ticket % n''est pas ouvert (statut actuel: %)', p_ticket_id, v_ticket.status;
    END IF;

    -- 1. Update Ticket
    UPDATE public.tickets
    SET status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        paid_by = p_paid_by,
        payment_method = p_payment_method
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- 2. Update Related Sales (PROPAGATION) -- ✨ NOUVEAU
    -- On met à jour toutes les ventes liées à ce ticket qui étaient en attente de paiement (method='ticket')
    UPDATE public.sales
    SET payment_method = p_payment_method,
        updated_at = CURRENT_TIMESTAMP
    WHERE ticket_id = p_ticket_id
      AND payment_method = 'ticket'; -- Sécurité pour ne pas écraser si déjà traité manuellement

    RETURN v_ticket;
END;
$$;

-- ==============================================================================
-- 2. CORRECTION DES VUES (daily_sales_summary & dependances)
-- ==============================================================================

-- a) Drop dependencies first (Cascade order)
DROP VIEW IF EXISTS bar_stats_multi_period;
DROP MATERIALIZED VIEW IF EXISTS bar_stats_multi_period_mat;
DROP VIEW IF EXISTS daily_sales_summary;
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat;

-- b) Recreate `daily_sales_summary_mat` with REAL SUMS
CREATE MATERIALIZED VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  -- Compteurs
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected_count,

  -- Revenus bruts
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,
  COALESCE(SUM(s.subtotal) FILTER (WHERE s.status = 'validated'), 0) AS gross_subtotal,
  COALESCE(SUM(s.discount_total) FILTER (WHERE s.status = 'validated'), 0) AS total_discounts,

  -- Nombre d'items vendus
  COALESCE(SUM(
    (SELECT SUM((item->>'quantity')::integer)
     FROM jsonb_array_elements(s.items) AS item)
  ) FILTER (WHERE s.status = 'validated'), 0) AS total_items_sold,

  -- Panier moyen
  CASE
    WHEN COUNT(*) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) /
         COUNT(*) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS avg_basket_value,

  -- ✨ VENTILATION PAR MÉTHODE DE PAIEMENT (CORRECTION)
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'cash'), 0) AS cash_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'mobile_money'), 0) AS mobile_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'card'), 0) AS card_revenue,
  -- Note: on ignore 'ticket' ici car ils sont censés être convertis. S'il en reste, ils ne seront pas comptés dans ces 3 colonnes,
  -- mais seront bien dans 'gross_revenue'. C'est le comportement voulu (cash reconciliation).

  -- Serveurs actifs
  COUNT(DISTINCT s.sold_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW() AS updated_at

FROM sales s
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY 
  s.bar_id, 
  s.business_date, 
  DATE_TRUNC('week', s.business_date), 
  DATE_TRUNC('month', s.business_date);

-- Index pour daily_sales_summary_mat
CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- Vue Publique daily_sales_summary
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);
GRANT SELECT ON daily_sales_summary TO authenticated;

-- c) Recreate `bar_stats_multi_period` (Identique à avant, juste rebranché)
CREATE MATERIALIZED VIEW bar_stats_multi_period_mat AS
SELECT
  dss.bar_id,
  dss.sale_date,
  dss.sale_week,
  dss.sale_month,
  dss.pending_count,
  dss.validated_count,
  dss.rejected_count,
  dss.gross_revenue,
  dss.gross_subtotal,
  dss.total_discounts,
  dss.total_items_sold,
  dss.avg_basket_value,
  dss.cash_revenue,
  dss.mobile_revenue,
  dss.card_revenue,
  dss.active_servers,
  dss.first_sale_time,
  dss.last_sale_time,
  NOW() AS updated_at
FROM daily_sales_summary_mat dss;

CREATE UNIQUE INDEX idx_bar_stats_mat_pk ON bar_stats_multi_period_mat(bar_id, sale_date);

CREATE OR REPLACE VIEW bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);
GRANT SELECT ON bar_stats_multi_period TO authenticated;


-- ==============================================================================
-- 3. BACKFILL (Rattrapage Historique)
-- ==============================================================================

-- Met à jour les ventes liées à des tickets DÉJÀ payés.
-- Condition : Vente en 'ticket' + Ticket en 'paid' + Ticket a une méthode connue.
UPDATE public.sales s
SET payment_method = t.payment_method,
    updated_at = CURRENT_TIMESTAMP
FROM public.tickets t
WHERE s.ticket_id = t.id
  AND t.status = 'paid'
  AND s.payment_method = 'ticket'
  AND t.payment_method IS NOT NULL
  AND t.payment_method IN ('cash', 'mobile_money', 'card', 'credit'); -- Safety check on enum

-- ==============================================================================
-- 4. REFRESH INITIAL
-- ==============================================================================

REFRESH MATERIALIZED VIEW daily_sales_summary_mat;
REFRESH MATERIALIZED VIEW bar_stats_multi_period_mat;

COMMIT;
