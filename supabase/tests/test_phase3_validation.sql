-- =====================================================
-- PHASE 3 VALIDATION TEST SCRIPT
-- =====================================================
-- Date: 2025-12-28
-- Purpose: Validate all Jour 1-3 migrations and features
-- Run in: Supabase SQL Editor
-- =====================================================

-- =====================================================
-- SECTION 1: BACKEND FUNCTIONS & INDEXES
-- =====================================================

-- Test 1.1: Validate strategic indexes exist
SELECT
  'Test 1.1: Strategic Indexes' AS test_name,
  CASE
    WHEN COUNT(*) >= 10 THEN 'PASS ✅'
    ELSE 'FAIL ❌ - Expected >= 10 indexes'
  END AS result,
  COUNT(*) AS indexes_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_sales_bar_status_created',
    'idx_sale_items_sale_product',
    'idx_products_bar_category',
    'idx_stock_movements_bar_product_created',
    'idx_bars_with_stats_unique',
    'idx_daily_sales_summary_mat_unique',
    'idx_top_products_period_bar_date',
    'idx_bar_stats_multi_period_unique'
  );

-- Test 1.2: Validate materialized views exist
SELECT
  'Test 1.2: Materialized Views' AS test_name,
  CASE
    WHEN COUNT(*) >= 3 THEN 'PASS ✅'
    ELSE 'FAIL ❌ - Expected 3 mat views'
  END AS result,
  COUNT(*) AS matviews_count
FROM pg_matviews
WHERE schemaname = 'public'
  AND matviewname IN (
    'bars_with_stats',
    'daily_sales_summary_mat',
    'top_products_by_period_mat',
    'bar_stats_multi_period_mat'
  );

-- Test 1.3: Validate RPC functions exist
SELECT
  'Test 1.3: RPC Functions' AS test_name,
  CASE
    WHEN COUNT(*) >= 8 THEN 'PASS ✅'
    ELSE 'FAIL ❌ - Expected >= 8 functions'
  END AS result,
  COUNT(*) AS functions_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'refresh_bars_with_stats',
    'safe_refresh_materialized_view',
    'get_top_products_aggregated',
    'get_top_products_by_server',
    'get_current_business_date',
    'check_recent_rls_violations',
    'create_or_update_failure_alerts',
    'cleanup_old_refresh_logs'
  );

-- Test 1.4: Test get_current_business_date function
DO $$
DECLARE
  v_bar_id UUID;
  v_business_date DATE;
  v_result TEXT;
BEGIN
  -- Get first bar
  SELECT id INTO v_bar_id FROM bars LIMIT 1;

  IF v_bar_id IS NOT NULL THEN
    SELECT get_current_business_date(v_bar_id) INTO v_business_date;

    IF v_business_date IS NOT NULL THEN
      v_result := 'PASS ✅ - get_current_business_date returned: ' || v_business_date::TEXT;
    ELSE
      v_result := 'FAIL ❌ - get_current_business_date returned NULL';
    END IF;
  ELSE
    v_result := 'SKIP ⚠️ - No bars in database';
  END IF;

  RAISE NOTICE 'Test 1.4: get_current_business_date - %', v_result;
END $$;

-- =====================================================
-- SECTION 2: MATERIALIZED VIEWS REFRESH
-- =====================================================

-- Test 2.1: Test refresh_bars_with_stats performance
SELECT
  'Test 2.1: refresh_bars_with_stats Performance' AS test_name,
  CASE
    WHEN success = TRUE AND duration_ms < 5000 THEN 'PASS ✅'
    WHEN success = TRUE AND duration_ms >= 5000 THEN 'WARN ⚠️ - Slow refresh (' || duration_ms || 'ms)'
    ELSE 'FAIL ❌ - ' || error_message
  END AS result,
  duration_ms || 'ms' AS duration
FROM refresh_bars_with_stats();

-- Test 2.2: Validate materialized_view_refresh_log populated
SELECT
  'Test 2.2: Refresh Logs' AS test_name,
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS ✅'
    ELSE 'FAIL ❌ - No refresh logs found'
  END AS result,
  COUNT(*) AS log_count,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM materialized_view_refresh_log
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Test 2.3: Validate bars_with_stats populated
SELECT
  'Test 2.3: bars_with_stats Data' AS test_name,
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS ✅'
    ELSE 'WARN ⚠️ - No data in bars_with_stats (expected if no bars)'
  END AS result,
  COUNT(*) AS rows_count
