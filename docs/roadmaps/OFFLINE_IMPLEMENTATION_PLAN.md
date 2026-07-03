# 🚀 Plan d'Implémentation - Mode Offline Production

**Date :** 2026-02-05
**Version :** 1.0
**Estimation totale :** ~11h développement

---

## 📋 Architecture Finale

### Règles Métier

| Mode | État Connexion | Rôle | Comportement |
|------|----------------|------|--------------|
| **Complet** | Online | Tous | ✅ Normal |
| **Complet** | Offline | Tous | ❌ **BLOQUÉ** - Message : "Passez en Mode Simplifié" |
| **Simplifié** | Online | Tous | ✅ Normal |
| **Simplifié** | Offline | Gérant/Promoteur | ✅ **Queue locale** + Sync auto |
| **Simplifié** | Offline | Serveur | ❌ Bloqué (pas de compte actif en mode simplifié) |

### Stack Technique

```
┌─────────────────────────────────────────────────┐
│ NetworkManager (60s grace)                      │
│  └─ Détection réseau avec période de grâce      │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ OfflineBanner (adaptatif)                       │
│  └─ UX contextuelle selon mode + rôle           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ OfflineQueue (IndexedDB)                        │
│  └─ Persistence ventes + idempotency keys       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ SyncManager                                      │
│  └─ Sync automatique au retour online           │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Plan d'Implémentation

### **Phase 1 : Nettoyage (1h)**

**Objectif :** Supprimer le code legacy du mode secours

**Fichiers à modifier :**

#### 1.1 - BarContext.tsx
```typescript
// ❌ SUPPRIMER :
- forcedMode state
- updateForcedMode function
- OfflineStorage.getForcedMode() dans useState

// ✅ GARDER :
- operatingMode (config serveur uniquement)
- isSimplifiedMode
```

#### 1.2 - OfflineStorage.ts
```typescript
// ❌ SUPPRIMER :
- saveForcedMode()
- getForcedMode()
- removeForcedMode()
- hasForcedMode()
- FORCED_MODE key
```

#### 1.3 - SettingsPage.tsx
```typescript
// ❌ SUPPRIMER :
- Section "Mode Secours" (ligne ~485)
- handleToggleForceMode()
- Import WifiOff (si plus utilisé)
- isOffline state (si plus utilisé)
```

#### 1.4 - OfflineBanner.tsx
```typescript
// ❌ SUPPRIMER :
- forcedMode logic
- updateForcedMode calls
- État "réconciliation"

// ✅ GARDER :
- NetworkManager subscription
- Messages selon isSimplifiedMode
```

**Checklist :**
- [ ] Supprimer forcedMode de BarContext
- [ ] Supprimer méthodes OfflineStorage
- [ ] Supprimer section Mode Secours dans Settings
- [ ] Simplifier OfflineBanner
- [ ] Vérifier aucune référence à forcedMode (grep)
- [ ] Tests : App compile sans erreur

---

### **Phase 2 : NetworkManager avec Grace Period (1h)**

**Objectif :** Ajouter période de grâce 60s avant état 'offline'

#### 2.1 - Nouveau type NetworkStatus

**Fichier :** `src/types/sync.ts`

```typescript
export type NetworkStatus = 'online' | 'unstable' | 'offline' | 'checking';
```

#### 2.2 - Mise à jour NetworkManager

**Fichier :** `src/services/NetworkManager.ts`

```typescript
class NetworkManagerService {
  private gracePeriod = 60000; // 60 secondes
  private offlineTimer: number | null = null;

  private handleOffline = (): void => {
    console.log('[NetworkManager] Browser reports offline - Starting grace period');

    // État unstable pendant grace period
    this.updateStatus('unstable');

    // Timer : si toujours offline après 60s → vraiment offline
    this.offlineTimer = window.setTimeout(() => {
      console.log('[NetworkManager] Grace period expired - Now truly offline');
      this.updateStatus('offline');
    }, this.gracePeriod);
  };

  private handleOnline = (): void => {
    console.log('[NetworkManager] Browser reports online');

    // Annuler le timer si connexion revient
    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
      console.log('[NetworkManager] Grace period cancelled');
    }

