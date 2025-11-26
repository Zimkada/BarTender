# Roadmap Système de Prévisions - BarTender

**Date de création :** 26 Novembre 2025
**Objectif :** Architecture complète de prévisions de ventes et de stock avec optimisation des coûts Supabase
**Approche :** Hybride - Performance SQL + Modèles Statistiques Avancés

---

## 📋 Vue d'Ensemble

### **Contexte**

L'application BarTender nécessite un système de prévisions robuste pour :
- 📊 **Prévisions de Ventes** : Anticiper le CA futur (7-30 jours)
- 📦 **Prévisions de Stock** : Optimiser les réapprovisionnements
- 🎉 **Gestion d'Événements** : Ajuster les prévisions selon jours fériés du Bénin, weekends, promotions, anniversaires
- 💰 **Optimisation des Coûts** : Minimiser les coûts Supabase via calculs SQL

**Note importante :** Le système intègre automatiquement les **9 jours fériés du Bénin** dans les calculs de prévisions :
1. 1er janvier : Nouvel An (+60%)
2. 10 janvier : Fête du Vodoun (+40%)
3. 1er mai : Fête du Travail (+30%)
4. 1er août : Fête Nationale/Indépendance (+50%)
5. 26 octobre : Fête des Forces Armées (+30%)
6. 1er novembre : Toussaint (+20%)
7. 30 novembre : Fête Nationale/Dahomey (+40%)
8. 25 décembre : Noël (+70%)
9. 31 décembre : Réveillon (+65%)

Les jours fériés religieux variables (Pâques, Ascension, Pentecôte, Tabaski, Ramadan) peuvent être ajoutés manuellement via l'interface de gestion des événements.

### **Architecture Choisie : Approche Hybride**

```
Phase 1 : OPTIMISATION SQL (Performance × 50)
  ↓ Vues matérialisées pour calculs de base
  ↓ Gains immédiats : ForecastingSystem rapide

Phase 2 : PRÉVISIONS VENTES (Modèles statistiques)
  ↓ Système adaptatif selon qualité des données
  ↓ Gestion événements spéciaux
  ↓ Sous-menu "Prévisions de Ventes" fonctionnel

Phase 3 : CONNEXION DRY (Stock depuis Ventes)
  ↓ Réutilisation des prévisions ventes
  ↓ Safety stock, EOQ, reorder point
```

---

## 🎯 Phase 1 : Optimisation SQL de Base (Semaine 1-2)

### **Objectif**
Migrer les calculs lourds du client vers PostgreSQL pour gains de performance immédiats.

### **Migrations SQL à Créer**

#### **Migration 037 : `product_sales_stats_mat`**

**Fichier :** `supabase/migrations/037_create_product_sales_stats_view.sql`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 391-506)

**Optimisations intégrées :**
- ✅ `REFRESH MATERIALIZED VIEW CONCURRENTLY` (non-bloquant)
- ✅ Limite historique : **90 jours** (prévisions stock court terme)
- ✅ Index unique : `idx_product_sales_stats_mat_pk(product_id)`
- ✅ Index bar : `idx_product_sales_stats_mat_bar(bar_id)`

**Données fournies :**
- Ventes totales 30 derniers jours par produit
- Moyenne journalière réelle (basée sur jours avec ventes)
- Jours sans vente (détection rupture)
- Stock actuel vs seuil d'alerte
- Coût moyen d'achat (pour calcul coût commande)

---

#### **Migration 038 : `daily_sales_summary_mat`**

**Fichier :** `supabase/migrations/038_create_daily_sales_summary_view.sql`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 515-619)

**Optimisations intégrées :**
- ✅ `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- ✅ Limite historique : **365 jours** (analytics annuelles)
- ✅ Business Day : `DATE(created_at - INTERVAL '4 hours')` (bars ferment à 4h)
- ✅ Index unique : `idx_daily_sales_summary_mat_pk(bar_id, sale_date)`
- ✅ Index temporels : week, month

**Données fournies :**
- CA par jour/semaine/mois
- Nombre de ventes par statut
- Panier moyen
- Répartition par méthode de paiement (cash, mobile, card)
- Nombre de serveurs actifs
- Remises totales

---

#### **Migration 039 : `top_products_by_period_mat`**

**Fichier :** `supabase/migrations/039_create_top_products_view.sql`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 643-706)

**Optimisations intégrées :**
- ✅ `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- ✅ Limite historique : **365 jours**
- ✅ Index composite : `idx_top_products_mat_bar_date(bar_id, sale_date)`
- ✅ Index performance : `idx_top_products_mat_quantity(bar_id, total_quantity DESC)`

**Données fournies :**
- Top produits par jour/semaine/mois
- Quantités vendues par produit
- Revenue par produit
- Prix unitaire moyen
- Nombre de transactions

---

#### **Migration 040 : `bar_stats_multi_period_mat`**

**Fichier :** `supabase/migrations/040_create_bar_stats_multi_period_view.sql`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 714-778)

