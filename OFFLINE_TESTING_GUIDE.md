# Guide de Test - Mode Offline

## Objectif
Valider le fonctionnement complet du mode offline pour garantir:
- Aucune perte de vente en cas de coupure réseau
- Synchronisation automatique fiable au retour de connexion
- Prévention des doublons via idempotency keys
- UX claire pour les utilisateurs

---

## Prérequis

### Configuration Test
1. **Bar en Mode Simplifié** (`operatingMode: 'simplified'`)
2. **Rôles requis:**
   - Gérant ou Promoteur (peut travailler offline)
   - Serveur (bloqué offline)

### Outils DevTools
- **Network Throttling**: Chrome DevTools > Network > Offline
- **IndexedDB Inspector**: Chrome DevTools > Application > IndexedDB > `bartender_offline_queue`
- **Console Logs**: Filtrer par `[NetworkManager]`, `[OfflineQueue]`, `[SyncManager]`, `[SalesService]`

---

## Scénarios de Test

### 1. Grace Period (60s) - Transitions Réseau

#### Test 1.1: Coupure courte < 60s
**Objectif**: Vérifier que la grace period évite les faux positifs

**Steps:**
1. Connexion stable, ouvrir l'app comme Gérant
2. DevTools > Network > Offline
3. **Vérifier**: Banner affiche état "unstable" (non bloquant)
4. Attendre 30 secondes
5. DevTools > Network > Online
6. **Résultat attendu:**
   - Aucun passage en mode offline
   - Banner disparaît
   - Aucune queue créée
   - Console: `[NetworkManager] Grace period cancelled, connection restored`

#### Test 1.2: Coupure longue > 60s
**Objectif**: Vérifier passage en offline après grace period

**Steps:**
1. Connexion stable, ouvrir l'app comme Gérant
2. DevTools > Network > Offline
3. Attendre 65 secondes
4. **Résultat attendu:**
   - 0-60s: Banner unstable
   - 60s+: Banner bleu "Mode Hors Ligne"
   - Console: `[NetworkManager] Grace period elapsed, now truly offline`

---

### 2. Ventes Offline - Gérant/Promoteur

#### Test 2.1: Vente offline normale
**Objectif**: Créer vente offline et vérifier queue

**Steps:**
1. Mode Simplifié, connecté comme Gérant
2. DevTools > Network > Offline
3. Attendre 65s (grace period)
4. Créer une vente: 2x Bière (1000 FCFA chacune)
5. **Vérifier IndexedDB:**
   - Application > IndexedDB > `bartender_offline_queue` > `sync_operations`
   - 1 opération avec:
     - `type: "CREATE_SALE"`
     - `status: "pending"`
     - `payload.idempotency_key: "sync_..."`
     - `barId`, `userId` corrects
6. **Vérifier Banner:**
   - Affiche "1 vente en attente de synchronisation"
7. **Console:**
   - `[SalesService] Offline mode detected, queueing sale`
   - `[OfflineQueue] Operation added: sync_...`

#### Test 2.2: Multiples ventes offline
**Objectif**: Valider accumulation dans la queue

**Steps:**
1. Répéter Test 2.1
2. Créer 3 ventes différentes offline
3. **Vérifier:**
   - IndexedDB: 3 opérations distinctes
   - Banner: "3 ventes en attente"
   - Toutes avec status `pending`

#### Test 2.3: Vente serveur bloquée offline
**Objectif**: Vérifier que serveur ne peut PAS travailler offline

**Steps:**
1. Mode Simplifié, connecté comme Serveur
2. DevTools > Network > Offline
3. Attendre 65s (grace period)
4. Tenter de créer une vente
5. **Résultat attendu:**
   - Banner rouge: "Rétablissez votre connexion Internet pour continuer"
   - Vente bloquée (pas de queue créée)
   - Message à l'utilisateur de contacter le gérant

---

### 3. Synchronisation Auto au Retour Online

#### Test 3.1: Sync automatique simple
**Objectif**: Vérifier auto-sync d'1 vente

