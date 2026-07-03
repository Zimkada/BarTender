# Plan d'Optimisation SQL Complète - BarTender

**Date :** 24 Novembre 2025  
**Mise à jour :** 25 Novembre 2025 (Compatibilité Migration 036)  
**Objectif :** Déplacer les calculs lourds du client vers la base de données PostgreSQL  
**Impact :** Performance × 100-1000, Scalabilité illimitée

---

## ⚠️ Prérequis - Migration 036

> [!IMPORTANT]
> Ce plan d'optimisation SQL **dépend** de la migration 036 (Fix Auth Schema & Add Atomic RPCs).
> 
> **Raisons** :
> - Réutilise le pattern RPC introduit par migration 036
> - Réutilise le format de logging standardisé
> - S'appuie sur la table `bar_members` modifiée par migration 036
> 
> **Ordre de déploiement** :
> 1. ✅ Migration 036 (Auth) - **À déployer en premier**
> 2. ⏳ Migrations 037-040 (Vues SQL) - **Ce document**
> 
> Voir [MIGRATION_COMPATIBILITY_ANALYSIS.md](MIGRATION_COMPATIBILITY_ANALYSIS.md) pour l'analyse détaillée.

---

## 📋 Table des Matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Analyse des Composants Problématiques](#analyse-des-composants-problématiques)
3. [Architecture Actuelle vs Cible](#architecture-actuelle-vs-cible)
4. [Vues SQL Proposées](#vues-sql-proposées)
5. [Services TypeScript](#services-typescript)
6. [Plan de Migration](#plan-de-migration)
7. [Gains de Performance Attendus](#gains-de-performance-attendus)
8. [Risques et Stratégies](#risques-et-stratégies)

---

## 📊 Résumé Exécutif

### Problème Actuel

L'application charge **TOUTES les ventes** dans le navigateur puis effectue des calculs JavaScript complexes. Avec 10 000 ventes :

- ❌ **3-5 secondes** de chargement par menu
- ❌ **50-100 MB** de données transférées
- ❌ **Millions d'opérations** JavaScript
- ❌ **Navigateur qui rame** sur mobile

### Solution Proposée

Créer des **vues SQL matérialisées** qui pré-calculent les statistiques dans PostgreSQL :

- ✅ **50-200ms** de chargement
- ✅ **10-50 KB** de données transférées
- ✅ **Calculs fait par Postgres** (optimisé)
- ✅ **Fluide** même avec 1M de ventes

### ROI Estimé

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| **Temps chargement** | 3-5s | 0.05-0.2s | **× 25** |
| **Bande passante** | 50 MB | 50 KB | **÷ 1000** |
| **Opérations CPU** | 10M (client) | 1000 (serveur) | **÷ 10 000** |
| **Scalabilité** | 10k ventes max | Illimitée | **∞** |

---

## 🚨 Observations Critiques & Correctifs (Mise à jour V2)

Suite à une analyse approfondie, deux points critiques ont été identifiés et intégrés dans ce plan :

### 1. Gestion de la "Journée Commerciale" (Business Day) 🌙
*   **Problème :** `DATE(created_at)` coupe à minuit. Or, les bars ferment souvent à 2h ou 4h du matin. Une vente à 01h00 appartient comptablement à la veille.
*   **Solution :** Appliquer un décalage (offset) avant de grouper par date.
    *   *Formule :* `DATE(created_at - INTERVAL '4 hours')` (pour une clôture à 04h00).
    *   *Impact :* Les chiffres correspondront exactement à la caisse physique.

### 2. Sécurité RLS (Row Level Security) 🔒
*   **Problème :** Les Vues Matérialisées contournent les règles RLS de Supabase. Si exposées directement, elles pourraient fuiter des données entre bars.
*   **Solution :** Architecture "Vue Sécurisée sur Vue Matérialisée".
    1.  **Vue Matérialisée (Privée)** : Contient toutes les données pré-calculées (rapide).
    2.  **Vue Standard (Publique)** : Filtre la Vue Matérialisée selon l'utilisateur connecté (`auth.uid()`).
    *   *Sécurité :* `GRANT SELECT` uniquement sur la Vue Standard.

---

## 🔍 Analyse des Composants Problématiques

### **🔴 CRITIQUE - Nécessite optimisation immédiate**

#### 1. **ForecastingSystem** (Prévisions de Stock)

**Localisation :** [src/components/ForecastingSystem.tsx:140-180](src/components/ForecastingSystem.tsx#L140-L180)

**Calculs actuels :**
```typescript
// Pour CHAQUE produit (200×) :
const recentSales = sales
  .filter(sale => sale.status === 'validated')           // 10 000 ventes
  .filter(sale => getSaleDate(sale) >= thirtyDaysAgo);   // 10 000 dates

const totalSold = recentSales.reduce((sum, sale) => {
  return sum + sale.items.reduce((itemSum, item) => {    // 5 items/vente
    return item.product_id === productId ? item.quantity : 0;
  }, 0);
}, 0);
```

**Complexité :** O(n × m × p) = 10 000 × 5 × 200 = **10 000 000 opérations**

**Impact utilisateur :**
- ⏱️ 3-5 secondes de calcul
- 📱 Freeze sur mobile
- 🔄 Recalcul à chaque changement du slider (1-30 jours)

**Urgence :** 🔴 **CRITIQUE**

---

#### 2. **AccountingOverview** (Vue Comptable)

**Localisation :** [src/components/AccountingOverview.tsx:123-331](src/components/AccountingOverview.tsx#L123-L331)

**Calculs actuels :**
```typescript
// 1. Revenus période actuelle
const totalRevenue = sales
  .filter(sale => sale.status === 'validated' && saleDate >= periodStart && saleDate <= periodEnd)
  .reduce((sum, sale) => sum + sale.total, 0);

// 2. Revenus période précédente (REFAIT LE MÊME CALCUL)
const prevTotalRevenue = sales
  .filter(sale => sale.status === 'validated' && saleDate >= prevPeriodStart && saleDate <= prevPeriodEnd)
  .reduce((sum, sale) => sum + sale.total, 0);

// 3. Revenus avant période (ENCORE !)
const previousRevenue = sales
  .filter(sale => sale.status === 'validated' && saleDate < periodStart)
  .reduce((sum, sale) => sum + sale.total, 0);
```

**Complexité :** 3 × O(n) = 3 × 10 000 = **30 000 opérations**

**Impact utilisateur :**
- ⏱️ 2-3 secondes par changement de période
- 🔄 Recalcul à chaque navigation (semaine/mois/custom)
- 💾 Toutes les ventes chargées même si on regarde 1 semaine

**Urgence :** 🔴 **CRITIQUE**

---

#### 3. **SalesHistory** (Historique des Ventes)

**Localisation :** [src/components/SalesHistory.tsx:242-312](src/components/SalesHistory.tsx#L242-L312)

**Calculs actuels :**
```typescript
// Statistiques
const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

const totalItems = filteredSales.reduce((sum, sale) =>
  sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
);

// Top produits (DOUBLE BOUCLE)
filteredSales.forEach(sale => {
  sale.items.forEach((item: SaleItem) => {
    const name = item.product_name;
    const volume = item.product_volume || '';
    const key = `${name}-${volume}`;
    if (!productCounts[key]) {
      productCounts[key] = { name, volume, count: 0, revenue: 0 };
    }
    productCounts[key].count += item.quantity;
    productCounts[key].revenue += item.total_price;
  });
});
```

**Complexité :** O(n × m) = 10 000 × 5 = **50 000 opérations**

**Impact utilisateur :**
- ⏱️ 1-2 secondes de calcul
- 🔄 Recalcul à chaque changement de filtre (date, serveur, statut)
- 📊 Export CSV/Excel lent

**Urgence :** 🟠 **HAUTE**

---

#### 4. **BarStatsModal** (Stats Multi-Périodes)

**Localisation :** [src/components/BarStatsModal.tsx:52-108](src/components/BarStatsModal.tsx#L52-L108)

**Calculs actuels :**
```typescript
// Filtre 4 fois les MÊMES ventes
const salesToday = sales.filter(sale => isSameDay(getBusinessDay(saleDate, closeHour), currentBusinessDay));
const salesYesterday = sales.filter(sale => isSameDay(getBusinessDay(saleDate, closeHour), yesterday));
const salesLast7Days = sales.filter(sale => businessDay >= sevenDaysAgo && businessDay < currentBusinessDay);
const salesLast30Days = sales.filter(sale => businessDay >= thirtyDaysAgo && businessDay < currentBusinessDay);

// Puis calcule CA pour chacune
const caToday = salesToday.reduce((sum, sale) => sum + sale.totalAmount, 0);
const caYesterday = salesYesterday.reduce((sum, sale) => sum + sale.totalAmount, 0);
// ...

// Top produits aujourd'hui (ENCORE UNE BOUCLE)
salesToday.forEach(sale => {
  sale.items.forEach(item => {
    // Agrégation produits
  });
});
```

**Complexité :** 4 × O(n) + O(n × m) = 50 000 opérations

**Impact utilisateur :**
- ⏱️ 1-2 secondes d'ouverture modal
- 🔄 Utilisé dans SuperAdmin (× nombre de bars)
- 📱 Très lent sur mobile

**Urgence :** 🟠 **HAUTE**

---

### **🟡 MOYEN - Optimisation recommandée**

#### 5. **DailyDashboard** (Tableau de Bord Quotidien)

**Localisation :** [src/components/DailyDashboard.tsx:103-129](src/components/DailyDashboard.tsx#L103-L129)

**Calculs actuels :**
```typescript
const todayValidatedSales = getTodaySales();
const totalItems = todayValidatedSales.reduce((sum, sale) =>
  sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
);

const topProducts = todayValidatedSales.flatMap(sale => sale.items).reduce((acc, item: SaleItem) => {
  const name = item.product_name;
  acc[name] = (acc[name] || 0) + item.quantity;
  return acc;
}, {});
```

**Complexité :** O(n × m) mais n petit (aujourd'hui)

**Impact utilisateur :**
- ⏱️ 0.5-1 seconde
- Acceptable actuellement mais se dégradera

**Urgence :** 🟡 **MOYENNE**

---

#### 6. **ReturnsSystem** (Système de Retours)

**Localisation :** [src/components/ReturnsSystem.tsx](src/components/ReturnsSystem.tsx)

**Calculs actuels :**
```typescript
// Vérifie quantités disponibles pour retour
const alreadyReturned = returns
  .filter(r => r.saleId === sale.id && r.productId === productId)
  .reduce((sum, r) => sum + r.quantity, 0);

const alreadyConsigned = consignments
  .filter(c => c.saleId === sale.id && c.productId === productId)
  .reduce((sum, c) => sum + c.quantity, 0);
```

**Complexité :** O(r + c) par produit

**Impact utilisateur :**
- ⏱️ 0.3-0.5 seconde
- Acceptable avec peu de retours

**Urgence :** 🟢 **FAIBLE** (pour l'instant)

---

## 🏗️ Architecture Actuelle vs Cible

### **Architecture Actuelle (Problématique)**

```
┌─────────────────────────────────────────────────────┐
│ BASE DE DONNÉES (Supabase PostgreSQL)              │
│ - 10 000 ventes × 5 items = 50 000 lignes          │
│ - Total : ~50 MB de données                         │
└──────────────────┬──────────────────────────────────┘
                   │ SELECT * FROM sales
                   │ (TOUTES les données)
                   ▼
┌─────────────────────────────────────────────────────┐
│ RÉSEAU                                              │
│ Transfert : 50 MB                                   │
│ Temps : 2-5 secondes (4G/Wifi)                      │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ CLIENT (Navigateur JavaScript)                      │
│ 1. Parse 50 MB de JSON                              │
│ 2. Filtre 10 000 ventes par date                    │
│ 3. Boucle sur items (50 000 lignes)                 │
│ 4. Calcule sommes, moyennes, top produits           │
│ 5. Render React                                     │
│                                                      │
│ CPU : 100% pendant 3-5 secondes 🔥                  │
│ Mémoire : 200+ MB                                   │
└─────────────────────────────────────────────────────┘
```

**Problèmes :**
- ❌ Bande passante gaspillée (données inutiles)
- ❌ CPU client surchargé
- ❌ Latence réseau importante
- ❌ Pas scalable (crash à 50k+ ventes)
- ❌ Batterie mobile épuisée

---

### **Architecture Cible (Optimale)**

```
┌─────────────────────────────────────────────────────┐
│ BASE DE DONNÉES (Supabase PostgreSQL)              │
│                                                      │
│ ┌─────────────────────────────────────────────────┐│
│ │ VUES MATÉRIALISÉES (pré-calculées)             ││
│ │                                                 ││
│ │ • daily_sales_stats (CA par jour)              ││
│ │ • product_sales_stats (ventes par produit)     ││
│ │ • top_products_by_period (top ventes)          ││
│ │ • accounting_summary (résumé compta)           ││
│ │                                                 ││
│ │ Rafraîchies automatiquement après chaque vente ││
│ └─────────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────────┘
                   │ SELECT * FROM daily_sales_stats
                   │ WHERE bar_id = 'xxx'
                   │ (Données agrégées uniquement)
                   ▼
┌─────────────────────────────────────────────────────┐
│ RÉSEAU                                              │
│ Transfert : 50 KB (÷1000)                           │
│ Temps : 50-100ms                                    │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│ CLIENT (Navigateur JavaScript)                      │
│ 1. Parse 50 KB de JSON (instantané)                 │
│ 2. Affichage direct (données prêtes)                │
│ 3. Render React                                     │
│                                                      │
│ CPU : 5% pendant 50-100ms ⚡                        │
│ Mémoire : 10 MB                                     │
└─────────────────────────────────────────────────────┘
```

**Avantages :**
- ✅ Bande passante réduite (÷1000)
- ✅ Calculs faits par Postgres (optimisé)
- ✅ Latence minimale
- ✅ Scalable à l'infini
- ✅ Économie de batterie mobile

---

## 🗄️ Vues SQL Proposées

### **Vue 1 : `product_sales_stats` (Prévisions de Stock)**

**Objectif :** Remplacer les calculs de ForecastingSystem

**Données fournies :**
- Ventes totales par produit (30 derniers jours)
- Jours réels avec ventes
- Moyenne journalière réelle
- Date de dernière vente
- Jours sans vente (détection rupture)
- Date de création du produit

**Migration SQL :**
```sql
-- 037_create_product_sales_stats_view.sql
-- V2: Avec Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne - Données brutes)
CREATE MATERIALIZED VIEW product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  bp.bar_id,
  bp.name AS product_name,
  bp.volume AS product_volume,
  bp.stock AS current_stock,
  bp.alert_threshold,
  bp.cost_price,
  bp.price AS selling_price,
  bp.created_at AS product_created_at,

  -- Statistiques des 30 derniers jours
  COUNT(DISTINCT DATE(s.created_at)) AS days_with_sales,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'validated') AS total_transactions,
  COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0) AS total_sold_30d,

  -- Moyenne journalière RÉELLE (basée sur jours avec ventes)
  CASE
    WHEN COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0)::float /
         COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS daily_average,

  -- Jours depuis création du produit
  EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400 AS days_since_creation,

  -- Dernière vente
  MAX(s.created_at) FILTER (WHERE s.status = 'validated') AS last_sale_date,

  -- Jours sans vente (détection rupture)
  CASE
    WHEN MAX(s.created_at) FILTER (WHERE s.status = 'validated') IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - MAX(s.created_at) FILTER (WHERE s.status = 'validated'))) / 86400
    ELSE NULL
  END AS days_without_sale,

  -- Coût moyen d'achat (pour calcul coût commande)
  COALESCE(AVG(sup.unit_cost), bp.cost_price) AS avg_purchase_cost,

  -- Dernière mise à jour
  NOW() AS updated_at

FROM bar_products bp
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  AND s.created_at >= NOW() - INTERVAL '30 days'
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text
LEFT JOIN supplies sup ON sup.product_id = bp.id
  AND sup.created_at >= NOW() - INTERVAL '90 days'

WHERE bp.active = true

GROUP BY
  bp.id, bp.bar_id, bp.name, bp.volume, bp.stock,
  bp.alert_threshold, bp.cost_price, bp.price, bp.created_at;

-- Index pour performance
CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);

-- 2. Vue Sécurisée (Publique - Filtrée par RLS)
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_product_sales_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Logging inspiré de migration 036
  RAISE NOTICE '[refresh_product_sales_stats] Starting refresh...';
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE '[refresh_product_sales_stats] ✓ Refreshed % products', v_row_count;
END;
$$;

-- Rafraîchissement automatique après vente validée
CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Rafraîchir de manière asynchrone (ne bloque pas la vente)
  PERFORM pg_notify('refresh_stats', 'product_sales_stats_mat');
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_sale_validated_refresh_stats
AFTER INSERT OR UPDATE OF status ON sales
FOR EACH ROW
WHEN (NEW.status = 'validated')
EXECUTE FUNCTION trigger_refresh_product_stats();

-- Permissions (Uniquement sur la vue sécurisée)
GRANT SELECT ON product_sales_stats TO authenticated;
-- PAS de permission sur product_sales_stats_mat pour authenticated
```

**Gains estimés :**
- Temps calcul : 3-5s → 50-100ms (**÷ 50**)
- Bande passante : 50 MB → 50 KB (**÷ 1000**)
- Opérations : 10M → 200 (**÷ 50 000**)

---

### **Vue 2 : `daily_sales_summary` (AccountingOverview + DailyDashboard)**

**Objectif :** Pré-calculer les statistiques par jour/semaine/mois

**Migration SQL :**
```sql
-- 038_create_daily_sales_summary_view.sql
-- V2: Avec Business Day (-4h) et Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  -- Business Day: On décale de 4h (clôture à 04:00)
  DATE(s.created_at - INTERVAL '4 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours') AS sale_month,

  -- Compteurs
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected_count,

  -- Revenus bruts
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,
  COALESCE(SUM(s.subtotal) FILTER (WHERE s.status = 'validated'), 0) AS gross_subtotal,
  COALESCE(SUM(s.discount_total) FILTER (WHERE s.status = 'validated'), 0) AS total_discounts,

  -- Nombre d'items vendus
  COALESCE(SUM(
    (SELECT SUM((item->>'quantity')::integer)
     FROM jsonb_array_elements(s.items) AS item)
  ) FILTER (WHERE s.status = 'validated'), 0) AS total_items_sold,

  -- Panier moyen
  CASE
    WHEN COUNT(*) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) /
         COUNT(*) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS avg_basket_value,

  -- Par méthode de paiement
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'cash'), 0) AS cash_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'mobile_money'), 0) AS mobile_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'card'), 0) AS card_revenue,

  -- Serveurs actifs
  COUNT(DISTINCT s.sold_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW() AS updated_at

FROM sales s
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY 
  s.bar_id, 
  DATE(s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours');

-- Index
CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_daily_sales_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Logging inspiré de migration 036
  RAISE NOTICE '[refresh_daily_sales_summary] Starting refresh...';
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE '[refresh_daily_sales_summary] ✓ Refreshed % days', v_row_count;
END;
$$;

-- Trigger après vente
CREATE TRIGGER after_sale_refresh_daily_summary
AFTER INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_product_stats();  -- Réutilise le trigger générique

-- Permissions
GRANT SELECT ON daily_sales_summary TO authenticated;
```

**Utilisation dans AccountingOverview :**
```typescript
// AVANT (3 requêtes + calculs client)
const totalRevenue = sales
  .filter(sale => saleDate >= periodStart && saleDate <= periodEnd)
  .reduce((sum, sale) => sum + sale.total, 0);

// APRÈS (1 requête, 0 calcul)
const { data } = await supabase
  .from('daily_sales_summary')
  .select('gross_revenue')
  .eq('bar_id', barId)
  .gte('sale_date', periodStart)
  .lte('sale_date', periodEnd);

const totalRevenue = data.reduce((sum, day) => sum + day.gross_revenue, 0);
```

**Gains estimés :**
- Temps calcul : 2-3s → 100-200ms (**÷ 15**)
- Bande passante : 30 MB → 10 KB (**÷ 3000**)

---

### **Vue 3 : `top_products_by_period` (SalesHistory)**

**Objectif :** Pré-calculer le top produits par période

**Migration SQL :**
```sql
-- 039_create_top_products_view.sql
-- V2: Avec Business Day (-4h) et Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW top_products_by_period_mat AS
SELECT
  s.bar_id,
  DATE(s.created_at - INTERVAL '4 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours') AS sale_month,

  -- Produit
  (item->>'product_id')::uuid AS product_id,
  item->>'product_name' AS product_name,
  item->>'product_volume' AS product_volume,

  -- Agrégations
  COUNT(DISTINCT s.id) AS transaction_count,
  SUM((item->>'quantity')::integer) AS total_quantity,
  SUM((item->>'total_price')::numeric) AS total_revenue,
  AVG((item->>'unit_price')::numeric) AS avg_unit_price,

  -- Métadonnées
  NOW() AS updated_at

FROM sales s
CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
WHERE
  s.status = 'validated'
  AND s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  DATE(s.created_at - INTERVAL '4 hours'),
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours'),
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours'),
  (item->>'product_id')::uuid,
  item->>'product_name',
  item->>'product_volume';

-- Index
CREATE INDEX idx_top_products_mat_bar_date ON top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX idx_top_products_mat_quantity ON top_products_by_period_mat(bar_id, total_quantity DESC);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW top_products_by_period AS
SELECT *
FROM top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Permissions
GRANT SELECT ON top_products_by_period TO authenticated;
```

**Gains estimés :**
- Temps calcul : 1-2s → 50ms (**÷ 30**)
- Bande passante : 20 MB → 5 KB (**÷ 4000**)

---

### **Vue 4 : `bar_stats_multi_period` (BarStatsModal)**

**Objectif :** Stats pré-calculées pour toutes les périodes (aujourd'hui, hier, 7j, 30j)

**Migration SQL :**
```sql
-- 040_create_bar_stats_multi_period_view.sql
-- V2: Avec Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) + Migration 038 (daily_sales_summary) doivent être appliquées

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW bar_stats_multi_period_mat AS
SELECT
  bar_id,

  -- Aujourd'hui
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE) AS revenue_today,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE) AS sales_today,

  -- Hier
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE - 1) AS revenue_yesterday,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE - 1) AS sales_yesterday,

  -- 7 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 7 AND sale_date < CURRENT_DATE) AS revenue_7d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 7 AND sale_date < CURRENT_DATE) AS sales_7d,

  -- 30 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 30 AND sale_date < CURRENT_DATE) AS revenue_30d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 30 AND sale_date < CURRENT_DATE) AS sales_30d,

  NOW() AS updated_at

FROM (SELECT DISTINCT bar_id FROM sales) s;

-- Index
CREATE UNIQUE INDEX idx_bar_stats_multi_period_mat_pk ON bar_stats_multi_period_mat(bar_id);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Permissions
GRANT SELECT ON bar_stats_multi_period TO authenticated;
```

**Gains estimés :**
- Temps calcul : 1-2s → 20ms (**÷ 75**)
- Bande passante : 10 MB → 1 KB (**÷ 10 000**)

---

## 💻 Services TypeScript

### **Service 1 : ForecastingService**

```typescript
// src/services/supabase/forecasting.service.ts

export interface ProductSalesStats {
  product_id: string;
  bar_id: string;
  product_name: string;
  product_volume: string;
  current_stock: number;
  alert_threshold: number;
  cost_price: number;
  selling_price: number;
  product_created_at: string;
  days_with_sales: number;
  total_transactions: number;
  total_sold_30d: number;
  daily_average: number;
  days_since_creation: number;
  last_sale_date: string | null;
  days_without_sale: number | null;
  avg_purchase_cost: number;
  updated_at: string;
}

export interface OrderSuggestion {
  productId: string;
  productName: string;
  productVolume: string;
  currentStock: number;
  suggestedQuantity: number;
  estimatedCost: number;
  urgency: 'high' | 'medium' | 'low';
  reasoning: string;
}

export const ForecastingService = {
  /**
   * Récupère les statistiques de ventes pré-calculées pour un bar
   */
  async getProductSalesStats(barId: string): Promise<ProductSalesStats[]> {
    const { data, error } = await supabase
      .from('product_sales_stats')
      .select('*')
      .eq('bar_id', barId)
      .order('daily_average', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Calcule la suggestion de commande pour un produit
   */
  calculateOrderSuggestion(
    stats: ProductSalesStats,
    coverageDays: number
  ): OrderSuggestion {
    let suggestedQuantity = 0;
    let reasoning = '';
    let urgency: 'high' | 'medium' | 'low' = 'low';

    // Cas 1: Produit récent (moins de 30 jours d'existence)
    if (stats.days_since_creation < 30) {
      const adjustedDays = Math.max(stats.days_since_creation, 1);
      const adjustedAverage = stats.total_sold_30d / adjustedDays;
      const coverageNeeds = adjustedAverage * coverageDays;

      suggestedQuantity = Math.ceil(coverageNeeds + stats.alert_threshold - stats.current_stock);
      reasoning = `Produit récent (${Math.floor(stats.days_since_creation)}j). Moyenne ajustée: ${adjustedAverage.toFixed(1)}/jour sur ${stats.days_with_sales}j de ventes`;
      urgency = stats.current_stock <= stats.alert_threshold ? 'high' : 'medium';
    }
    // Cas 2: Rupture de stock prolongée (pas de ventes depuis 7+ jours)
    else if (stats.days_without_sale && stats.days_without_sale > 7) {
      suggestedQuantity = Math.max(0, stats.alert_threshold - stats.current_stock);
      reasoning = `⚠️ Rupture depuis ${Math.floor(stats.days_without_sale)}j. Reconstitution stock de sécurité uniquement`;
      urgency = stats.current_stock === 0 ? 'medium' : 'low';
    }
    // Cas 3: Calcul standard basé sur moyenne journalière réelle
    else {
      if (stats.days_with_sales === 0 || stats.daily_average === 0) {
        suggestedQuantity = 0;
        reasoning = 'Aucune vente récente. Pas de suggestion.';
        urgency = 'low';
      } else {
        const coverageNeeds = stats.daily_average * coverageDays;
        suggestedQuantity = Math.ceil(coverageNeeds + stats.alert_threshold - stats.current_stock);
        reasoning = `Basé sur ${stats.days_with_sales}j de ventes réelles. Moyenne: ${stats.daily_average.toFixed(1)}/jour`;

        // Déterminer urgence
        if (stats.current_stock === 0) {
          urgency = 'high';
        } else if (stats.current_stock <= stats.alert_threshold / 2) {
          urgency = 'high';
        } else if (stats.current_stock <= stats.alert_threshold) {
          urgency = 'medium';
        } else {
          urgency = 'low';
        }
      }
    }

    // Estimer le coût
    const estimatedCost = Math.max(0, suggestedQuantity) * stats.avg_purchase_cost;

    return {
      productId: stats.product_id,
      productName: stats.product_name,
      productVolume: stats.product_volume,
      currentStock: stats.current_stock,
      suggestedQuantity: Math.max(0, suggestedQuantity),
      estimatedCost,
      urgency,
      reasoning
    };
  },

  /**
   * Rafraîchir les statistiques manuellement
   */
  async refreshStats(): Promise<void> {
    const { error } = await supabase.rpc('refresh_product_sales_stats');
    if (error) throw error;
  }
};
```

---

### **Service 2 : AnalyticsService**

```typescript
// src/services/supabase/analytics.service.ts

export interface DailySalesSummary {
  bar_id: string;
  sale_date: string;
  sale_week: string;
  sale_month: string;
  pending_count: number;
  validated_count: number;
  rejected_count: number;
  gross_revenue: number;
  gross_subtotal: number;
  total_discounts: number;
  total_items_sold: number;
  avg_basket_value: number;
  cash_revenue: number;
  mobile_revenue: number;
  card_revenue: number;
  active_servers: number;
  first_sale_time: string;
  last_sale_time: string;
  updated_at: string;
}

export interface TopProduct {
  bar_id: string;
  sale_date: string;
  sale_week: string;
  sale_month: string;
  product_id: string;
  product_name: string;
  product_volume: string;
  transaction_count: number;
  total_quantity: number;
  total_revenue: number;
  avg_unit_price: number;
}

export const AnalyticsService = {
  /**
   * Récupère le résumé des ventes par jour/semaine/mois
   */
  async getDailySummary(
    barId: string,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<DailySalesSummary[]> {
    const dateColumn = groupBy === 'day' ? 'sale_date' :
                       groupBy === 'week' ? 'sale_week' : 'sale_month';

    const { data, error } = await supabase
      .from('daily_sales_summary')
      .select('*')
      .eq('bar_id', barId)
      .gte(dateColumn, startDate.toISOString())
      .lte(dateColumn, endDate.toISOString())
      .order(dateColumn, { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère les top produits pour une période
   */
  async getTopProducts(
    barId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<TopProduct[]> {
    const { data, error } = await supabase
      .from('top_products_by_period')
      .select('*')
      .eq('bar_id', barId)
      .gte('sale_date', startDate.toISOString().split('T')[0])
      .lte('sale_date', endDate.toISOString().split('T')[0])
      .order('total_quantity', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère les stats multi-périodes pour un bar (dashboard rapide)
   */
  async getBarStatsMultiPeriod(barId: string) {
    const { data, error } = await supabase
      .from('bar_stats_multi_period')
      .select('*')
      .eq('bar_id', barId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Calcule le CA pour une période spécifique (pour AccountingOverview)
   */
  async getRevenueSummary(
    barId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRevenue: number;
    totalSales: number;
    avgBasketValue: number;
    cashRevenue: number;
    mobileRevenue: number;
    cardRevenue: number;
  }> {
    const summaries = await this.getDailySummary(barId, startDate, endDate);

    return {
      totalRevenue: summaries.reduce((sum, s) => sum + s.gross_revenue, 0),
      totalSales: summaries.reduce((sum, s) => sum + s.validated_count, 0),
      avgBasketValue: summaries.length > 0
        ? summaries.reduce((sum, s) => sum + s.avg_basket_value, 0) / summaries.length
        : 0,
      cashRevenue: summaries.reduce((sum, s) => sum + s.cash_revenue, 0),
      mobileRevenue: summaries.reduce((sum, s) => sum + s.mobile_revenue, 0),
      cardRevenue: summaries.reduce((sum, s) => sum + s.card_revenue, 0),
    };
  }
};
```

---

## 📅 Plan de Migration

### **Phase 1 : Préparation (1 jour)**

**Objectifs :**
- Créer les migrations SQL
- Tester en local avec données de test
- Valider les performances

**Tâches :**
1. ✅ Créer `036_create_product_sales_stats_view.sql`
2. ✅ Créer `037_create_daily_sales_summary_view.sql`
3. ✅ Créer `038_create_top_products_view.sql`
4. ✅ Créer `039_create_bar_stats_multi_period_view.sql`
5. ✅ Tester chaque migration dans Supabase SQL Editor
6. ✅ Vérifier l'exactitude des données (comparer avec calculs actuels)
7. ✅ Mesurer les performances (EXPLAIN ANALYZE)

**Critères de succès :**
- Toutes les vues créées sans erreur
- Données identiques aux calculs actuels (±1%)
- Temps de requête < 200ms

---

### **Phase 2 : Services TypeScript (1 jour)**

**Objectifs :**
- Créer les services de requête
- Types TypeScript
- Tests unitaires

**Tâches :**
1. ✅ Créer `src/services/supabase/forecasting.service.ts`
2. ✅ Créer `src/services/supabase/analytics.service.ts`
3. ✅ Définir tous les types d'interface
4. ✅ Implémenter les fonctions de calcul côté client (léger)
5. ✅ Écrire tests unitaires pour les calculs
6. ✅ Documenter les fonctions (JSDoc)

**Critères de succès :**
- Types complets et corrects
- Tests passent à 100%
- Documentation claire

---

### **Phase 3 : Intégration React (2 jours)**

**Objectifs :**
- Remplacer les calculs client par appels SQL
- Migrer composant par composant
- Tests manuels approfondis

**Ordre de migration (par priorité) :**

#### **Jour 1 :**
1. **ForecastingSystem** (3h)
   - Remplacer `calculateOrderSuggestion()` par `ForecastingService`
   - Supprimer boucles sur `sales`
   - Tester suggestions de commande
   - Vérifier export Excel

2. **AccountingOverview** (3h)
   - Utiliser `AnalyticsService.getRevenueSummary()`
   - Remplacer tous les `sales.filter().reduce()`
   - Tester vue Trésorerie
   - Tester vue Analytique
   - Vérifier exports

#### **Jour 2 :**
3. **SalesHistory** (2h)
   - Utiliser `AnalyticsService.getTopProducts()`
   - Garder filtrage local (léger)
   - Tester statistiques
   - Vérifier exports CSV/Excel

4. **BarStatsModal** (2h)
   - Utiliser `AnalyticsService.getBarStatsMultiPeriod()`
   - Simplifier calculs comparaisons
   - Tester dans SuperAdminDashboard

5. **DailyDashboard** (1h)
   - Utiliser `daily_sales_summary` pour aujourd'hui
   - Tester affichage stats

**Critères de succès :**
- Tous les composants fonctionnent
- Données identiques (vérifier manuellement)
- Performance améliorée (mesurer avec DevTools)
- Aucune régression

---

### **Phase 4 : Tests et Optimisations (1 jour)**

**Objectifs :**
- Tests de charge
- Monitoring
- Optimisations finales

**Tâches :**
1. ✅ Tests avec données réelles (10k+ ventes)
2. ✅ Mesurer temps de chargement avant/après
3. ✅ Vérifier utilisation mémoire
4. ✅ Tester sur mobile (4G, 3G)
5. ✅ Configurer monitoring Supabase
6. ✅ Ajouter cache React Query (5 min TTL)
7. ✅ Documentation utilisateur (changelog)

**Critères de succès :**
- Performance × 10 minimum
- Stable sur mobile
- Documentation complète

---

### **Phase 5 : Déploiement Production (1/2 jour)**

**Objectifs :**
- Migration en production sans downtime
- Rollback plan prêt

**Tâches :**
1. ✅ Backup base de données
2. ✅ Appliquer migrations SQL en production
3. ✅ Vérifier que les vues sont créées
4. ✅ Rafraîchir les vues matérialisées
5. ✅ Déployer nouveau code frontend (Vercel)
6. ✅ Tests smoke en production
7. ✅ Monitoring actif pendant 24h

**Rollback plan :**
Si problème critique :
1. Rollback Vercel (1 clic)
2. Garder les vues SQL (pas de régression)
3. Analyser logs
4. Corriger et redéployer

---

## 📊 Gains de Performance Attendus

### **Avant Optimisation (État Actuel)**

| Composant | Temps Chargement | Bande Passante | Opérations CPU |
|-----------|------------------|----------------|----------------|
| ForecastingSystem | 3-5s | 50 MB | 10 000 000 |
| AccountingOverview | 2-3s | 30 MB | 30 000 |
| SalesHistory | 1-2s | 20 MB | 50 000 |
| BarStatsModal | 1-2s | 10 MB | 50 000 |
| DailyDashboard | 0.5-1s | 5 MB | 10 000 |
| **TOTAL** | **8-13s** | **115 MB** | **10 140 000** |

### **Après Optimisation (Avec Vues SQL)**

| Composant | Temps Chargement | Bande Passante | Opérations CPU | Gain |
|-----------|------------------|----------------|----------------|------|
| ForecastingSystem | 50-100ms | 50 KB | 200 | **× 50** |
| AccountingOverview | 100-200ms | 10 KB | 100 | **× 15** |
| SalesHistory | 50-100ms | 5 KB | 1 000 | **× 20** |
| BarStatsModal | 20-50ms | 1 KB | 10 | **× 50** |
| DailyDashboard | 20-50ms | 2 KB | 50 | **× 20** |
| **TOTAL** | **240-500ms** | **68 KB** | **1 360** | **× 25** |

### **Impact Utilisateur**

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Temps de réponse** | 8-13s | 0.2-0.5s | **÷ 30** |
| **Consommation data (mobile)** | 115 MB | 68 KB | **÷ 1700** |
| **Consommation batterie** | Élevée | Faible | **÷ 20** |
| **Utilisable avec 10k ventes** | ❌ Lag | ✅ Fluide | ∞ |
| **Utilisable avec 100k ventes** | ❌ Crash | ✅ Fluide | ∞ |
| **Expérience mobile 3G** | ❌ Timeout | ✅ Acceptable | ✅ |

---

## ⚠️ Risques et Stratégies d'Atténuation

### **Risque 1 : Vues Matérialisées Obsolètes**

**Probabilité :** Moyenne
**Impact :** Moyen
**Symptôme :** Statistiques affichées avec 5-10 min de retard

**Stratégie d'atténuation :**
1. ✅ Rafraîchissement automatique après chaque vente validée (trigger)
2. ✅ Rafraîchissement manuel disponible (`REFRESH MATERIALIZED VIEW`)
3. ✅ Afficher timestamp "Mis à jour il y a X min" dans l'UI
4. ✅ Utiliser `CONCURRENTLY` pour ne pas bloquer les lectures

**Code exemple :**
```typescript
// Afficher l'âge des données
const statsAge = useMemo(() => {
  if (!statsData[0]?.updated_at) return null;
  const ageMs = Date.now() - new Date(statsData[0].updated_at).getTime();
  const ageMin = Math.floor(ageMs / 60000);
  return ageMin;
}, [statsData]);

// Dans l'UI
{statsAge !== null && statsAge > 5 && (
  <div className="text-xs text-amber-600">
    ⚠️ Données mises à jour il y a {statsAge} min
    <button onClick={handleRefreshStats}>Actualiser</button>
  </div>
)}
```

---

### **Risque 2 : Données Incohérentes Pendant Migration**

**Probabilité :** Faible
**Impact :** Élevé
**Symptôme :** Statistiques différentes entre ancien et nouveau système

**Stratégie d'atténuation :**
1. ✅ Tests approfondis en local avec données réelles
2. ✅ Comparaison automatique ancien vs nouveau calcul
3. ✅ Feature flag pour activer/désactiver les nouvelles vues
4. ✅ Rollback instantané si détecté

**Code exemple :**
```typescript
// Feature flag
const USE_SQL_VIEWS = import.meta.env.VITE_USE_SQL_VIEWS === 'true';

// Comparaison (en mode debug)
if (import.meta.env.DEV) {
  const oldValue = calculateOldWay();
  const newValue = await fetchFromSQLView();
  const diff = Math.abs(oldValue - newValue);
  if (diff > oldValue * 0.01) {  // Plus de 1% d'écart
    console.warn('Discrepancy detected:', { oldValue, newValue, diff });
  }
}
```

---

### **Risque 3 : Performance Dégradée sur Refresh**

**Probabilité :** Faible
**Impact :** Faible
**Symptôme :** Lenteur temporaire lors du rafraîchissement des vues

**Stratégie d'atténuation :**
1. ✅ Utiliser `REFRESH MATERIALIZED VIEW CONCURRENTLY` (non-bloquant)
2. ✅ Rafraîchir de manière asynchrone (file d'attente)
3. ✅ Index appropriés sur les vues
4. ✅ Limiter à 365 jours d'historique dans les vues

**Configuration PostgreSQL recommandée :**
```sql
-- Augmenter la mémoire pour les vues matérialisées
SET work_mem = '256MB';
SET maintenance_work_mem = '512MB';

-- Créer les index AVANT de remplir les vues
CREATE INDEX CONCURRENTLY idx_sales_created_at ON sales(created_at);
CREATE INDEX CONCURRENTLY idx_sales_bar_status ON sales(bar_id, status);
```

---

### **Risque 4 : Coût Supabase Augmenté**

**Probabilité :** Faible
**Impact :** Faible
**Symptôme :** Augmentation légère de la facture Supabase

**Analyse :**
- **Stockage :** +10-50 MB pour les vues (négligeable)
- **CPU :** -90% (moins de requêtes, calculs optimisés)
- **Bande passante :** -95% (données agrégées)

**Résultat :** **Économie globale de ~50%** sur la facture

**Monitoring recommandé :**
```sql
-- Vérifier la taille des vues
SELECT
  schemaname,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||matviewname) DESC;
```

---

## 💰 Optimisations des Coûts Supabase (Ajout Novembre 2025)

### **Contexte : Économies Potentielles**

**Impact financier de l'optimisation SQL :**
- Bande passante réduite : ÷1000 (50 MB → 50 KB par requête)
- Économie estimée : **$4-150/mois** selon usage
- Stockage supplémentaire : +50 MB (négligeable, inclus jusqu'à 8 GB)
- CPU calculs SQL : **GRATUIT** (illimité dans tous les plans Supabase)

**Rappel important :** Supabase facture la **bande passante**, pas le **CPU**. Les calculs SQL sont donc gratuits !

---

### **🔧 Optimisation 1 : Refresh CONCURRENT (Obligatoire)**

**Objectif :** Éviter le blocage des lectures pendant le rafraîchissement des vues

**Implémentation :**

```sql
-- ✅ BON (non-bloquant, recommandé)
CREATE OR REPLACE FUNCTION refresh_product_sales_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;
  RAISE NOTICE '[refresh_product_sales_stats] ✓ Refreshed successfully';
END;
$$;

-- ❌ ÉVITER (bloque toutes les lectures)
REFRESH MATERIALIZED VIEW product_sales_stats_mat;
```

**Prérequis pour CONCURRENT :**
```sql
-- Nécessite un UNIQUE INDEX sur la vue matérialisée
CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk
ON product_sales_stats_mat(product_id);
```

**Gains :**
- ✅ Utilisateurs continuent de lire pendant refresh
- ✅ Pas de "freeze" de l'application
- ✅ Coût CPU identique

**À appliquer sur TOUTES les vues matérialisées :**
- `product_sales_stats_mat`
- `daily_sales_summary_mat`
- `top_products_by_period_mat`
- `bar_stats_multi_period_mat`

---

### **🔧 Optimisation 2 : Limitation Historique (Recommandé)**

**Objectif :** Réduire le temps de refresh et le stockage en limitant l'historique traité

**Implémentation :**

```sql
-- ✅ BON (365 jours maximum)
CREATE MATERIALIZED VIEW product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  -- ... autres colonnes
FROM bar_products bp
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  AND s.created_at >= NOW() - INTERVAL '365 days'  -- ⭐ LIMITE IMPORTANTE
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text
WHERE bp.active = true
GROUP BY bp.id, bp.bar_id, ...;

-- ❌ ÉVITER (tout l'historique, lent et coûteux)
LEFT JOIN sales s ON s.bar_id = bp.bar_id  -- Pas de limite de date
```

**Recommandations par vue :**

| Vue | Historique Recommandé | Justification |
|-----|----------------------|---------------|
| `product_sales_stats_mat` | 90 jours | Prévisions stock à court terme |
| `daily_sales_summary_mat` | 365 jours | Analytics annuelles |
| `top_products_by_period_mat` | 365 jours | Comparaisons année N-1 |
| `bar_stats_multi_period_mat` | 90 jours | Dashboard rapide |

**Gains :**
- ✅ Refresh 2-5× plus rapide
- ✅ -30-50% de stockage vues matérialisées
- ✅ Données anciennes archivées si besoin (table séparée)

---

### **🔧 Optimisation 3 : Debouncing des Refresh (Critique pour coûts)**

**Objectif :** Réduire la fréquence des refresh (de 20×/jour → 3-4×/jour)

**Problème actuel :**
```sql
-- ❌ ACTUEL : Refresh après CHAQUE vente validée
CREATE TRIGGER after_sale_validated_refresh_stats
AFTER INSERT OR UPDATE OF status ON sales
FOR EACH ROW
WHEN (NEW.status = 'validated')
EXECUTE FUNCTION trigger_refresh_product_stats();

-- Si 20 ventes/jour → 20 refresh/jour → CPU gaspillé
```

**Solution : Debouncing avec pg_notify**

```sql
-- Étape 1 : Trigger léger qui envoie seulement une notification
CREATE OR REPLACE FUNCTION trigger_refresh_with_debounce()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Envoyer notification asynchrone (ne bloque pas la vente)
  PERFORM pg_notify('refresh_stats_debounced', json_build_object(
    'bar_id', NEW.bar_id,
    'timestamp', NOW()
  )::text);

  RETURN NEW;
END;
$$;

CREATE TRIGGER after_sale_validated_notify
AFTER INSERT OR UPDATE OF status ON sales
FOR EACH ROW
WHEN (NEW.status = 'validated')
EXECUTE FUNCTION trigger_refresh_with_debounce();

-- Étape 2 : Worker backend qui regroupe les notifications (à implémenter côté app)
-- Pseudo-code TypeScript :
/*
const notifications = [];
supabase.channel('refresh_stats_debounced')
  .on('postgres_changes', (payload) => {
    notifications.push(payload);
  })
  .subscribe();

// Toutes les 5 minutes, refresh si notifications
setInterval(async () => {
  if (notifications.length > 0) {
    await supabase.rpc('refresh_product_sales_stats');
    await supabase.rpc('refresh_daily_sales_summary');
    notifications.length = 0;
  }
}, 5 * 60 * 1000);
*/
```

**Alternative simple : Cron Job quotidien**

```sql
-- Option minimaliste : Refresh 1×/jour à 4h du matin (heure creuse)
-- Configurer dans Supabase Dashboard > Database > Cron Jobs
-- OU utiliser pg_cron extension

SELECT cron.schedule(
  'refresh-analytics-views',
  '0 4 * * *',  -- Tous les jours à 4h00
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;
    REFRESH MATERIALIZED VIEW CONCURRENTLY top_products_by_period_mat;
    REFRESH MATERIALIZED VIEW CONCURRENTLY bar_stats_multi_period_mat;
  $$
);
```

**Gains :**
- ✅ Réduit refresh de 20×/jour → 1-4×/jour
- ✅ Économise 80-95% du CPU de refresh
- ✅ Données toujours fraîches (max 5 min de retard avec debouncing, 24h avec cron)

**Recommandation :**
- Phase 1 : Cron quotidien (simple, efficace)
- Phase 2 : Debouncing 5 min (si besoin temps réel)

---

### **🔧 Optimisation 4 : Index Stratégiques (Performance)**

**Objectif :** Accélérer les refresh et réduire le CPU utilisé

**Index critiques à créer :**

```sql
-- Index sur colonnes de filtrage fréquent
CREATE INDEX CONCURRENTLY idx_sales_created_at_bar_status
ON sales(bar_id, created_at, status)
WHERE status = 'validated';

-- Index sur JSONB items pour éviter le scan complet
CREATE INDEX CONCURRENTLY idx_sales_items_product_id
ON sales USING GIN ((items));

-- Index sur date pour les vues temporelles
CREATE INDEX CONCURRENTLY idx_sales_created_at_date
ON sales(DATE(created_at - INTERVAL '4 hours'));

-- Index sur supplies pour forecasting
CREATE INDEX CONCURRENTLY idx_supplies_product_created
ON supplies(product_id, created_at);
```

**Vérifier l'utilisation des index :**

```sql
-- Analyser une requête pour voir si index utilisé
EXPLAIN ANALYZE
SELECT * FROM product_sales_stats_mat WHERE bar_id = 'xxx';

-- Surveiller index inutilisés
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,  -- Nombre d'utilisations
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0  -- Index jamais utilisé
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Gains :**
- ✅ Refresh 3-10× plus rapide selon la vue
- ✅ -60-80% CPU utilisé pour refresh
- ❌ +10-30 MB stockage index (négligeable)

---

### **🔧 Optimisation 5 : Monitoring des Coûts (Préventif)**

**Objectif :** Surveiller l'impact réel et détecter les dérives

**Dashboard Supabase à surveiller :**

```sql
-- 1. Taille des vues matérialisées
SELECT
  schemaname,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size,
  pg_total_relation_size(schemaname||'.'||matviewname) / 1024 / 1024 AS size_mb
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||matviewname) DESC;

-- Objectif : Rester sous 100 MB total

-- 2. Fréquence des refresh (monitoring CPU)
SELECT
  query,
  calls,
  total_exec_time / 1000 as total_seconds,
  mean_exec_time as avg_ms,
  max_exec_time as max_ms
FROM pg_stat_statements
WHERE query LIKE '%REFRESH MATERIALIZED VIEW%'
ORDER BY calls DESC;

-- Objectif : <50 calls/jour, <500ms avg

-- 3. Bande passante économisée (estimation)
-- Comparer avant/après via Supabase Dashboard > Settings > Usage
-- Objectif : -80% bande passante minimum
```

**Alertes recommandées :**

| Métrique | Seuil Alerte | Action |
|----------|--------------|--------|
| Taille vues > 200 MB | ⚠️ Warning | Réduire historique à 180j |
| Refresh > 100×/jour | 🔴 Critical | Activer debouncing |
| Temps refresh > 2s | ⚠️ Warning | Optimiser requêtes/index |
| Bande passante > 50 GB/mois | 🔴 Critical | Vérifier fuites données |

---

### **📊 Récapitulatif des Optimisations et Impact Coût**

| Optimisation | Difficulté | Impact Coût | Impact Performance | Priorité |
|--------------|------------|-------------|--------------------|----------|
| **1. CONCURRENT Refresh** | Facile | Indirect (UX) | Critique | 🔴 P0 |
| **2. Limite historique 365j** | Facile | -30% stockage | +100% vitesse | 🟠 P1 |
| **3. Debouncing refresh** | Moyenne | -80% CPU | Neutre | 🟠 P1 |
| **4. Index stratégiques** | Facile | +10 MB storage | +300% vitesse | 🟡 P2 |
| **5. Monitoring coûts** | Facile | Préventif | Détection issues | 🟢 P3 |

**Estimation économies totales avec TOUTES les optimisations :**
- Bande passante : -95% → **-$10-140/mois**
- Stockage : +50 MB → **+$0/mois** (inclus)
- CPU refresh : -80% → **+$0/mois** (gratuit)
- **TOTAL : -$10-140/mois d'économies** 💰

---

## 🎯 Prochaines Étapes Recommandées (MISE À JOUR)

### **Immédiat (Cette Semaine)**

1. ✅ **Valider l'approche** avec l'équipe
2. ✅ **Créer les migrations SQL** (Phase 1) **+ Optimisations coûts intégrées**
   - ✅ CONCURRENT sur tous les refresh
   - ✅ Limite 365j sur daily_sales_summary et top_products
   - ✅ Limite 90j sur product_sales_stats
   - ✅ Index stratégiques
3. ✅ **Tester en local** avec données de production anonymisées
4. ✅ **Documenter les résultats** de tests + mesures coûts

### **Court Terme (2 Semaines)**

1. ✅ **Créer les services TypeScript** (Phase 2)
2. ✅ **Migrer ForecastingSystem** (plus critique)
3. ✅ **Migrer AccountingOverview**
4. ✅ **Tests approfondis**
5. 🆕 **Implémenter Cron Job quotidien** (refresh 4h du matin)
6. 🆕 **Configurer monitoring coûts** (dashboard Supabase)

### **Moyen Terme (1 Mois)**

1. ✅ **Migrer les autres composants**
2. ✅ **Déploiement production**
3. ✅ **Monitoring pendant 1 semaine**
4. ✅ **Documentation finale**
5. 🆕 **Analyser économies réelles** (comparer factures avant/après)
6. 🆕 **Ajuster limites historique** selon usage réel

### **Long Terme (Améliorations Futures)**

1. 🚀 **Debouncing intelligent** (refresh 5 min si activité)
2. 🚀 **Vue agrégée par heure** (analytics temps réel)
3. 🚀 **Détection anomalies** (ventes inhabituelles)
4. 🚀 **Prévisions ML** (tendances futures)
5. 🚀 **Dashboard SuperAdmin temps réel** (tous les bars)
6. 🚀 **Archivage données anciennes** (>2 ans) vers stockage froid

---

## 📚 Références et Ressources

### **Documentation PostgreSQL**

- [Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [JSONB Functions](https://www.postgresql.org/docs/current/functions-json.html)
- [Performance Tips](https://www.postgresql.org/docs/current/performance-tips.html)

### **Documentation Supabase**

- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Triggers](https://supabase.com/docs/guides/database/triggers)
- [Performance Best Practices](https://supabase.com/docs/guides/database/performance)

### **Outils de Monitoring**

- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) - Analyser les requêtes lentes
- [EXPLAIN ANALYZE](https://www.postgresql.org/docs/current/sql-explain.html) - Optimiser les requêtes
- Supabase Dashboard - Monitoring intégré

---

## ✅ Checklist de Validation

### **Avant Migration**

- [ ] Migrations SQL créées et testées
- [ ] Services TypeScript implémentés
- [ ] Tests unitaires passent
- [ ] Comparaison ancien/nouveau validée (< 1% écart)
- [ ] Performance mesurée (avant/après)
- [ ] Documentation complète
- [ ] Backup base de données fait

### **Pendant Migration**

- [ ] Feature flag activé (test A/B)
- [ ] Monitoring actif
- [ ] Rollback plan prêt
- [ ] Équipe disponible pour support

### **Après Migration**

- [ ] Performance validée (× 10 minimum)
- [ ] Aucune régression fonctionnelle
- [ ] Utilisateurs satisfaits (feedback)
- [ ] Documentation à jour
- [ ] Monitoring 1 semaine OK

---

**Document créé le :** 24 Novembre 2025
**Dernière mise à jour :** 24 Novembre 2025
**Auteur :** Claude Code
**Statut :** 📋 Prêt pour implémentation
**Priorité :** 🔴 CRITIQUE (Impact majeur sur UX)