**Optimisations intégrées :**
- ✅ `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- ✅ Limite historique : **90 jours** (dashboard rapide)
- ✅ Index unique : `idx_bar_stats_multi_period_mat_pk(bar_id)`
- ✅ Réutilise `daily_sales_summary_mat` (pas de recalcul)

**Données fournies :**
- Statistiques pré-calculées pour aujourd'hui, hier, 7j, 30j
- Revenue et nombre de ventes par période
- Optimisé pour BarStatsModal (1 requête au lieu de 4+)

---

### **Services TypeScript à Créer**

#### **Service 1 : `forecasting.service.ts`**

**Fichier :** `src/services/supabase/forecasting.service.ts`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 787-914)

**Fonctions principales :**
```typescript
getProductSalesStats(barId: string): Promise<ProductSalesStats[]>
calculateOrderSuggestion(stats: ProductSalesStats, coverageDays: number): OrderSuggestion
refreshStats(): Promise<void>
```

**Logique métier :**
- Gestion produits récents (< 30 jours d'existence)
- Détection rupture de stock (> 7 jours sans vente)
- Calcul suggestions basées sur moyenne journalière réelle
- Détermination urgence (high/medium/low)
- Estimation coût de commande

---

#### **Service 2 : `analytics.service.ts`**

**Fichier :** `src/services/supabase/analytics.service.ts`

**Contenu :** (Selon OPTIMISATION_SQL_COMPLETE.md lignes 918-1049)

**Fonctions principales :**
```typescript
getDailySummary(barId, startDate, endDate, groupBy): Promise<DailySalesSummary[]>
getTopProducts(barId, startDate, endDate, limit): Promise<TopProduct[]>
getBarStatsMultiPeriod(barId): Promise<BarStatsMultiPeriod>
getRevenueSummary(barId, startDate, endDate): Promise<RevenueSummary>
```

---

### **Composants React à Migrer**

#### **1. ForecastingSystem.tsx (Priorité P0)**

**Changements :**
```typescript
// AVANT (calculs client, lent)
const recentSales = sales.filter(sale => sale.status === 'validated');
const totalSold = recentSales.reduce(...);  // 10M opérations

// APRÈS (SQL pré-calculé, rapide)
const stats = await ForecastingService.getProductSalesStats(barId);
const suggestion = ForecastingService.calculateOrderSuggestion(stats[0], coverageDays);
```

**Gains attendus :**
- ⏱️ 3-5s → 50-100ms (× 50 plus rapide)
- 📡 50 MB → 50 KB (÷ 1000 bande passante)

---

#### **2. AccountingOverview.tsx (Priorité P0)**

**Changements :**
```typescript
// AVANT
const totalRevenue = sales.filter(...).reduce(...);  // 3× boucles

// APRÈS
const summary = await AnalyticsService.getRevenueSummary(barId, startDate, endDate);
```

---

#### **3. SalesHistory.tsx (Priorité P1)**

**Changements :**
```typescript
// AVANT
const topProducts = filteredSales.forEach(...);  // Double boucle

// APRÈS
const topProducts = await AnalyticsService.getTopProducts(barId, startDate, endDate, 10);
```

---

#### **4. BarStatsModal.tsx (Priorité P1)**

**Changements :**
```typescript
// AVANT
const caToday = sales.filter(...).reduce(...);  // 4× filtres

// APRÈS
const stats = await AnalyticsService.getBarStatsMultiPeriod(barId);
```

---

### **Optimisations Coûts Supabase (Critiques)**

#### **Optimisation 1 : CONCURRENT Refresh (P0 - Obligatoire)**

**Problème évité :** Blocage des lectures pendant refresh

**Solution :**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;
```

**Prérequis :** Index unique sur chaque vue matérialisée

---

#### **Optimisation 2 : Limite Historique (P1 - Recommandé)**

**Économie :** -30% stockage, +100% vitesse refresh

**Recommandations :**
- `product_sales_stats_mat` : **90 jours**
- `daily_sales_summary_mat` : **365 jours**
- `top_products_by_period_mat` : **365 jours**
- `bar_stats_multi_period_mat` : **90 jours**

---

#### **Optimisation 3 : Debouncing Refresh (P1 - Critique)**

**Économie :** -80% CPU refresh

**Phase 1 (Simple) :** Cron Job quotidien à 4h du matin
```sql
SELECT cron.schedule(
  'refresh-analytics-views',
  '0 4 * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY ...; $$
);
```

**Phase 2 (Avancé) :** Debouncing 5 minutes via pg_notify
```typescript
// Worker qui regroupe les notifications
setInterval(async () => {
  if (notifications.length > 0) {
    await supabase.rpc('refresh_all_analytics_views');
    notifications.length = 0;
  }
}, 5 * 60 * 1000);
```

---

#### **Optimisation 4 : Index Stratégiques (P2 - Performance)**

**Économie :** +300% vitesse refresh, -60% CPU

**Index critiques :**
```sql
-- Filtrage fréquent
CREATE INDEX CONCURRENTLY idx_sales_created_at_bar_status
ON sales(bar_id, created_at, status) WHERE status = 'validated';

-- JSONB items
CREATE INDEX CONCURRENTLY idx_sales_items_product_id
ON sales USING GIN ((items));

-- Dates avec business day
CREATE INDEX CONCURRENTLY idx_sales_created_at_date
ON sales(DATE(created_at - INTERVAL '4 hours'));
```

---

### **Résumé Phase 1**

**Livrables :**
- ✅ 4 migrations SQL avec optimisations intégrées
- ✅ 2 services TypeScript (forecasting, analytics)
- ✅ 4 composants React migrés
- ✅ Cron Job quotidien configuré
- ✅ Index stratégiques créés

**Gains attendus :**
- Performance : **× 25-50 plus rapide**
- Bande passante : **÷ 1000**
- Coût Supabase : **-$4-150/mois**

**Durée estimée :** 1-2 semaines

---

## 🎯 Phase 2 : Système de Prévisions de Ventes (Semaine 3-4)

### **Objectif**
Implémenter le sous-menu "Prévisions de Ventes" avec modèles statistiques adaptés à la qualité des données.

### **Migration 047 : Prévisions Ventes Adaptatives**

**Fichier :** `supabase/migrations/047_sales_forecasting_adaptive.sql`

#### **1. Table `bar_events` (Gestion événements)**

```sql
CREATE TABLE bar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'holiday', 'weekend', 'promotion', 'anniversary', 'custom'
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0, -- 1.5 = +50%, 2.0 = +100%
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- 'weekly_friday', 'monthly_15', 'yearly_12_25'
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bar_events_bar_date ON bar_events(bar_id, event_date);
CREATE INDEX idx_bar_events_type ON bar_events(event_type);

-- RLS
ALTER TABLE bar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events for their bars"
ON bar_events FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage events for their bars"
ON bar_events FOR ALL
USING (bar_id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
));
```

---

#### **2. Fonction `assess_data_quality()` (Qualité données)**

**Objectif :** Déterminer quel modèle statistique utiliser

