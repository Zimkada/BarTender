#!/bin/bash
# =====================================================
# Script de déploiement des index via psql
# =====================================================
# Usage: ./20260113_deploy_indexes.sh
#
# Prérequis:
# 1. psql installé
# 2. Variable DATABASE_URL configurée
#
# Exemple:
# export DATABASE_URL="postgresql://user:pass@host:5432/db"
# bash 20260113_deploy_indexes.sh
# =====================================================

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Déploiement Index Scalability - Phase 11          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Vérifier que DATABASE_URL est défini
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL non défini"
  echo ""
  echo "Définir avec:"
  echo "export DATABASE_URL='postgresql://user:pass@host:5432/db'"
  exit 1
fi

echo "📊 Database: $(echo $DATABASE_URL | sed 's/:.*/.../')"
echo ""

# Fonction pour exécuter une commande SQL
run_sql() {
  local description=$1
  local sql=$2

  echo "⏳ $description..."
  psql "$DATABASE_URL" -c "$sql" --single-transaction=off

  if [ $? -eq 0 ]; then
    echo "✅ $description : Succès"
  else
    echo "❌ $description : Échec"
    exit 1
  fi
  echo ""
}

# Créer les index un par un
run_sql "Création idx_sales_validated_by" \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_validated_by ON sales(validated_by) WHERE validated_by IS NOT NULL;"

run_sql "Metadata idx_sales_validated_by" \
  "COMMENT ON INDEX idx_sales_validated_by IS 'Audit managers - Partial index';"

run_sql "Création idx_sales_rejected_by" \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_rejected_by ON sales(rejected_by) WHERE rejected_by IS NOT NULL;"

run_sql "Metadata idx_sales_rejected_by" \
  "COMMENT ON INDEX idx_sales_rejected_by IS 'Audit managers - Partial index';"

run_sql "Création idx_returns_product_id" \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_product_id ON returns(product_id);"

run_sql "Metadata idx_returns_product_id" \
  "COMMENT ON INDEX idx_returns_product_id IS 'Rapports produits retournés';"

# Vérification
echo "📊 Vérification finale..."
psql "$DATABASE_URL" <<EOF
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  idx_scan as times_used
FROM pg_stat_user_indexes
WHERE indexname IN (
  'idx_sales_validated_by',
  'idx_sales_rejected_by',
  'idx_returns_product_id'
)
ORDER BY indexname;
EOF

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ Déploiement Terminé avec Succès           ║"
echo "╚════════════════════════════════════════════════════════════╝"
