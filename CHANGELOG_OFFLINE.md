# Historique Technique - Résolution Visibilité Offline (v17)

## Contexte
Problème critique de création de bons en mode hors ligne (et parfois en ligne) :
1. Les bons créés disparaissaient visuellement lors de la tentative de synchronisation.
2. L'interface se figeait parfois lors de la création.
3. Crash complet sur certains navigateurs (TypeError: crypto.randomUUID).

## Correctifs Appliqués (Date: 2026-02-07)

### 1. Visibilité des Tickets (`src/hooks/queries/useTickets.ts`)
**Problème :** Le hook `useTickets` ne récupérait que les tickets avec le statut `pending` depuis la base locale.
**Conséquence :** Dès que le SyncManager tentait d'envoyer le ticket (statut `syncing`) ou échouait (`error`), le ticket disparaissait de l'interface, donnant l'impression qu'il n'avait jamais été créé.
**Solution :**
- Récupération de **toutes** les opérations offline pour le bar courant.
- Filtrage en mémoire pour inclure explicitement `pending`, `syncing`, et `error`.

### 2. Race Condition (`src/hooks/queries/useTickets.ts`)
**Problème :** L'interface de vente (`QuickSaleFlow`) tentait de sélectionner le nouveau ticket avant que la liste des tickets ne soit mise à jour.
**Tentative 1 (Échec) :** Utilisation de `Promise.all` pour attendre la fin stricte du rafraîchissement. Cela a causé un gel de l'UI ("0 en cours" ne changeait jamais) si le réseau était instable.
**Solution Finale :**
- Simplification de `refetchTickets` : lancement des rafraîchissements (online + offline) en arrière-plan sans bloquer l'appelant (`.catch(console.error)`).
- L'interface reste fluide et se met à jour réactivement dès que les données sont prêtes.

### 3. Crash UUID (`src/services/supabase/tickets.service.ts`)
**Problème :** `crypto.randomUUID()` n'est pas disponible dans tous les environnements (ex: contextes non sécurisés ou anciens navigateurs), provoquant un `TypeError` bloquant lors de la création.
**Solution :** Ajout d'un fallback manuel si `crypto.randomUUID` est indéfini.

### 4. Harmonisation des IDs (`src/services/supabase/sales.service.ts`)
**Problème :** Incohérence entre `snake_case` (Base de données) et `camelCase` (Application JS) pour les IDs offline.
**Solution :** Stratégie "Dual-Casing" dans `mapOperationToOfflineSale` : les objets offline exposent maintenant les deux formats (ex: `ticketId` ET `ticket_id`) pour garantir la compatibilité avec tous les hooks.

## État Final
- Création de bon : ✅ Fonctionnel (Online + Offline)
- Affichage : ✅ Stable (Persistance visuelle durant la sync)
- Robustesse : ✅ Compatible tous navigateurs
