-- =====================================================
-- SCRIPT À EXÉCUTER EN 3 FOIS SÉPARÉES
-- =====================================================
-- Copier-coller SEULEMENT LA PARTIE 1, cliquer RUN
-- Puis PARTIE 2, puis PARTIE 3
--
-- Raison : Éviter le wrapper de transaction automatique
-- =====================================================

-- ═══════════════════════════════════════════════════
-- PARTIE 1/3 : Index sales.validated_by
-- ═══════════════════════════════════════════════════
-- Copier UNIQUEMENT ces lignes, cliquer RUN, attendre 30s

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_validated_by
  ON sales(validated_by)
  WHERE validated_by IS NOT NULL;

COMMENT ON INDEX idx_sales_validated_by IS
  'Audit managers - Partial index (validated_by IS NOT NULL) - Réduit taille ~50%';

-- Vérification
SELECT
  'idx_sales_validated_by' as index_name,
  pg_size_pretty(pg_relation_size('idx_sales_validated_by'::regclass)) as size,
  '✅ Créé avec succès' as status;

-- ═══════════════════════════════════════════════════
-- PARTIE 2/3 : Index sales.rejected_by
-- ═══════════════════════════════════════════════════
-- Copier UNIQUEMENT ces lignes APRÈS succès de PARTIE 1

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_rejected_by
  ON sales(rejected_by)
  WHERE rejected_by IS NOT NULL;

COMMENT ON INDEX idx_sales_rejected_by IS
  'Audit managers - Partial index (rejected_by IS NOT NULL) - Réduit taille ~50%';

-- Vérification
SELECT
  'idx_sales_rejected_by' as index_name,
  pg_size_pretty(pg_relation_size('idx_sales_rejected_by'::regclass)) as size,
  '✅ Créé avec succès' as status;

-- ═══════════════════════════════════════════════════
-- PARTIE 3/3 : Index returns.product_id
-- ═══════════════════════════════════════════════════
-- Copier UNIQUEMENT ces lignes APRÈS succès de PARTIE 2

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_product_id
  ON returns(product_id);

COMMENT ON INDEX idx_returns_product_id IS
  'Rapports produits retournés - Faible volume = coût maintenance nul';

-- Vérification
SELECT
  'idx_returns_product_id' as index_name,
  pg_size_pretty(pg_relation_size('idx_returns_product_id'::regclass)) as size,
  '✅ Créé avec succès' as status;

-- ═══════════════════════════════════════════════════
-- VÉRIFICATION FINALE (après les 3 parties)
-- ═══════════════════════════════════════════════════
-- Copier et exécuter pour vérifier que tout est OK

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

-- Résultat attendu : 3 lignes
-- Si moins de 3 lignes : un index n'a pas été créé, recommencer la partie manquante
