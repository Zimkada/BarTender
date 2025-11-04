# 📘 Guide d'Utilisation - `getServerRevenue()` & `getServerReturns()`

**Date:** 02/11/2025
**Status:** ✅ Implémenté dans AppContext.tsx

---

## 🎯 Objectif

Calculer le **CA NET** d'un serveur en déduisant les retours remboursés de ses ventes.

**Problème résolu :**
```
❌ AVANT : getSalesByUser(serveurId) → CA brut (sans déduire retours)
✅ APRÈS : getServerRevenue(serveurId) → CA net (retours déduits)
```

---

## 📖 API

### 1. `getServerRevenue(userId, startDate?, endDate?): number`

Calcule le CA NET d'un serveur sur une période donnée.

**Paramètres:**
- `userId` (string, requis) : ID du serveur
- `startDate` (Date, optionnel) : Début de période
- `endDate` (Date, optionnel) : Fin de période

**Retour:** Nombre (CA NET en FCFA)

**Logique:**
1. Récupère toutes les ventes **validées** du serveur dans la période
2. Récupère tous les retours **remboursés** de ces ventes
3. CA NET = Ventes totales - Retours remboursés

**Exemple:**
```typescript
import { useAppContext } from '../context/AppContext';

const MyComponent = () => {
  const { getServerRevenue } = useAppContext();
  const { currentSession } = useAuth();

  // CA net aujourd'hui
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0));
  const todayEnd = new Date(today.setHours(23, 59, 59, 999));
  const todayRevenue = getServerRevenue(currentSession.userId, todayStart, todayEnd);

  // CA net du mois
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthRevenue = getServerRevenue(currentSession.userId, monthStart, monthEnd);

  // CA net total (toutes périodes)
  const totalRevenue = getServerRevenue(currentSession.userId);

  return (
    <div>
      <p>CA Aujourd'hui: {todayRevenue} FCFA</p>
      <p>CA Ce Mois: {monthRevenue} FCFA</p>
      <p>CA Total: {totalRevenue} FCFA</p>
    </div>
  );
};
```

---

### 2. `getServerReturns(userId): Return[]`

Récupère tous les retours liés aux ventes d'un serveur.

**Paramètres:**
- `userId` (string, requis) : ID du serveur

**Retour:** Tableau de retours

**Logique:**
1. Trouve toutes les ventes **validées** du serveur
2. Retourne tous les retours liés à ces ventes (approved, pending, rejected)

**Exemple:**
```typescript
import { useAppContext } from '../context/AppContext';

const ServerReturnsTable = () => {
  const { getServerReturns } = useAppContext();
  const { currentSession } = useAuth();

  const myReturns = getServerReturns(currentSession.userId);
  const refundedReturns = myReturns.filter(r => r.isRefunded);
  const totalRefunded = refundedReturns.reduce((sum, r) => sum + r.refundAmount, 0);

  return (
    <div>
      <h3>Mes Retours</h3>
      <p>Total retours: {myReturns.length}</p>
      <p>Retours remboursés: {refundedReturns.length}</p>
      <p>Montant total remboursé: {totalRefunded} FCFA</p>

      <ul>
        {myReturns.map(ret => (
          <li key={ret.id}>
            {ret.productName} - {ret.quantityReturned} unités
            {ret.isRefunded ? ` (Remboursé: ${ret.refundAmount} FCFA)` : ' (Non remboursé)'}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

---

## 🎨 Cas d'Usage Complets

### Cas 1 : Dashboard Serveur Simple

```typescript
const ServerDashboard = () => {
  const { getServerRevenue, getSalesByUser, getServerReturns } = useAppContext();
  const { currentSession } = useAuth();
  const { formatPrice } = useCurrencyFormatter();

  const myUserId = currentSession.userId;

  // Données
  const allSales = getSalesByUser(myUserId);
  const grossRevenue = allSales.reduce((sum, s) => sum + s.total, 0);
  const netRevenue = getServerRevenue(myUserId);
  const returns = getServerReturns(myUserId);
  const refundedAmount = returns
    .filter(r => r.isRefunded)
    .reduce((sum, r) => sum + r.refundAmount, 0);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Mon Tableau de Bord</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* CA Brut */}
        <div className="bg-blue-100 p-4 rounded">
          <p className="text-sm text-gray-600">CA Brut</p>
          <p className="text-2xl font-bold">{formatPrice(grossRevenue)}</p>
          <p className="text-xs text-gray-500">{allSales.length} ventes</p>
        </div>

        {/* Retours */}
        <div className="bg-red-100 p-4 rounded">
          <p className="text-sm text-gray-600">Retours Remboursés</p>
          <p className="text-2xl font-bold text-red-600">-{formatPrice(refundedAmount)}</p>
          <p className="text-xs text-gray-500">{returns.length} retours</p>
        </div>

        {/* CA Net */}
        <div className="col-span-2 bg-green-100 p-6 rounded">
          <p className="text-sm text-gray-600">CA NET (après retours)</p>
          <p className="text-3xl font-bold text-green-600">{formatPrice(netRevenue)}</p>
        </div>
      </div>
    </div>
  );
};
```

---

### Cas 2 : Statistiques par Période

```typescript
const ServerStats = () => {
  const { getServerRevenue } = useAppContext();
  const { currentSession } = useAuth();

  const now = new Date();

  // Aujourd'hui
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayRevenue = getServerRevenue(currentSession.userId, startOfToday, endOfToday);

  // Cette semaine
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Lundi
  startOfWeek.setDate(now.getDate() - diff);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekRevenue = getServerRevenue(currentSession.userId, startOfWeek, now);

  // Ce mois
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenue = getServerRevenue(currentSession.userId, startOfMonth, now);

  return (
    <div>
      <div className="stat">
        <div className="stat-title">Aujourd'hui</div>
        <div className="stat-value">{todayRevenue} FCFA</div>
      </div>
      <div className="stat">
        <div className="stat-title">Cette Semaine</div>
        <div className="stat-value">{weekRevenue} FCFA</div>
      </div>
      <div className="stat">
        <div className="stat-title">Ce Mois</div>
        <div className="stat-value">{monthRevenue} FCFA</div>
      </div>
    </div>
  );
};
```

---

### Cas 3 : Calcul Commission Serveur

```typescript
const ServerCommission = () => {
  const { getServerRevenue } = useAppContext();
  const { currentSession } = useAuth();

  // Configuration commissions (à adapter selon votre modèle)
  const COMMISSION_RATE = 0.05; // 5%
  const BONUS_THRESHOLD = 100000; // Bonus si CA > 100k
  const BONUS_AMOUNT = 5000;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const netRevenue = getServerRevenue(currentSession.userId, monthStart);
  const commission = netRevenue * COMMISSION_RATE;
  const bonus = netRevenue > BONUS_THRESHOLD ? BONUS_AMOUNT : 0;
  const totalEarnings = commission + bonus;

  return (
    <div className="p-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
      <h3 className="text-xl font-bold mb-4">Mes Gains Ce Mois</h3>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span>CA Net:</span>
          <span className="font-bold">{netRevenue} FCFA</span>
        </div>
        <div className="flex justify-between">
          <span>Commission (5%):</span>
          <span className="font-bold text-green-600">{commission} FCFA</span>
        </div>
        {bonus > 0 && (
          <div className="flex justify-between">
            <span>🎉 Bonus Performance:</span>
            <span className="font-bold text-purple-600">{bonus} FCFA</span>
          </div>
        )}
        <hr className="my-2" />
        <div className="flex justify-between text-lg">
          <span className="font-bold">Total:</span>
          <span className="font-bold text-green-600">{totalEarnings} FCFA</span>
        </div>
      </div>
    </div>
  );
};
```

---

## 🧪 Scénario de Test

### Setup
```typescript
// Serveur: Marie (id: 'serveur-123')