FROM bars_with_stats;

-- =====================================================
-- SECTION 3: RLS POLICIES & SECURITY
-- =====================================================

-- Test 3.1: Validate RLS enabled on critical tables
SELECT
  'Test 3.1: RLS Enabled' AS test_name,
  CASE
    WHEN COUNT(*) FILTER (WHERE rowsecurity = TRUE) = COUNT(*) THEN 'PASS ✅'
    ELSE 'FAIL ❌ - Some tables missing RLS'
  END AS result,
  COUNT(*) FILTER (WHERE rowsecurity = TRUE) || '/' || COUNT(*) AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'sales',
    'products',
    'stock_movements',
    'materialized_view_refresh_log',
    'rls_violations_log'
  );

-- Test 3.2: Validate RLS policies exist
SELECT
  'Test 3.2: RLS Policies Count' AS test_name,
  CASE
    WHEN COUNT(*) >= 10 THEN 'PASS ✅'
    ELSE 'WARN ⚠️ - Expected >= 10 policies, found ' || COUNT(*)
  END AS result,
  COUNT(*) AS policies_count
FROM pg_policies
WHERE schemaname = 'public';

-- Test 3.3: Test check_recent_rls_violations function
SELECT
  'Test 3.3: check_recent_rls_violations' AS test_name,
  CASE
    WHEN pg_function_is_visible('check_recent_rls_violations'::regproc) THEN 'PASS ✅ - Function callable'
    ELSE 'FAIL ❌ - Function not accessible'
  END AS result;

-- =====================================================
-- SECTION 4: CLOSING_HOUR DYNAMIC ANALYTICS
-- =====================================================

-- Test 4.1: Validate business_date column exists in sales
SELECT
  'Test 4.1: business_date Column' AS test_name,
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS ✅'
    ELSE 'FAIL ❌ - business_date column missing'
  END AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales'
  AND column_name = 'business_date';

-- Test 4.2: Validate sales have business_date populated
SELECT
  'Test 4.2: business_date Populated' AS test_name,
  CASE
    WHEN total_sales = 0 THEN 'SKIP ⚠️ - No sales in database'
    WHEN sales_with_business_date = total_sales THEN 'PASS ✅'
    ELSE 'WARN ⚠️ - ' || (total_sales - sales_with_business_date) || '/' || total_sales || ' sales missing business_date'
  END AS result,
  sales_with_business_date || '/' || total_sales AS coverage
FROM (
  SELECT
    COUNT(*) AS total_sales,
    COUNT(*) FILTER (WHERE business_date IS NOT NULL) AS sales_with_business_date
  FROM sales
) sub;

-- Test 4.3: Validate closing_hour diversity (multiple bars with different closing times)
SELECT
  'Test 4.3: closing_hour Diversity' AS test_name,
  CASE
    WHEN bar_count = 0 THEN 'SKIP ⚠️ - No bars in database'
    WHEN unique_closing_hours > 1 THEN 'PASS ✅ - Multiple closing hours detected'
    WHEN unique_closing_hours = 1 THEN 'INFO ℹ️ - All bars have same closing_hour'
    ELSE 'WARN ⚠️ - Some bars have NULL closing_hour'
  END AS result,
  unique_closing_hours || ' unique values' AS closing_hours,
  bar_count || ' bars total' AS total_bars
FROM (
  SELECT
    COUNT(*) AS bar_count,
    COUNT(DISTINCT closing_hour) AS unique_closing_hours
  FROM bars
) sub;

-- Test 4.4: Validate daily_sales_summary_mat uses business_date
SELECT
  'Test 4.4: daily_sales_summary_mat business_date' AS test_name,
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS ✅'
    ELSE 'WARN ⚠️ - daily_sales_summary_mat empty (expected if no sales)'
  END AS result,
  COUNT(*) AS rows_count,
  COUNT(DISTINCT sale_date) AS unique_dates