    // Vérifier la connectivité réelle
    this.checkConnectivity();
  };

  // Cleanup du timer
  cleanup(): void {
    if (!this.isInitialized) return;

    if (this.offlineTimer !== null) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.stopPeriodicCheck();

    this.isInitialized = false;
  }

  // Helper : vérifier si unstable
  isUnstable(): boolean {
    return this.status === 'unstable';
  }
}
```

**Checklist :**
- [ ] Ajouter 'unstable' à NetworkStatus type
- [ ] Implémenter grace period 60s
- [ ] Ajouter isUnstable() helper
- [ ] Cleanup du timer
- [ ] Tests : Simuler offline 30s → doit rester 'unstable'
- [ ] Tests : Simuler offline 70s → doit passer 'offline'

---

### **Phase 3 : OfflineQueue Service (2h)**

**Objectif :** Service de queue locale avec IndexedDB

#### 3.1 - Créer le service

**Fichier :** `src/services/OfflineQueue.ts`

```typescript
import type { CreateSaleData, Sale } from './supabase/sales.service';

interface QueuedSale {
  id: string;
  data: CreateSaleData & { idempotency_key: string };
  timestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retries: number;
}

const DB_NAME = 'bartender_offline';
const DB_VERSION = 1;
const STORE_NAME = 'sales_queue';

