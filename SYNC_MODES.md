# 🔄 Modes de Synchronisation

> Guide des modes de fonctionnement offline/online de BarTender Pro

---

## 📋 Vue d'ensemble

BarTender Pro supporte **2 modes de synchronisation** configurables via `.env` :

| Mode | Description | Usage | Backend requis |
|------|-------------|-------|----------------|
| **MOCK** | Simulation locale | Développement & tests | ❌ Non |
| **SUPABASE** | Sync cloud réelle | Production | ✅ Oui |

---

## 🛠️ Configuration

### **Mode MOCK (Développement local)**

Créez `.env.local` :

```bash
# Mode localStorage uniquement (pas de backend)
VITE_USE_SUPABASE=false

# Optionnel: Intervalle de sync (ms)
VITE_SYNC_INTERVAL=5000

# Optionnel: Activer logs debug
VITE_SYNC_DEBUG=true
```

**Comportement :**
- ✅ Toutes les mutations sont enregistrées dans `localStorage`
- ✅ SyncQueue accumule les opérations
- ✅ ApiClient simule des succès (95% taux réussite)
- ✅ Retry automatique sur échecs simulés (5%)
- ❌ Aucune requête HTTP réelle

**Avantages :**
- Développement sans backend
- Tests de retry/erreurs
- Simulation latence réseau (50-200ms)
- Autonomie complète offline

---

### **Mode SUPABASE (Production)**

Créez `.env.production` :

```bash
# Activer Supabase (sync cloud)
VITE_USE_SUPABASE=true

# Credentials Supabase (obtenir de votre projet)
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_KEY=votre-anon-key-ici

# Intervalle de sync (5 secondes)
VITE_SYNC_INTERVAL=5000

# Nombre de tentatives retry
VITE_SYNC_MAX_RETRIES=5

# Désactiver logs debug en production
VITE_SYNC_DEBUG=false
```

**Comportement :**
- ✅ Mutations locales + enqueue pour sync
- ✅ Requêtes HTTP réelles vers Supabase
- ✅ Retry automatique avec exponential backoff
- ✅ Sync automatique au retour online
- ✅ Multi-tenant isolé par `barId`

**Avantages :**
- Synchronisation cloud
- Accès multi-appareils
- Backup automatique
- Collaboration équipe

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER ACTION                          │
│        (addSale, addProduct, createConsignment, etc.)   │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              OPTIMISTIC UPDATE                          │
│         (localStorage immédiat - UX fluide)             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│               SYNC QUEUE                                │
│          (FIFO - enqueue operation)                     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│             SYNC HANDLER                                │
│      (Auto-processing toutes les 5s)                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              API CLIENT                                 │
│    (Mode automatique: MOCK ou SUPABASE)                 │
└─────────────┬───────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌─────────┐      ┌─────────────┐
│  MOCK   │      │  SUPABASE   │
│ (95% ✅)│      │  (HTTP RPC) │
└─────────┘      └─────────────┘
```

---

## 🔍 Détection automatique du mode

L'application détecte automatiquement le mode au démarrage :

```typescript
// Dans sync.config.ts
export function isSupabaseEnabled(): boolean {
  return SYNC_CONFIG.ENABLE_SUPABASE &&
         Boolean(SYNC_CONFIG.SUPABASE_URL) &&
         Boolean(SYNC_CONFIG.SUPABASE_KEY);
}
```

**Si Supabase activé ET configuré → Mode SUPABASE**
**Sinon → Mode MOCK**

---

## 🧪 Mode MOCK - Détails

### **Simulation des réponses**

```typescript
// Dans ApiClient.ts
private async mockSync(operation: SyncOperation): Promise<ApiResponse> {
  // Simuler latence réseau (50-200ms)
  const delay = 50 + Math.random() * 150;
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simuler taux d'échec de 5% (pour tester retry)
  const failureRate = 0.05;
  const shouldFail = Math.random() < failureRate;

  if (shouldFail) {
    return { success: false, error: 'Mock: Simulated network error' };
  }

  return {
    success: true,
    data: {
      id: operation.payload.id,
      synced_at: new Date().toISOString(),
    },
  };
}
```

### **Cas d'usage**

✅ **Développement local sans backend**
```bash
npm run dev  # Mode MOCK automatique
```

✅ **Tests de l'UI offline**
- Créer des ventes, produits, consignations
- Vérifier accumulation dans la queue
- Observer retry automatique (5% échecs)

✅ **Tests de résilience**
- Simuler perte réseau
- Vérifier optimistic updates
- Valider rollback sur erreurs

---

## 🚀 Mode SUPABASE - Détails

### **Endpoints RPC**

Tous les appels utilisent des **RPC functions** Supabase :

```typescript
// Exemples d'endpoints
POST /rpc/create_sale       { sale, bar_id }
POST /rpc/update_product    { product_id, updates, bar_id }
POST /rpc/add_expense       { expense, bar_id }
POST /rpc/claim_consignment { consignment_id, claimed_by, bar_id }
// ... etc (12 endpoints au total)
```

### **Sécurité RLS (Row Level Security)**

Chaque RPC function vérifie :
- ✅ Authentification utilisateur
- ✅ Appartenance au bar (`barId` match)
- ✅ Permissions rôle (promoteur/gérant/serveur)

**Exemple politique RLS :**
```sql
CREATE POLICY "Users can only access their bar data"
ON sales FOR ALL
USING (bar_id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid()
));
```

### **Retry avec Exponential Backoff**

```typescript
// Dans SyncHandler.ts
const backoffMs = Math.min(
  1000 * Math.pow(2, operation.retryCount),  // 1s, 2s, 4s, 8s, 16s
  30000  // Max 30 secondes
);