// Vente 1: 10h00 - 5 bières Heineken
const sale1 = {
  id: 'sale-001',
  createdBy: 'serveur-123',
  total: 2500,
  status: 'validated'
};

// Vente 2: 11h00 - 3 bières Beaufort
const sale2 = {
  id: 'sale-002',
  createdBy: 'serveur-123',
  total: 1500,
  status: 'validated'
};

// Retour 1: 11h30 - 2 bières défectueuses de sale1
const return1 = {
  saleId: 'sale-001',
  isRefunded: true,
  refundAmount: 1000
};

// Retour 2: 12h00 - 1 bière changement d'avis de sale2 (NON remboursé)
const return2 = {
  saleId: 'sale-002',
  isRefunded: false,
  refundAmount: 0
};
```

### Résultats Attendus
```typescript
getSalesByUser('serveur-123')
// → [sale1, sale2]
// → CA Brut = 4000 FCFA ❌ (ne déduit pas retours)

getServerRevenue('serveur-123')
// → 4000 - 1000 = 3000 FCFA ✅ (déduit retour remboursé)
// → Le retour2 n'est PAS déduit car isRefunded=false

getServerReturns('serveur-123')
// → [return1, return2] (tous les retours, remboursés ou non)
```

---

## 📊 Comparaison Avant/Après

### ❌ AVANT (Bug métier)

```typescript
// Code existant
const serverSales = getSalesByUser('serveur-123');
const revenue = serverSales.reduce((sum, s) => sum + s.total, 0);
// revenue = 4000 FCFA (FAUX ! Ignore les 1000 FCFA remboursés)
```

### ✅ APRÈS (Correct)

```typescript
// Nouveau code
const netRevenue = getServerRevenue('serveur-123');
// netRevenue = 3000 FCFA (CORRECT ! Déduit les retours remboursés)
```

---

## ⚠️ Points Importants

1. **Permissions :** Pas de check `hasPermission` dans `getServerRevenue()` car :
   - Serveur peut voir son propre CA
   - Gérant/Promoteur peuvent voir CA de tous les serveurs
   - À gérer au niveau du composant UI

2. **Période par défaut :** Si `startDate` et `endDate` non fournis, retourne CA total depuis le début

3. **Retours non remboursés :** Ne sont PAS déduits du CA (correct métier)

4. **Consignations :** N'impactent PAS le CA (montant déjà dans la vente)

5. **Business Day :** Utiliser `getBusinessDay()` si besoin de filtrer par journée commerciale

---

## 🚀 Prochaines Étapes

- [ ] Créer composant `ServerDashboard` complet
- [ ] Ajouter statistiques comparatives (classement serveurs)
- [ ] Intégrer système de commissions
- [ ] Afficher évolution CA serveur (graphiques)
- [ ] Notifications si CA sous objectif

---

**Implémenté le:** 02/11/2025
**Testé:** ⏳ En attente
**Documenté dans:** [ANALYSE_IMPACT_RETOURS_SERVEURS.md](ANALYSE_IMPACT_RETOURS_SERVEURS.md)
