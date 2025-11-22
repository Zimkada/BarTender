# 🚨 MIGRATIONS CRITIQUES À APPLIQUER IMMÉDIATEMENT

## Ordre d'Application

Allez dans **Supabase Dashboard > SQL Editor** et exécutez ces migrations dans l'ordre:

### 1. Migration 032 - Fix Sales Permissions
```sql
-- Fichier: supabase/migrations/032_fix_sales_permissions.sql
-- Copier-coller tout le contenu du fichier
```

### 2. Migration 033 - Add Stock RPC Functions ⚠️ CRITIQUE
```sql
-- Fichier: supabase/migrations/033_add_stock_rpc.sql
-- Cette migration crée decrement_stock() et increment_stock()
-- SANS CETTE MIGRATION, LES VENTES NE DÉCRÉMENTENT PAS LE STOCK!
```

### 3. Migration 034 - Force Schema Reload
```sql
-- Fichier: supabase/migrations/034_force_schema_reload.sql
-- Recharge le cache du schéma PostgREST
```

## Vérification

Après avoir appliqué les migrations, vérifiez:

```sql
-- Vérifier que la fonction existe
SELECT proname, pronargs
FROM pg_proc
WHERE proname IN ('decrement_stock', 'increment_stock');

-- Devrait retourner 2 lignes (une pour chaque fonction)
```

## Après Application

1. Redéployer l'application sur Vercel (ou rafraîchir)
2. Tester une vente rapide
3. Vérifier que le stock est décrémenté
4. Vérifier que le CA est mis à jour