**Steps:**
1. Créer 1 vente offline (Test 2.1)
2. **Vérifier queue**: 1 opération `pending`
3. DevTools > Network > Online
4. **Attendre 5-10 secondes**
5. **Vérifier:**
   - Console:
     - `[NetworkManager] Network status changed: online`
     - `[SyncManager] Starting sync...`
     - `[SyncManager] Found 1 operations to sync`
     - `[SyncManager] Sale created successfully`
     - `[SyncManager] Operation sync_... synced successfully`
   - IndexedDB: Opération supprimée (queue vide)
   - Banner: Disparaît ou affiche "0 ventes en attente"
   - Database (Supabase): Nouvelle vente créée avec `idempotency_key`

#### Test 3.2: Sync multiples ventes
**Objectif**: Valider sync de plusieurs ventes

**Steps:**
1. Créer 5 ventes offline (Test 2.2)
2. **Vérifier queue**: 5 opérations `pending`
3. Rétablir connexion
4. **Vérifier:**
   - Toutes les 5 ventes synchronisées
   - Queue vide
   - Base de données: 5 nouvelles ventes

#### Test 3.3: Tentative doublon (idempotency)
**Objectif**: Vérifier prévention doublons

**Steps:**
1. Créer 1 vente offline avec items spécifiques
2. **Manipuler IndexedDB manuellement:**
   - Dupliquer l'opération (même `idempotency_key`)
   - Maintenant 2 opérations identiques
3. Rétablir connexion
4. **Résultat attendu:**
   - Console: `Sale with idempotency_key ... already exists, returning existing sale`
   - Base de données: 1 seule vente créée (pas de doublon)
   - Queue: 2 opérations supprimées

---

### 4. Gestion Erreurs et Retry

#### Test 4.1: Erreur temporaire (retry)
**Objectif**: Valider retry sur erreur réseau

**Steps:**
1. Créer 1 vente offline
2. **Simuler erreur réseau:**
   - DevTools > Network > Throttling > Slow 3G
   - Ou intercepter requête Supabase pour retourner timeout
3. Rétablir connexion
4. **Vérifier:**
   - Opération passe en `error` avec `retryCount: 1`
   - Console: `[SyncManager] Operation ... failed, will retry later`
   - Opération reste dans la queue
5. Attendre prochain cycle sync
6. **Vérifier:** Retry réussit, opération supprimée

#### Test 4.2: Erreur permanente (max retries)
**Objectif**: Valider abandon après 5 tentatives

**Steps:**
1. Créer vente offline avec données invalides (ex: `bar_id` inexistant)
2. Rétablir connexion
3. **Vérifier:**
   - Opération échoue 5 fois (`maxRetries: 5`)
   - Status reste `error`
   - Console: `Operation ... exceeded max retries, skipping`
   - Opération reste en queue mais n'est plus tentée

---

### 5. UX et Affichage

#### Test 5.1: Banner adaptatif - Gérant
**Objectif**: Vérifier affichage correct pour gérant

**Steps:**
1. Mode Simplifié, Gérant
2. Passer offline (grace period + 60s)
3. **Vérifier Banner:**
   - Couleur: Bleu (`bg-blue-600`)
   - Icône: WifiOff
   - Titre: "ℹ️ Mode Hors Ligne"
   - Message: "Vous pouvez continuer à encaisser..."
   - Compteur: "X vente(s) en attente" si queue > 0
   - Bouton fermer (X) visible

#### Test 5.2: Banner adaptatif - Serveur
**Objectif**: Vérifier affichage bloquant pour serveur

**Steps:**
1. Mode Simplifié, Serveur
2. Passer offline
3. **Vérifier Banner:**
   - Couleur: Rouge (`bg-red-600`)
   - Titre: "⚠️ Connexion Perdue"
   - Message: "Rétablissez votre connexion Internet..."
   - Pas de compteur queue

#### Test 5.3: Banner Mode Complet offline
**Objectif**: Vérifier message pour mode complet

**Steps:**
1. Mode Complet (`operatingMode: 'full'`)
2. N'importe quel rôle, passer offline
3. **Vérifier Banner:**
   - Rouge
   - Message: "L'application nécessite Internet en mode complet..."
   - Suggestion: Passer en Mode Simplifié

---

### 6. Cas Limites (Edge Cases)

#### Test 6.1: Reconnexion pendant grace period
**Objectif**: Vérifier annulation timer

**Steps:**
1. Online, passer offline
2. Attendre 30s (pendant grace period)
3. Repasser online avant 60s
4. **Vérifier:**
   - Aucune queue créée
   - Banner disparaît immédiatement
   - Status: `online`