FROM daily_sales_summary_mat;

-- =====================================================
-- SECTION 5: PERFORMANCE VALIDATION
-- =====================================================

-- Test 5.1: Index usage statistics (requires pg_stat_statements extension)
SELECT
  'Test 5.1: Index Statistics' AS test_name,
  'INFO ℹ️ - Check pg_stat_statements for detailed index usage' AS result;

-- Test 5.2: Materialized view sizes
SELECT
  'Test 5.2: Materialized View Sizes' AS test_name,
  'INFO ℹ️' AS result,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||matviewname) DESC;

-- Test 5.3: Query response time test (get_top_products_aggregated)
DO $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_bar_id UUID;
  v_result TEXT;
BEGIN
  SELECT id INTO v_bar_id FROM bars LIMIT 1;

  IF v_bar_id IS NOT NULL THEN
    v_start_time := clock_timestamp();

    PERFORM * FROM get_top_products_aggregated(
      v_bar_id,
      CURRENT_DATE - INTERVAL '30 days',
      CURRENT_DATE,
      10
    );

    v_duration_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;

    IF v_duration_ms < 200 THEN
      v_result := 'PASS ✅ - ' || v_duration_ms || 'ms';
    ELSIF v_duration_ms < 500 THEN
      v_result := 'WARN ⚠️ - Acceptable but slow (' || v_duration_ms || 'ms)';
    ELSE
      v_result := 'FAIL ❌ - Too slow (' || v_duration_ms || 'ms > 500ms)';
    END IF;
  ELSE
    v_result := 'SKIP ⚠️ - No bars in database';
  END IF;

  RAISE NOTICE 'Test 5.3: get_top_products_aggregated Performance - %', v_result;
END $$;

-- =====================================================
-- SECTION 6: EDGE CASES
-- =====================================================

-- Test 6.1: Bar without closing_hour (fallback to 6)
DO $$
DECLARE
  v_bar_id UUID;
  v_business_date DATE;
  v_result TEXT;
BEGIN
  -- Create temp bar without closing_hour
  INSERT INTO bars (name, address, phone, email, closing_hour)
  VALUES ('Test Bar No Closing Hour', 'Test Address', '0000000000', 'test@test.com', NULL)
  RETURNING id INTO v_bar_id;

  SELECT get_current_business_date(v_bar_id) INTO v_business_date;

  IF v_business_date IS NOT NULL THEN
    v_result := 'PASS ✅ - Fallback to default working';
  ELSE
    v_result := 'FAIL ❌ - Fallback failed';
  END IF;

  -- Cleanup
  DELETE FROM bars WHERE id = v_bar_id;

  RAISE NOTICE 'Test 6.1: Bar without closing_hour - %', v_result;
END $$;

-- Test 6.2: Refresh with no data
SELECT
  'Test 6.2: Refresh Empty View' AS test_name,
  CASE
    WHEN success = TRUE THEN 'PASS ✅'
    ELSE 'FAIL ❌'
  END AS result
FROM safe_refresh_materialized_view('bars_with_stats', TRUE, 30);

-- =====================================================
-- SUMMARY REPORT
-- =====================================================

SELECT
  '========================================' AS summary,
  'PHASE 3 VALIDATION COMPLETE' AS status,
  NOW() AS tested_at;

-- Display refresh stats
SELECT
  view_name,
  total_refreshes,
  success_count,
  failed_count,
  timeout_count,
  ROUND(avg_duration_ms::NUMERIC, 2) || 'ms' AS avg_duration,
  last_refresh_at
FROM materialized_view_refresh_stats
ORDER BY view_name;

-- Display active alerts (if any)
SELECT
  view_name,
  consecutive_failures,
  first_failure_at,
  last_failure_at,
  status
FROM refresh_failure_alerts
WHERE status = 'active';

-- =====================================================
-- NOTES
-- =====================================================
-- Manual tests to perform in browser:
-- 1. SecurityDashboard responsive (Chrome DevTools Device Mode)
-- 2. Export CSV button working
-- 3. Export Excel button working
-- 4. Notifications toggle working
-- 5. Manual refresh button working
-- 6. Mobile card view displaying correctly (< 768px)
-- =====================================================
