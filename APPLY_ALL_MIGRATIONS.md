# 🚨 APPLICATION DE TOUTES LES MIGRATIONS MANQUANTES

**Problème:** Colonnes manquantes dans Supabase causent des erreurs 400

**Erreurs identifiées:**
- `expenses.expense_date` does not exist
- `expense_categories_custom.is_active` does not exist
- Erreurs foreign keys sur `sales`

---

## 📋 MIGRATIONS À APPLIQUER

Allez dans **Supabase Dashboard > SQL Editor** et exécutez ces migrations **dans l'ordre**:

### Étape 1: Vérifier les migrations déjà appliquées

```sql
-- Créer une table de tracking si elle n'existe pas
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voir les migrations déjà appliquées
SELECT name FROM _migrations ORDER BY applied_at;
```

### Étape 2: Appliquer les migrations critiques

**DANS L'ORDRE, une par une:**

1. `019_ensure_tables_and_relationships.sql`
2. `027_ensure_missing_tables.sql`
3. `030_create_storage_bucket.sql`
4. `031_fix_bar_members_fk.sql`
5. `032_fix_sales_permissions.sql`
6. `033_add_stock_rpc.sql`
7. `034_force_schema_reload.sql`

Pour chaque migration:
1. Ouvrez le fichier dans `supabase/migrations/`
2. Copiez tout le contenu
3. Collez dans Supabase SQL Editor
4. Cliquez "Run"
5. Ajoutez à la table de tracking:
   ```sql
   INSERT INTO _migrations (name) VALUES ('NOM_MIGRATION');
   ```

### Étape 3: Vérifier que les colonnes existent maintenant

```sql
-- Vérifier expenses
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expenses';

-- Devrait inclure: expense_date

-- Vérifier expense_categories_custom
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expense_categories_custom';

-- Devrait inclure: is_active

-- Vérifier sales
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sales';

-- Devrait inclure: created_by, validated_by avec foreign keys
```

---

## ⚡ ALTERNATIVE RAPIDE: Appliquer toutes les migrations d'un coup

**ATTENTION:** Seulement si vous êtes sûr qu'aucune migration n'a été appliquée!

Créez un super-script en combinant toutes les migrations dans l'ordre, puis exécutez-le une seule fois.

Mais **RECOMMANDATION:** Appliquez une par une pour voir laquelle échoue si erreur.

---

## 🔍 DEBUG: Si une migration échoue

Si vous voyez une erreur genre:
```
ERROR: column "xxx" already exists
ERROR: table "yyy" already exists
```

C'est normal! Cela signifie que cette partie est déjà appliquée. **Ignorez et continuez** avec la migration suivante.

---

## ✅ APRÈS APPLICATION

1. Rafraîchissez l'app Vercel (Ctrl+F5)
2. Les erreurs 400 devraient disparaître
3. Testez une vente rapide
4. Vérifiez stock et CA

