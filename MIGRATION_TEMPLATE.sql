-- ===================================================================
-- MIGRATION TEMPLATE - BarTender Pro
-- ===================================================================
-- 🔴 REQUIRED: Fill in all sections marked [REQUIRED]
-- 🟡 OPTIONAL: Fill if applicable to your migration
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ METADATA                                                        │
-- └─────────────────────────────────────────────────────────────────┘

-- FILE NAME CONVENTION: YYYYMMDDHHMMSS_description_slug.sql
-- EXAMPLE: 20260107143022_add_feature_x.sql
-- PATTERN: No spaces, lowercase, underscores only

-- MIGRATION: [REQUIRED - One-line title]
-- DATE: [REQUIRED - YYYY-MM-DD]
-- AUTHOR: [REQUIRED - Your name or "AI Assistant"]
-- TICKET: [OPTIONAL - Jira/GitHub ticket if applicable]

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM: [REQUIRED - What problem does this solve?]
-- Example: "Dashboard shows CA from 5 hours ago (materialized view latency)"

-- IMPACT: [REQUIRED - Who is affected?]
-- Example: "All bars | Admins | Specific bars in simplifié mode"

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION: [REQUIRED - What we're doing]
-- Example: "Convert daily_sales_summary from MATERIALIZED VIEW to VIEW (real-time)"

-- APPROACH: [OPTIONAL - Why this approach?]
-- Example: "Latency < Correctness for accounting data"

-- BREAKING_CHANGE: [REQUIRED - YES/NO]
-- - YES if: API changes, data deleted, columns renamed
-- - NO if: additive, backward compatible
-- EXAMPLE: "NO - Same view name, behavior now real-time"

-- ROLLBACK_STRATEGY: [OPTIONAL - How to undo if needed]
-- EXAMPLE: "Recreate MATERIALIZED VIEW daily_sales_summary_mat (old data in migrations/backup/)"

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ AFFECTED COMPONENTS                                             │
-- └─────────────────────────────────────────────────────────────────┘

-- TABLES_CREATED: [OPTIONAL - Which tables are new?]
-- EXAMPLE: "promotions, promotion_applications, promotion_schedule"

-- TABLES_MODIFIED: [OPTIONAL - Which tables change?]
-- EXAMPLE: "sales (ADD server_id), returns (ADD server_id)"

-- VIEWS_AFFECTED: [OPTIONAL - Which views impacted?]
-- EXAMPLE: "daily_sales_summary, top_products, product_sales_stats"

-- FUNCTIONS_CREATED: [OPTIONAL - New RPCs?]
-- EXAMPLE: "admin_as_create_sale, _verify_super_admin_proxy"

-- RLS_CHANGES: [OPTIONAL - New policies?]
-- EXAMPLE: "Add RLS policy for sales.server_id in simplifié mode"

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTING CHECKLIST                                               │
-- └─────────────────────────────────────────────────────────────────┘

-- PRE_DEPLOY_TESTS: [OPTIONAL - Manual tests before deploying]
-- ☐ RLS: User A cannot see data of User B / Bar A
-- ☐ Permissions: All roles can perform expected actions
-- ☐ Performance: No N+1 queries, slow queries under 1s
-- ☐ Data: Existing data backfilled correctly
-- ☐ Backward compat: Old code still works (if applicable)

-- POST_DEPLOY_VALIDATION: [OPTIONAL - Checks after deploy]
-- ☐ Audit logs populated for sensitive operations
-- ☐ Monitoring alerts not triggered
-- ☐ Dashboard displays correct data
-- ☐ No RLS violations in logs

-- ===================================================================
-- BEGIN MIGRATION
-- ===================================================================

BEGIN;

-- Your SQL here
-- Guidelines:
-- 1. Use transactions (BEGIN/COMMIT) for atomicity
-- 2. Add comments above major operations
-- 3. Include data validation if backfilling
-- 4. Create indexes for performance-critical queries
-- 5. Grant permissions explicitly (SELECT, INSERT, UPDATE, DELETE)

-- Example structure:

-- -- Step 1: Create or modify table
-- CREATE TABLE IF NOT EXISTS my_table (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   UNIQUE(bar_id, name)
-- );

-- -- Step 2: Add comments
-- COMMENT ON TABLE my_table IS 'Description of what this table does';
-- COMMENT ON COLUMN my_table.bar_id IS 'References bars table for multi-tenant isolation';

-- -- Step 3: Add RLS policy
-- ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "select_own_bar" ON my_table
--   FOR SELECT USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

-- -- Step 4: Grant permissions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON my_table TO authenticated;
-- GRANT SELECT ON my_table TO anon;

-- -- Step 5: Create index
-- CREATE INDEX idx_my_table_bar_id ON my_table(bar_id);

-- -- Step 6: Backfill if needed
-- -- UPDATE my_table SET field = ... WHERE ...;

-- -- Step 7: Add trigger if needed
-- -- CREATE TRIGGER trg_my_table_updated AFTER UPDATE ON my_table ...

COMMIT;

-- ===================================================================
-- POST-MIGRATION NOTES                                              │
-- ===================================================================
-- [OPTIONAL - Add any notes about deployment or monitoring]
-- Example:
-- - Monitor audit_logs for PROXY_SALE_CREATED events
-- - If "operating_mode" changes, backfill server_id automatically
-- - Dashboard may cache data for 5 min (clear browser cache if needed)
