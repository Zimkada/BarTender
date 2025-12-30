# 🔍 Diagnostic - Vente Lente (30+ secondes)

## Informations à Collecter

### 1. Console DevTools (F12)
Cherche ces messages pendant la vente:

```javascript
// Doit apparaître IMMÉDIATEMENT au clic
[useSales] Creating sale...

// Si > 5s, problème réseau/Supabase
Supabase RPC: create_sale_with_promotions - START

// Doit apparaître < 1s après START
Supabase RPC: create_sale_with_promotions - SUCCESS
```

**Question**: Quel délai entre START et SUCCESS?

### 2. Network Tab (DevTools > Network)
Filtre: `rpc/create_sale`

**Vérifier**:
- **Status**: 200 OK ou erreur?
- **Time**: Combien de ms?
- **Initiator**: D'où vient l'appel?
- **Preview**: Contenu de la réponse

**Si Time > 5000ms**: Problème côté Supabase (verrou SQL ou timeout)

### 3. Erreurs Console
Cherche:
```
ERR_INSUFFICIENT_RESOURCES
InvalidStateError
ERR_CERT_VERIFIER_CHANGED
Failed to fetch
```

### 4. IndexedDB (DevTools > Application > Storage)
**Vérifier**:
- IndexedDB vidée? (Doit être vide après nettoyage)
- Taille des DB si présentes

---

## Causes Possibles

### Cause 1: IndexedDB Non Vidée ❌
**Symptômes**: Erreur `InvalidStateError` dans console
**Solution**:
1. F12 > Application > Storage > IndexedDB
2. Clic droit sur chaque DB → Delete
3. Ctrl+Shift+Suppr → Effacer cache
4. Redémarrer navigateur

### Cause 2: Verrou SQL Supabase (SELECT FOR UPDATE) 🔒
**Symptômes**:
- Network: `create_sale_with_promotions` prend 20-30s
- Pas d'erreur, juste lent
- Console: Long délai entre START et SUCCESS

**Explication**:
Si plusieurs onglets/utilisateurs vendent en même temps, le RPC `create_sale_with_promotions` utilise `SELECT FOR UPDATE` pour verrouiller les produits. Si une transaction est bloquée (timeout, erreur réseau), les suivantes attendent.

**Solution**:
1. Ferme TOUS les onglets de l'app (sauf 1)
2. Vide IndexedDB
3. Réessaye vente

### Cause 3: Connexion Lente/Instable 📡
**Symptômes**:
- Network: Beaucoup de requêtes "pending" longtemps
- Console: Erreurs `Failed to fetch` intermittentes

**Test**:
```bash
# Dans terminal
ping yekomwjdznvtnialpdcz.supabase.co
```

**Si ping > 200ms ou packet loss**: Problème réseau

### Cause 4: Quota Supabase Saturé 💥
**Symptômes**:
- Erreur 429 (Too Many Requests)
- Erreur "quota exceeded"

**Vérification**: Dashboard Supabase > Settings > Usage

**Solution**: Attendre que quota se réinitialise (ou upgrade plan)

### Cause 5: Trop de Transactions Simultanées en Base 🔄
**Symptômes**:
- Toutes les opérations lentes (pas juste ventes)
- Supabase Dashboard > Database > Connections élevé

**Solution**:
Redémarrer Supabase Database (Dashboard > Settings > Database > Restart)

---

## Tests à Faire

### Test 1: Vente Simple (1 produit)
```
1. Ouvrir 1 SEUL onglet
2. Vider IndexedDB
3. F12 > Console clear
4. F12 > Network > Clear
5. Créer vente 1 produit
6. Noter le temps
```

**Temps attendu**: < 2 secondes

### Test 2: Vérifier Polling Désactivé
```javascript
// Dans console DevTools, taper:
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('supabase'))
  .filter(r => r.name.includes('get_bar_members') || r.name.includes('returns'))
  .length
```

**Résultat attendu**: 0 ou 1 (pas de polling répété)

### Test 3: Isoler le Problème
```
1. Ouvrir Incognito (Ctrl+Shift+N)
2. Se connecter
3. Créer vente
```

**Si rapide en incognito**: Cache/IndexedDB corrompu dans profil normal

---

## Prochaines Étapes Selon Résultat

### Si < 2s après nettoyage ✅
→ Problème résolu! C'était IndexedDB saturée

### Si 5-10s après nettoyage ⚠️
→ Problème réseau ou Supabase lent
→ Vérifier ping + Dashboard Supabase

### Si 20-30s même après nettoyage ❌
→ Verrou SQL Supabase bloqué
→ Actions:
1. Vérifier Dashboard Supabase > Database > Active Queries
2. Tuer les transactions longues
3. Ajouter timeout au RPC

### Si erreur console ❌
→ Copier l'erreur exacte et me la transmettre

---

## Commandes Rapides

### Vider Cache Complet
```
Ctrl+Shift+Suppr → Tout cocher → Depuis le début → Effacer
```

### Redémarrer Navigateur Propre
```
Fermer tous les onglets
Fermer navigateur
Rouvrir navigateur
```

### Tester en Mode Incognito
```
Ctrl+Shift+N → Ouvrir app
```