class OfflineQueueService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialiser IndexedDB
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[OfflineQueue] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[OfflineQueue] Object store created');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ajouter une vente à la queue
   */
  async enqueue(data: CreateSaleData & { idempotency_key: string }): Promise<string> {
    await this.init();

    const queuedSale: QueuedSale = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data,
      timestamp: Date.now(),
      status: 'pending',
      retries: 0
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(queuedSale);

      request.onsuccess = () => {
        console.log('[OfflineQueue] Sale enqueued:', queuedSale.id);
        resolve(queuedSale.id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Récupérer toutes les ventes en attente
   */
  async getPending(): Promise<QueuedSale[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mettre à jour une vente dans la queue
   */
  async update(queuedSale: QueuedSale): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(queuedSale);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Supprimer une vente de la queue
   */
  async delete(id: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('[OfflineQueue] Sale deleted:', id);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Compter les ventes en attente
   */
  async count(): Promise<number> {
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * Récupérer toutes les ventes (tous statuts)
   */
  async getAll(): Promise<QueuedSale[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineQueue = new OfflineQueueService();
```

**Checklist :**
- [ ] Créer OfflineQueue service
- [ ] Implémenter IndexedDB (DB_NAME: bartender_offline)
- [ ] Méthodes : enqueue, getPending, update, delete, count
- [ ] Gestion erreurs IndexedDB
- [ ] Tests : Enqueue → getPending → update → delete

---

### **Phase 4 : Idempotency Keys (1.5h)**

**Objectif :** Ajouter colonne + logique serveur pour éviter doublons

#### 4.1 - Migration Supabase

**Fichier :** `supabase/migrations/YYYYMMDDHHMMSS_add_idempotency_key.sql`

```sql
-- Ajouter colonne idempotency_key à la table sales
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_sales_idempotency_key
ON public.sales(idempotency_key);

-- Commentaire
COMMENT ON COLUMN public.sales.idempotency_key IS
'Clé unique pour détecter les doublons (offline sync)';
```

#### 4.2 - Mise à jour RPC

**Fichier :** `supabase/migrations/YYYYMMDDHHMMSS_update_create_sale_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_sold_by UUID,
    p_server_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'pending',
    p_validated_by UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_business_date TEXT DEFAULT NULL,
    p_ticket_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL  -- NOUVEAU
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale public.sales;
    -- ... autres variables
BEGIN
    SET LOCAL row_security = off;

    -- ✨ DÉTECTER DOUBLON via idempotency_key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_sale
        FROM public.sales
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RAISE NOTICE 'Vente déjà existante (idempotency_key: %)', p_idempotency_key;
            RETURN v_sale;  -- Retourner vente existante
        END IF;
    END IF;

    -- ... logique création vente existante

    INSERT INTO public.sales (
        bar_id, items, total, payment_method, sold_by, server_id,
        status, validated_by, customer_name, customer_phone, notes,
        business_date, ticket_id, idempotency_key  -- NOUVEAU
    )
    VALUES (
        p_bar_id, v_items_with_promotions, v_total, p_payment_method,
        p_sold_by, p_server_id, p_status, p_validated_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date,
        p_ticket_id, p_idempotency_key  -- NOUVEAU
    )
    RETURNING * INTO v_sale;

    RETURN v_sale;
END;
$$;
```

#### 4.3 - Helper pour générer clés

**Fichier :** `src/utils/idempotencyKey.ts`

```typescript
import type { CreateSaleData } from '../services/supabase/sales.service';

/**
 * Générer une clé d'idempotence unique pour une vente
 * Format : barId_userId_timestamp_hash(items)
 */
export function generateIdempotencyKey(data: CreateSaleData): string {
  const timestamp = Date.now();

  // Hash simple des items pour unicité
  const itemsHash = hashItems(data.items);

  return `${data.bar_id}_${data.sold_by}_${timestamp}_${itemsHash}`;
}

/**
 * Hash simple des items pour détecter les ventes identiques
 */
function hashItems(items: any[]): string {
  const str = items
    .map(i => `${i.product_id}:${i.quantity}:${i.total_price}`)
    .sort()
    .join('|');

  // Hash simple (pas crypto, juste pour unicité)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}
```

**Checklist :**
- [ ] Créer migration add_idempotency_key
- [ ] Mettre à jour RPC create_sale_with_promotions
- [ ] Créer helper generateIdempotencyKey
- [ ] Tests : Créer 2x même vente → 1 seule en base

---

### **Phase 5 : SalesService avec Queue (1.5h)**

**Objectif :** Intercepter ventes offline et les enqueuer

#### 5.1 - Mise à jour SalesService

**Fichier :** `src/services/supabase/sales.service.ts`

```typescript
import { offlineQueue } from '../OfflineQueue';
import { networkManager } from '../NetworkManager';
import { generateIdempotencyKey } from '../../utils/idempotencyKey';

export class SalesService {
  /**
   * Créer une nouvelle vente
   * Avec support offline pour mode simplifié
   */
  static async createSale(data: CreateSaleData & { status?: 'pending' | 'validated' }): Promise<Sale> {
    try {
      const status = data.status || 'pending';

      // Vérifier si offline ET autorisé à travailler offline
      const canWorkOffline = this.canWorkOffline();

      if (networkManager.isOffline() && !canWorkOffline) {
        throw new Error(
          'Création de vente impossible hors ligne. ' +
          'Passez en Mode Simplifié ou rétablissez votre connexion.'
        );
      }

      // Générer idempotency key
      const idempotencyKey = generateIdempotencyKey(data);
      const saleData = { ...data, idempotency_key: idempotencyKey };

      // Si offline (et autorisé), enqueuer localement
      if (networkManager.isOffline()) {
        console.log('[SalesService] Offline mode - Enqueueing sale');

        const localId = await offlineQueue.enqueue(saleData);

        // Retourner un "sale" temporaire
        return {
          id: localId,
          bar_id: data.bar_id,
          items: data.items,
          total: data.items.reduce((sum, item) => sum + item.total_price, 0),
          payment_method: data.payment_method,
          status: 'pending_sync' as any, // Statut spécial
          sold_by: data.sold_by,
          server_id: data.server_id,
          created_at: new Date().toISOString(),
          business_date: data.business_date || new Date().toISOString().split('T')[0]
        } as Sale;
      }

      // Si online, création normale
      const { data: newSale, error: rpcError } = await supabase.rpc(
        'create_sale_with_promotions',
        {
          p_bar_id: data.bar_id,
          p_items: data.items,
          p_payment_method: data.payment_method,
          p_sold_by: data.sold_by,
          p_server_id: data.server_id || null,
          p_status: status,
          p_validated_by: data.validated_by || null,
          p_customer_name: data.customer_name || null,
          p_customer_phone: data.customer_phone || null,
          p_notes: data.notes || null,
          p_business_date: data.business_date || null,
          p_ticket_id: data.ticket_id || null,
          p_idempotency_key: idempotencyKey
        }
      ).single();

      if (rpcError) {
        throw new Error(`Erreur lors de la création de la vente: ${rpcError.message}`);
      }

      if (!newSale) {
        throw new Error('Erreur lors de la création de la vente: aucune donnée retournée');
      }

      return newSale;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Vérifier si l'utilisateur peut travailler offline
   */
  private static canWorkOffline(): boolean {
    // Importer depuis les contexts
    const barContext = useBarContext();
    const authContext = useAuth();

    // Mode simplifié + Gérant/Promoteur
    return (
      barContext.isSimplifiedMode &&
      ['gerant', 'promoteur'].includes(authContext.currentSession?.role || '')
    );
  }
}
```

**Note :** Le `canWorkOffline()` nécessite l'accès aux contexts. Alternative :

```typescript
// Dans AppContext ou créer un helper
export function canWorkOffline(
  isSimplifiedMode: boolean,
  role: UserRole | null
): boolean {
  return isSimplifiedMode && ['gerant', 'promoteur'].includes(role || '');
}
```

**Checklist :**
- [ ] Importer offlineQueue, networkManager, generateIdempotencyKey
- [ ] Modifier createSale pour gérer offline
- [ ] Helper canWorkOffline()
- [ ] Retourner sale temporaire si offline
- [ ] Tests : Mode simplifié offline → Enqueue OK
- [ ] Tests : Mode complet offline → Erreur

---

### **Phase 6 : SyncManager (1h)**

**Objectif :** Sync automatique au retour de connexion

#### 6.1 - Créer SyncManager

**Fichier :** `src/services/SyncManager.ts`

```typescript
import { offlineQueue } from './OfflineQueue';
import { networkManager } from './NetworkManager';
import { SalesService } from './supabase/sales.service';
import { supabase } from '../lib/supabase';

class SyncManagerService {
  private isSyncing = false;
  private listeners: Set<(count: number) => void> = new Set();

  /**
   * Initialiser le sync automatique
   */
  init(): void {
    // Écouter le retour de connexion
    networkManager.subscribe((status) => {
      if (status === 'online' && !this.isSyncing) {
        this.syncPendingSales();
      }
    });

    console.log('[SyncManager] Initialized');
  }

  /**
   * Synchroniser toutes les ventes en attente
   */
  async syncPendingSales(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress');
      return;
    }

    this.isSyncing = true;
    console.log('[SyncManager] Starting sync...');

    try {
      const pending = await offlineQueue.getPending();

      if (pending.length === 0) {
        console.log('[SyncManager] No pending sales');
        return;
      }

      console.log(`[SyncManager] Syncing ${pending.length} sale(s)...`);

      let successCount = 0;
      let failureCount = 0;

      for (const queuedSale of pending) {
        try {
          // Marquer comme en cours de sync
          queuedSale.status = 'syncing';
          await offlineQueue.update(queuedSale);

          // Créer la vente sur le serveur via RPC direct
          const { data, error } = await supabase.rpc(
            'create_sale_with_promotions',
            {
              p_bar_id: queuedSale.data.bar_id,
              p_items: queuedSale.data.items,
              p_payment_method: queuedSale.data.payment_method,
              p_sold_by: queuedSale.data.sold_by,
              p_server_id: queuedSale.data.server_id || null,
              p_status: queuedSale.data.status || 'validated',
              p_validated_by: queuedSale.data.validated_by || null,
              p_customer_name: queuedSale.data.customer_name || null,
              p_customer_phone: queuedSale.data.customer_phone || null,
              p_notes: queuedSale.data.notes || null,
              p_business_date: queuedSale.data.business_date || null,
              p_ticket_id: queuedSale.data.ticket_id || null,
              p_idempotency_key: queuedSale.data.idempotency_key
            }
          ).single();

          if (error) throw error;

          // Succès : supprimer de la queue
          await offlineQueue.delete(queuedSale.id);
          successCount++;

          console.log(`[SyncManager] Sale synced: ${queuedSale.id}`);
        } catch (error) {
          console.error(`[SyncManager] Failed to sync sale ${queuedSale.id}:`, error);

          // Incrémenter compteur de retry
          queuedSale.retries++;
          queuedSale.status = queuedSale.retries >= 3 ? 'failed' : 'pending';
          await offlineQueue.update(queuedSale);

          failureCount++;
        }
      }

      console.log(`[SyncManager] Sync complete: ${successCount} success, ${failureCount} failed`);

      // Notifier les listeners
      const remaining = await offlineQueue.count();
      this.notifyListeners(remaining);

    } catch (error) {
      console.error('[SyncManager] Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Forcer un sync manuel
   */
  async forceSyncattente(): Promise<void> {
    if (!networkManager.isOnline()) {
      throw new Error('Connexion Internet requise pour synchroniser');
    }

    await this.syncPendingSales();
  }

  /**
   * S'abonner aux changements de compteur
   */
  subscribe(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifier les listeners
   */
  private notifyListeners(count: number): void {
    this.listeners.forEach(listener => listener(count));
  }
}

export const syncManager = new SyncManagerService();
```

#### 6.2 - Initialiser dans App

**Fichier :** `src/App.tsx` ou `src/layouts/RootLayout.tsx`

```typescript
import { syncManager } from './services/SyncManager';

function App() {
  useEffect(() => {
    // Initialiser le sync manager
    syncManager.init();
  }, []);

  // ... rest
}
```

**Checklist :**
- [ ] Créer SyncManager service
- [ ] Méthode syncPendingSales avec retry logic
- [ ] Subscribe à NetworkManager
- [ ] Initialiser dans App.tsx
- [ ] Tests : Enqueue 3 ventes → Online → Sync auto

---

### **Phase 7 : UX Offline (1.5h)**

**Objectif :** Banner adaptatif + Dashboard ventes en attente

#### 7.1 - Mise à jour OfflineBanner

**Fichier :** `src/components/OfflineBanner.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { WifiOff, X, Loader2 } from 'lucide-react';
import { networkManager } from '../services/NetworkManager';
import { offlineQueue } from '../services/OfflineQueue';
import { syncManager } from '../services/SyncManager';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';

export const OfflineBanner: React.FC = () => {
    const [status, setStatus] = useState(networkManager.getStatus());
    const [pendingCount, setPendingCount] = useState(0);
    const [isVisible, setIsVisible] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const { isSimplifiedMode } = useBarContext();
    const { currentSession } = useAuth();

    const role = currentSession?.role;
    const canWorkOffline = isSimplifiedMode && ['gerant', 'promoteur'].includes(role || '');

    // Subscribe à NetworkManager
    useEffect(() => {
        const unsubscribe = networkManager.subscribe((newStatus) => {
            setStatus(newStatus);
            if (newStatus === 'offline' || newStatus === 'unstable') {
                setIsVisible(true);
            }
        });
        return unsubscribe;
    }, []);

    // Update pending count
    useEffect(() => {
        const updateCount = async () => {
            const count = await offlineQueue.count();
            setPendingCount(count);
        };

        updateCount();
        const interval = setInterval(updateCount, 5000);

        // Subscribe aux changements de sync
        const unsubscribe = syncManager.subscribe((count) => {
            setPendingCount(count);
        });

        return () => {
            clearInterval(interval);
            unsubscribe();
        };
    }, []);

    // Forcer sync manuel
    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            await syncManager.forceSync();
        } catch (error) {
            console.error('Force sync error:', error);
        } finally {
            setIsSyncing(false);
        }
    };

    // Ne rien afficher si online et pas de ventes en attente
    if (status === 'online' && pendingCount === 0) return null;
    if (!isVisible) return null;

    // Couleur selon l'état
    const bgColor =
        status === 'unstable' ? 'bg-orange-500' :
        status === 'offline' && canWorkOffline ? 'bg-blue-600' :
        'bg-red-600';

    return (
        <div className={`${bgColor} text-white px-4 py-3 shadow-lg relative z-[9999] transition-colors duration-300`}>
            <div className="container mx-auto flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="text-sm font-medium">
                        {/* Status Unstable */}
                        {status === 'unstable' && (
                            <>
                                <p className="font-bold mb-1">🔄 Connexion instable</p>
                                <p className="text-xs">Vérification en cours...</p>
                            </>
                        )}

                        {/* Status Offline - Mode Simplifié autorisé */}
                        {status === 'offline' && canWorkOffline && (
                            <>
                                <p className="font-bold mb-1">ℹ️ Mode Hors Ligne</p>
                                <p>
                                    Vous pouvez continuer à encaisser.
                                    {pendingCount > 0 && (
                                        <span className="font-bold"> {pendingCount} vente{pendingCount > 1 ? 's' : ''} en attente de synchronisation.</span>
                                    )}
                                </p>
                                <p className="text-xs mt-1">Les ventes seront synchronisées au retour de la connexion.</p>
                            </>
                        )}

                        {/* Status Offline - Mode Complet ou Serveur */}
                        {status === 'offline' && !canWorkOffline && (
                            <>
                                <p className="font-bold mb-1">⚠️ Connexion Perdue</p>
                                <p>
                                    {isSimplifiedMode ? (
                                        <>Rétablissez votre connexion Internet pour continuer.</>
                                    ) : (
                                        <>
                                            L'application nécessite Internet en mode complet.
                                            Rétablissez votre connexion ou demandez au Gérant de passer en
                                            <span className="font-bold"> Mode Simplifié</span> (Paramètres).
                                        </>
                                    )}
                                </p>
                            </>
                        )}

                        {/* Status Online avec ventes en attente */}
                        {status === 'online' && pendingCount > 0 && (
                            <>
                                <p className="font-bold mb-1 text-green-100">✅ Connexion Rétablie</p>
                                <div className="flex items-center gap-3">
                                    <p>
                                        <span className="font-bold">{pendingCount} vente{pendingCount > 1 ? 's' : ''}</span> en attente de synchronisation.
                                    </p>
                                    <button
                                        onClick={handleForceSync}
                                        disabled={isSyncing}
                                        className="bg-white text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {isSyncing ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Sync...
                                            </>
                                        ) : (
                                            'Synchroniser Maintenant'
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    className="text-white/80 hover:text-white transition-colors p-1"
                    aria-label="Fermer"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};
```

#### 7.2 - Dashboard Ventes en Attente

**Fichier :** `src/components/dashboard/PendingSalesCard.tsx`

```typescript
import { useEffect, useState } from 'react';
import { offlineQueue } from '../../services/OfflineQueue';
import { syncManager } from '../../services/SyncManager';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';

interface QueuedSale {
  id: string;
  data: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retries: number;
}

export function PendingSalesCard() {
  const [sales, setSales] = useState<QueuedSale[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { formatPrice } = useCurrencyFormatter();

  const loadSales = async () => {
    const pending = await offlineQueue.getAll();
    setSales(pending.filter(s => s.status === 'pending' || s.status === 'failed'));
  };

  useEffect(() => {
    loadSales();
    const interval = setInterval(loadSales, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncManager.forceSync();
      await loadSales();
    } finally {
      setIsSyncing(false);
    }
  };

  if (sales.length === 0) return null;

  const totalAmount = sales.reduce((sum, s) =>
    sum + s.data.items.reduce((itemSum: number, i: any) => itemSum + i.total_price, 0),
    0
  );

  return (
    <Card className="bg-amber-50 border-amber-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-amber-900">
            Ventes en Attente de Synchronisation
          </h3>
          <p className="text-xs text-amber-700 mt-1">
            {sales.length} vente{sales.length > 1 ? 's' : ''} • {formatPrice(totalAmount)}
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={isSyncing}
          variant="secondary"
          size="sm"
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          {isSyncing ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1" />
              Sync...
            </>
          ) : (
            <>
              <RefreshCw size={14} className="mr-1" />
              Synchroniser
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {sales.map(sale => {
          const saleTotal = sale.data.items.reduce((sum: number, i: any) => sum + i.total_price, 0);
          const itemsSummary = sale.data.items
            .map((i: any) => `${i.quantity}x ${i.product_name}`)
            .join(', ');

          return (
            <div
              key={sale.id}
              className="bg-white rounded-lg p-3 border border-amber-200"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">
                  {new Date(sale.timestamp).toLocaleString('fr-FR')}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  sale.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {sale.status === 'failed' ? `Échec (${sale.retries} retries)` : 'En attente'}
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate">{itemsSummary}</p>
              <p className="text-sm font-bold text-gray-900 mt-1">{formatPrice(saleTotal)}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

#### 7.3 - Bloquer actions en mode complet offline

**Fichier :** `src/components/cart/CartFooter.tsx`

```typescript
const { isSimplifiedMode } = useBarContext();
const { currentSession } = useAuth();
const [networkStatus, setNetworkStatus] = useState(networkManager.getStatus());

useEffect(() => {
  const unsubscribe = networkManager.subscribe(setNetworkStatus);
  return unsubscribe;
}, []);

const isOffline = networkStatus === 'offline';
const canWorkOffline = isSimplifiedMode && ['gerant', 'promoteur'].includes(currentSession?.role || '');
const isBlocked = isOffline && !canWorkOffline;

// Dans le render
{isBlocked && (
  <Alert variant="error" className="mb-2">
    ⚠️ Connexion Internet requise en Mode Complet.
    {currentSession?.role === 'serveur' ? (
      <p className="text-xs mt-1">Demandez au Gérant de passer en Mode Simplifié (Paramètres).</p>
    ) : (
      <p className="text-xs mt-1">Rétablissez votre connexion ou passez en Mode Simplifié.</p>
    )}
  </Alert>
)}

<Button
  onClick={handleCheckout}
  disabled={isBlocked || !hasItems || isLoading}
>
  {isBlocked ? 'Connexion Requise' : 'Valider la Vente'}
</Button>
```

**Checklist :**
- [ ] Mettre à jour OfflineBanner (états adaptatifs)
- [ ] Créer PendingSalesCard (dashboard)
- [ ] Bloquer boutons en mode complet offline
- [ ] Tests UX : Tous les états affichent le bon message

---

### **Phase 8 : Tests & Validation (2h)**

**Objectif :** Tester tous les scénarios offline

#### 8.1 - Scénarios de Test

**Test 1 : Mode Complet Offline**
```
1. Se connecter en mode complet (serveur)
2. Désactiver WiFi
3. Attendre 60s
4. ✅ Banner rouge "Connexion Perdue"
5. ✅ Bouton "Valider" désactivé
6. ✅ Message clair selon rôle
```

**Test 2 : Mode Simplifié Offline (Gérant)**
```
1. Passer en mode simplifié (gérant)
2. Désactiver WiFi
3. Attendre 60s
4. ✅ Banner bleu "Mode Hors Ligne"
5. Créer 3 ventes
6. ✅ Ventes en queue (IndexedDB)
7. ✅ Badge "X ventes en attente"
8. Réactiver WiFi
9. ✅ Sync automatique
10. ✅ Ventes en base Supabase
```

**Test 3 : Grace Period**
```
1. Désactiver WiFi
2. ✅ État 'unstable' pendant 60s
3. ✅ Banner orange discret
4. ✅ Actions autorisées pendant grace period
5. Après 60s : ✅ État 'offline', banner rouge
```

**Test 4 : Idempotency**
```
1. Mode simplifié offline
2. Créer vente A
3. Simuler: Créer 2x vente A (même items, même timestamp)
4. Sync
5. ✅ Une seule vente en base (détection doublon)
```

**Test 5 : Retry Failed**
```
1. Mode simplifié offline
2. Créer vente
3. Modifier le RPC pour forcer erreur
4. Sync
5. ✅ Vente en status 'failed'
6. ✅ Compteur retries incrémenté
7. Corriger le RPC
8. Forcer sync manuel
9. ✅ Vente synchronisée
```

**Test 6 : Dashboard Ventes en Attente**
```
1. Mode simplifié offline
2. Créer 5 ventes
3. ✅ PendingSalesCard affiche 5 ventes
4. ✅ Total correct
5. Cliquer "Synchroniser"
6. ✅ Sync manuel OK
7. ✅ Card disparaît
```

#### 8.2 - Tests Automatisés (Optionnel)

**Fichier :** `src/services/__tests__/OfflineQueue.test.ts`

```typescript
import { offlineQueue } from '../OfflineQueue';

describe('OfflineQueue', () => {
  beforeEach(async () => {
    await offlineQueue.init();
  });

  it('should enqueue a sale', async () => {
    const saleData = { /* mock data */ };
    const id = await offlineQueue.enqueue(saleData);

    expect(id).toBeDefined();
    expect(id).toMatch(/^offline_/);
  });

  it('should retrieve pending sales', async () => {
    await offlineQueue.enqueue({ /* mock 1 */ });
    await offlineQueue.enqueue({ /* mock 2 */ });

    const pending = await offlineQueue.getPending();

    expect(pending).toHaveLength(2);
  });

  it('should update sale status', async () => {
    const id = await offlineQueue.enqueue({ /* mock */ });
    const sale = (await offlineQueue.getPending())[0];

    sale.status = 'syncing';
    await offlineQueue.update(sale);

    const pending = await offlineQueue.getPending();
    expect(pending).toHaveLength(0); // Plus pending
  });
});
```

**Checklist :**
- [ ] Test mode complet offline (bloqué)
- [ ] Test mode simplifié offline (queue OK)
- [ ] Test grace period 60s
- [ ] Test idempotency (pas de doublon)
- [ ] Test retry failed sales
- [ ] Test dashboard ventes en attente
- [ ] Tests automatisés (optionnel)

---

## ✅ Checklist Globale

### Phase 1 - Nettoyage
- [ ] Supprimer forcedMode de BarContext
- [ ] Supprimer OfflineStorage legacy
- [ ] Supprimer section Mode Secours dans Settings
- [ ] Simplifier OfflineBanner
- [ ] Vérifier grep: aucune référence forcedMode

### Phase 2 - NetworkManager
- [ ] Ajouter type 'unstable' à NetworkStatus
- [ ] Implémenter grace period 60s
- [ ] Helper isUnstable()
- [ ] Cleanup timer
- [ ] Tests grace period

### Phase 3 - OfflineQueue
- [ ] Service IndexedDB complet
- [ ] Méthodes CRUD (enqueue, get, update, delete)
- [ ] Tests queue locale

### Phase 4 - Idempotency
- [ ] Migration add_idempotency_key
- [ ] Update RPC avec détection doublon
- [ ] Helper generateIdempotencyKey
- [ ] Tests doublon

### Phase 5 - SalesService
- [ ] Intercepter ventes offline
- [ ] Enqueuer si autorisé
- [ ] Erreur si non autorisé
- [ ] Tests création offline

### Phase 6 - SyncManager
- [ ] Service sync complet
- [ ] Subscribe NetworkManager
- [ ] Retry logic (max 3)
- [ ] Init dans App.tsx
- [ ] Tests sync auto

### Phase 7 - UX
- [ ] Banner adaptatif (3 états)
- [ ] PendingSalesCard dashboard
- [ ] Bloquer boutons en mode complet
- [ ] Tests UX

### Phase 8 - Tests
- [ ] Test E2E tous scénarios
- [ ] Test idempotency
- [ ] Test grace period
- [ ] Test retry

---

## 🚀 Déploiement

### Pre-Deploy Checklist

- [ ] Tous les tests passent
- [ ] Migration Supabase appliquée en staging
- [ ] IndexedDB testé sur Safari/Chrome/Firefox
- [ ] Banner testé sur mobile
- [ ] Documentation utilisateur (FAQ offline)

### Deploy Strategy

1. **Staging** : Déployer + tester 48h
2. **Canary** : 10% utilisateurs pendant 24h
3. **Production** : Rollout progressif

### Rollback Plan

Si problème critique :
```bash
# Rollback migration idempotency_key
supabase db reset

# Redéployer version précédente app
git revert <commit>
```

---

## 📚 Documentation Utilisateur

### FAQ Offline

**Q : Puis-je encaisser hors ligne ?**
R : Oui, si vous êtes en Mode Simplifié et connecté en tant que Gérant ou Promoteur.

**Q : Mes ventes sont-elles sauvegardées ?**
R : Oui, elles sont stockées localement et synchronisées automatiquement au retour de la connexion.

**Q : Que se passe-t-il si la sync échoue ?**
R : L'app retente automatiquement. Si 3 échecs, vous êtes notifié pour une intervention manuelle.

**Q : En mode complet, puis-je travailler offline ?**
R : Non, passez en Mode Simplifié (Paramètres > Opérationnel) avant la perte de connexion.

---

## 🎯 Résumé

**Temps estimé total :** ~11h

**Complexité :** Moyenne (IndexedDB, RPC, Sync)

**Risques maîtrisés :**
- Doublons : Idempotency keys
- Perte données : Queue locale + retry
- UX confuse : Banner adaptatif

**ROI :** Excellent pour app en production dans zones à connectivité instable.

---

**Auteur :** Expert Dev Senior
**Date :** 2026-02-05
**Version :** 1.0 - Production Ready
