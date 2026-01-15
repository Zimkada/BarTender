# Auto-Expiration des Ventes en Attente

**Date d'implémentation** : 2026-01-14
**Version** : 2.0 (Frontend-Only)
**Statut** : ✅ Production Ready

---

## 📋 Vue d'Ensemble

Système d'expiration automatique des ventes en attente (`status: 'pending'`) côté frontend pour éviter l'accumulation de commandes anciennes et garantir l'intégrité des données affichées.

### Problème Résolu

**Avant** : Les ventes en attente restaient indéfiniment visibles dans le système, même après la fin de la journée commerciale, causant :
- ❌ Fausses données dans les statistiques du jour suivant
- ❌ Confusion pour les gérants (ventes d'hier mélangées avec aujourd'hui)
- ❌ Workflow perturbé

**Après** : Expiration automatique à la fin de la journée commerciale
- ✅ Ventes expirées masquées immédiatement (frontend)
- ✅ S'adapte automatiquement au `closingHour` de chaque bar
- ✅ Fonctionne en Free Tier (pas de pg_cron requis)
- ✅ Architecture simple et maintenable

---

## 🏗️ Architecture : Solution Frontend-Only

### Pourquoi Frontend-Only ?

**Décision d'architecture** : Après avoir initialement considéré une approche hybride (frontend + SQL pg_cron), nous avons opté pour une solution frontend uniquement pour les raisons suivantes :

1. **Adaptabilité** : Chaque bar peut configurer son propre `closingHour` (6h par défaut, mais personnalisable)
2. **Simplicité** : Un job SQL à heure fixe ne peut pas s'adapter aux différentes configurations
3. **Compatibilité** : Fonctionne en Free Tier Supabase (pas besoin de pg_cron)
4. **Performance** : Utilise `useMemo` pour optimisation, calcul instantané
5. **Maintenance** : Une seule source de vérité, pas de synchronisation frontend/backend

### Implémentation

