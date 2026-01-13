# ⏰ Quand Appliquer les Index Scalability (Phase 11)

## 🚦 Critères de Déclenchement

Appliquer les index **UNIQUEMENT** si l'un de ces critères est atteint :

### 🔴 **CRITIQUE (Urgent - Appliquer sous 48h)**
- [ ] Les rapports admin prennent **> 3 secondes**
- [ ] Plaintes utilisateurs fréquentes (> 5/semaine) sur lenteur dashboard
- [ ] Table `sales` contient **> 500,000 lignes**
- [ ] CPU database > 70% pendant les heures de pointe

### 🟠 **IMPORTANT (Planifier sous 2 semaines)**
- [ ] Les rapports admin prennent **> 1 seconde**
- [ ] Table `sales` contient **> 100,000 lignes**
- [ ] Vous avez **> 50 bars actifs**
- [ ] pg_stat_statements montre seq_scan sur sales.validated_by > 100/jour

### 🟢 **OPTIONNEL (Nice to have)**
- [ ] Vous optimisez proactivement avant un gros événement marketing
- [ ] Vous avez du temps libre et voulez "préparer le terrain"
- [ ] Vous êtes en train de faire un audit performance global

---

## 📊 Comment Vérifier les Critères ?

### 1. Tester la vitesse des rapports admin

```sql
-- Mesurer le temps d'exécution
\timing on

SELECT COUNT(*)
FROM sales
WHERE validated_by IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days';

-- Si > 1000ms → Index IMPORTANT
-- Si > 3000ms → Index CRITIQUE
```

### 2. Compter les lignes dans sales

```sql
SELECT
  'sales' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('sales')) as size,
  CASE
    WHEN COUNT(*) > 500000 THEN '🔴 CRITIQUE'
    WHEN COUNT(*) > 100000 THEN '🟠 IMPORTANT'
    ELSE '🟢 OK'
  END as status
FROM sales;
```

### 3. Activer pg_stat_statements (Dashboard > Extensions)

```sql
-- Après 1 semaine, vérifier les seq_scans
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%validated_by%'
ORDER BY total_exec_time DESC
LIMIT 5;
```

---

## 🎯 Plan d'Action si Critères Atteints

### Étape 1 : Appliquer les index
```bash
# Fichiers disponibles dans ce dossier :
# - 20260113_scalability_indexes_STEP_BY_STEP.sql (RECOMMANDÉ)
# - 20260113_INDEX_CREATION_GUIDE_MANUAL_EXECUTION_REQUIRED.md (Guide)

# Suivre les instructions du guide (5 minutes)
```

### Étape 2 : Mesurer l'impact
```sql
-- Réexécuter la query de test (voir §1 ci-dessus)
-- Comparer avant/après
```

### Étape 3 : Documenter
```
Mettre à jour ce fichier avec :
- Date d'application : __________
- Seuil atteint : __________
- Gain mesuré : __________
```

---

## 📌 Notes Importantes

1. **Ne PAS appliquer juste "au cas où"** → C'est de l'optimisation prématurée
2. **Ne PAS paniquer si un critère est atteint** → Les index se créent en 2 minutes
3. **Surveiller trimestriellement** → Ajouter un rappel calendrier (tous les 3 mois)

---

**Date de création :** 2026-01-13
**Prochaine revue recommandée :** 2026-04-13 (dans 3 mois)
**Statut :** ⏸️ En attente de déclenchement
