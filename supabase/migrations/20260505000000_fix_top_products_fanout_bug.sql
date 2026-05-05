-- Fix: fanout bug in get_top_products_aggregated
--
-- Root cause: LEFT JOIN returns r ON r.sale_id = s.id produced multiple rows
-- when a single sale had multiple return records for the same product.
-- SUM(quantity) was then multiplied by the number of matching return rows.
--
-- Example: sale with 27 units + 2 return records → SUM counted 54 instead of 27.
--
-- Fix: pre-aggregate returns by (sale_id, product_id) in a CTE before joining,
-- so each (sale × product) pair always joins exactly one row.
-- Also adds WHERE bar_id = p_bar_id in the returns CTE to avoid a full table scan.

CREATE OR REPLACE FUNCTION public.get_top_products_aggregated(
    p_bar_id uuid,
    p_start_date date,
    p_end_date date,
    p_limit integer DEFAULT 10,
    p_sort_by text DEFAULT 'quantity'::text
)
RETURNS TABLE(
    product_id              uuid,
    product_name            text,
    product_volume          text,
    transaction_count       bigint,
    total_quantity          integer,
    total_revenue           numeric,
    total_quantity_returned integer,
    total_refunded          numeric,
    avg_unit_price          numeric,
    profit                  numeric,
    updated_at              timestamp without time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH product_costs AS (
    SELECT id, current_average_cost
    FROM public.bar_products
    WHERE bar_id = p_bar_id
  ),
  -- Pre-aggregate returns per (sale_id, product_id) to prevent fanout:
  -- without this, a sale joined to N return rows would multiply SUM(quantity) by N.
  returns_agg AS (
    SELECT
      sale_id,
      product_id,
      SUM(quantity_returned) FILTER (
        WHERE status IN ('approved', 'restocked', 'validated')
          AND (is_refunded = true OR reason = 'exchange')
      ) AS quantity_returned,
      SUM(refund_amount) FILTER (
        WHERE status IN ('approved', 'restocked', 'validated')
          AND (is_refunded = true OR reason = 'exchange')
      ) AS refund_amount
    FROM public.returns
    WHERE bar_id = p_bar_id
    GROUP BY sale_id, product_id
  ),
  aggregated_products AS (
    SELECT
      (item->>'product_id')::uuid          AS product_id,
      MAX(item->>'product_name')           AS product_name,
      MAX(item->>'product_volume')         AS product_volume,
      COUNT(DISTINCT s.id)::BIGINT         AS transaction_count,
      (SUM((item->>'quantity')::integer) -
       COALESCE(SUM(r.quantity_returned), 0))::INT     AS total_quantity,
      (SUM((item->>'total_price')::numeric) -
       COALESCE(SUM(r.refund_amount), 0))::NUMERIC     AS total_revenue,
      COALESCE(SUM(r.quantity_returned), 0)::INT       AS total_quantity_returned,
      COALESCE(SUM(r.refund_amount), 0)::NUMERIC       AS total_refunded,
      AVG((item->>'unit_price')::numeric)              AS avg_unit_price,
      COALESCE(pc.current_average_cost, 0)::NUMERIC    AS cump
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    LEFT JOIN returns_agg r
      ON  r.sale_id    = s.id
      AND r.product_id = (item->>'product_id')::uuid
    LEFT JOIN product_costs pc ON pc.id = (item->>'product_id')::uuid
    WHERE
      s.bar_id        = p_bar_id
      AND s.status    = 'validated'
      AND s.business_date >= p_start_date
      AND s.business_date <= p_end_date
    GROUP BY
      (item->>'product_id')::uuid,
      pc.current_average_cost
  )
  SELECT
    product_id,
    product_name,
    product_volume,
    transaction_count,
    total_quantity,
    total_revenue,
    total_quantity_returned,
    total_refunded,
    avg_unit_price,
    (total_revenue - (total_quantity * cump)) AS profit,
    NOW()                                     AS updated_at
  FROM aggregated_products
  ORDER BY
    CASE p_sort_by
      WHEN 'revenue' THEN total_revenue
      WHEN 'profit'  THEN (total_revenue - (total_quantity * cump))
      ELSE total_quantity
    END DESC NULLS LAST
  LIMIT p_limit;
$function$;