await this.delay(backoffMs);
```

**Tentatives :**
1. Immédiate
2. +1s
3. +2s
4. +4s
5. +8s
6. ❌ Abandon (notification erreur)

---

## 📊 Monitoring

### **Console logs (mode DEBUG)**

```javascript
// Activer dans .env
VITE_SYNC_DEBUG=true
```

**Logs MOCK :**
```
[ApiClient] Initialized: { enabled: false, mode: 'MOCK' }
[ApiClient] ✅ MOCK SUCCESS: CREATE_SALE { id: 'sale_123', total: 5000 }
[SyncHandler] Operation synced successfully: op_456
```

**Logs SUPABASE :**
```
[ApiClient] Initialized: { enabled: true, mode: 'SUPABASE' }
[ApiClient] POST: https://xxx.supabase.co/rpc/create_sale
[ApiClient] Response: { success: true, data: {...} }
```

### **Stats de sync**

```typescript
// Dans DevTools console
syncHandler.getStats()
// {
//   isProcessing: false,
//   queueStats: { pending: 3, syncing: 0, success: 127, error: 2 }
// }
```

---

## 🔄 Migration MOCK → SUPABASE

**Étapes pour passer en production :**

1. **Setup projet Supabase**
   - Créer compte sur https://supabase.com
   - Nouveau projet → Obtenir URL + API Key

2. **Créer schéma PostgreSQL**
   - Tables: bars, sales, products, returns, expenses, etc.
   - RLS policies par `bar_id`
   - RPC functions pour chaque mutation

3. **Configurer `.env.production`**
   ```bash
   VITE_USE_SUPABASE=true
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_KEY=eyJ...
   ```

4. **Build & Deploy**
   ```bash
   npm run build
   # Déployer sur Vercel/Netlify/etc.
   ```

5. **Validation**
   - Tester sync online/offline
   - Vérifier isolation multi-tenant
   - Valider retry sur erreurs réseau

---

## 🎯 Résumé

| Critère | MOCK | SUPABASE |
|---------|------|----------|
| **Backend requis** | ❌ Non | ✅ Oui |
| **Sync cloud** | ❌ Non | ✅ Oui |
| **Multi-appareils** | ❌ Non | ✅ Oui |
| **Offline-first** | ✅ Oui | ✅ Oui |
| **Retry auto** | ✅ Oui (95% success) | ✅ Oui (exponential backoff) |
| **Tests locaux** | ✅ Parfait | ⚠️ Nécessite backend |
| **Production** | ❌ Non recommandé | ✅ Recommandé |

---

**Dernière mise à jour : Novembre 2025 - Phase 2 Infrastructure Sync**
