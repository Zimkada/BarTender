# Plan de Test - Mode Switching Implementation

**Date**: 26 Décembre 2025
**Objectif**: Validation complète de l'implémentation Mode Switching
**Statut Code**: ✅ 100% implémenté (10/10 bugs corrigés)
**Statut Tests**: ⏳ À exécuter

---

## 📋 Vue d'Ensemble

Ce plan de test couvre **6 catégories** de tests pour garantir que le Mode Switching fonctionne parfaitement dans tous les scénarios.

### Catégories de Tests
1. **Tests de Base de Données** - Migrations, RLS, FK, indexes
2. **Tests de Services Backend** - ServerMappingsService, résolution UUID
3. **Tests d'Intégration Frontend** - QuickSaleFlow, Cart, Consignments, Returns
4. **Tests de Filtrage & Isolation** - Serveurs voient uniquement leurs données
5. **Tests de Mode Switching** - Bascule full ↔ simplified sans perte
6. **Tests de Performance & Edge Cases** - Charge, erreurs réseau, données corrompues

### Méthodologie
- ✅ **Test Manuel Guidé**: Instructions étape par étape à suivre
- 📊 **Critères de Succès**: Résultats attendus clairs
- 🔴 **Indicateurs d'Échec**: Quand considérer qu'un test a échoué
- 🐛 **Debugging**: Requêtes SQL et logs à vérifier en cas de problème

---

## 🗄️ CATÉGORIE 1: Tests de Base de Données

### Test 1.1: Vérification des Migrations Appliquées
**Objectif**: S'assurer que toutes les 6 migrations sont appliquées correctement

**Requête de Vérification**:
```sql
-- Vérifier que les colonnes server_id existent
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sales', 'consignments', 'returns')
  AND column_name = 'server_id';

-- Résultat Attendu: 3 lignes (sales, consignments, returns)
```

**✅ Critère de Succès**:
- 3 lignes retournées
- `data_type` = `uuid`
- `is_nullable` = `YES`

**🔴 Indicateur d'Échec**: Moins de 3 lignes ou `data_type` incorrect

---

### Test 1.2: Vérification de la Table server_name_mappings
**Objectif**: Confirmer création table + contraintes

**Requête**:
```sql
-- Vérifier structure table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'server_name_mappings'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Vérifier contrainte UNIQUE
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'server_name_mappings'
  AND constraint_type = 'UNIQUE';
```

**✅ Critère de Succès**:
- Colonnes: `id`, `bar_id`, `server_name`, `user_id`, `created_at`, `created_by`
- Contrainte UNIQUE sur `(bar_id, server_name)`

---

### Test 1.3: Vérification des Foreign Keys ON DELETE SET NULL
**Objectif**: Confirmer que supprimer un utilisateur n'échoue pas (BUG #4)

**Requête**:
```sql
-- Lister les FK sur server_id
SELECT
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'server_id';
```

**✅ Critère de Succès**:
- 3 lignes (sales, consignments, returns)
- `delete_rule` = `SET NULL` pour toutes

**🔴 Indicateur d'Échec**: `delete_rule` = `RESTRICT` ou `CASCADE`

---

