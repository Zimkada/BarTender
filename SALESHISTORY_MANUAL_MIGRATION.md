# Migration SalesHistory.tsx - Instructions Manuelles

## ⚠️ Contexte

L'outil automatique a échoué 2 fois sur ce fichier (trop volumineux: 2241 lignes).
Voici les instructions pour faire la modification **manuellement**.

## 📍 Modification à Faire

**Fichier**: `src/components/SalesHistory.tsx`  
**Lignes à remplacer**: 164-233 (70 lignes)

### ❌ Code Actuel (à supprimer)

```typescript
  // Filtrage des consignations par période
  const filteredConsignments = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    // 1. Filtrage initial basé sur le rôle
    const baseConsignments = consignments.filter(consignment => {
      if (isServer) {
        // 🔒 SERVEURS : Voir consignations de LEURS ventes (via originalSeller)
        return consignment.originalSeller === currentSession.userId;
      }
      return true; // Gérants/Promoteurs voient toutes les consignations
    });

    // 2. Appliquer les filtres de date sur la liste pré-filtrée
    let filtered = baseConsignments;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeRange) {
      case 'today': {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          const consignBusinessDay = getBusinessDay(consignDate, closeHour);
          return isSameDay(consignBusinessDay, currentBusinessDay);
        });
        break;
      }
      case 'week': {
        const currentDay = today.getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= monday && consignDate <= sunday;
        });
        break;
      }
      case 'month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= firstDay && consignDate <= lastDay;
        });
        break;
      }
      case 'custom': {
        const startDate = new Date(customRange.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customRange.end);
        endDate.setDate(endDate.getDate() + 1);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= startDate && consignDate < endDate;
        });
        break;
      }
    }

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [consignments, timeRange, customRange, currentSession, closeHour]);
```

### ✅ Nouveau Code (à copier-coller)

```typescript
  // Filtrage des consignations par période
  const filteredConsignments = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    // 1. Filtrage initial basé sur le rôle
    const baseConsignments = consignments.filter(consignment => {
      if (isServer) {
        // 🔒 SERVEURS : Voir consignations de LEURS ventes (via originalSeller)
        return consignment.originalSeller === currentSession.userId;
      }
      return true; // Gérants/Promoteurs voient toutes les consignations
    });

    // 2. ✨ REFACTORISATION : Utiliser startDate et endDate du hook au lieu de recalculer
    // Le hook useDateRangeFilter gère déjà tous les cas (today, week, month, custom)
    // avec la logique de business day
    const filtered = baseConsignments.filter(c => {
      const consignDate = new Date(c.createdAt);
      const consignDateObj = new Date(consignDate.getFullYear(), consignDate.getMonth(), consignDate.getDate());
      const start = new Date(startDate);
      const end = new Date(endDate);
      return consignDateObj >= start && consignDateObj <= end;
    });

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [consignments, startDate, endDate, currentSession]);
```

## 📊 Résultat

- **Avant**: 70 lignes avec switch/case dupliqué
- **Après**: 28 lignes utilisant les helpers centralisés
- **Gain**: -42 lignes (-60%)
- **Dépendances**: `timeRange` et `closeHour` supprimés (déjà gérés par le hook)

## ✅ Vérification

Après modification, vérifiez que :
1. Aucune erreur TypeScript
2. Le filtrage des consignations fonctionne toujours
3. Les dates "Aujourd'hui", "Semaine", "Mois" affichent les bonnes données

---

*Si vous préférez que je continue automatiquement, dites-le moi et je trouverai une autre approche.*
