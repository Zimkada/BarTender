-- Vérifier la dernière vente avec promotion
SELECT
    id,
    created_at,
    items,
    subtotal,
    discount_total,
    total,
    applied_promotions
FROM sales
WHERE bar_id = '66f6a6a9-35d7-48b9-a49a-4075c45ea452'
  AND applied_promotions IS NOT NULL
  AND jsonb_array_length(applied_promotions) > 0
ORDER BY created_at DESC
LIMIT 1;