```sql
CREATE OR REPLACE FUNCTION assess_data_quality(p_bar_id UUID)
RETURNS TABLE (
  quality_level TEXT,
  days_of_data INT,
  total_sales INT,
  avg_daily_sales DECIMAL,
  recommendation TEXT
) AS $$
DECLARE
  v_days_of_data INT;
  v_total_sales INT;
  v_avg_daily_sales DECIMAL;
BEGIN
  -- Compter les jours avec des ventes
  SELECT
    COUNT(DISTINCT DATE(created_at - INTERVAL '4 hours')),
    COUNT(*) FILTER (WHERE status = 'validated'),
    COUNT(*) FILTER (WHERE status = 'validated')::DECIMAL /
      NULLIF(COUNT(DISTINCT DATE(created_at - INTERVAL '4 hours')), 0)
  INTO v_days_of_data, v_total_sales, v_avg_daily_sales
  FROM sales
  WHERE bar_id = p_bar_id
    AND created_at >= NOW() - INTERVAL '90 days'
    AND status = 'validated';

  -- Déterminer le niveau de qualité
  IF v_days_of_data < 30 OR v_total_sales < 100 THEN
    quality_level := 'insufficient';
    recommendation := 'Utiliser moyenne mobile simple avec facteurs d''ajustement';
  ELSIF v_days_of_data >= 30 AND v_days_of_data < 90 THEN
    quality_level := 'medium';
    recommendation := 'Utiliser EWMA avec détection saisonnalité hebdomadaire';
  ELSE
    quality_level := 'rich';
    recommendation := 'Utiliser ARIMA simplifié avec variables externes';
  END IF;

  days_of_data := v_days_of_data;
  total_sales := v_total_sales;
  avg_daily_sales := COALESCE(v_avg_daily_sales, 0);

  RETURN QUERY SELECT
    assess_data_quality.quality_level,
    assess_data_quality.days_of_data,
    assess_data_quality.total_sales,
    assess_data_quality.avg_daily_sales,
    assess_data_quality.recommendation;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

#### **3. Fonction `get_date_factors()` (Événements spéciaux)**

**Objectif :** Calculer les facteurs multiplicatifs pour une date donnée

```sql
CREATE OR REPLACE FUNCTION get_date_factors(
  p_date DATE,
  p_bar_id UUID
) RETURNS TABLE (
  base_factor DECIMAL,
  weekend_factor DECIMAL,
  holiday_factor DECIMAL,
  event_factor DECIMAL,
  combined_factor DECIMAL,
  event_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH date_analysis AS (
    SELECT
      1.0 as base_factor,

      -- Weekend (Vendredi +20%, Samedi +40%)
      CASE EXTRACT(DOW FROM p_date)
        WHEN 5 THEN 1.20 -- Vendredi
        WHEN 6 THEN 1.40 -- Samedi
        ELSE 1.0
      END as weekend_factor,

      -- Jours fériés du Bénin
      CASE
        -- Jours fériés fixes
        WHEN EXTRACT(MONTH FROM p_date) = 1 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.60 -- Nouvel An
        WHEN EXTRACT(MONTH FROM p_date) = 1 AND EXTRACT(DAY FROM p_date) = 10 THEN 1.40 -- Fête du Vodoun
        WHEN EXTRACT(MONTH FROM p_date) = 5 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.30 -- Fête du Travail
        WHEN EXTRACT(MONTH FROM p_date) = 8 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.50 -- Fête Nationale (Indépendance)
        WHEN EXTRACT(MONTH FROM p_date) = 10 AND EXTRACT(DAY FROM p_date) = 26 THEN 1.30 -- Fête des Forces Armées
        WHEN EXTRACT(MONTH FROM p_date) = 11 AND EXTRACT(DAY FROM p_date) = 1 THEN 1.20 -- Toussaint
        WHEN EXTRACT(MONTH FROM p_date) = 11 AND EXTRACT(DAY FROM p_date) = 30 THEN 1.40 -- Fête Nationale (Indépendance du Dahomey)
        WHEN EXTRACT(MONTH FROM p_date) = 12 AND EXTRACT(DAY FROM p_date) = 25 THEN 1.70 -- Noël
        WHEN EXTRACT(MONTH FROM p_date) = 12 AND EXTRACT(DAY FROM p_date) = 31 THEN 1.65 -- Réveillon
        -- Note: Jours fériés religieux variables (Pâques, Ascension, Pentecôte, Tabaski, Ramadan)
        -- peuvent être ajoutés via la table bar_events avec is_recurring = false
        ELSE 1.0
      END as holiday_factor,

      -- Événements bar spécifiques
      COALESCE(
        (SELECT MAX(impact_multiplier)
         FROM bar_events
         WHERE bar_id = p_bar_id
           AND event_date = p_date
           AND is_active = true
        ), 1.0
      ) as event_factor,

      -- Nom de l'événement (pour affichage)
      (SELECT event_name
       FROM bar_events
       WHERE bar_id = p_bar_id
         AND event_date = p_date
         AND is_active = true
       ORDER BY impact_multiplier DESC
       LIMIT 1
      ) as event_name
  )
  SELECT
    base_factor,
    weekend_factor,
    holiday_factor,
    event_factor,
    -- Le facteur combiné prend le maximum (pas multiplicatif pour éviter explosion)
    GREATEST(weekend_factor, holiday_factor, event_factor) as combined_factor,
    COALESCE(event_name,
      CASE
        WHEN EXTRACT(DOW FROM p_date) = 5 THEN 'Vendredi'
        WHEN EXTRACT(DOW FROM p_date) = 6 THEN 'Samedi'
        WHEN EXTRACT(MONTH FROM p_date) = 1 AND EXTRACT(DAY FROM p_date) = 1 THEN 'Nouvel An'
        WHEN EXTRACT(MONTH FROM p_date) = 12 AND EXTRACT(DAY FROM p_date) = 25 THEN 'Noël'
        ELSE NULL
      END
    ) as event_name
  FROM date_analysis;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

#### **4. Fonctions de Prévision par Niveau**

**Niveau 1 : Moyenne Mobile Simple**

```sql
CREATE OR REPLACE FUNCTION forecast_revenue_simple(
  p_bar_id UUID,
  p_forecast_days INT DEFAULT 7
) RETURNS TABLE (
  forecast_date DATE,
  base_revenue DECIMAL,
  adjusted_revenue DECIMAL,
  factor DECIMAL,
  event_name TEXT,
  confidence_lower DECIMAL,
  confidence_upper DECIMAL
) AS $$
DECLARE
  v_avg_daily_revenue DECIMAL;
BEGIN
  -- Calculer la moyenne journalière des 14 derniers jours
  SELECT AVG(daily_revenue) INTO v_avg_daily_revenue
  FROM (
    SELECT
      DATE(created_at - INTERVAL '4 hours') as sale_date,
      SUM(total) as daily_revenue
    FROM sales
    WHERE bar_id = p_bar_id
      AND status = 'validated'
      AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(created_at - INTERVAL '4 hours')
  ) daily_sales;

  v_avg_daily_revenue := COALESCE(v_avg_daily_revenue, 0);

  -- Générer les prévisions pour les N prochains jours
  RETURN QUERY
  SELECT
    (CURRENT_DATE + i)::DATE as forecast_date,
    v_avg_daily_revenue as base_revenue,
    v_avg_daily_revenue * df.combined_factor as adjusted_revenue,
    df.combined_factor as factor,
    df.event_name,
    v_avg_daily_revenue * df.combined_factor * 0.8 as confidence_lower,  -- ±20%
    v_avg_daily_revenue * df.combined_factor * 1.2 as confidence_upper
  FROM generate_series(1, p_forecast_days) i
  CROSS JOIN LATERAL get_date_factors((CURRENT_DATE + i)::DATE, p_bar_id) df;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

**Niveau 2 : EWMA avec Saisonnalité**

```sql
CREATE OR REPLACE FUNCTION forecast_revenue_ewma(
  p_bar_id UUID,
  p_alpha DECIMAL DEFAULT 0.3,
  p_forecast_days INT DEFAULT 7
) RETURNS TABLE (
  forecast_date DATE,
  base_revenue DECIMAL,
  trend_adjusted DECIMAL,
  seasonal_adjusted DECIMAL,
  final_forecast DECIMAL,
  event_name TEXT,
  confidence_lower DECIMAL,
  confidence_upper DECIMAL
) AS $$
DECLARE
  v_ewma_current DECIMAL;
  v_trend DECIMAL;
  v_stddev DECIMAL;
BEGIN
  -- Calculer EWMA et tendance sur les 30 derniers jours
  WITH daily_revenues AS (
    SELECT
      DATE(created_at - INTERVAL '4 hours') as sale_date,
      SUM(total) as daily_revenue,
      EXTRACT(DOW FROM DATE(created_at - INTERVAL '4 hours')) as day_of_week
    FROM sales
    WHERE bar_id = p_bar_id
      AND status = 'validated'
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at - INTERVAL '4 hours')
    ORDER BY sale_date
  ),
  ewma_calc AS (
    SELECT
      sale_date,
      daily_revenue,
      -- EWMA simplifiée : moyenne pondérée récente
      AVG(daily_revenue) OVER (
        ORDER BY sale_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ) as ewma_value
    FROM daily_revenues
  )
  SELECT
    AVG(ewma_value),
    REGR_SLOPE(daily_revenue, EXTRACT(EPOCH FROM sale_date)) * 86400,  -- Tendance par jour
    STDDEV(daily_revenue)
  INTO v_ewma_current, v_trend, v_stddev
  FROM ewma_calc
  JOIN daily_revenues USING (sale_date);

  v_ewma_current := COALESCE(v_ewma_current, 0);
  v_trend := COALESCE(v_trend, 0);
  v_stddev := COALESCE(v_stddev, 0);

  -- Générer prévisions avec tendance et saisonnalité
  RETURN QUERY
  SELECT
    (CURRENT_DATE + i)::DATE as forecast_date,
    v_ewma_current as base_revenue,
    v_ewma_current + (v_trend * i) as trend_adjusted,
    -- Saisonnalité hebdomadaire (facteur jour de semaine)
    (v_ewma_current + v_trend * i) *
      (SELECT AVG(weekly_factor) FROM get_weekly_seasonality(p_bar_id, EXTRACT(DOW FROM CURRENT_DATE + i)))
      as seasonal_adjusted,
    -- Forecast final = tendance + saisonnalité + événements
    (v_ewma_current + v_trend * i) *
      (SELECT AVG(weekly_factor) FROM get_weekly_seasonality(p_bar_id, EXTRACT(DOW FROM CURRENT_DATE + i))) *
      df.combined_factor as final_forecast,
    df.event_name,
    -- Intervalle de confiance ±15%
    (v_ewma_current + v_trend * i) * df.combined_factor * 0.85 as confidence_lower,
    (v_ewma_current + v_trend * i) * df.combined_factor * 1.15 as confidence_upper
  FROM generate_series(1, p_forecast_days) i
  CROSS JOIN LATERAL get_date_factors((CURRENT_DATE + i)::DATE, p_bar_id) df;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

