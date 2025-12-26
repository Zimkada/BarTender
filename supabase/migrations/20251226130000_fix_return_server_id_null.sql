-- MIGRATION: Fix return with server_id NULL due to mode switching bug
-- DATE: 2025-12-26
-- PURPOSE: Update existing return where server_id is NULL but should be deduced from the sale

-- Update return to have the correct server_id based on the associated sale
-- Return ID: 5eef62e8-7f29-4341-bc46-de335cfb4c2f
-- Sale ID: bc15c773-0f1c-43ac-8d2c-a427891eb89b (created by TEST6 in full mode)

UPDATE returns r
SET server_id = COALESCE(
    s.server_id,  -- Use server_id if present (simplified mode sale)
    s.created_by  -- Otherwise use created_by (full mode sale)
)
FROM sales s
WHERE r.sale_id = s.id
  AND r.server_id IS NULL  -- Only update returns with NULL server_id
  AND s.created_by IS NOT NULL;  -- Only if we can deduce a server

-- Add comment explaining the fix
COMMENT ON COLUMN returns.server_id IS
'Server ID deduced from the associated sale. Uses sale.server_id (simplified mode) or sale.created_by (full mode).';