### Test 1.4: Vérification des Indexes de Performance
**Objectif**: Confirmer existence indexes pour performance (BUG #7)

**Requête**:
```sql
-- Lister tous les indexes sur server_id et operating_mode
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE '%server_id%' OR indexname LIKE '%operating_mode%');
```

**✅ Critère de Succès**:
- `idx_sales_server_id`
- `idx_consignments_server_id`
- `idx_returns_server_id`
- `idx_bars_operating_mode` (index fonctionnel sur JSONB)

---

### Test 1.5: Vérification de la RLS Policy Mode-Aware
**Objectif**: Tester que serveurs NE PEUVENT PAS créer ventes en mode simplifié

**Étapes**:
1. Se connecter avec un compte **serveur** (pas gérant)
2. Vérifier le mode du bar: `SELECT settings->>'operatingMode' FROM bars WHERE id = '<bar_id>';`
3. Si mode = `simplified`, essayer de créer une vente via l'UI
4. Vérifier que l'erreur RLS est levée

**Requête de Vérification RLS**:
```sql
-- Lister les policies sur sales
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'sales'
  AND policyname LIKE '%mode%';
```

**✅ Critère de Succès**:
- Policy `Bar members can create sales with mode restriction` existe
- En mode simplifié, serveur reçoit erreur "permission denied" lors de création vente

**🔴 Indicateur d'Échec**: Serveur peut créer vente en mode simplifié

---

### Test 1.6: Vérification du Backfill (BUG #6)
**Objectif**: Vérifier que toutes les ventes anciennes ont un server_id

**Requête**:
```sql
-- Compter ventes sans server_id
SELECT COUNT(*) as ventes_sans_server_id
FROM sales
WHERE server_id IS NULL;

-- Vérifier audit trail backfill
SELECT
  COUNT(*) as total_migrated,
  SUM(CASE WHEN mapping_found THEN 1 ELSE 0 END) as with_mapping,
  SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) as with_fallback
FROM migration_server_id_log;
```

**✅ Critère de Succès**:
- `ventes_sans_server_id` < 1% du total
- Audit trail montre nombre de ventes migrées

**🔴 Indicateur d'Échec**: Plus de 5% des ventes sans server_id

---

## 🔧 CATÉGORIE 2: Tests de Services Backend

### Test 2.1: ServerMappingsService - Créer Mapping
**Objectif**: Tester création d'un nouveau mapping

**Étapes Manuelles**:
1. Ouvrir DevTools Console
2. Exécuter:
```typescript
import { ServerMappingsService } from './services/supabase/server-mappings.service';

const barId = '<bar_id>';
const serverName = 'Ahmed Test';
const userId = '<user_uuid>';

const result = await ServerMappingsService.upsertServerMapping(barId, serverName, userId);
console.log('Mapping créé:', result);
```

**✅ Critère de Succès**:
- Aucune erreur console
- `result` contient `id`, `bar_id`, `server_name`, `user_id`

**Vérification DB**:
```sql
SELECT * FROM server_name_mappings
WHERE bar_id = '<bar_id>' AND server_name = 'Ahmed Test';
```

---

### Test 2.2: ServerMappingsService - Résoudre Nom → UUID
**Objectif**: Tester résolution serveur (core du système)

**Étapes**:
1. S'assurer qu'un mapping existe (Test 2.1)
2. Exécuter:
```typescript
const userId = await ServerMappingsService.getUserIdForServerName(barId, 'Ahmed Test');
console.log('UUID résolu:', userId);
```

**✅ Critère de Succès**:
- `userId` retourne l'UUID correct
- Temps de résolution < 100ms (vérifier Network tab)

**🔴 Indicateur d'Échec**:
- `userId` retourne `null` alors que mapping existe
- Temps > 500ms

---

### Test 2.3: ServerMappingsService - Mapping Non Trouvé
**Objectif**: Vérifier comportement quand mapping n'existe pas

**Étapes**:
```typescript
const userId = await ServerMappingsService.getUserIdForServerName(barId, 'ServeurInexistant');
console.log('Résultat:', userId); // Doit être null
```

**✅ Critère de Succès**:
- `userId` = `null`
- Pas d'erreur levée (gestion gracieuse)

---

### Test 2.4: SalesService - Création avec server_id
**Objectif**: Vérifier que RPC accepte paramètre server_id

**Étapes**:
```typescript
import { SalesService } from './services/supabase/sales.service';

const saleData = {
  bar_id: '<bar_id>',
  items: [...],
  payment_method: 'cash',
  sold_by: '<gerant_uuid>',
  server_id: '<serveur_uuid>', // ← NOUVEAU
  status: 'validated'
};

const newSale = await SalesService.createSale(saleData);
console.log('Vente créée:', newSale);
```

**Vérification DB**:
```sql
SELECT id, sold_by, server_id
FROM sales
WHERE id = '<sale_id>';
```

**✅ Critère de Succès**:
- `sold_by` = UUID gérant
- `server_id` = UUID serveur
- Les deux sont différents (mode simplifié simulé)

---

## 🖥️ CATÉGORIE 3: Tests d'Intégration Frontend

### Test 3.1: QuickSaleFlow - Mode Complet (Serveur crée sa vente)
**Objectif**: Vérifier que serveur peut créer vente et server_id = createdBy

**Étapes**:
1. Se connecter avec compte **serveur**
2. Vérifier mode bar = `full` dans Settings
3. Créer une vente via QuickSaleFlow
4. Vérifier DB:
```sql
SELECT id, sold_by, server_id, created_by
FROM sales
WHERE id = '<sale_id>';
```

**✅ Critère de Succès**:
- `sold_by` = `server_id` = `created_by` = UUID serveur
- Vente visible dans Historique du serveur

---

### Test 3.2: QuickSaleFlow - Mode Simplifié (Gérant assigne serveur)
**Objectif**: Vérifier résolution nom → UUID + blocage si mapping manquant

**Étapes**:
1. Se connecter avec compte **gérant**
2. Basculer mode bar à `simplified` dans Settings
3. Créer mapping pour "Ahmed" (si pas déjà fait)
4. Dans QuickSaleFlow, sélectionner serveur "Ahmed"
5. Compléter la vente
6. Vérifier DB:
```sql
SELECT id, sold_by, server_id
FROM sales
WHERE id = '<sale_id>';
```

**✅ Critère de Succès**:
- `sold_by` = UUID gérant
- `server_id` = UUID de "Ahmed"
- Vente visible dans Historique de Ahmed uniquement (pas gérant)

---

### Test 3.3: QuickSaleFlow - Mapping Manquant (BUG #1 & #2)
**Objectif**: Vérifier blocage quand mapping n'existe pas

**Étapes**:
1. Mode simplifié actif
2. Supprimer tous les mappings pour un serveur "Fatou"
3. Créer vente et sélectionner "Fatou"
4. Essayer de valider

**✅ Critère de Succès**:
- Alert apparaît: "⚠️ Erreur Critique: Le serveur 'Fatou' n'existe pas ou n'est pas mappé"
- Vente N'EST PAS créée (vérifier DB - pas de nouvelle ligne)

**🔴 Indicateur d'Échec**:
- Vente créée avec `server_id = NULL`
- Vente créée avec `server_id = gérant UUID` (fallback dangereux)

---

### Test 3.4: Cart Component - Résolution Serveur
**Objectif**: Même logique que QuickSaleFlow mais via Cart

**Étapes**:
1. Mode simplifié, mapping "Ahmed" existe
2. Ajouter produits au panier
3. Assigner à "Ahmed"
4. Checkout
5. Vérifier DB (même requête que Test 3.2)

**✅ Critère de Succès**: Identique à Test 3.2

---

### Test 3.5: ConsignmentPage - Création avec server_id (BUG #10)
**Objectif**: Vérifier que consignations supportent server_id

**Étapes**:
1. Mode simplifié, mapping "Ahmed" existe
2. Aller à `/consignments`
3. Créer nouvelle consignation
4. Sélectionner serveur "Ahmed"
5. Valider
6. Vérifier DB:
```sql
SELECT id, original_seller, server_id
FROM consignments
WHERE id = '<consignment_id>';
```

**✅ Critère de Succès**:
- `original_seller` = UUID gérant
- `server_id` = UUID de "Ahmed"
- Consignation visible pour Ahmed dans sa liste filtrée

---

### Test 3.6: ReturnsPage - Création avec server_id (BUG #10)
**Objectif**: Vérifier que retours supportent server_id

**Étapes**:
1. Mode simplifié, mapping "Ahmed" existe
2. Aller à `/returns`
3. Créer nouveau retour
4. Sélectionner serveur "Ahmed"
5. Valider
6. Vérifier DB:
```sql
SELECT id, returned_by, server_id
FROM returns
WHERE id = '<return_id>';
```

**✅ Critère de Succès**:
- `returned_by` = UUID gérant
- `server_id` = UUID de "Ahmed"
- Retour visible pour Ahmed dans sa liste filtrée

---

## 🔍 CATÉGORIE 4: Tests de Filtrage & Isolation

### Test 4.1: Serveur Voit Uniquement Ses Ventes - Mode Complet
**Objectif**: Vérifier isolation en mode full

**Configuration**:
- Bar en mode `full`
- 2 serveurs: "Ahmed" et "Fatou" (comptes réels)
- Ahmed crée 3 ventes
- Fatou crée 5 ventes

**Étapes**:
1. Se connecter comme Ahmed
2. Aller à `/sales` (Historique)
3. Compter le nombre de ventes affichées

**✅ Critère de Succès**:
- Ahmed voit exactement 3 ventes (les siennes)
- Fatou voit exactement 5 ventes (les siennes)

**Vérification DB**:
```sql
-- Ventes de Ahmed
SELECT COUNT(*) FROM sales
WHERE server_id = '<ahmed_uuid>';

-- Ventes de Fatou
SELECT COUNT(*) FROM sales
WHERE server_id = '<fatou_uuid>';
```

---

### Test 4.2: Serveur Voit Uniquement Ses Ventes - Mode Simplifié
**Objectif**: Vérifier isolation en mode simplified

**Configuration**:
- Bar en mode `simplified`
- Gérant crée 10 ventes totales
- 4 ventes assignées à "Ahmed"
- 6 ventes assignées à "Fatou"
- Mappings existent pour les deux

**Étapes**:
1. Se connecter comme Ahmed
2. Aller à `/sales`
3. Compter ventes

**✅ Critère de Succès**:
- Ahmed voit 4 ventes
- Fatou voit 6 ventes
- Gérant voit 10 ventes (toutes, car status='validated')

---

### Test 4.3: Filtrage Consignations par Serveur
**Objectif**: Vérifier que useSalesFilters fonctionne pour consignations

**Configuration**:
- 3 consignations: 2 pour Ahmed, 1 pour Fatou

**Étapes**:
1. Se connecter comme Ahmed
2. Aller à `/consignments`
3. Vérifier liste

**✅ Critère de Succès**:
- Ahmed voit 2 consignations
- Fatou voit 1 consignation

---

### Test 4.4: Filtrage Retours par Serveur
**Objectif**: Vérifier que useSalesFilters fonctionne pour retours

**Configuration**:
- 4 retours: 3 pour Ahmed, 1 pour Fatou

**Étapes**:
1. Se connecter comme Ahmed
2. Aller à `/returns`
3. Vérifier liste

**✅ Critère de Succès**:
- Ahmed voit 3 retours
- Fatou voit 1 retour

---

### Test 4.5: Dashboard - Top Produits Filtrés par Serveur
**Objectif**: Vérifier analytics filtrées (BUG #9)

**Configuration**:
- Ahmed a vendu: 10x Bière, 5x Soda
- Fatou a vendu: 3x Bière, 8x Jus

**Étapes**:
1. Se connecter comme Ahmed
2. Aller à `/dashboard`
3. Vérifier section "Top Produits"

**✅ Critère de Succès**:
- Top 1 = Bière (10)
- Top 2 = Soda (5)
- PAS de Jus dans la liste (appartient à Fatou)

---

## 🔄 CATÉGORIE 5: Tests de Mode Switching

### Test 5.1: Bascule Full → Simplified (Sans Perte)
**Objectif**: Vérifier conservation des données

**Étapes**:
1. Mode `full`, Ahmed crée 5 ventes
2. Vérifier DB:
```sql
SELECT COUNT(*) FROM sales WHERE server_id = '<ahmed_uuid>';
-- Résultat: 5
```
3. Basculer à `simplified` dans Settings
4. Créer mappings si nécessaire
5. Vérifier Ahmed voit toujours ses 5 ventes dans `/sales`

**✅ Critère de Succès**:
- 5 ventes visibles avant ET après switch
- `server_id` reste inchangé dans DB

---

### Test 5.2: Bascule Simplified → Full (Conservation)
**Objectif**: Vérifier données créées en simplified restent accessibles

**Étapes**:
1. Mode `simplified`, gérant crée 7 ventes pour Ahmed
2. Vérifier Ahmed voit 7 ventes
3. Basculer à `full`
4. Vérifier Ahmed voit toujours 7 ventes

**✅ Critère de Succès**:
- 7 ventes visibles avant ET après
- Ahmed peut maintenant créer ses propres ventes directement

---

### Test 5.3: Bascule Multiple (Full → Simplified → Full → Simplified)
**Objectif**: Stress test basculement

**Étapes**:
1. Full: Ahmed crée 2 ventes (total: 2)
2. → Simplified: Gérant crée 3 ventes pour Ahmed (total: 5)
3. → Full: Ahmed crée 1 vente (total: 6)
4. → Simplified: Gérant crée 4 ventes pour Ahmed (total: 10)

**Vérification finale**:
```sql
SELECT COUNT(*) FROM sales WHERE server_id = '<ahmed_uuid>';
```

**✅ Critère de Succès**:
- 10 ventes dans DB
- Ahmed voit 10 ventes dans UI

---

## ⚡ CATÉGORIE 6: Tests de Performance & Edge Cases

### Test 6.1: Performance - Résolution Mapping (1000 Mappings)
**Objectif**: Vérifier que résolution reste rapide (BUG #7)

**Configuration**:
1. Créer 1000 mappings dans la DB
2. Mesurer temps de résolution

**Requête Benchmark**:
```sql
EXPLAIN ANALYZE
SELECT user_id FROM server_name_mappings
WHERE bar_id = '<bar_id>' AND server_name = 'Ahmed';
```

**✅ Critère de Succès**:
- Temps < 50ms
- Index utilisé (voir EXPLAIN ANALYZE output)

---

### Test 6.2: Performance - Filtrage Ventes (10K+ Sales)
**Objectif**: Vérifier latence filtrage avec gros volume

**Configuration**:
- 10,000+ ventes dans la DB
- 500 pour Ahmed

**Mesure**:
1. Se connecter comme Ahmed
2. Aller à `/sales`
3. Mesurer temps de chargement (Network tab)

**✅ Critère de Succès**:
- Chargement < 1000ms
- Seulement 500 ventes retournées (pas 10K)

---

### Test 6.3: Edge Case - Serveur Supprimé (FK ON DELETE SET NULL)
**Objectif**: Vérifier que supprimer user ne casse pas ventes

**Étapes**:
1. Ahmed a 5 ventes
2. Supprimer le compte Ahmed (via admin)
3. Vérifier DB:
```sql
SELECT id, server_id FROM sales WHERE id IN ('<vente_ids>');
```

**✅ Critère de Succès**:
- `server_id` = `NULL` (pas d'erreur FK)
- Ventes toujours présentes dans DB
- Gérant peut toujours voir ces ventes (orphelines)

---

### Test 6.4: Edge Case - Erreur Réseau lors Résolution
**Objectif**: Vérifier gestion erreur réseau (BUG #1)

**Simulation**:
1. Ouvrir DevTools Network tab
2. Activer "Offline" mode
3. Essayer de créer vente en mode simplifié

**✅ Critère de Succès**:
- Alert apparaît: "❌ Impossible d'attribuer la vente: Erreur réseau"
- Vente N'EST PAS créée

---

### Test 6.5: Edge Case - Mapping Dupliqué
**Objectif**: Vérifier contrainte UNIQUE

**Étapes**:
1. Créer mapping: `Ahmed` → `<uuid1>`
2. Essayer de créer: `Ahmed` → `<uuid2>` (même bar_id)

**✅ Critère de Succès**:
- Erreur contrainte UNIQUE
- Premier mapping conservé, second rejeté

---

### Test 6.6: Edge Case - Nom Serveur avec Espaces/Accents
**Objectif**: Vérifier extraction robuste (BUG #6)

**Étapes**:
1. Créer mapping pour "Aïcha Mohamed" (accents + espace)
2. Créer vente avec ce serveur
3. Vérifier résolution correcte

**✅ Critère de Succès**:
- Mapping trouvé malgré espaces/accents
- `server_id` correct dans vente créée

---

## 📊 Résumé des Tests

### Statistiques Attendues
- **Total Tests**: 31
- **Tests Base de Données**: 6
- **Tests Services**: 4
- **Tests Frontend**: 6
- **Tests Filtrage**: 5
- **Tests Mode Switching**: 3
- **Tests Performance/Edge**: 7

### Critères de Réussite Globaux
- ✅ **100% des tests DB passent** (migrations correctes)
- ✅ **95%+ des tests fonctionnels passent** (tolérance 1-2 edge cases mineurs)
- ✅ **100% des tests de sécurité passent** (RLS, isolation, blocage)
- ✅ **Performance cibles atteintes** (< 1s chargement, < 100ms résolution)

### En Cas d'Échec
1. Noter le test échoué + symptômes
2. Vérifier logs console (erreurs JS)
3. Vérifier logs Supabase (erreurs RLS/SQL)
4. Exécuter requêtes de debugging fournies
5. Ouvrir issue GitHub avec:
   - Numéro du test
   - Résultat attendu vs réel
   - Logs pertinents
   - Requête SQL de vérification

---

## 🚀 Prochaines Étapes

Une fois tous les tests validés:
1. ✅ Marquer ce document comme "Tests Passed"
2. ✅ Créer rapport de test (résultats + screenshots)
3. ✅ Procéder au déploiement selon [ATOMIC_DEPLOYMENT_RUNBOOK.md](ATOMIC_DEPLOYMENT_RUNBOOK.md)

---

**Document créé**: 26 Décembre 2025
**Auteur**: Claude Code (Agent IA)
**Version**: 1.0
**Statut**: ⏳ Prêt pour exécution