**Fonction Helper : Saisonnalité Hebdomadaire**

```sql
CREATE OR REPLACE FUNCTION get_weekly_seasonality(
  p_bar_id UUID,
  p_day_of_week INT
) RETURNS TABLE (
  weekly_factor DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      EXTRACT(DOW FROM DATE(created_at - INTERVAL '4 hours')) as dow,
      AVG(daily_revenue) as avg_revenue
    FROM (
      SELECT
        DATE(created_at - INTERVAL '4 hours') as sale_date,
        SUM(total) as daily_revenue
      FROM sales
      WHERE bar_id = p_bar_id
        AND status = 'validated'
        AND created_at >= NOW() - INTERVAL '60 days'
      GROUP BY DATE(created_at - INTERVAL '4 hours')
    ) daily_sales
    CROSS JOIN LATERAL (SELECT created_at FROM sales WHERE bar_id = p_bar_id LIMIT 1) s
    GROUP BY EXTRACT(DOW FROM DATE(s.created_at - INTERVAL '4 hours'))
  ),
  overall_avg AS (
    SELECT AVG(avg_revenue) as overall_average FROM daily_avg
  )
  SELECT
    COALESCE(daily_avg.avg_revenue / NULLIF(overall_avg.overall_average, 0), 1.0) as weekly_factor
  FROM daily_avg
  CROSS JOIN overall_avg
  WHERE daily_avg.dow = p_day_of_week;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

#### **5. Vue Dashboard Principale**

```sql
CREATE OR REPLACE VIEW sales_forecast_dashboard AS
WITH data_quality AS (
  SELECT * FROM assess_data_quality(
    (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1)
  )
)
SELECT
  dq.quality_level,
  dq.days_of_data,
  dq.total_sales,
  dq.recommendation,

  -- Choisir la fonction de prévision selon qualité
  CASE
    WHEN dq.quality_level = 'insufficient' THEN
      (SELECT json_agg(row_to_json(f)) FROM forecast_revenue_simple(
        (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1), 7
      ) f)
    WHEN dq.quality_level = 'medium' THEN
      (SELECT json_agg(row_to_json(f)) FROM forecast_revenue_ewma(
        (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1), 0.3, 7
      ) f)
    ELSE
      -- Pour 'rich', utiliser EWMA avec plus de jours (à améliorer avec ARIMA)
      (SELECT json_agg(row_to_json(f)) FROM forecast_revenue_ewma(
        (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1), 0.3, 30
      ) f)
  END as forecasts_7d,

  -- Événements à venir
  (SELECT json_agg(row_to_json(e))
   FROM bar_events e
   WHERE e.bar_id = (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1)
     AND e.event_date >= CURRENT_DATE
     AND e.event_date <= CURRENT_DATE + 30
     AND e.is_active = true
   ORDER BY e.event_date
  ) as upcoming_events

