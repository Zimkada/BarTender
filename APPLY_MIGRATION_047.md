# Guide d'Application de la Migration 047

## Étape 1 : Vérifier si déjà appliquée

```sql
-- Dans Supabase SQL Editor
SELECT EXISTS (
  SELECT FROM pg_tables 
  WHERE schemaname = 'public' 
  AND tablename = 'promotions'
) AS promotions_exists;
```

- Si retourne `true` → Migration déjà appliquée ✅
- Si retourne `false` → Continuer à l'étape 2

## Étape 2 : Appliquer la migration

### Option A : Via Supabase Dashboard (Recommandé)

1. Ouvrir [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionner votre projet BarTender
3. Aller dans **SQL Editor**
4. Créer une nouvelle query
5. Copier-coller **TOUT** le contenu de `supabase/migrations/047_create_promotions_and_events.sql`
6. Cliquer sur **Run** (ou Ctrl+Enter)

### Option B : Via Supabase CLI

```bash
# Depuis la racine du projet
npx supabase db push
```

## Étape 3 : Vérifier le succès

```sql
-- Vérifier les tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('promotions', 'promotion_applications', 'bar_events')
ORDER BY table_name;

-- Doit retourner 3 lignes
```

```sql
-- Vérifier les types ENUM
SELECT typname 
FROM pg_type 
WHERE typname IN ('promotion_type', 'promotion_status', 'event_type');

-- Doit retourner 3 lignes
```

```sql
-- Vérifier les fonctions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%promotion%';

-- Doit retourner au moins 3 fonctions
```

## Étape 4 : Tester avec une promotion test

```sql
-- Créer une promotion test
INSERT INTO promotions (
  bar_id,
  name,
  description,
  type,
  status,
  target_type,
  bundle_quantity,
  bundle_price,
  start_date,
  priority,
  created_by
) VALUES (
  'REMPLACER_PAR_VOTRE_BAR_ID',
  'Test 3 bières',
  'Promotion de test',
  'bundle',
  'active',
  'all',
  3,
  1000.00,
  CURRENT_DATE,
  0,
  'REMPLACER_PAR_VOTRE_USER_ID'
) RETURNING id, name, bundle_quantity, bundle_price;

-- Si SUCCESS → Migration OK ✅
-- Si ERROR → Vérifier le message d'erreur
```

## En cas d'erreur

### Erreur : "type promotion_type already exists"
✅ Normal si migration réexécutée, ignorée grâce à `DO $$ BEGIN ... EXCEPTION`

### Erreur : "relation promotions already exists"
✅ Normal si migration réexécutée, ignorée grâce à `CREATE TABLE IF NOT EXISTS`

### Erreur : "foreign key constraint bars does not exist"
❌ La table `bars` n'existe pas → Vérifier migrations précédentes

### Erreur : "permission denied"
❌ Se connecter avec role `postgres` ou `service_role`

## Notes importantes

- ✅ Migration **idempotente** : peut être réexécutée sans erreur
- ✅ Inclut **RLS policies** pour sécurité multi-tenant
- ✅ Tous les index créés avec `IF NOT EXISTS`
- ✅ Toutes les policies avec `DO $$ BEGIN ... EXCEPTION`

## Après application réussie

1. Tester les services TypeScript :
   ```typescript
   import { PromotionsService } from './services/supabase/promotions.service';
   const promos = await PromotionsService.getAllPromotions('bar-id');
   console.log('Promotions:', promos);
   ```

2. Vérifier que l'app compile sans erreur

3. Passer à l'implémentation de l'UI PromotionsManager
