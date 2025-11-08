# 🏪 Guide: Créer un Nouveau Bar

> Guide pratique pour créer de nouveaux bars dans BarTender Pro

---

## 🎯 Méthodes Disponibles

### **Méthode 1 : Via Console (Rapide)** ⚡

**Pour développement et tests**

1. **Démarrer l'application** :
   ```bash
   npm run dev
   ```

2. **Ouvrir la console du navigateur** :
   - Appuyez sur `F12`
   - Onglet "Console"

3. **Créer un bar de test** :
   ```javascript
   // Créer un bar avec un nom personnalisé
   __bartender.createTestBar("Mon Bar à Cotonou")

   // Recharger la page pour voir le nouveau bar
   location.reload()
   ```

4. **Lister les bars existants** :
   ```javascript
   __bartender.listBars()
   ```

---

### **Méthode 2 : Via Code (Programmatique)** 💻

**Dans un composant React**

```typescript
import { useBarContext } from './context/BarContext';

function MonComposant() {
  const { createBar } = useBarContext();

  const handleCreateBar = () => {
    const newBar = createBar({
      name: 'Bar Plage Cotonou',
      address: '123 Boulevard de la Marina, Cotonou',
      phone: '+229 97 12 34 56',
      email: 'contact@barplage.bj',
      isActive: true,
      settings: {
        currency: 'XOF',
        currencySymbol: ' FCFA',
        timezone: 'Africa/Porto-Novo',
        language: 'fr',
        businessDayCloseHour: 6,
        operatingMode: 'full',
        consignmentExpirationDays: 7,
      },
    });

    if (newBar) {
      console.log('✅ Bar créé:', newBar);
    }
  };

  return <button onClick={handleCreateBar}>Créer Bar</button>;
}
```

---

### **Méthode 3 : Manuellement (localStorage)** 🛠️

**Pour modifications avancées**

1. **Ouvrir la console** (F12)

2. **Voir le template** :
   ```javascript
   console.log(__bartender.template)
   ```

3. **Créer votre bar personnalisé** :
   ```javascript
   const monBar = {
     id: 'bar_' + Date.now(),
     name: 'Bar Custom',
     address: '456 Rue de Porto-Novo',
     phone: '+229 XX XX XX XX',
     email: 'contact@custom.bj',
     ownerId: 'user1', // ID du promoteur
     createdAt: new Date(),
     isActive: true,
     settings: {
       currency: 'XOF',
       currencySymbol: ' FCFA',
       timezone: 'Africa/Porto-Novo',
       language: 'fr',
       businessDayCloseHour: 6,
       operatingMode: 'simplified', // ou 'full'
       serversList: ['Marie', 'Jean', 'Fatou'], // Pour mode simplifié
       consignmentExpirationDays: 7,
     },
   };

   // Sauvegarder
   const bars = JSON.parse(localStorage.getItem('bars-v3') || '[]');
   bars.push(monBar);
   localStorage.setItem('bars-v3', JSON.stringify(bars));

   // Recharger
   location.reload();
   ```

---

## 🔧 Utilitaires Console Disponibles

En mode développement (`npm run dev`), ces fonctions sont disponibles dans `window.__bartender`:

| Fonction | Description | Exemple |
|----------|-------------|---------|
| `createTestBar(name)` | Créer un bar de test | `__bartender.createTestBar("Bar Test")` |
| `listBars()` | Afficher tous les bars | `__bartender.listBars()` |
| `deleteAllBars()` | Supprimer tous les bars (⚠️ DANGER) | `__bartender.deleteAllBars()` |
| `showInstructions()` | Afficher les instructions | `__bartender.showInstructions()` |
| `template` | Template de bar | `__bartender.template` |

---

## 📋 Configuration des Settings

### **`operatingMode`**

| Mode | Description | Usage |
|------|-------------|-------|
| `'full'` | Mode complet | Chaque serveur a son compte |
| `'simplified'` | Mode simplifié | Gérant attribue les ventes |

**Exemple Mode Simplifié** :
```typescript
settings: {
  operatingMode: 'simplified',
  serversList: ['Marie', 'Jean', 'Fatou'], // Liste des serveurs
  // ...
}
```

### **`businessDayCloseHour`**

Heure de clôture de la journée commerciale (0-23).

**Exemples** :
- `6` → Clôture à 6h du matin (bars de nuit)
- `2` → Clôture à 2h du matin
- `23` → Clôture à 23h (bars qui ferment tôt)

**Règle** : Ventes entre 0h-6h comptent dans la journée précédente.

### **`consignmentExpirationDays`**

Nombre de jours avant expiration d'une consignation.

**Défaut** : `7` jours

---

## 🚨 Troubleshooting

### **Problème : Bar non visible après création**

**Solution** :
```javascript
// Recharger la page
location.reload()
```

### **Problème : Permission refusée**

**Vérification** :
- Êtes-vous connecté en tant que **promoteur** ?
- Le promoteur a-t-il la permission `canCreateBars` ?

```javascript
// Vérifier vos permissions
const session = JSON.parse(localStorage.getItem('currentSession'));
console.log(session.role); // Doit être 'promoteur'
console.log(session.permissions.canCreateBars); // Doit être true
```

### **Problème : Bars perdus après rafraîchissement**

**Cause** : Données en localStorage corrompues

**Solution** :
```javascript
// Vérifier les données
const bars = JSON.parse(localStorage.getItem('bars-v3') || '[]');
console.log(bars);

// Si vide, recréer
__bartender.createTestBar("Bar Demo");
location.reload();
```

---

## 🎯 Prochaine Étape : Modal UI

**À venir** : Composant `BarCreateModal.tsx` pour créer des bars via interface graphique.

**En attendant** : Utilisez les méthodes console ci-dessus.

---

## 📝 Notes

- Les bars sont sauvegardés dans `localStorage` (clé: `bars-v3`)
- Chaque bar est isolé (multi-tenant) via `barId`
- Le créateur devient automatiquement membre avec rôle `promoteur`
- Les membres sont dans `localStorage` (clé: `bar-members-v3`)

---

*Dernière mise à jour : Session Sync Infrastructure - Novembre 2025*