FROM data_quality dq;

GRANT SELECT ON sales_forecast_dashboard TO authenticated;
```

---

### **Services TypeScript Phase 2**

#### **Service 3 : `events.service.ts`**

**Fichier :** `src/services/supabase/events.service.ts`

```typescript
export interface BarEvent {
  id: string;
  bar_id: string;
  event_type: 'holiday' | 'weekend' | 'promotion' | 'anniversary' | 'custom';
  event_name: string;
  event_date: string;
  impact_multiplier: number;
  is_recurring: boolean;
  recurrence_rule?: string;
  notes?: string;
  is_active: boolean;
}

export const EventsService = {
  /**
   * Créer un nouvel événement
   */
  async createEvent(barId: string, event: Partial<BarEvent>): Promise<BarEvent> {
    const { data, error } = await supabase
      .from('bar_events')
      .insert({
        bar_id: barId,
        ...event,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer les événements à venir
   */
  async getUpcomingEvents(barId: string, days: number = 30): Promise<BarEvent[]> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const { data, error } = await supabase
      .from('bar_events')
      .select('*')
      .eq('bar_id', barId)
      .eq('is_active', true)
      .gte('event_date', new Date().toISOString().split('T')[0])
      .lte('event_date', endDate.toISOString().split('T')[0])
      .order('event_date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupérer l'historique des événements et leur impact réel
   */
  async getEventImpactHistory(barId: string): Promise<any[]> {
    // Comparer CA jour d'événement vs moyenne 7 jours avant
    const { data, error } = await supabase.rpc('get_event_impact_history', {
      p_bar_id: barId,
    });

    if (error) throw error;
    return data || [];
  },

  /**
   * Mettre à jour un événement
   */
  async updateEvent(eventId: string, updates: Partial<BarEvent>): Promise<BarEvent> {
    const { data, error } = await supabase
      .from('bar_events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprimer (désactiver) un événement
   */
  async deleteEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('bar_events')
      .update({ is_active: false })
      .eq('id', eventId);

    if (error) throw error;
  },
};
```

---

#### **Extension de `forecasting.service.ts`**

```typescript
// Ajouter ces fonctions au ForecastingService existant

export interface SalesForecast {
  forecast_date: string;
  base_revenue: number;
  adjusted_revenue: number;
  factor: number;
  event_name?: string;
  confidence_lower: number;
  confidence_upper: number;
}

export interface DataQuality {
  quality_level: 'insufficient' | 'medium' | 'rich';
  days_of_data: number;
  total_sales: number;
  avg_daily_sales: number;
  recommendation: string;
}

export const ForecastingService = {
  // ... fonctions existantes (Phase 1)

  /**
   * Évaluer la qualité des données disponibles
   */
  async assessDataQuality(barId: string): Promise<DataQuality> {
    const { data, error } = await supabase.rpc('assess_data_quality', {
      p_bar_id: barId,
    });

    if (error) throw error;
    return data[0];
  },

  /**
   * Récupérer les prévisions de ventes (adaptatives selon qualité)
   */
  async getSalesForecast(
    barId: string,
    days: number = 7
  ): Promise<{
    quality: DataQuality;
    forecasts: SalesForecast[];
    upcomingEvents: BarEvent[];
  }> {
    // Évaluer qualité
    const quality = await this.assessDataQuality(barId);

    // Choisir la fonction appropriée
    let rpcFunction: string;
    if (quality.quality_level === 'insufficient') {
      rpcFunction = 'forecast_revenue_simple';
    } else {
      rpcFunction = 'forecast_revenue_ewma';
    }

    // Récupérer prévisions
    const { data: forecasts, error: forecastError } = await supabase.rpc(rpcFunction, {
      p_bar_id: barId,
      p_forecast_days: days,
    });

    if (forecastError) throw forecastError;

    // Récupérer événements à venir
    const upcomingEvents = await EventsService.getUpcomingEvents(barId, days);

    return {
      quality,
      forecasts: forecasts || [],
      upcomingEvents,
    };
  },

  /**
   * Récupérer prévisions pour les top produits
   */
  async getTopProductsForecast(
    barId: string,
    days: number = 7,
    limit: number = 20
  ): Promise<any[]> {
    // Utilise product_sales_stats + facteurs événements
    const { data, error } = await supabase.rpc('forecast_top_products', {
      p_bar_id: barId,
      p_forecast_days: days,
      p_limit: limit,
    });

    if (error) throw error;
    return data || [];
  },
};
```

---

### **Composant React : SalesForecastView**

**Fichier :** `src/components/ForecastingSystem.tsx` (remplacer placeholder ligne 697-726)

```typescript
function SalesForecastView({ isMobile, formatPrice, currentBar }: any) {
  const [forecastDays, setForecastDays] = useState(7);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { showError } = useFeedback();

  // Charger les prévisions
  useEffect(() => {
    if (!currentBar) return;

    const loadForecasts = async () => {
      setIsLoading(true);
      try {
        const data = await ForecastingService.getSalesForecast(
          currentBar.id,
          forecastDays
        );
        setForecastData(data);
      } catch (error) {
        console.error('Error loading forecasts:', error);
        showError('Erreur lors du chargement des prévisions');
      } finally {
        setIsLoading(false);
      }
    };

    loadForecasts();
  }, [currentBar, forecastDays]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Calcul des prévisions...</p>
        </div>
      </div>
    );
  }

  if (!forecastData) return null;

  const { quality, forecasts, upcomingEvents } = forecastData;

  return (
    <div className="p-6 space-y-6">
      {/* Indicateur de qualité des données */}
      <div className={`p-4 rounded-lg border-2 ${
        quality.quality_level === 'rich' ? 'bg-green-50 border-green-200' :
        quality.quality_level === 'medium' ? 'bg-amber-50 border-amber-200' :
        'bg-orange-50 border-orange-200'
      }`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-3 h-3 rounded-full ${
            quality.quality_level === 'rich' ? 'bg-green-500' :
            quality.quality_level === 'medium' ? 'bg-amber-500' :
            'bg-orange-500'
          }`} />
          <h3 className="font-semibold">
            Qualité des données : {
              quality.quality_level === 'rich' ? 'Excellente' :
              quality.quality_level === 'medium' ? 'Moyenne' :
              'Limitée'
            }
          </h3>
        </div>
        <p className="text-sm text-gray-700">
          {quality.days_of_data} jours de données • {quality.total_sales} ventes •
          Moyenne {quality.avg_daily_sales.toFixed(1)} ventes/jour
        </p>
        <p className="text-xs text-gray-600 mt-2">
          {quality.recommendation}
        </p>
      </div>

      {/* Sélecteur de période */}
      <div className="flex gap-2">
        {[7, 15, 30].map(days => (
          <button
            key={days}
            onClick={() => setForecastDays(days)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              forecastDays === days
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {days} jours
          </button>
        ))}
      </div>

      {/* Graphique prévisions */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-4">Prévisions de Chiffre d'Affaires</h3>
        {/* Ici : Intégrer un graphique (Chart.js ou Recharts) */}
        <div className="space-y-2">
          {forecasts.slice(0, 7).map((forecast: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div>
                <div className="font-medium">
                  {new Date(forecast.forecast_date).toLocaleDateString('fr-FR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </div>
                {forecast.event_name && (
                  <div className="text-xs text-amber-600">
                    🎉 {forecast.event_name}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatPrice(forecast.adjusted_revenue || forecast.final_forecast)}
                </div>
                <div className="text-xs text-gray-500">
                  {formatPrice(forecast.confidence_lower)} - {formatPrice(forecast.confidence_upper)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Événements à venir */}
      {upcomingEvents.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Événements à venir
          </h3>
          <div className="space-y-2">
            {upcomingEvents.map((event: BarEvent) => (
              <div key={event.id} className="flex items-center justify-between p-2 bg-white rounded">
                <div>
                  <div className="font-medium">{event.event_name}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(event.event_date).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="text-sm font-semibold text-purple-600">
                  +{((event.impact_multiplier - 1) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton gestion événements */}
      <button
        onClick={() => {/* Ouvrir modal gestion événements */}}
        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
      >
        ➕ Gérer les événements
      </button>
    </div>
  );
}
```

---

### **Résumé Phase 2**

**Livrables :**
- ✅ Migration 047 (table bar_events + fonctions prévisions)
- ✅ Service EventsService complet
- ✅ Extension ForecastingService (prévisions ventes)
- ✅ Composant SalesForecastView fonctionnel
- ✅ Système adaptatif selon qualité données

**Modèles implémentés :**
- ✅ Moyenne Mobile Simple (< 30 jours)
- ✅ EWMA + Saisonnalité (30-90 jours)
- ⏳ ARIMA simplifié (> 90 jours) - Phase 3

**Événements gérés :**
- ✅ Weekends (facteur automatique)
- ✅ Jours fériés du Bénin (9 jours pré-programmés)
  - 1er janvier : Nouvel An
  - 10 janvier : Fête du Vodoun
  - 1er mai : Fête du Travail
  - 1er août : Fête Nationale (Indépendance)
  - 26 octobre : Fête des Forces Armées
  - 1er novembre : Toussaint
  - 30 novembre : Fête Nationale (Dahomey)
  - 25 décembre : Noël
  - 31 décembre : Réveillon
- ✅ Jours fériés religieux variables (Pâques, Ascension, Pentecôte, Tabaski, Ramadan) - via saisie manuelle
- ✅ Promotions (saisie manuelle)
- ✅ Anniversaires bar (saisie manuelle)
- ✅ Événements custom (saisie manuelle)

**Durée estimée :** 1-2 semaines

---

## 🎯 Phase 3 : Connexion DRY Stock ← Ventes (Semaine 5)

### **Objectif**
Réutiliser les prévisions de ventes pour calculer automatiquement les besoins en stock.

### **Principe DRY (Don't Repeat Yourself)**

```
Prévisions Ventes (déjà calculées)
         ↓
Conversion CA → Quantités unitaires
         ↓
Demande prévue par produit
         ↓
+ Safety Stock (Z × σ × √Lead Time)
         ↓
= Recommandations de réapprovisionnement
```

### **Fonction SQL : Connexion Ventes → Stock**

```sql
-- Migration 048 : Connexion DRY Stock depuis Ventes
CREATE OR REPLACE FUNCTION calculate_stock_needs_from_sales_forecast(
  p_bar_id UUID,
  p_forecast_days INT DEFAULT 7
) RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  current_stock INT,

  -- Depuis prévisions ventes
  forecasted_revenue DECIMAL,
  forecasted_units INT,

  -- Calculs stock
  safety_stock INT,
  reorder_point INT,
  quantity_to_order INT,
  eoq INT,

  urgency TEXT,
  reasoning TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH sales_forecasts AS (
    -- Réutiliser les prévisions de ventes
    SELECT * FROM forecast_revenue_ewma(p_bar_id, 0.3, p_forecast_days)
  ),
  total_forecast AS (
    SELECT SUM(adjusted_revenue) as total_revenue
    FROM sales_forecasts
  ),
  product_mix AS (
    -- Mix produit historique (% du CA par produit)
    SELECT
      pss.product_id,
      pss.product_name,
      pss.current_stock,
      pss.alert_threshold,
      pss.selling_price,
      pss.avg_purchase_cost,
      pss.daily_average,
      -- Part du CA historique
      (pss.daily_average * pss.selling_price) /
        NULLIF((SELECT SUM(daily_average * selling_price) FROM product_sales_stats WHERE bar_id = p_bar_id), 0)
        as revenue_share
    FROM product_sales_stats pss
    WHERE pss.bar_id = p_bar_id
      AND pss.daily_average > 0
  )
  SELECT
    pm.product_id,
    pm.product_name,
    pm.current_stock,

    -- Revenue prévu pour ce produit (basé sur mix historique)
    (tf.total_revenue * pm.revenue_share)::DECIMAL as forecasted_revenue,

    -- Units prévues (revenue / prix moyen)
    CEIL((tf.total_revenue * pm.revenue_share) / NULLIF(pm.selling_price, 0))::INT as forecasted_units,

    -- Safety stock (pour 95% service level, Z=1.65)
    CEIL(1.65 * pm.daily_average * SQRT(7))::INT as safety_stock,

    -- Reorder point
    (pm.daily_average * 7 + CEIL(1.65 * pm.daily_average * SQRT(7)))::INT as reorder_point,

    -- Quantité à commander
    GREATEST(
      0,
      (pm.daily_average * p_forecast_days)::INT +
      CEIL(1.65 * pm.daily_average * SQRT(7))::INT -
      pm.current_stock
    )::INT as quantity_to_order,

    -- EOQ (Economic Order Quantity)
    CEIL(SQRT(2 * pm.daily_average * 30 * 5000 / NULLIF(pm.avg_purchase_cost * 0.2, 0)))::INT as eoq,

    -- Urgence
    CASE
      WHEN pm.current_stock <= 0 THEN 'high'
      WHEN pm.current_stock <= pm.alert_threshold / 2 THEN 'high'
      WHEN pm.current_stock <= pm.alert_threshold THEN 'medium'
      ELSE 'low'
    END as urgency,

    -- Explication
    format(
      'Prévision %s unités sur %s jours (basé sur %s FCFA prévu). Stock actuel: %s, Seuil: %s',
      CEIL((tf.total_revenue * pm.revenue_share) / NULLIF(pm.selling_price, 0)),
      p_forecast_days,
      (tf.total_revenue * pm.revenue_share)::INT,
      pm.current_stock,
      pm.alert_threshold
    ) as reasoning

  FROM product_mix pm
  CROSS JOIN total_forecast tf
  ORDER BY
    CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    quantity_to_order DESC;
END;
$$ LANGUAGE plpgsql STABLE;
```

### **Vue Publique : Stock Recommendations**

```sql
CREATE OR REPLACE VIEW stock_recommendations_from_forecast AS
SELECT * FROM calculate_stock_needs_from_sales_forecast(
  (SELECT bar_id FROM bar_members WHERE user_id = auth.uid() LIMIT 1),
  7
);

GRANT SELECT ON stock_recommendations_from_forecast TO authenticated;
```

### **Mise à jour de ForecastingService**

```typescript
// Ajouter au ForecastingService
export interface StockRecommendation {
  product_id: string;
  product_name: string;
  current_stock: number;
  forecasted_revenue: number;
  forecasted_units: number;
  safety_stock: number;
  reorder_point: number;
  quantity_to_order: number;
  eoq: number;
  urgency: 'high' | 'medium' | 'low';
  reasoning: string;
}

export const ForecastingService = {
  // ... fonctions existantes

  /**
   * Récupérer recommandations stock basées sur prévisions ventes (DRY)
   */
  async getStockRecommendationsFromForecast(
    barId: string,
    days: number = 7
  ): Promise<StockRecommendation[]> {
    const { data, error } = await supabase.rpc(
      'calculate_stock_needs_from_sales_forecast',
      {
        p_bar_id: barId,
        p_forecast_days: days,
      }
    );

    if (error) throw error;
    return data || [];
  },
};
```

### **Mise à jour du Composant ForecastingSystem**

**Onglet "Prévision Stock" : Remplacer ancien calcul par DRY**

```typescript
// Dans ForecastingSystem.tsx, onglet "stock"
const loadStockRecommendations = async () => {
  setIsLoadingStock(true);
  try {
    // Nouvelle méthode DRY : réutilise prévisions ventes
    const recommendations = await ForecastingService.getStockRecommendationsFromForecast(
      currentBar.id,
      coverageDays
    );
    setOrderSuggestions(recommendations);

    // Calculer coût total
    const totalCost = recommendations.reduce(
      (sum, r) => sum + (r.quantity_to_order * (r.forecasted_revenue / r.forecasted_units || 0)),
      0
    );
    setTotalOrderCost(totalCost);
  } catch (error) {
    console.error('Error loading stock recommendations:', error);
    showError('Erreur lors du chargement des recommandations');
  } finally {
    setIsLoadingStock(false);
  }
};
```

### **Résumé Phase 3**

**Livrables :**
- ✅ Migration 048 (fonction DRY stock ← ventes)
- ✅ Vue stock_recommendations_from_forecast
- ✅ Extension ForecastingService
- ✅ Mise à jour onglet "Prévision Stock"

**Architecture DRY validée :**
```
forecast_revenue_ewma()  (source unique de vérité)
         ↓
  [Réutilisé par]
         ↓
calculate_stock_needs_from_sales_forecast()
         ↓
  [Affiché dans]
         ↓
ForecastingSystem > Onglet "Prévision Stock"
```

**Avantages :**
- ✅ Zéro duplication de code
- ✅ Cohérence garantie (ventes = stock)
- ✅ Maintenance simplifiée (1 bug = 1 fix)
- ✅ Performance optimale (calculs réutilisés)

**Durée estimée :** 3-5 jours

---

## 📊 Résumé Global de la Roadmap

### **Timeline Complète**

| Phase | Durée | Effort | Gains |
|-------|-------|--------|-------|
| **Phase 1 : SQL Optimisation** | 1-2 sem | Moyen | Performance × 50, -$10-150/mois |
| **Phase 2 : Prévisions Ventes** | 1-2 sem | Élevé | Fonctionnalité majeure, événements |
| **Phase 3 : Connexion DRY Stock** | 3-5 jours | Faible | Architecture propre, maintenable |
| **TOTAL** | **4-5 semaines** | - | **Système complet et optimisé** |

### **Gains Cumulés Attendus**

**Performance :**
- Temps chargement : 8-13s → 0.2-0.5s (**× 25-50**)
- Bande passante : 115 MB → 68 KB (**÷ 1700**)
- Scalabilité : 10k ventes max → ∞

**Coûts Supabase :**
- Bande passante : **-$10-150/mois**
- CPU refresh : **-80%** (gratuit mais optimisé)
- Stockage : **+50 MB** (négligeable)
- **TOTAL : -$120-1800/an d'économies**

**Fonctionnalités :**
- ✅ Prévisions ventes adaptatives (3 modèles selon données)
- ✅ Gestion événements complets (weekends, fêtes, promos, anniversaires)
- ✅ Prévisions stock DRY (réutilise ventes)
- ✅ Safety stock, EOQ, reorder point automatiques
- ✅ Intervalles de confiance sur prévisions
- ✅ Dashboard temps réel avec indicateurs fraîcheur

---

## ✅ Checklist de Validation

### **Phase 1 (SQL Optimisation)**
- [ ] Migration 037 créée et testée (product_sales_stats_mat)
- [ ] Migration 038 créée et testée (daily_sales_summary_mat)
- [ ] Migration 039 créée et testée (top_products_by_period_mat)
- [ ] Migration 040 créée et testée (bar_stats_multi_period_mat)
- [ ] Tous les REFRESH sont CONCURRENT
- [ ] Limites historique appliquées (90j/365j)
- [ ] Index stratégiques créés
- [ ] Cron Job configuré (refresh 4h du matin)
- [ ] ForecastingService implémenté et testé
- [ ] AnalyticsService implémenté et testé
- [ ] ForecastingSystem migré et fonctionnel
- [ ] AccountingOverview migré et fonctionnel
- [ ] SalesHistory migré et fonctionnel
- [ ] BarStatsModal migré et fonctionnel
- [ ] Performance validée (× 25 minimum)
- [ ] Monitoring coûts configuré

### **Phase 2 (Prévisions Ventes)**
- [ ] Migration 047 créée (bar_events + fonctions)
- [ ] Table bar_events créée avec RLS
- [ ] Fonction assess_data_quality() testée
- [ ] Fonction get_date_factors() testée (weekends, fêtes)
- [ ] Fonction forecast_revenue_simple() testée
- [ ] Fonction forecast_revenue_ewma() testée
- [ ] Fonction get_weekly_seasonality() testée
- [ ] Vue sales_forecast_dashboard créée
- [ ] EventsService implémenté et testé
- [ ] ForecastingService étendu (prévisions ventes)
- [ ] Composant SalesForecastView implémenté
- [ ] Graphiques prévisions fonctionnels
- [ ] Gestion événements fonctionnelle
- [ ] Système adaptatif validé (3 niveaux qualité)

### **Phase 3 (Connexion DRY Stock)**
- [ ] Migration 048 créée (fonction DRY stock ← ventes)
- [ ] Fonction calculate_stock_needs_from_sales_forecast() testée
- [ ] Vue stock_recommendations_from_forecast créée
- [ ] ForecastingService étendu (stock DRY)
- [ ] Onglet "Prévision Stock" mis à jour
- [ ] Cohérence ventes-stock validée
- [ ] Safety stock calculé correctement
- [ ] EOQ calculé correctement
- [ ] Zéro duplication de code confirmée

### **Post-Déploiement**
- [ ] Toutes les migrations appliquées en production
- [ ] Backup base de données fait
- [ ] Tests smoke passés
- [ ] Monitoring actif (Dashboard Supabase)
- [ ] Économies coûts mesurées (comparer factures avant/après)
- [ ] Feedback utilisateurs collecté
- [ ] Documentation mise à jour
- [ ] Performance en production validée (× 25 minimum)

---

## 📚 Références

- **OPTIMISATION_SQL_COMPLETE.md** : Détails techniques Phase 1
- **Migrations Supabase** : `supabase/migrations/037-048_*.sql`
- **Services** : `src/services/supabase/{forecasting,analytics,events}.service.ts`
- **Composants** : `src/components/ForecastingSystem.tsx`

---

**Document créé le :** 26 Novembre 2025
**Dernière mise à jour :** 26 Novembre 2025
**Auteur :** Claude Code
**Statut :** 📋 Prêt pour implémentation
**Priorité :** 🔴 CRITIQUE (Impact majeur performance + fonctionnalités)
