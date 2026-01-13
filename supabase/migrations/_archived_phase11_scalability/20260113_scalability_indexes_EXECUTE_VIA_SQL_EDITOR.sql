-- =====================================================
-- ⚠️ ATTENTION : À EXÉCUTER MANUELLEMENT VIA SQL EDITOR
-- =====================================================
-- NE PAS UTILISER supabase db push avec ce fichier
-- Renommer en .SKIP ou déplacer hors du dossier migrations/
--
-- Raison : CREATE INDEX CONCURRENTLY incompatible avec transactions
-- Solution : Copier-coller dans Dashboard > SQL Editor
-- =====================================================

-- =====================================================
-- Audit & Compliance Indexes (PRIORITÉ HAUTE)
-- =====================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_validated_by
  ON sales(validated_by)
  WHERE validated_by IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_rejected_by
  ON sales(rejected_by)
  WHERE rejected_by IS NOT NULL;

-- =====================================================
-- Returns Analysis Index (PRIORITÉ MOYENNE)
-- =====================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_product_id
  ON returns(product_id);

-- =====================================================
-- Metadata
-- =====================================================

COMMENT ON INDEX idx_sales_validated_by IS
  'Audit managers - Partial index (validated_by IS NOT NULL) - Réduit taille ~50%';

COMMENT ON INDEX idx_sales_rejected_by IS
  'Audit managers - Partial index (rejected_by IS NOT NULL) - Réduit taille ~50%';

COMMENT ON INDEX idx_returns_product_id IS
  'Rapports produits retournés - Faible volume = coût maintenance nul';

-- =====================================================
-- Vérification
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║       Scalability Indexes Created Successfully             ║
  ╚════════════════════════════════════════════════════════════╝
  ';

  RAISE NOTICE '✅ Index créé : idx_sales_validated_by (partial)';
  RAISE NOTICE '✅ Index créé : idx_sales_rejected_by (partial)';
  RAISE NOTICE '✅ Index créé : idx_returns_product_id';

  RAISE NOTICE '';
  RAISE NOTICE '📊 Vérifier la taille :';
  RAISE NOTICE 'SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid))';
  RAISE NOTICE 'FROM pg_stat_user_indexes';
  RAISE NOTICE 'WHERE indexname LIKE ''idx_sales_%'' OR indexname LIKE ''idx_returns_%'';';
END $$;

-- =====================================================
-- Post-Migration : Vérification
-- =====================================================

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as times_used
FROM pg_stat_user_indexes
WHERE indexname IN (
  'idx_sales_validated_by',
  'idx_sales_rejected_by',
  'idx_returns_product_id'
)
ORDER BY tablename, indexname;
