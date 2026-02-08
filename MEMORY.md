# BarTender - Mémoire Architecturale & Patterns de Typage

Ce document consigne les décisions de conception et les standards de typage établis pour garantir la robustesse de l'application.

## 🛡️ Gestion des Types `any`
L'utilisation de `any` est strictement interdite. Si un type est inconnu (ex: bloc `catch`), utiliser `unknown` et effectuer un narrowing explicite via des helpers.

### Patterns validés :
- **RPC Supabase** : Utiliser les interfaces dans `src/lib/supabase-rpc.types.ts` et les constructeurs comme `buildCreateSaleParams` pour convertir les types TypeScript vers le `Json` de Supabase sans cast brute.
- **Droit à l'erreur** : Toujours utiliser `getErrorMessage(error)` depuis `src/utils/errorHandler.ts` pour extraire les messages d'erreur de manière type-safe.

## 🔄 Dual-Casing (Snake vs Camel)
Le projet utilise deux conventions :
- **Snake Case** (`business_date`, `sold_by`) : Données brutes de la base de données (Supabase) et payloads offline.
- **Camel Case** (`businessDate`, `soldBy`) : Objets métier dans l'application React.

### Pattern de fusion :
Pour les listes mixtes (Online/Offline), utiliser l'interface `UnifiedSale` dans les hooks d'analytics :
```typescript
interface UnifiedSale {
    businessDate?: Date | string | null;
    business_date?: string | null;
    // ...
}
const dateVal = s.businessDate || s.business_date;
```

## 📶 Résilience Offline
- **Idempotence** : Chaque vente générée offline DOIT porter une `idempotency_key` générée immédiatement.
- **SyncManager** : Utilise un tampon `recentlySyncedKeys` pour éviter l'effet "Flash" (disparition temporaire des données) entre la fin du RPC et l'indexation par Supabase.
- **Modèle Offline** : L'interface `OfflineSale` doit porter les champs financiers complets (`subtotal`, `discount_total`) pour garantir qu'aucune métrique n'est perdue durant la capture offline.

## 💳 Paiements
Toutes les méthodes de paiement doivent être validées via `isValidPaymentMethod()` avant d'être injectées dans les moteurs de calcul ou de synchronisation.
