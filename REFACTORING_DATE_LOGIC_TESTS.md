# Checklist de Validation - Refactorisation Date Logic

## ✅ Tests Manuels Obligatoires

### 1. BarsManagementPanel - CA Aujourd'hui
- [ ] Ouvrir le panel de gestion des bars (Super Admin)
- [ ] Vérifier que le "CA Aujourd'hui" s'affiche pour chaque bar
- [ ] Comparer avec l'ancien calcul (si disponible)
- [ ] Tester avec une vente à 5h59 (doit être jour précédent)
- [ ] Tester avec une vente à 6h01 (doit être jour actuel)

### 2. SuperAdminDashboard - Statistiques
- [ ] Ouvrir le dashboard Super Admin
- [ ] Vérifier "CA Total Aujourd'hui"
- [ ] Vérifier "Nombre de Ventes"
- [ ] Vérifier les tendances vs hier
- [ ] Vérifier les tendances vs moyenne 7j
- [ ] Vérifier le Top 10 des bars

### 3. Cas Limites
- [ ] Tester à minuit (00:00)
- [ ] Tester à 5h59 (avant closeHour)
- [ ] Tester à 6h00 (exactement closeHour)
- [ ] Tester à 6h01 (après closeHour)
- [ ] Tester avec un bar ayant closeHour différent (ex: 4h)

### 4. Retours
- [ ] Créer un retour aujourd'hui
- [ ] Vérifier qu'il est déduit du CA
- [ ] Vérifier qu'il apparaît dans les stats

### 5. Comparaison Avant/Après
- [ ] Noter le CA affiché AVANT la refactorisation
- [ ] Noter le CA affiché APRÈS la refactorisation
- [ ] Vérifier que les chiffres sont identiques

## 🐛 Bugs Potentiels à Surveiller

### Symptômes d'un problème :
- ❌ CA différent entre BarsManagementPanel et SuperAdminDashboard
- ❌ CA qui change au refresh de la page
- ❌ Ventes de 5h59 comptées dans le mauvais jour
- ❌ Retours non déduits du CA
- ❌ Erreurs console liées aux dates

### Si un bug est détecté :
1. Ouvrir la console (F12)
2. Noter l'erreur exacte
3. Noter l'heure de la vente/retour problématique
4. Vérifier le `closeHour` du bar
5. Comparer avec le calcul SQL (si possible)

## 📝 Résultats des Tests

### Test 1 : BarsManagementPanel
- Date/Heure du test : ___________
- CA affiché : ___________
- Résultat : ☐ OK ☐ KO
- Notes : ___________

### Test 2 : SuperAdminDashboard
- Date/Heure du test : ___________
- CA Total : ___________
- Nombre de ventes : ___________
- Résultat : ☐ OK ☐ KO
- Notes : ___________

### Test 3 : Cas Limites
- Test à 5h59 : ☐ OK ☐ KO
- Test à 6h00 : ☐ OK ☐ KO
- Test à 6h01 : ☐ OK ☐ KO
- Notes : ___________

## ✅ Validation Finale

- [ ] Tous les tests manuels passent
- [ ] Aucune erreur console
- [ ] CA cohérent entre les composants
- [ ] Retours correctement déduits
- [ ] Cas limites gérés correctement

**Signature** : ___________  
**Date** : ___________

---

## 🎯 Prochaines Étapes

Si tous les tests passent :
1. ✅ Commit des changements
2. ✅ Déployer en staging
3. ✅ Monitorer pendant 24h
4. ✅ Migrer les autres composants (SalesHistory.tsx)

Si un test échoue :
1. ❌ Ne pas merger
2. ❌ Analyser le bug
3. ❌ Corriger
4. ❌ Re-tester