#### Test 6.2: Offline → Fermeture app → Réouverture
**Objectif**: Vérifier persistance queue

**Steps:**
1. Créer 2 ventes offline
2. **Fermer complètement l'app** (ou rafraîchir F5)
3. Rouvrir l'app (toujours offline)
4. **Vérifier:**
   - IndexedDB: 2 opérations toujours présentes
   - Banner: "2 ventes en attente"
5. Passer online
6. **Vérifier:** Sync automatique fonctionne

#### Test 6.3: Changement de bar pendant offline
**Objectif**: Isolation des queues par bar

**Steps:**
1. Bar A, créer 1 vente offline
2. Changer pour Bar B (si multi-bar setup)
3. **Vérifier:**
   - Bar A: 1 opération en queue
   - Bar B: 0 opération en queue
   - Banner adapté à chaque bar

---

## Checklist Validation Complète

### Fonctionnel
- [ ] Grace period 60s fonctionne (pas de faux positifs)
- [ ] Gérant/Promoteur peut créer ventes offline
- [ ] Serveur est bloqué offline (mode simplifié)
- [ ] Tous les rôles bloqués offline en mode complet
- [ ] Queue IndexedDB persiste les opérations
- [ ] Auto-sync au retour online (< 10s)
- [ ] Idempotency keys préviennent doublons
- [ ] Retry intelligent sur erreurs temporaires
- [ ] Abandon après max retries (5)

### UI/UX
- [ ] Banner bleu pour mode offline actif (gérant)
- [ ] Banner rouge pour mode offline bloqué
- [ ] Compteur ventes en attente affiché
- [ ] Banner disparaît au retour online
- [ ] Bouton fermer (X) fonctionne
- [ ] Messages adaptés par rôle et mode

### Technique
- [ ] NetworkManager initialisé au démarrage
- [ ] SyncManager initialisé au démarrage
- [ ] IndexedDB `bartender_offline_queue` créée
- [ ] Logs console clairs et structurés
- [ ] Pas d'erreurs console non gérées
- [ ] Performance acceptable (< 500ms pour queue op)

---

## Logs à Surveiller

### NetworkManager
```
[NetworkManager] Initialized
[NetworkManager] Browser reports offline
[NetworkManager] Grace period elapsed, now truly offline
[NetworkManager] Grace period cancelled, connection restored
[NetworkManager] Status changed: offline → online
```

### OfflineQueue
```
[OfflineQueue] Database initialized
[OfflineQueue] Operation added: sync_1738787654321_abc123
[OfflineQueue] Operation sync_... updated to syncing
[OfflineQueue] Operation sync_... removed
```

### SyncManager
```
[SyncManager] Initialized
[SyncManager] Starting sync...
[SyncManager] Found 3 operations to sync
[SyncManager] Syncing operation sync_... (CREATE_SALE)
[SyncManager] Sale created successfully
[SyncManager] Operation sync_... synced successfully
[SyncManager] Sync completed
```

### SalesService
```
[SalesService] Offline mode detected, queueing sale
[SalesService] Sale queued: sync_...
```

---

## Dépannage Commun

### Queue ne se vide pas
**Vérifier:**
- SyncManager initialisé? (`syncManager.init()` appelé)
- NetworkManager status = `online`?
- Console: erreurs RPC Supabase?
- IndexedDB: status des ops = `error`?

### Doublons malgré idempotency
**Vérifier:**
- Migration `20260205170000_add_idempotency_key_to_sales.sql` appliquée?
- RPC `create_sale_idempotent` existe?
- Payload contient bien `idempotency_key`?

### Banner ne s'affiche pas
**Vérifier:**
- NetworkManager status = `offline`?
- Composant OfflineBanner monté dans layout?
- Grace period écoulé (> 60s)?

---

## Métriques de Succès

### Performance
- **Queue Operation**: < 100ms (add/update/remove)
- **Sync All (10 ops)**: < 5s
- **Grace Period**: Exactement 60s ± 1s

### Fiabilité
- **Success Rate Sync**: > 99.9%
- **Zero Data Loss**: 100%
- **Zero Duplicates**: 100%

### UX
- **Time to Notification**: < 1s après offline
- **Sync Feedback**: Visible dans < 3s
- **Error Messages**: Clairs et actionnables
