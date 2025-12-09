# Migration 069 - Offline-First Business Date

## 🎯 Objectif

Permettre au frontend de calculer et envoyer `business_date` lors de la création de ventes, pour supporter pleinement l'architecture **offline-first**.

## 📋 Changements

### Avant (Migration 064)

```sql
CREATE OR REPLACE FUNCTION create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_status TEXT DEFAULT 'pending',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
  -- ❌ Pas de business_date
)
```

### Après (Migration 069)

```sql
CREATE OR REPLACE FUNCTION create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_status TEXT DEFAULT 'pending',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL  -- ✅ NOUVEAU
)
```

## 🔄 Logique de Calcul

```sql
IF p_business_date IS NOT NULL THEN
  -- Priorité 1: Valeur frontend (mode offline)
  v_business_date := p_business_date;
ELSE
  -- Priorité 2: Calcul backend (fallback)
  v_business_date := DATE(NOW() - (closing_hour || ' hours')::INTERVAL);
END IF;
```

## ✅ Avantages

1. **Rétrocompatible** : Paramètre optionnel (`DEFAULT NULL`)
2. **Offline-first** : Frontend peut calculer et envoyer
3. **Sécurité** : Backend recalcule si non fourni
4. **Transaction atomique** : Toujours préservée
5. **Trigger actif** : Reste comme filet de sécurité

## 🔒 Sécurité

Le trigger `trg_sales_business_date` (migration 067) reste actif :
- Il s'exécute **BEFORE INSERT**
- Il peut recalculer si `business_date` est NULL
- Il garantit la cohérence des données

## 📊 Flux Offline-First

```
┌─────────────────────────────────────┐
│  FRONTEND (Offline)                 │
├─────────────────────────────────────┤
│  1. Vente créée à 3h du matin       │
│  2. JS calcule: "2025-12-01"        │
│  3. Stocké localement AVEC date     │
│  4. Ajouté à la queue de sync       │
└─────────────────────────────────────┘
              ↓
    [Connexion rétablie]
              ↓
┌─────────────────────────────────────┐
│  BACKEND (Online)                   │
├─────────────────────────────────────┤
│  5. Reçoit business_date frontend   │
│  6. Fonction utilise cette valeur   │
│  7. INSERT avec business_date       │
│  8. Trigger vérifie (optionnel)     │
│  9. Données cohérentes ✅           │
└─────────────────────────────────────┘
```

## 🧪 Tests Recommandés

### Test 1 : Frontend envoie business_date
```sql
SELECT create_sale_with_promotions(
  'bar-uuid',
  '[{"product_id": "...", ...}]'::JSONB,
  'cash',
  'user-uuid',
  'pending',
  NULL,
  NULL,
  NULL,
  '2025-12-01'::DATE  -- ✅ Envoyé par frontend
);

-- Vérifier: business_date = '2025-12-01'
```

### Test 2 : Frontend n'envoie rien (fallback)
```sql
SELECT create_sale_with_promotions(
  'bar-uuid',
  '[{"product_id": "...", ...}]'::JSONB,
  'cash',
  'user-uuid',
  'pending',
  NULL,
  NULL,
  NULL
  -- ❌ Pas de business_date
);

-- Vérifier: business_date calculée par backend
```

### Test 3 : Cohérence frontend/backend
```javascript
// Frontend
const closeHour = 6;
const businessDate = calculateBusinessDate(new Date(), closeHour);
// Résultat: "2025-12-01"

// Backend (doit donner le même résultat)
SELECT DATE(NOW() - INTERVAL '6 hours');
-- Résultat: 2025-12-01
```

## 📝 Modifications Frontend Requises

Après cette migration, mettre à jour :

1. **`sales.service.ts`** : Ajouter `business_date` au type
2. **`useSalesMutations.ts`** : Calculer et envoyer `business_date`
3. **Tests** : Vérifier la cohérence frontend/backend

## ⚠️ Points d'Attention

1. **Déploiement** : Déployer la migration AVANT le code frontend
2. **Tests** : Vérifier que frontend et backend calculent la même date
3. **Monitoring** : Surveiller les divergences éventuelles
4. **Rollback** : Possible en supprimant le paramètre (rétrocompatible)

## 🎯 Validation

Après déploiement, vérifier :
- ✅ Ventes online fonctionnent (avec et sans business_date)
- ✅ Ventes offline ont une business_date calculée
- ✅ Filtres par date fonctionnent offline
- ✅ Stats "Aujourd'hui" fonctionnent offline
- ✅ Pas de divergence frontend/backend

---

**Cette migration complète l'architecture offline-first documentée dans `BUSINESS_DATE_LOGIC_EXPLAINED.md`.**