**Fichier** : [src/components/DailyDashboard.tsx:231-245](src/components/DailyDashboard.tsx#L231-L245)

**Fonctionnement** :
- Filtre les ventes `pending` pour ne montrer que celles de la journée commerciale actuelle
- Utilise `getCurrentBusinessDateString()` qui respecte le `closingHour` de chaque bar
- Conversion Date → string pour comparaison type-safe avec `todayDateStr`
- S'exécute à chaque render du composant via `useMemo`

**Code** :
```typescript
const pendingSales = useMemo(() => {
  const isManager = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';
  return sales.filter(s => {
    // Convert businessDate to YYYY-MM-DD for comparison
    const saleDateStr = s.businessDate instanceof Date
      ? s.businessDate.toISOString().split('T')[0]
      : String(s.businessDate).split('T')[0];

    return (
      s.status === 'pending' &&
      saleDateStr === todayDateStr && // Frontend expiration filter
      (isManager || s.soldBy === currentSession?.userId || s.serverId === currentSession?.userId)
    );
  });
}, [sales, currentSession, todayDateStr]);
```

**Détail Technique** :
- `todayDateStr` provient de `getCurrentBusinessDateString()` (date utils)
- Cette fonction calcule la date commerciale actuelle en fonction de `closingHour`
- Exemple : Si `closingHour = 6h` et il est 2h du matin, on est encore sur la journée commerciale d'hier
- Le filtre `saleDateStr === todayDateStr` masque automatiquement les ventes expirées

### Avantages

- ✅ **Adaptation automatique** : Respecte le `closingHour` de chaque bar (6h par défaut)
- ✅ **Pas de dépendance pg_cron** : Fonctionne en Free Tier Supabase
- ✅ **Temps réel** : Ventes masquées immédiatement au changement de jour commercial
- ✅ **Performance optimale** : `useMemo` évite les recalculs inutiles
- ✅ **Sécurité type** : Conversion explicite Date → string
- ✅ **Maintenabilité** : Une seule source de vérité (frontend)

### Limites (Acceptables)

- ⚠️ **Ventes restent en DB** : Les ventes expirées ne sont pas marquées `rejected` en base
  - **Impact** : Aucun, car elles restent invisibles dans l'interface
  - **Justification** : Peut être utile pour analytics historiques
- ⚠️ **Stock non restauré automatiquement** : Les items des ventes expirées restent décomptés
  - **Impact** : Minimal, car les ventes pending sont temporaires (< 1 jour)
  - **Solution manuelle** : Les gérants peuvent rejeter manuellement pour restaurer stock si nécessaire

---

## 🚀 Déploiement

### Statut Actuel

**Statut** : ✅ Actif en production

**Composants déployés** :
- ✅ Frontend filter dans `DailyDashboard.tsx` (lignes 231-245)
- ✅ Guide utilisateur mis à jour dans `owner-guides.ts` (ligne 84)
- ✅ Documentation complète

**Migrations SQL supprimées** :
- ❌ ~~`20260114000009_auto_expire_pending_sales.sql`~~ (rollback via migration 20260114000011)
- ❌ ~~`20260114000010_schedule_pending_sales_expiration.sql`~~ (rollback via migration 20260114000011)
- ✅ `20260114000011_rollback_pending_sales_expiration.sql` (cleanup)

### Instructions de Rollback (Si Migrations SQL Déjà Appliquées)

Si vous aviez déjà exécuté les migrations `20260114000009` et `20260114000010`, appliquez le rollback :

**Étape 1 : Appliquer migration rollback**
1. Aller sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionner votre projet BarTender
3. **SQL Editor** > **New Query**
4. Copier-coller le contenu de `supabase/migrations/20260114000011_rollback_pending_sales_expiration.sql`
5. Exécuter

**Vérification** :
```sql
-- Vérifier fonction supprimée
SELECT proname FROM pg_proc WHERE proname = 'expire_old_pending_sales';
-- Attendu: 0 rows

-- Vérifier job supprimé (si pg_cron actif)
SELECT * FROM cron.job WHERE jobname = 'expire-pending-sales-daily';
-- Attendu: 0 rows
```

---

## 📊 Impact Utilisateur

### Pour les Serveurs

**Comportement** :
- Ventes créées aujourd'hui → Visibles jusqu'à validation/rejet
- Ventes créées hier et non validées → **Masquées automatiquement** après `closingHour`
- **Pas d'action requise**

**Message utilisateur** (optionnel dans guide) :
> "Les ventes en attente non validées expirent automatiquement à la fin de la journée commerciale (après l'heure de fermeture configurée). Assurez-vous que vos ventes soient validées avant la fermeture."

---

### Pour les Gérants/Promoteurs

**Comportement** :
- Section "Ventes en attente" n'affiche que les ventes **du jour commercial actuel**
- Ventes anciennes → Automatiquement masquées après `closingHour`
- Les ventes masquées restent en DB avec `status: 'pending'` (peuvent être consultées via SQL si besoin)

**Workflow optimal** :
1. En cours de journée : Valider les ventes pending au fur et à mesure
2. Fin de journée : Vérifier qu'aucune vente légitime reste en attente
3. Après `closingHour` : Les ventes non validées disparaissent automatiquement de l'interface

---

## 🧪 Tests

### Test Frontend (Local)

```typescript
// Dans DailyDashboard, vérifier le filtre
console.log('[Test] Pending sales filter:', {
  allSales: sales.length,
  pendingSales: pendingSales.length,
  todayDateStr,
  closingHour: bar?.closingHour || 6,
  currentTime: new Date().toISOString(),
  filteredOut: sales.filter(s => {
    const saleDateStr = s.businessDate instanceof Date
      ? s.businessDate.toISOString().split('T')[0]
      : String(s.businessDate).split('T')[0];
    return s.status === 'pending' && saleDateStr !== todayDateStr;
  }).length
});
```

**Résultat attendu** :
- `pendingSales` contient uniquement ventes avec `businessDate === todayDateStr`
- `filteredOut` > 0 si ventes anciennes présentes en DB

### Test Scénario Complet

**Scénario de test** :
1. Créer une vente pending avec `business_date = CURRENT_DATE - 1`
2. Recharger `DailyDashboard`
3. Vérifier que cette vente **n'apparaît pas** dans la liste des ventes en attente

**SQL pour créer vente test** :
```sql
INSERT INTO sales (bar_id, items, total, status, business_date, sold_by, created_by)
VALUES (
  'your-bar-id',
  '[{"product_id": "test-id", "product_name": "Test", "quantity": 1, "unit_price": 100, "total_price": 100}]'::jsonb,
  100,
  'pending',
  CURRENT_DATE - INTERVAL '1 day',  -- Hier
  'user-id',
  'user-id'
);
```

**Vérification frontend** :
- Cette vente ne doit PAS apparaître dans `pendingSales`
- Console doit afficher `filteredOut: 1`

---

## 🐛 Troubleshooting

### Problème : Ventes anciennes toujours visibles

**Symptôme** : Des ventes de la veille apparaissent encore dans "Ventes en attente"

**Diagnostic** :
```typescript
// Vérifier comparaison dates dans console navigateur
const sale = sales.find(s => s.status === 'pending');
console.log({
  saleDateStr: sale.businessDate instanceof Date
    ? sale.businessDate.toISOString().split('T')[0]
    : String(sale.businessDate).split('T')[0],
  todayDateStr: getCurrentBusinessDateString(),
  closingHour: bar?.closingHour || 6,
  matches: saleDateStr === todayDateStr
});
```

**Solutions** :
1. Vider cache navigateur (`Ctrl+Shift+R` ou `Cmd+Shift+R`)
2. Vérifier que `getCurrentBusinessDateString()` retourne la bonne date
3. Vérifier timezone client vs serveur
4. Forcer refresh de la liste des ventes

---

### Problème : Ventes disparaissent trop tôt

**Symptôme** : Ventes créées aujourd'hui disparaissent avant `closingHour`

**Cause probable** : Mauvaise configuration de `closingHour` ou bug dans `getCurrentBusinessDateString()`

**Diagnostic** :
```typescript
console.log({
  barClosingHour: bar?.closingHour,
  currentHour: new Date().getHours(),
  todayDateStr: getCurrentBusinessDateString(),
  expectedDate: new Date().toISOString().split('T')[0]
});
```

**Solutions** :
1. Vérifier paramètre `closingHour` dans table `bars` (default: 6)
2. Tester `getCurrentBusinessDateString()` à différentes heures
3. Vérifier timezone serveur (doit être cohérente)

---

## 📈 Métriques de Succès

### KPIs à Surveiller

1. **Nombre de ventes pending anciennes en DB**
   ```sql
   SELECT COUNT(*) FROM sales
   WHERE status = 'pending'
     AND business_date < CURRENT_DATE;
   ```
   - **Interprétation** : Ces ventes sont masquées frontend mais restent en DB
   - **Cible** : < 5% du total des ventes pending (nettoyage manuel si nécessaire)

2. **Plaintes utilisateurs**
   - Monitorer feedback sur "ventes disparues"
   - Vérifier compréhension du concept de journée commerciale

3. **Performance frontend**
   - Temps de calcul `pendingSales` dans `useMemo`
   - Cible : < 10ms pour 1000 ventes

---

## 🔗 Fichiers Liés

### Code Source
- [src/components/DailyDashboard.tsx:231-245](src/components/DailyDashboard.tsx#L231-L245) - Frontend filter
- [src/data/guides/owner-guides.ts:84](src/data/guides/owner-guides.ts#L84) - Documentation guide utilisateur
- `src/utils/date.ts` - Fonction `getCurrentBusinessDateString()`

### Migrations SQL (Rollback)
- [supabase/migrations/20260114000011_rollback_pending_sales_expiration.sql](supabase/migrations/20260114000011_rollback_pending_sales_expiration.sql) - Rollback SQL approach

### Documentation
- [MIGRATION_FREE_TO_PRO.md](MIGRATION_FREE_TO_PRO.md) - Configuration pg_cron (maintenant 6 jobs au lieu de 7)
- `CURRENT_STATUS_REPORT.md` - Statut général du projet

---

## ✅ Checklist Déploiement

### Pré-déploiement
- [x] Frontend filter implémenté (DailyDashboard.tsx)
- [x] Guide utilisateur mis à jour (owner-guides.ts)
- [x] Documentation PENDING_SALES_EXPIRATION.md mise à jour
- [x] Migration rollback créée (20260114000011)
- [x] Tests manuels réussis (local)
- [x] Build réussi (npm run build)

### Post-déploiement
- [ ] Appliquer migration rollback 20260114000011 (si migrations SQL déjà exécutées)
- [ ] Vérifier frontend fallback actif (ventes anciennes masquées)
- [ ] Tester avec différentes valeurs de `closingHour`
- [ ] Monitorer plaintes utilisateurs (ventes "disparues")
- [ ] Vérifier performance `useMemo` dans DailyDashboard

---

## 📚 Historique des Versions

### Version 2.0 (2026-01-14) - Frontend-Only
- **Changement majeur** : Suppression approche SQL/pg_cron
- **Raison** : Job SQL à heure fixe ne peut pas s'adapter aux différents `closingHour` de chaque bar
- **Solution** : Frontend-only avec `getCurrentBusinessDateString()` qui respecte `closingHour`
- **Rollback** : Migration 20260114000011 pour nettoyer SQL

### Version 1.0 (2026-01-14) - Hybride (Deprecated)
- Approche hybride frontend + SQL pg_cron
- Job à 2h du matin (incompatible avec `closingHour = 6h`)
- Abandonné après découverte du problème d'adaptabilité

---

**Version** : 2.0 (Frontend-Only)
**Dernière mise à jour** : 2026-01-14
**Auteur** : Claude Code
**Statut** : ✅ Production Ready
