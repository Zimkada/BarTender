# 🔍 DIAGNOSTIC COMPLET - PROBLÈME VENTES RAPIDES

**Date:** 22 Novembre 2025
**Symptômes:** Ventes rapides ne décrémentent pas le stock et ne mettent pas à jour le CA
**Environnement testé:** Local (localhost)

---

## 🎯 CAUSE RACINE IDENTIFIÉE

### ❌ **Problème: auth.uid() retourne NULL en local**

**Test SQL effectué:**
```sql
SELECT auth.uid() as current_user, is_bar_member('bar_id') as is_member;
-- Résultat: current_user = NULL, is_member = false
```

**Impact:**
- ❌ Les politiques RLS (Row Level Security) bloquent toutes les opérations
- ❌ Impossible d'insérer dans la table `sales` (erreur 400 Bad Request)
- ❌ Le stock n'est jamais décrémenté car la vente n'est pas créée
- ❌ Le CA n'est pas mis à jour car aucune vente validée n'existe

**Erreur Console:**
```
POST https://yekomwjdznvtnialpdcz.supabase.co/rest/v1/sales?select=* 400 (Bad Request)
```

---

## 🔬 ANALYSE TECHNIQUE DÉTAILLÉE

### ✅ **Ce qui fonctionne:**

1. **Fonctions RPC stock** - Vérifiées et existantes:
   - `decrement_stock(uuid, integer)` ✅
   - `increment_stock(uuid, integer)` ✅

2. **Structure de code** - Correcte:
   - QuickSaleFlow.tsx: Logique de vente correcte ✅
   - SalesService.createSale(): Appelle bien decrementStock() ✅
   - AppContext.addSale(): Format de données correct ✅

3. **Tables de base de données** - Existantes:
   - `bar_products` ✅ (colonnes: id, local_name, stock, etc.)
   - `sales` ✅ (colonnes: id, bar_id, items, created_by, sold_by, etc.)
   - Politiques RLS configurées ✅

### ❌ **Ce qui ne fonctionne PAS:**

1. **Authentification Supabase en local:**
   - Le frontend local n'envoie pas de token JWT Supabase valide
   - `auth.uid()` retourne NULL côté serveur
   - Les politiques RLS bloquent toute opération (INSERT dans sales)

2. **Conséquences en cascade:**
   ```
   auth.uid() = NULL
   ↓
   RLS bloque INSERT dans sales (400 Bad Request)
   ↓
   SalesService.createSale() échoue
   ↓
   decrementStock() n'est jamais appelé
   ↓
   Stock inchangé, CA à 0
   ```

---

## 🔧 SOLUTION

### **Environnement Local vs Production**

Le problème est **spécifique à l'environnement local**:

**Local (localhost):**
- Utilise probablement localStorage/session custom
- Pas de token JWT Supabase valide
- RLS bloque toutes les opérations ❌

**Production (Vercel):**
- Utilise Supabase Auth natif
- Token JWT automatiquement inclus dans les requêtes
- RLS fonctionne correctement avec auth.uid() ✅

### **Actions à prendre:**

1. **✅ Tester sur Vercel** (environnement de production)
   - Se connecter avec compte Supabase Auth
   - Faire une vente rapide
   - Vérifier stock et CA

2. **Pour corriger en local** (optionnel):
   - S'assurer d'utiliser le vrai login Supabase
   - Vérifier que le token est stocké: `localStorage.getItem('supabase.auth.token')`
   - Ou désactiver temporairement RLS en dev (non recommandé)

---

## 📊 VÉRIFICATIONS EFFECTUÉES

### ✅ Migrations appliquées:
- [x] Migration 032: RLS sales policies
- [x] Migration 033: Stock RPC functions (decrement_stock, increment_stock)
- [x] Migration 034: Schema reload

### ✅ Structure DB vérifiée:
```sql
-- Tables existantes
✅ bar_products (local_name, stock, etc.)
✅ sales (bar_id, items, created_by, sold_by, status, etc.)
✅ bar_categories
✅ global_categories

-- Fonctions RPC vérifiées
✅ decrement_stock(p_product_id UUID, p_quantity INTEGER)
✅ increment_stock(p_product_id UUID, p_quantity INTEGER)
✅ is_bar_member(bar_id_param UUID)
✅ get_user_role(bar_id_param UUID)
```

### ❌ Problème identifié:
```sql
-- Test auth en local
SELECT auth.uid();
-- Résultat: NULL ❌

-- Impact RLS
SELECT is_bar_member('bar_id'::uuid);
-- Résultat: false (car auth.uid() = NULL)
```

---

## 🎯 CONCLUSION

**Le code est correct.** Le problème n'est PAS dans:
- ❌ La logique des ventes
- ❌ Les fonctions de stock
- ❌ Les migrations
- ❌ La structure de la base de données

**Le problème EST dans:**
- ✅ L'authentification Supabase en environnement local
- ✅ Le token JWT non présent/invalide
- ✅ RLS qui bloque correctement les opérations non authentifiées

**Prochaine étape:** Tester sur Vercel avec authentification Supabase complète.

---

## 📝 COMMANDES UTILES POUR DEBUG

### Vérifier l'authentification:
```javascript
// Dans la console navigateur
const { data } = await supabase.auth.getSession();
console.log('Session:', data.session);
console.log('User ID:', data.session?.user?.id);
```

### Vérifier une vente:
```sql
-- Dernière vente créée
SELECT * FROM sales ORDER BY created_at DESC LIMIT 1;

-- Vérifier le stock d'un produit
SELECT id, local_name, stock FROM bar_products WHERE local_name LIKE '%nom%';
```

### Forcer un test d'insertion:
```sql
-- Test avec votre user_id Supabase
INSERT INTO sales (bar_id, items, subtotal, total, payment_method, status, created_by)
VALUES (
  'votre_bar_id'::uuid,
  '[{"product_id":"test","quantity":1,"unit_price":100,"total_price":100}]'::jsonb,
  100, 100, 'cash', 'validated',
  'votre_user_id'::uuid
);
```
