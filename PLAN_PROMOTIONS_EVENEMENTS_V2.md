# Plan d'Implémentation : Système de Promotions & Événements (Version 2.0)

**Date :** 27 Novembre 2025
**Version :** 2.0 (Production-Ready)
**Objectif :** Système complet de promotions et événements pour enrichir les données de prévisions
**Durée estimée :** 5-6 semaines (timeline réaliste)
**Prérequis :** Migration 058 (Business Day 6h) appliquée

---

## 📋 Table des Matières

1. [Résolution Conflits & Architecture](#résolution-conflits--architecture)
2. [Phase 1 : Fondations SQL & Types](#phase-1--fondations-sql--types)
3. [Phase 2 : Services & Logique Métier](#phase-2--services--logique-métier)
4. [Phase 3 : Intégration QuickSale](#phase-3--intégration-quicksale)
5. [Phase 4 : Gestion & Analytics](#phase-4--gestion--analytics)
6. [Tests & Validation](#tests--validation)
7. [Checklist Implémentation](#checklist-implémentation)

---

## 🔧 Résolution Conflits & Architecture

### Conflit Migration 047

**PROBLÈME :** Deux documents (ROADMAP_FORECASTING et PLAN_PROMOTIONS) utilisent migration 047 et créent `bar_events`

**SOLUTION ADOPTÉE : Architecture Modulaire**

```
Migration 059_promotions_system.sql
  ├── Tables Promotions (promotions, promotion_applications)
  └── Fonction helper increment_promotion_uses()

Réutilise bar_events de ROADMAP_FORECASTING (Migration 047)
  ├── Si déjà créée → Skip
  └── Si non créée → Créer avec ENUM consolidé
```

### ENUM `event_type` Consolidé

**Fusion des deux définitions :**

```sql
CREATE TYPE event_type AS ENUM (
  -- Jours fériés (ROADMAP)
  'holiday',

  -- Événements bar (PLAN_PROMOTIONS)
  'anniversary',    -- Anniversaire bar
  'sports',         -- Match important
  'theme_night',    -- Soirée thématique

  -- Promotions liées (NOUVEAU)
  'promotion_event', -- Promotion liée à un événement

  -- Générique
  'custom'
);
```

**Note :** `weekend` retiré car calculé dynamiquement (pas un événement ponctuel)

---

## 📋 Contexte & Cas d'Usage

### Types de Promotions (Pratiques Bénin)

#### 1. **Promotion par Lot (Bundle) - LE PLUS COURANT** ⭐

**Cas d'usage :** Vendre plusieurs unités à prix réduit

**Exemple concret :**
- 3 bières à 1000 FCFA au lieu de 1050 FCFA (3 × 350)
- Économie client : 50 FCFA (4.8%)

**Configuration :**
```typescript
{
  type: 'bundle',
  bundleQuantity: 3,
  bundlePrice: 1000
}
```

**Gestion stock partiel :**
- Client veut 7 unités, promo par 3
- Calcul : 2 bundles (6 unités) + 1 unité prix normal
- Prix : (2 × 1000) + (1 × 350) = 2350 FCFA ✅

---

#### 2. **Prix Spécial (avec horaires optionnels)**

**A. Prix spécial tout le weekend**
```typescript
{
  type: 'special_price',
  specialPrice: 300,
  startDate: '2025-12-01',
  endDate: '2025-12-07',
  timeStart: null,
  timeEnd: null
}
```

**B. Happy Hour (17h-19h) tous les jours**
```typescript
{
  type: 'special_price',
  specialPrice: 300,
  startDate: '2025-12-01',
  endDate: '2025-12-31',
  timeStart: '17:00',
  timeEnd: '19:00'
}
```

**C. Happy Hour vendredi/samedi uniquement**
```typescript
{
  type: 'special_price',
  specialPrice: 300,
  timeStart: '17:00',
  timeEnd: '19:00',
  recurrenceDays: [5, 6]  // Vendredi, Samedi
}
```

---

#### 3. **Réduction Montant Fixe**

**Cas d'usage :** -50 FCFA sur toutes les bières

**Configuration :**
```typescript
{
  type: 'fixed_discount',
  discountAmount: 50,  // Par produit (pas × quantité !)
  targetType: 'category',
  targetCategoryIds: ['beer-category-id']
}
```

**Calcul correct :**
- Prix : 350 FCFA × 3 = 1050 FCFA
- Réduction : 50 FCFA (fixe, pas × 3)
- **Total : 1000 FCFA** ✅

---

#### 4. **Réduction Pourcentage (Rare)**

**Cas d'usage :** -10% sur toutes les boissons gazeuses

**Configuration :**
```typescript
{
  type: 'percentage',
  discountPercentage: 10,
  targetType: 'category',
  targetCategoryIds: ['soda-category-id']
}
```

---

## 🎯 Phase 1 : Fondations SQL & Types (Semaine 1-2)

### Migration 059 : Système Promotions

**Fichier :** `supabase/migrations/059_promotions_system.sql`

#### 1.1 Types ENUM

```sql
-- Type de promotion
CREATE TYPE promotion_type AS ENUM (
  'bundle',           -- Lot : X unités à prix fixe
  'fixed_discount',   -- Réduction montant fixe (par produit)
  'percentage',       -- Réduction pourcentage
  'special_price'     -- Prix spécial (avec horaires optionnels)
);

-- Statut promotion
CREATE TYPE promotion_status AS ENUM (
  'draft',      -- Brouillon (création en cours)
  'scheduled',  -- Programmée (pas encore active)
  'active',     -- Active (applicable maintenant)
  'paused',     -- En pause (temporairement désactivée)
  'expired',    -- Expirée (date fin dépassée)
  'cancelled'   -- Annulée (par admin)
);

-- Vérifier si event_type existe déjà (ROADMAP_FORECASTING)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM (
      'holiday',          -- Jour férié
      'anniversary',      -- Anniversaire bar
      'sports',           -- Événement sportif
      'theme_night',      -- Soirée thématique
      'promotion_event',  -- Promotion liée à événement
      'custom'            -- Personnalisé
    );
  END IF;
END $$;
```

---

#### 1.2 Table `promotions`

```sql
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  -- Informations générales
  name TEXT NOT NULL,
  description TEXT,
  type promotion_type NOT NULL,
  status promotion_status DEFAULT 'draft',

  -- Ciblage produits
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'all')),
  target_product_ids UUID[], -- Si target_type = 'product'
  target_category_ids UUID[], -- Si target_type = 'category'

  -- Configuration BUNDLE
  bundle_quantity INT,
  bundle_price DECIMAL(10,2),

  -- Configuration FIXED_DISCOUNT (par produit, pas × quantité)
  discount_amount DECIMAL(10,2),

  -- Configuration PERCENTAGE
  discount_percentage DECIMAL(5,2),

  -- Configuration SPECIAL_PRICE
  special_price DECIMAL(10,2),
  time_start TIME,  -- OPTIONNEL : Pour Happy Hour
  time_end TIME,    -- OPTIONNEL : Pour Happy Hour

  -- Planification temporelle
  start_date DATE NOT NULL,
  end_date DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_days INT[], -- [1,2,3,4,5] = Lun-Ven, [5,6] = Ven-Sam

  -- Limites d'utilisation
  max_uses_per_customer INT,
  max_total_uses INT,
  current_uses INT DEFAULT 0,

  -- Priorité (si plusieurs promos applicables, la plus haute priorité gagne)
  priority INT DEFAULT 0,

  -- Traçabilité
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ===== CONTRAINTES DE VALIDATION =====

  -- Bundle : Doit avoir quantité ET prix
  CONSTRAINT valid_bundle CHECK (
    (type = 'bundle' AND bundle_quantity > 1 AND bundle_price > 0)
    OR type != 'bundle'
  ),

  -- Fixed Discount : Montant positif
  CONSTRAINT valid_fixed_discount CHECK (
    (type = 'fixed_discount' AND discount_amount > 0)
    OR type != 'fixed_discount'
  ),

  -- Percentage : Entre 0.01% et 100%
  CONSTRAINT valid_percentage CHECK (
    (type = 'percentage' AND discount_percentage > 0 AND discount_percentage <= 100)
    OR type != 'percentage'
  ),

  -- Special Price : Prix positif
  CONSTRAINT valid_special_price CHECK (
    (type = 'special_price' AND special_price > 0)
    OR type != 'special_price'
  ),

  -- Target : Au moins un ciblage valide
  CONSTRAINT valid_target CHECK (
    (target_type = 'product' AND target_product_ids IS NOT NULL AND array_length(target_product_ids, 1) > 0)
    OR (target_type = 'category' AND target_category_ids IS NOT NULL AND array_length(target_category_ids, 1) > 0)
    OR target_type = 'all'
  ),

  -- Happy Hour : Si time_start, alors time_end requis
  CONSTRAINT valid_time_range CHECK (
    (time_start IS NULL AND time_end IS NULL)
    OR (time_start IS NOT NULL AND time_end IS NOT NULL AND time_end > time_start)
  ),

  -- Dates cohérentes
  CONSTRAINT valid_date_range CHECK (
    end_date IS NULL OR end_date >= start_date
  ),

  -- Limites utilisation cohérentes
  CONSTRAINT valid_usage_limits CHECK (
    (max_total_uses IS NULL OR max_total_uses > 0)
    AND (max_uses_per_customer IS NULL OR max_uses_per_customer > 0)
    AND (current_uses >= 0)
  )
);

-- Index pour performance
CREATE INDEX idx_promotions_bar_id ON promotions(bar_id);
CREATE INDEX idx_promotions_status ON promotions(status) WHERE status IN ('active', 'scheduled');
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date) WHERE status = 'active';
CREATE INDEX idx_promotions_target_products ON promotions USING GIN (target_product_ids) WHERE target_product_ids IS NOT NULL;
CREATE INDEX idx_promotions_target_categories ON promotions USING GIN (target_category_ids) WHERE target_category_ids IS NOT NULL;

-- Index composite pour query actives
CREATE INDEX idx_promotions_active_lookup ON promotions(bar_id, status, start_date, end_date)
  WHERE status = 'active';

-- RLS Policies
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotions for their bars"
ON promotions FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage promotions for their bars"
ON promotions FOR ALL
USING (bar_id IN (
  SELECT bar_id FROM bar_members
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'promoteur')
));

-- Commentaires documentation
COMMENT ON TABLE promotions IS 'Système de promotions avec 4 types: bundle, fixed_discount, percentage, special_price';
COMMENT ON COLUMN promotions.discount_amount IS 'Réduction fixe PAR PRODUIT (pas × quantité)';
COMMENT ON COLUMN promotions.time_start IS 'OPTIONNEL : Heure début Happy Hour (format HH:MM)';
COMMENT ON COLUMN promotions.recurrence_days IS 'Jours de semaine (0=Dim, 6=Sam). Ex: [5,6] = Ven-Sam';
```

---

#### 1.3 Table `promotion_applications` (Historique)

```sql
CREATE TABLE promotion_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

  -- Détails application
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL, -- Dénormalisé pour historique
  quantity_sold INT NOT NULL CHECK (quantity_sold > 0),

  -- Prix et économies
  original_unit_price DECIMAL(10,2) NOT NULL,
  discounted_unit_price DECIMAL(10,2) NOT NULL,
  original_total DECIMAL(10,2) NOT NULL,      -- original_unit_price × quantity
  discounted_total DECIMAL(10,2) NOT NULL,    -- Prix final payé
  discount_amount DECIMAL(10,2) NOT NULL,     -- Économie réalisée

  -- Métadonnées promotion (snapshot pour analytics)
  promotion_type promotion_type NOT NULL,
  promotion_name TEXT NOT NULL,

  -- Traçabilité
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID NOT NULL,

  -- Contrainte cohérence
  CONSTRAINT valid_discount_calculation CHECK (
    discount_amount = original_total - discounted_total
    AND discount_amount >= 0
    AND discounted_total <= original_total
  )
);

-- Index pour analytics et reporting
CREATE INDEX idx_promo_apps_bar_id ON promotion_applications(bar_id);
CREATE INDEX idx_promo_apps_promotion_id ON promotion_applications(promotion_id);
CREATE INDEX idx_promo_apps_sale_id ON promotion_applications(sale_id);
CREATE INDEX idx_promo_apps_applied_at ON promotion_applications(applied_at DESC);
CREATE INDEX idx_promo_apps_product_id ON promotion_applications(product_id);

-- Index composite pour dashboard performance
CREATE INDEX idx_promo_apps_analytics ON promotion_applications(
  bar_id, promotion_id, applied_at DESC
);

-- RLS
ALTER TABLE promotion_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotion applications for their bars"
ON promotion_applications FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert promotion applications for their bars"
ON promotion_applications FOR INSERT
WITH CHECK (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

COMMENT ON TABLE promotion_applications IS 'Historique applications promotions pour analytics et ROI';
COMMENT ON COLUMN promotion_applications.discount_amount IS 'Économie totale réalisée (original_total - discounted_total)';
```

---

#### 1.4 Table `bar_events` (Si pas déjà créée)

```sql
-- Créer seulement si n'existe pas (ROADMAP_FORECASTING peut l'avoir créée)
CREATE TABLE IF NOT EXISTS bar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,

  event_type event_type NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,

  -- Impact sur ventes (pour prévisions)
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0 CHECK (impact_multiplier >= 0), -- 1.5 = +50%, 2.0 = +100%

  -- Récurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- 'yearly_12_25', 'monthly_15', 'weekly_5'

  -- Lien optionnel vers promotion
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,

  notes TEXT,
  is_active BOOLEAN DEFAULT true,

  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index (création conditionnelle)
CREATE INDEX IF NOT EXISTS idx_bar_events_bar_date ON bar_events(bar_id, event_date);
CREATE INDEX IF NOT EXISTS idx_bar_events_type ON bar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bar_events_promotion ON bar_events(promotion_id) WHERE promotion_id IS NOT NULL;

-- RLS (création conditionnelle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bar_events' AND policyname = 'Users can view events for their bars'
  ) THEN
    ALTER TABLE bar_events ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view events for their bars"
    ON bar_events FOR SELECT
    USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

    CREATE POLICY "Admins can manage events for their bars"
    ON bar_events FOR ALL
    USING (bar_id IN (
      SELECT bar_id FROM bar_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'promoteur')
    ));
  END IF;
END $$;
```

---

#### 1.5 Fonctions SQL Helpers

```sql
-- Fonction : Incrémenter compteur utilisations promotion
CREATE OR REPLACE FUNCTION increment_promotion_uses(p_promotion_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE promotions
  SET current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = p_promotion_id;

  -- Marquer comme expired si max atteint
  UPDATE promotions
  SET status = 'expired'
  WHERE id = p_promotion_id
    AND max_total_uses IS NOT NULL
    AND current_uses >= max_total_uses
    AND status = 'active';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_promotion_uses IS 'Incrémente compteur usage et auto-expire si limite atteinte';

---

-- Fonction : Auto-update statut promotions (à exécuter via cron)
CREATE OR REPLACE FUNCTION update_promotion_statuses()
RETURNS VOID AS $$
BEGIN
  -- Activer promotions programmées dont la date est arrivée
  UPDATE promotions
  SET status = 'active',
      updated_at = NOW()
  WHERE status = 'scheduled'
    AND start_date <= CURRENT_DATE;

  -- Expirer promotions actives dont la date de fin est dépassée
  UPDATE promotions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < CURRENT_DATE;

  -- Expirer promotions ayant atteint max_total_uses
  UPDATE promotions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND max_total_uses IS NOT NULL
    AND current_uses >= max_total_uses;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_promotion_statuses IS 'Auto-update statuts (scheduled→active, active→expired). À exécuter quotidiennement via cron.';

---

-- Vue : Promotions actives avec enrichissement
CREATE OR REPLACE VIEW active_promotions AS
SELECT
  p.*,
  -- Compteurs analytics
  COALESCE(apps.total_applications, 0) as total_applications,
  COALESCE(apps.total_discount_given, 0) as total_discount_given,
  COALESCE(apps.total_revenue, 0) as total_revenue,

  -- Calcul ROI (revenue généré par rapport au discount donné)
  CASE
    WHEN COALESCE(apps.total_discount_given, 0) > 0
    THEN ROUND(COALESCE(apps.total_revenue, 0) / apps.total_discount_given, 2)
    ELSE NULL
  END as roi_ratio,

  -- Disponibilité restante
  CASE
    WHEN p.max_total_uses IS NOT NULL
    THEN p.max_total_uses - p.current_uses
    ELSE NULL
  END as remaining_uses

FROM promotions p
LEFT JOIN (
  SELECT
    promotion_id,
    COUNT(*) as total_applications,
    SUM(discount_amount) as total_discount_given,
    SUM(discounted_total) as total_revenue
  FROM promotion_applications
  GROUP BY promotion_id
) apps ON p.id = apps.promotion_id
WHERE p.status = 'active'
  AND p.start_date <= CURRENT_DATE
  AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE);

GRANT SELECT ON active_promotions TO authenticated;

COMMENT ON VIEW active_promotions IS 'Promotions actives enrichies avec analytics (applications, ROI, disponibilité)';
```

---

### Types TypeScript

**Fichier :** `src/types/promotions.ts` (nouveau fichier dédié)

```typescript
// ===== PROMOTIONS =====

export type PromotionType =
  | 'bundle'          // Lot : X unités à prix fixe
  | 'fixed_discount'  // Réduction montant fixe (par produit)
  | 'percentage'      // Réduction pourcentage
  | 'special_price';  // Prix spécial (avec horaires optionnels)

export type PromotionStatus =
  | 'draft'       // Brouillon (création en cours)
  | 'scheduled'   // Programmée (pas encore active)
  | 'active'      // Active (applicable maintenant)
  | 'paused'      // En pause (temporairement désactivée)
  | 'expired'     // Expirée (date fin dépassée ou max uses atteint)
  | 'cancelled';  // Annulée (par admin)

export type PromotionTargetType = 'product' | 'category' | 'all';

export interface Promotion {
  id: string;
  barId: string;

  // Informations générales
  name: string;
  description?: string;
  type: PromotionType;
  status: PromotionStatus;

  // Ciblage
  targetType: PromotionTargetType;
  targetProductIds?: string[];
  targetCategoryIds?: string[];

  // Configuration selon type
  bundleQuantity?: number;      // Pour 'bundle' (min 2)
  bundlePrice?: number;          // Pour 'bundle'
  discountAmount?: number;       // Pour 'fixed_discount' (PAR PRODUIT)
  discountPercentage?: number;   // Pour 'percentage' (0.01-100)
  specialPrice?: number;         // Pour 'special_price'
  timeStart?: string;            // OPTIONNEL : Happy Hour (HH:MM)
  timeEnd?: string;              // OPTIONNEL : Happy Hour (HH:MM)

  // Planification
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD (nullable = sans fin)
  isRecurring: boolean;
  recurrenceDays?: number[];  // [0-6] 0=Dimanche, 6=Samedi

  // Limites
  maxUsesPerCustomer?: number;
  maxTotalUses?: number;
  currentUses: number;

  // Priorité
  priority: number;  // Plus élevé = prioritaire si plusieurs promos applicables

  // Traçabilité
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromotionApplication {
  id: string;
  barId: string;
  promotionId: string;
  saleId: string;

  // Détails produit
  productId: string;
  productName: string;
  quantitySold: number;

  // Prix et économies
  originalUnitPrice: number;
  discountedUnitPrice: number;
  originalTotal: number;
  discountedTotal: number;
  discountAmount: number;  // Économie totale

  // Métadonnées
  promotionType: PromotionType;
  promotionName: string;

  // Traçabilité
  appliedAt: Date;
  appliedBy: string;
}

/**
 * Résultat calcul prix avec promotion
 */
export interface PromotionPriceResult {
  finalPrice: number;
  originalPrice: number;
  discount: number;
  appliedPromotion?: Promotion;

  // Détails calcul (pour UI)
  breakdown?: {
    bundles?: number;         // Nombre de lots complets
    remainingUnits?: number;  // Unités hors lot
    unitPrice: number;
    discountPerUnit?: number;
  };
}

// ===== ÉVÉNEMENTS =====

export type EventType =
  | 'holiday'          // Jour férié
  | 'anniversary'      // Anniversaire bar
  | 'sports'           // Événement sportif
  | 'theme_night'      // Soirée thématique
  | 'promotion_event'  // Promotion liée à événement
  | 'custom';          // Personnalisé

export interface BarEvent {
  id: string;
  barId: string;
  eventType: EventType;
  eventName: string;
  eventDate: string;  // YYYY-MM-DD
  impactMultiplier: number;  // 1.0 = neutre, 1.5 = +50%, 2.0 = +100%
  isRecurring: boolean;
  recurrenceRule?: string;  // 'yearly_12_25', 'monthly_15', 'weekly_5'
  promotionId?: string;     // Lien optionnel vers promotion
  notes?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Ajouter à `src/types/index.ts` :**

```typescript
// Réexporter types promotions
export * from './promotions';
```

---

## 🎯 Phase 2 : Services & Logique Métier (Semaine 3-4)

### Service Promotions (Production-Ready)

**Fichier :** `src/services/supabase/promotions.service.ts`

```typescript
import { supabase } from './client';
import { Promotion, PromotionApplication, PromotionPriceResult, Product } from '../../types';

/**
 * Service de gestion des promotions
 *
 * Architecture DRY :
 * - Calcul prix centralisé dans calculateBestPrice()
 * - Validation côté SQL (contraintes CHECK)
 * - Cache promotions actives (invalidation automatique)
 */
export const PromotionsService = {

  /**
   * Récupérer les promotions actives pour un bar
   * Filtre intelligent avec Happy Hour et récurrence
   *
   * @param barId - ID du bar
   * @param productId - Optionnel : Filtrer pour un produit spécifique
   * @param categoryId - Optionnel : Filtrer pour une catégorie
   * @returns Promotions applicables maintenant
   */
  async getActivePromotions(
    barId: string,
    productId?: string,
    categoryId?: string
  ): Promise<Promotion[]> {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    const currentDayOfWeek = now.getDay(); // 0-6

    // Query SQL optimisée avec index
    let query = supabase
      .from('promotions')
      .select('*')
      .eq('bar_id', barId)
      .eq('status', 'active')
      .lte('start_date', currentDate)
      .or(`end_date.is.null,end_date.gte.${currentDate}`);

    const { data, error } = await query;
    if (error) throw error;

    // Filtrage côté client pour logique complexe
    return (data || []).filter(promo => {

      // 1. Vérifier récurrence (jours de semaine)
      if (promo.is_recurring && promo.recurrence_days?.length > 0) {
        if (!promo.recurrence_days.includes(currentDayOfWeek)) {
          return false;
        }
      }

      // 2. Vérifier Happy Hour (plage horaire)
      if (promo.time_start && promo.time_end) {
        if (currentTime < promo.time_start || currentTime > promo.time_end) {
          return false;
        }
      }

      // 3. Vérifier ciblage produit
      if (productId && promo.target_type === 'product') {
        if (!promo.target_product_ids?.includes(productId)) {
          return false;
        }
      }

      // 4. Vérifier ciblage catégorie
      if (categoryId && promo.target_type === 'category') {
        if (!promo.target_category_ids?.includes(categoryId)) {
          return false;
        }
      }

      // 5. Vérifier limites d'utilisation
      if (promo.max_total_uses && promo.current_uses >= promo.max_total_uses) {
        return false;
      }

      return true;
    });
  },

  /**
   * Calculer le meilleur prix avec promotions
   *
   * Architecture :
   * - Teste toutes les promotions applicables
   * - Sélectionne la meilleure (plus grande économie)
   * - En cas d'égalité, prend la priorité la plus élevée
   *
   * ⚠️ CORRECTION BUG : fixed_discount appliqué par produit (pas × quantité)
   *
   * @param product - Produit à pricer
   * @param quantity - Quantité demandée
   * @param promotions - Promotions applicables
   * @returns Résultat avec prix final et détails
   */
  calculateBestPrice(
    product: Product,
    quantity: number,
    promotions: Promotion[]
  ): PromotionPriceResult {

    // Validation entrée
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    // Vérification stock (évite vente en rupture)
    if (product.stock < quantity) {
      throw new Error(`Stock insuffisant (${product.stock} disponibles, ${quantity} demandés)`);
    }

    const originalPrice = product.price * quantity;
    let bestPrice = originalPrice;
    let bestPromotion: Promotion | undefined;
    let bestBreakdown: PromotionPriceResult['breakdown'];

    for (const promo of promotions) {
      let calculatedPrice = originalPrice;
      let breakdown: typeof bestBreakdown;

      switch (promo.type) {
        case 'bundle': {
          // Exemple : 3 bières à 1000 FCFA
          // Client veut 7 → 2 bundles (6 unités) + 1 unité normale
          const bundleQty = promo.bundleQuantity || 1;
          const bundlePrice = promo.bundlePrice || 0;

          if (quantity >= bundleQty) {
            const bundles = Math.floor(quantity / bundleQty);
            const remaining = quantity % bundleQty;
            calculatedPrice = bundles * bundlePrice + remaining * product.price;

            breakdown = {
              bundles,
              remainingUnits: remaining,
              unitPrice: product.price,
            };
          }
          break;
        }

        case 'special_price': {
          calculatedPrice = (promo.specialPrice || 0) * quantity;
          breakdown = {
            unitPrice: promo.specialPrice || 0,
          };
          break;
        }

        case 'fixed_discount': {
          // ✅ CORRECTION : -50 FCFA sur le total (pas × quantité)
          // Avant (BUG) : originalPrice - (discountAmount × quantity)
          // Après (FIX) : originalPrice - discountAmount
          const discount = promo.discountAmount || 0;
          calculatedPrice = Math.max(0, originalPrice - discount);

          breakdown = {
            unitPrice: product.price,
            discountPerUnit: discount / quantity, // Pour affichage
          };
          break;
        }

        case 'percentage': {
          const percent = (promo.discountPercentage || 0) / 100;
          calculatedPrice = originalPrice * (1 - percent);

          breakdown = {
            unitPrice: product.price * (1 - percent),
          };
          break;
        }
      }

      // Sélectionner meilleure offre
      // Si égalité, priorité la plus élevée gagne
      if (
        calculatedPrice < bestPrice ||
        (calculatedPrice === bestPrice && (promo.priority > (bestPromotion?.priority || 0)))
      ) {
        bestPrice = calculatedPrice;
        bestPromotion = promo;
        bestBreakdown = breakdown;
      }
    }

    return {
      finalPrice: Math.round(bestPrice * 100) / 100, // Arrondi 2 décimales
      originalPrice,
      discount: Math.round((originalPrice - bestPrice) * 100) / 100,
      appliedPromotion: bestPromotion,
      breakdown: bestBreakdown,
    };
  },

  /**
   * Enregistrer l'application d'une promotion
   * Incrémente automatiquement le compteur
   *
   * @param application - Détails de l'application
   */
  async recordApplication(
    application: Omit<PromotionApplication, 'id' | 'appliedAt'>
  ): Promise<void> {

    // Validation cohérence
    if (application.discountAmount !== application.originalTotal - application.discountedTotal) {
      throw new Error('Incohérence calcul discount_amount');
    }

    // Insérer historique
    const { error: insertError } = await supabase
      .from('promotion_applications')
      .insert(application);

    if (insertError) throw insertError;

    // Incrémenter compteur (fonction SQL)
    const { error: rpcError } = await supabase.rpc('increment_promotion_uses', {
      p_promotion_id: application.promotionId
    });

    if (rpcError) throw rpcError;
  },

  /**
   * Créer une nouvelle promotion
   *
   * @param promotion - Données promotion (sans id, timestamps)
   * @returns Promotion créée avec id
   */
  async createPromotion(
    promotion: Omit<Promotion, 'id' | 'currentUses' | 'createdAt' | 'updatedAt'>
  ): Promise<Promotion> {

    // Validation métier côté client (double sécurité avec SQL CHECK)
    this.validatePromotion(promotion);

    const { data, error } = await supabase
      .from('promotions')
      .insert({
        ...promotion,
        current_uses: 0, // Initialiser à 0
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mettre à jour une promotion
   * ⚠️ Ne permet pas de changer le type (trop complexe)
   *
   * @param id - ID promotion
   * @param updates - Champs à modifier
   * @returns Promotion mise à jour
   */
  async updatePromotion(
    id: string,
    updates: Partial<Omit<Promotion, 'id' | 'createdAt' | 'updatedAt' | 'type'>>
  ): Promise<Promotion> {

    // Interdire changement de type
    if ('type' in updates) {
      throw new Error('Cannot change promotion type after creation');
    }

    const { data, error } = await supabase
      .from('promotions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Changer statut promotion (active/paused/cancelled)
   *
   * @param id - ID promotion
   * @param status - Nouveau statut
   */
  async updateStatus(
    id: string,
    status: Promotion['status']
  ): Promise<void> {
    const { error } = await supabase
      .from('promotions')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Obtenir les statistiques d'une promotion
   *
   * @param promotionId - ID promotion
   * @returns Analytics (applications, revenue, ROI)
   */
  async getPromotionStats(promotionId: string): Promise<{
    totalApplications: number;
    totalRevenue: number;
    totalDiscount: number;
    averageDiscount: number;
    roi: number; // revenue / discount (ratio)
  }> {
    const { data, error } = await supabase
      .from('promotion_applications')
      .select('discount_amount, discounted_total')
      .eq('promotion_id', promotionId);

    if (error) throw error;

    const totalApplications = data?.length || 0;
    const totalDiscount = data?.reduce((sum, app) => sum + app.discount_amount, 0) || 0;
    const totalRevenue = data?.reduce((sum, app) => sum + app.discounted_total, 0) || 0;

    return {
      totalApplications,
      totalRevenue,
      totalDiscount,
      averageDiscount: totalApplications > 0 ? totalDiscount / totalApplications : 0,
      roi: totalDiscount > 0 ? totalRevenue / totalDiscount : 0,
    };
  },

  /**
   * Validation métier côté client
   * (Complète les contraintes SQL)
   *
   * @param promo - Promotion à valider
   * @throws Error si invalide
   */
  validatePromotion(promo: Partial<Promotion>): void {
    // Validation selon type
    switch (promo.type) {
      case 'bundle':
        if (!promo.bundleQuantity || promo.bundleQuantity < 2) {
          throw new Error('Bundle quantity must be at least 2');
        }
        if (!promo.bundlePrice || promo.bundlePrice <= 0) {
          throw new Error('Bundle price must be positive');
        }
        break;

      case 'fixed_discount':
        if (!promo.discountAmount || promo.discountAmount <= 0) {
          throw new Error('Discount amount must be positive');
        }
        break;

      case 'percentage':
        if (!promo.discountPercentage || promo.discountPercentage <= 0 || promo.discountPercentage > 100) {
          throw new Error('Discount percentage must be between 0.01 and 100');
        }
        break;

      case 'special_price':
        if (!promo.specialPrice || promo.specialPrice <= 0) {
          throw new Error('Special price must be positive');
        }
        break;
    }

    // Validation ciblage
    if (promo.targetType === 'product' && (!promo.targetProductIds || promo.targetProductIds.length === 0)) {
      throw new Error('Target products required when target_type is "product"');
    }
    if (promo.targetType === 'category' && (!promo.targetCategoryIds || promo.targetCategoryIds.length === 0)) {
      throw new Error('Target categories required when target_type is "category"');
    }

    // Validation dates
    if (promo.startDate && promo.endDate && promo.endDate < promo.startDate) {
      throw new Error('End date must be after start date');
    }

    // Validation Happy Hour
    if (promo.timeStart && !promo.timeEnd) {
      throw new Error('Time end required when time start is set');
    }
    if (!promo.timeStart && promo.timeEnd) {
      throw new Error('Time start required when time end is set');
    }
    if (promo.timeStart && promo.timeEnd && promo.timeEnd <= promo.timeStart) {
      throw new Error('Time end must be after time start');
    }
  },
};
```

---

### Service Événements

**Fichier :** `src/services/supabase/events.service.ts`

```typescript
import { supabase } from './client';
import { BarEvent } from '../../types';

export const EventsService = {
  /**
   * Créer un nouvel événement
   */
  async createEvent(
    event: Omit<BarEvent, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<BarEvent> {
    const { data, error } = await supabase
      .from('bar_events')
      .insert(event)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Récupérer les événements à venir
   */
  async getUpcomingEvents(barId: string, days: number = 30): Promise<BarEvent[]> {
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('bar_events')
      .select('*')
      .eq('bar_id', barId)
      .eq('is_active', true)
      .gte('event_date', today)
      .lte('event_date', endDateStr)
      .order('event_date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtenir le multiplicateur d'impact pour une date
   * (Utilisé par système de prévisions)
   */
  async getEventImpact(date: string, barId: string): Promise<number> {
    const { data, error } = await supabase
      .from('bar_events')
      .select('impact_multiplier')
      .eq('bar_id', barId)
      .eq('event_date', date)
      .eq('is_active', true)
      .order('impact_multiplier', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return 1.0;
    return data?.impact_multiplier || 1.0;
  },

  /**
   * Mettre à jour un événement
   */
  async updateEvent(id: string, updates: Partial<BarEvent>): Promise<BarEvent> {
    const { data, error } = await supabase
      .from('bar_events')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Désactiver un événement (soft delete)
   */
  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase
      .from('bar_events')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
  },
};
```

---

## 🎯 Phase 3 : Intégration QuickSale (Semaine 5)

### Modifications QuickSaleFlow

**Fichier :** `src/components/QuickSaleFlow.tsx`

**Stratégie d'intégration :**

1. Charger promotions actives au montage
2. Calculer prix avec promo lors ajout panier
3. Afficher badges visuels "PROMO"
4. Enregistrer applications lors validation vente

**Pseudo-code intégration :**

```typescript
// Dans QuickSaleFlow.tsx

import { PromotionsService } from '../services/supabase/promotions.service';
import { Promotion, PromotionPriceResult } from '../types';

// State
const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
const [cartItemsWithPromos, setCartItemsWithPromos] = useState<Map<string, PromotionPriceResult>>(new Map());

// Charger promotions au démarrage
useEffect(() => {
  if (!currentBar?.id) return;

  const loadPromotions = async () => {
    try {
      const promos = await PromotionsService.getActivePromotions(currentBar.id);
      setActivePromotions(promos);
    } catch (error) {
      console.error('Error loading promotions:', error);
    }
  };

  loadPromotions();
}, [currentBar?.id]);

// Calculer prix avec promo lors ajout panier
const handleAddToCart = (product: Product, quantity: number = 1) => {
  // Filtrer promotions applicables à ce produit
  const applicablePromos = activePromotions.filter(promo => {
    if (promo.targetType === 'all') return true;
    if (promo.targetType === 'product') return promo.targetProductIds?.includes(product.id);
    if (promo.targetType === 'category') return promo.targetCategoryIds?.includes(product.categoryId);
    return false;
  });

  // Calculer meilleur prix
  const priceResult = PromotionsService.calculateBestPrice(
    product,
    quantity,
    applicablePromos
  );

  // Ajouter au panier avec prix promotionnel
  addToCart({
    product,
    quantity,
    unitPrice: priceResult.finalPrice / quantity,
    totalPrice: priceResult.finalPrice,
    appliedPromotion: priceResult.appliedPromotion,
  });

  // Sauvegarder info promo pour affichage
  if (priceResult.appliedPromotion) {
    setCartItemsWithPromos(prev => new Map(prev).set(product.id, priceResult));
  }
};

// Lors validation vente, enregistrer applications
const handleConfirmSale = async () => {
  // ... logique existante création vente ...

  // Enregistrer applications promotions
  for (const [productId, priceResult] of cartItemsWithPromos.entries()) {
    if (!priceResult.appliedPromotion) continue;

    const cartItem = cart.find(item => item.product.id === productId);
    if (!cartItem) continue;

    await PromotionsService.recordApplication({
      barId: currentBar.id,
      promotionId: priceResult.appliedPromotion.id,
      saleId: newSale.id,
      productId,
      productName: cartItem.product.name,
      quantitySold: cartItem.quantity,
      originalUnitPrice: cartItem.product.price,
      discountedUnitPrice: priceResult.finalPrice / cartItem.quantity,
      originalTotal: priceResult.originalPrice,
      discountedTotal: priceResult.finalPrice,
      discountAmount: priceResult.discount,
      promotionType: priceResult.appliedPromotion.type,
      promotionName: priceResult.appliedPromotion.name,
      appliedBy: currentUser.id,
    });
  }

  // Clear panier
  setCartItemsWithPromos(new Map());
};

// UI : Badge PROMO sur produit
const renderProductCard = (product: Product) => {
  const hasPromo = activePromotions.some(promo => {
    if (promo.targetType === 'all') return true;
    if (promo.targetType === 'product') return promo.targetProductIds?.includes(product.id);
    if (promo.targetType === 'category') return promo.targetCategoryIds?.includes(product.categoryId);
    return false;
  });

  return (
    <div className="product-card">
      {hasPromo && (
        <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
          PROMO
        </div>
      )}
      {/* ... rest of card ... */}
    </div>
  );
};

// UI : Afficher économie dans panier
const renderCartItem = (item: CartItem) => {
  const promoInfo = cartItemsWithPromos.get(item.product.id);

  return (
    <div className="cart-item">
      <div className="product-name">{item.product.name}</div>
      <div className="price">
        {promoInfo && promoInfo.discount > 0 ? (
          <>
            <span className="original-price line-through text-gray-400">
              {formatPrice(promoInfo.originalPrice)}
            </span>
            <span className="discounted-price font-bold text-green-600">
              {formatPrice(promoInfo.finalPrice)}
            </span>
            <span className="savings text-xs text-green-600">
              Économie : {formatPrice(promoInfo.discount)}
            </span>
          </>
        ) : (
          <span>{formatPrice(item.totalPrice)}</span>
        )}
      </div>
    </div>
  );
};
```

---

## 🎯 Phase 4 : Gestion & Analytics (Semaine 6)

### Interface Gestion Promotions

**Composant :** `src/components/PromotionsManager.tsx`

**Fonctionnalités détaillées :**

1. **Liste Promotions**
   - Filtres : Statut (active/scheduled/expired), Type, Dates
   - Tri : Date création, Priorité, Nom
   - Pagination (20 par page)
   - Actions rapides : Activer/Pause, Dupliquer, Modifier, Supprimer

2. **Formulaire Création/Édition**
   - **Étape 1 : Informations générales**
     - Nom (requis, max 100 chars)
     - Description (optionnel, textarea)
     - Type (dropdown : bundle, fixed_discount, percentage, special_price)

   - **Étape 2 : Configuration selon type**
     - Bundle : Quantité + Prix lot
     - Fixed Discount : Montant réduction
     - Percentage : Pourcentage (slider 1-100%)
     - Special Price : Nouveau prix

   - **Étape 3 : Ciblage**
     - Radio : Tous produits / Produits spécifiques / Catégories
     - Multi-select si produits/catégories

   - **Étape 4 : Planification**
     - Date début (date picker)
     - Date fin (optionnel)
     - Récurrence (checkbox + multi-select jours semaine)
     - Happy Hour (checkbox + time pickers)

   - **Étape 5 : Limites & Priorité**
     - Max utilisations totales (optionnel, number input)
     - Max par client (optionnel, number input)
     - Priorité (slider 0-10, default 0)

3. **Dashboard Performance Promotion**
   - **Métriques clés (cards) :**
     - CA généré (total discounted_total)
     - Économies données (total discount_amount)
     - Nombre applications
     - ROI (revenue / discount)

   - **Graphiques (Recharts) :**
     - Ligne : Applications par jour
     - Barres : Top 10 produits bénéficiaires
     - Pie : Répartition par type promotion

   - **Comparaison avant/pendant :**
     - CA 7 jours avant vs pendant promo
     - Augmentation volume ventes (%)
     - Panier moyen impact

4. **Duplication Promotion**
   - Bouton "Dupliquer" dans liste
   - Clone toutes config sauf dates
   - Statut automatique "draft"
   - Nom auto-incrémenté (ex: "Promo Noël (copie 1)")

---

### Vue Matérialisée Analytics (Optionnel - Performance)

```sql
-- Vue pour dashboard rapide
CREATE MATERIALIZED VIEW IF NOT EXISTS promotion_analytics_summary AS
SELECT
  p.id as promotion_id,
  p.bar_id,
  p.name,
  p.type,
  p.status,
  p.start_date,
  p.end_date,

  -- Compteurs
  COUNT(DISTINCT pa.id) as total_applications,
  COUNT(DISTINCT pa.sale_id) as total_sales,
  COUNT(DISTINCT pa.product_id) as distinct_products,

  -- Financier
  COALESCE(SUM(pa.discounted_total), 0) as total_revenue,
  COALESCE(SUM(pa.discount_amount), 0) as total_discount_given,
  COALESCE(AVG(pa.discount_amount), 0) as avg_discount_per_application,

  -- ROI
  CASE
    WHEN SUM(pa.discount_amount) > 0
    THEN ROUND(SUM(pa.discounted_total) / SUM(pa.discount_amount), 2)
    ELSE 0
  END as roi_ratio,

  -- Dates analytics
  MIN(pa.applied_at) as first_application_at,
  MAX(pa.applied_at) as last_application_at,

  NOW() as refreshed_at

FROM promotions p
LEFT JOIN promotion_applications pa ON p.id = pa.promotion_id
GROUP BY p.id;

-- Index pour query rapides
CREATE UNIQUE INDEX idx_promo_analytics_summary_pk ON promotion_analytics_summary(promotion_id);
CREATE INDEX idx_promo_analytics_bar ON promotion_analytics_summary(bar_id);

-- Permissions
GRANT SELECT ON promotion_analytics_summary TO authenticated;

-- Refresh quotidien via cron
SELECT cron.schedule(
  'refresh-promotion-analytics',
  '0 5 * * *',  -- 5h du matin
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY promotion_analytics_summary; $$
);
```

---

## 🧪 Tests & Validation

### Tests Unitaires Services

**Fichier :** `src/services/supabase/__tests__/promotions.service.test.ts`

```typescript
import { PromotionsService } from '../promotions.service';
import { Product, Promotion } from '../../../types';

describe('PromotionsService.calculateBestPrice', () => {

  const mockProduct: Product = {
    id: 'prod-1',
    name: 'Bière Test',
    price: 350,
    stock: 100,
    categoryId: 'cat-1',
    // ... autres champs
  };

  describe('Bundle Promotion', () => {
    const bundlePromo: Promotion = {
      id: 'promo-1',
      type: 'bundle',
      bundleQuantity: 3,
      bundlePrice: 1000,
      // ... autres champs requis
    };

    it('should apply bundle for exact quantity', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 3, [bundlePromo]);

      expect(result.finalPrice).toBe(1000);
      expect(result.discount).toBe(50);
      expect(result.appliedPromotion?.id).toBe('promo-1');
    });

    it('should handle partial bundle (7 units = 2 bundles + 1 normal)', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 7, [bundlePromo]);

      // 2 bundles (6 units) + 1 normal = 2×1000 + 1×350 = 2350
      expect(result.finalPrice).toBe(2350);
      expect(result.discount).toBe(100); // 7×350 - 2350
      expect(result.breakdown?.bundles).toBe(2);
      expect(result.breakdown?.remainingUnits).toBe(1);
    });

    it('should not apply bundle if quantity below minimum', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 2, [bundlePromo]);

      expect(result.finalPrice).toBe(700); // 2×350, pas de promo
      expect(result.discount).toBe(0);
      expect(result.appliedPromotion).toBeUndefined();
    });
  });

  describe('Fixed Discount', () => {
    const fixedPromo: Promotion = {
      id: 'promo-2',
      type: 'fixed_discount',
      discountAmount: 50,  // -50 FCFA (pas × quantité)
      // ... autres champs
    };

    it('should apply fixed discount correctly (not multiplied by quantity)', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 3, [fixedPromo]);

      // ✅ CORRECT : 3×350 - 50 = 1000 (pas 3×350 - 3×50)
      expect(result.finalPrice).toBe(1000);
      expect(result.discount).toBe(50);
    });

    it('should not go below zero', () => {
      const hugeDiscount: Promotion = {
        ...fixedPromo,
        discountAmount: 5000, // Discount > prix
      };

      const result = PromotionsService.calculateBestPrice(mockProduct, 1, [hugeDiscount]);

      expect(result.finalPrice).toBe(0);
      expect(result.discount).toBe(350);
    });
  });

  describe('Percentage Discount', () => {
    const percentPromo: Promotion = {
      id: 'promo-3',
      type: 'percentage',
      discountPercentage: 10,  // -10%
      // ... autres champs
    };

    it('should apply percentage correctly', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 2, [percentPromo]);

      // 2×350 = 700, -10% = 630
      expect(result.finalPrice).toBe(630);
      expect(result.discount).toBe(70);
    });
  });

  describe('Special Price', () => {
    const specialPromo: Promotion = {
      id: 'promo-4',
      type: 'special_price',
      specialPrice: 300,  // Prix fixe 300 FCFA/unité
      // ... autres champs
    };

    it('should apply special price per unit', () => {
      const result = PromotionsService.calculateBestPrice(mockProduct, 3, [specialPromo]);

      expect(result.finalPrice).toBe(900); // 3×300
      expect(result.discount).toBe(150); // 3×350 - 900
    });
  });

  describe('Multiple Promotions', () => {
    it('should select best promotion (highest discount)', () => {
      const promos: Promotion[] = [
        { id: 'p1', type: 'fixed_discount', discountAmount: 30, priority: 0 },
        { id: 'p2', type: 'percentage', discountPercentage: 20, priority: 0 }, // -70 FCFA sur 350
        { id: 'p3', type: 'fixed_discount', discountAmount: 50, priority: 0 }, // BEST
      ];

      const result = PromotionsService.calculateBestPrice(mockProduct, 1, promos as any);

      expect(result.appliedPromotion?.id).toBe('p3'); // Plus grand discount
      expect(result.discount).toBe(50);
    });

    it('should use priority if discount equal', () => {
      const promos: Promotion[] = [
        { id: 'p1', type: 'fixed_discount', discountAmount: 50, priority: 5 }, // BEST (priorité)
        { id: 'p2', type: 'fixed_discount', discountAmount: 50, priority: 3 },
      ];

      const result = PromotionsService.calculateBestPrice(mockProduct, 1, promos as any);

      expect(result.appliedPromotion?.id).toBe('p1'); // Même discount, mais priorité 5 > 3
    });
  });

  describe('Stock Validation', () => {
    it('should throw error if quantity exceeds stock', () => {
      const lowStockProduct: Product = {
        ...mockProduct,
        stock: 2,
      };

      expect(() => {
        PromotionsService.calculateBestPrice(lowStockProduct, 5, []);
      }).toThrow('Stock insuffisant');
    });
  });

  describe('Input Validation', () => {
    it('should throw error for negative quantity', () => {
      expect(() => {
        PromotionsService.calculateBestPrice(mockProduct, -1, []);
      }).toThrow('Quantity must be positive');
    });

    it('should throw error for zero quantity', () => {
      expect(() => {
        PromotionsService.calculateBestPrice(mockProduct, 0, []);
      }).toThrow('Quantity must be positive');
    });
  });
});
```

---

### Tests SQL Contraintes

**Fichier :** `supabase/tests/promotions_constraints.test.sql`

```sql
-- Test 1 : Bundle doit avoir quantité >= 2
DO $$
BEGIN
  INSERT INTO promotions (bar_id, name, type, bundle_quantity, bundle_price, target_type, start_date, created_by)
  VALUES ('bar-test', 'Invalid Bundle', 'bundle', 1, 100, 'all', CURRENT_DATE, 'user-test');

  RAISE EXCEPTION 'Should have failed: bundle_quantity < 2';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: Bundle quantity validation works';
END $$;

-- Test 2 : Fixed discount doit être positif
DO $$
BEGIN
  INSERT INTO promotions (bar_id, name, type, discount_amount, target_type, start_date, created_by)
  VALUES ('bar-test', 'Invalid Discount', 'fixed_discount', -10, 'all', CURRENT_DATE, 'user-test');

  RAISE EXCEPTION 'Should have failed: negative discount';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: Positive discount validation works';
END $$;

-- Test 3 : Percentage entre 0.01 et 100
DO $$
BEGIN
  INSERT INTO promotions (bar_id, name, type, discount_percentage, target_type, start_date, created_by)
  VALUES ('bar-test', 'Invalid Percentage', 'percentage', 150, 'all', CURRENT_DATE, 'user-test');

  RAISE EXCEPTION 'Should have failed: percentage > 100';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: Percentage range validation works';
END $$;

-- Test 4 : Time range cohérent (end > start)
DO $$
BEGIN
  INSERT INTO promotions (bar_id, name, type, special_price, target_type, start_date, time_start, time_end, created_by)
  VALUES ('bar-test', 'Invalid Time', 'special_price', 300, 'all', CURRENT_DATE, '19:00', '17:00', 'user-test');

  RAISE EXCEPTION 'Should have failed: time_end < time_start';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: Time range validation works';
END $$;

-- Test 5 : Target product requis si target_type = 'product'
DO $$
BEGIN
  INSERT INTO promotions (bar_id, name, type, special_price, target_type, start_date, created_by)
  VALUES ('bar-test', 'Invalid Target', 'special_price', 300, 'product', CURRENT_DATE, 'user-test');

  RAISE EXCEPTION 'Should have failed: target_product_ids NULL';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK: Target validation works';
END $$;

-- Test 6 : Auto-increment current_uses
INSERT INTO promotions (id, bar_id, name, type, bundle_quantity, bundle_price, target_type, start_date, created_by, status)
VALUES ('promo-test-increment', 'bar-test', 'Test Increment', 'bundle', 3, 1000, 'all', CURRENT_DATE, 'user-test', 'active')
RETURNING current_uses; -- Doit être 0

SELECT increment_promotion_uses('promo-test-increment');
SELECT current_uses FROM promotions WHERE id = 'promo-test-increment'; -- Doit être 1

-- Test 7 : Auto-expire si max_total_uses atteint
UPDATE promotions SET max_total_uses = 2, current_uses = 1 WHERE id = 'promo-test-increment';
SELECT increment_promotion_uses('promo-test-increment');
SELECT status FROM promotions WHERE id = 'promo-test-increment'; -- Doit être 'expired'

-- Cleanup
DELETE FROM promotions WHERE id = 'promo-test-increment';
```

---

### Scénarios Tests Manuels

**Checklist tests fonctionnels :**

#### Happy Hour Edge Cases

- [ ] **Happy Hour chevauchant minuit (23h-01h)**
  - Créer promo special_price de 23:00 à 01:00
  - Tester vente à 23:30 → Doit appliquer
  - Tester vente à 00:30 → Doit appliquer
  - Tester vente à 01:30 → Ne doit PAS appliquer

- [ ] **Happy Hour jour spécifique (vendredi/samedi)**
  - Créer promo recurring [5, 6], 17:00-19:00
  - Tester vendredi 18:00 → Appliquer ✅
  - Tester lundi 18:00 → PAS appliquer ❌

#### Promotions Multiples

- [ ] **Plusieurs promos applicables**
  - Créer 2 promos sur même produit avec discounts différents
  - Vérifier que la meilleure s'applique

- [ ] **Priorités égales**
  - 2 promos même discount, priorités 5 et 3
  - Vérifier que priorité 5 s'applique

#### Limites Utilisation

- [ ] **Max total uses**
  - Créer promo avec max_total_uses = 2
  - Faire 2 ventes → OK
  - Faire 3ème vente → Promo doit être expired

- [ ] **Statut auto-update**
  - Créer promo scheduled avec start_date = demain
  - Lancer fonction `update_promotion_statuses()`
  - Vérifier statut reste 'scheduled'
  - Changer manuellement start_date = aujourd'hui
  - Relancer fonction → Statut doit passer 'active'

#### Stock Validation

- [ ] **Vente avec stock insuffisant**
  - Produit avec stock = 2
  - Tenter vente de 5 unités
  - Vérifier erreur claire : "Stock insuffisant (2 disponibles, 5 demandés)"

---

## ✅ Checklist Implémentation

### Phase 1 : Fondations (Semaine 1-2)

- [ ] **Migration 059 créée**
  - [ ] Types ENUM (promotion_type, promotion_status, event_type)
  - [ ] Table promotions avec toutes contraintes
  - [ ] Table promotion_applications
  - [ ] Table bar_events (si non existante)
  - [ ] Fonction increment_promotion_uses()
  - [ ] Fonction update_promotion_statuses()
  - [ ] Vue active_promotions
  - [ ] Vue promotion_analytics_summary (optionnel)

- [ ] **Types TypeScript**
  - [ ] Fichier src/types/promotions.ts créé
  - [ ] Export dans src/types/index.ts
  - [ ] Interfaces documentées

- [ ] **Tests Migration**
  - [ ] Contraintes CHECK valident bien
  - [ ] RLS policies fonctionnent
  - [ ] Index créés correctement
  - [ ] Fonctions SQL exécutables

### Phase 2 : Services (Semaine 3-4)

- [ ] **PromotionsService**
  - [ ] getActivePromotions() avec filtres Happy Hour
  - [ ] calculateBestPrice() corrigé (fixed_discount)
  - [ ] recordApplication() avec validation
  - [ ] createPromotion() avec validation métier
  - [ ] updatePromotion() (interdit changement type)
  - [ ] updateStatus()
  - [ ] getPromotionStats()
  - [ ] validatePromotion()

- [ ] **EventsService**
  - [ ] createEvent()
  - [ ] getUpcomingEvents()
  - [ ] getEventImpact()
  - [ ] updateEvent()
  - [ ] deleteEvent()

- [ ] **Tests Unitaires**
  - [ ] 15+ test cases calculateBestPrice()
  - [ ] Tests validation
  - [ ] Tests edge cases
  - [ ] Coverage > 85%

### Phase 3 : QuickSale (Semaine 5)

- [ ] **Chargement Promotions**
  - [ ] useEffect au montage
  - [ ] Gestion erreurs
  - [ ] Indicateur loading

- [ ] **Calcul Prix**
  - [ ] Intégration calculateBestPrice()
  - [ ] Gestion cart avec promos
  - [ ] Update prix si quantité change

- [ ] **UI Badges**
  - [ ] Badge "PROMO" sur produits
  - [ ] Affichage économie panier
  - [ ] Prix barré + nouveau prix
  - [ ] Design responsive

- [ ] **Enregistrement**
  - [ ] recordApplication() à validation vente
  - [ ] Gestion erreurs
  - [ ] Clear state après vente

### Phase 4 : Gestion (Semaine 6)

- [ ] **PromotionsManager**
  - [ ] Liste avec filtres/tri/pagination
  - [ ] Actions rapides (activer/pause/dupliquer)
  - [ ] Formulaire création multi-étapes
  - [ ] Formulaire édition
  - [ ] Dashboard performance

- [ ] **Analytics**
  - [ ] Métriques clés (cards)
  - [ ] Graphiques Recharts
  - [ ] Comparaison avant/pendant
  - [ ] Export CSV (optionnel)

### Post-Déploiement

- [ ] **Production**
  - [ ] Migration 059 appliquée
  - [ ] Backup DB avant migration
  - [ ] Cron job update_promotion_statuses configuré (quotidien)
  - [ ] Cron job refresh analytics (si vue mat créée)
  - [ ] Monitoring erreurs actif

- [ ] **Tests Smoke**
  - [ ] Création promotion via UI
  - [ ] Application promo dans QuickSale
  - [ ] Vérification historique applications
  - [ ] Dashboard analytics affiche données

- [ ] **Documentation**
  - [ ] Guide utilisateur créer promo
  - [ ] Guide admin gérer événements
  - [ ] FAQ troubleshooting
  - [ ] Vidéo démo (optionnel)

---

## 📚 Valeur pour les Prévisions

Ce système enrichit le **ROADMAP_FORECASTING_SYSTEM** avec :

1. **Historique promotions** → Analyse impact réel sur ventes
   - Comparer CA avec/sans promo
   - Identifier meilleures périodes promotionnelles
   - Calculer élasticité prix

2. **Événements planifiés** → Ajustement prévisions futures
   - Multiplicateurs événements dans `get_date_factors()`
   - Intégration automatique dans `forecast_revenue_ewma()`

3. **Patterns saisonniers** → Récurrence promotions
   - Happy Hour réguliers (ven-sam)
   - Promotions mensuelles (début de mois)
   - Événements annuels (Noël, Indépendance)

4. **Élasticité prix** → Sensibilité clients
   - Analyser volume ventes vs discount %
   - Optimiser pricing stratégique
   - ROI promotion vs forecast naturel

**Connexion DRY avec Forecasting :**

```sql
-- Exemple : Prévision ventes ajustée par promotions actives
SELECT
  f.forecast_date,
  f.base_revenue,

  -- Ajustement événement (ROADMAP)
  f.base_revenue * ef.combined_factor as event_adjusted,

  -- Ajustement promo (PLAN_PROMOTIONS)
  f.base_revenue * ef.combined_factor *
    COALESCE(1 + (SELECT AVG(roi_ratio - 1) FROM active_promotions WHERE start_date <= f.forecast_date), 1)
    as final_forecast

FROM forecast_revenue_ewma('bar-id', 0.3, 7) f
CROSS JOIN LATERAL get_date_factors(f.forecast_date, 'bar-id') ef;
```

---

## 🚀 Prochaines Étapes

**Phase 1 : Immédiat**
1. ✅ Créer migration 059_promotions_system.sql
2. ✅ Tester migration en local (supabase db reset)
3. ✅ Créer types TypeScript (src/types/promotions.ts)

**Phase 2 : Semaine 3-4**
4. ✅ Implémenter PromotionsService avec tests
5. ✅ Implémenter EventsService
6. ✅ Code review + validation logique calcul

**Phase 3 : Semaine 5**
7. ✅ Intégrer QuickSaleFlow
8. ✅ Tests fonctionnels (Happy Hour, bundles, etc.)
9. ✅ UI/UX review

**Phase 4 : Semaine 6**
10. ✅ Créer PromotionsManager
11. ✅ Dashboard analytics
12. ✅ Tests utilisateurs beta

**Déploiement : Semaine 7**
13. ✅ Migration production
14. ✅ Monitoring + ajustements
15. ✅ Documentation + formation

---

**Document Version :** 2.0 (Production-Ready)
**Date Création :** 27 Novembre 2025
**Dernière MAJ :** 27 Novembre 2025
**Auteur :** Claude Code
**Statut :** ✅ Prêt pour implémentation
**Priorité :** 🟡 Moyenne (après Phase 1 ROADMAP_FORECASTING)
**Dépendances :** Migration 058 (Business Day 6h)
