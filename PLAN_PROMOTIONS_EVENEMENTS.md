# Plan d'Implémentation : Système de Promotions & Événements

**Date :** 27 Novembre 2025  
**Objectif :** Implémenter un système complet de promotions et événements pour enrichir les données de prévisions  
**Durée estimée :** 4 semaines

---

## 📋 Table des Matières

1. [Contexte & Cas d'Usage](#contexte--cas-dusage)
2. [Phase 1 : Fondations SQL & Types](#phase-1--fondations-sql--types)
3. [Phase 2 : Services & Logique Métier](#phase-2--services--logique-métier)
4. [Phase 3 : Intégration QuickSale](#phase-3--intégration-quicksale)
5. [Phase 4 : Gestion & Analytics](#phase-4--gestion--analytics)
6. [Checklist Implémentation](#checklist-implémentation)

---

## 📋 Contexte & Cas d'Usage

### Types de Promotions Observés au Bénin

Le système supporte **4 types de promotions** adaptés aux pratiques locales :

#### 1. **Promotion par Lot (Bundle) - LE PLUS COURANT** ⭐

**Cas d'usage :** Vendre plusieurs unités à prix réduit

**Exemple concret :**
- 3 bières à 1000 FCFA au lieu de 1050 FCFA (3 × 350)
- Économie client : 50 FCFA
- Impact : Augmente volume de ventes, fidélise clients

**Configuration :**
```typescript
{
  type: 'bundle',
  bundleQuantity: 3,
  bundlePrice: 1000
}
```

---

#### 2. **Prix Spécial (avec horaires optionnels)**

**Cas d'usage :** Prix réduit temporaire avec flexibilité horaire

**Exemples concrets :**

**A. Prix spécial tout le weekend**
```typescript
{
  type: 'special_price',
  specialPrice: 300,
  startDate: '2025-12-01',
  endDate: '2025-12-07',
  timeStart: null,  // Toute la journée
  timeEnd: null
}
```

**B. Happy Hour (17h-19h)**
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

**Cas d'usage :** Réduction en FCFA sur un produit

**Exemple concret :**
- -50 FCFA sur toutes les bières

**Configuration :**
```typescript
{
  type: 'fixed_discount',
  discountAmount: 50,
  targetType: 'category',
  targetCategoryIds: ['beer-category-id']
}
```

---

#### 4. **Réduction Pourcentage (Rare)**

**Cas d'usage :** Réduction en % pour écouler stock

**Exemple concret :**
- -10% sur toutes les boissons gazeuses

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

## 🎯 Phase 1 : Fondations SQL & Types (Semaine 1)

### Migration 047 : Tables Promotions & Événements

**Fichier :** `supabase/migrations/047_create_promotions_and_events.sql`

#### 1.1 Types ENUM

```sql
-- Type de promotion
CREATE TYPE promotion_type AS ENUM (
  'bundle',           -- Lot : X unités à prix fixe
  'fixed_discount',   -- Réduction montant fixe
  'percentage',       -- Réduction pourcentage
  'special_price'     -- Prix spécial (avec horaires optionnels)
);

-- Statut promotion
CREATE TYPE promotion_status AS ENUM (
  'draft',      -- Brouillon
  'scheduled',  -- Programmée (pas encore active)
  'active',     -- Active
  'paused',     -- En pause
  'expired',    -- Expirée
  'cancelled'   -- Annulée
);

-- Type d'événement
CREATE TYPE event_type AS ENUM (
  'holiday',      -- Jour férié
  'anniversary',  -- Anniversaire bar
  'sports',       -- Événement sportif (match important)
  'theme_night',  -- Soirée thématique
  'custom'        -- Personnalisé
);
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
  
  -- Configuration FIXED_DISCOUNT
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
  
  -- Limites
  max_uses_per_customer INT,
  max_total_uses INT,
  current_uses INT DEFAULT 0,
  
  -- Priorité (si plusieurs promos applicables)
  priority INT DEFAULT 0,
  
  -- Traçabilité
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Contraintes de validation
  CONSTRAINT valid_bundle CHECK (
    (type = 'bundle' AND bundle_quantity > 0 AND bundle_price > 0) 
    OR type != 'bundle'
  ),
  CONSTRAINT valid_fixed_discount CHECK (
    (type = 'fixed_discount' AND discount_amount > 0) 
    OR type != 'fixed_discount'
  ),
  CONSTRAINT valid_percentage CHECK (
    (type = 'percentage' AND discount_percentage > 0 AND discount_percentage <= 100) 
    OR type != 'percentage'
  ),
  CONSTRAINT valid_special_price CHECK (
    (type = 'special_price' AND special_price > 0) 
    OR type != 'special_price'
  ),
  CONSTRAINT valid_target CHECK (
    (target_type = 'product' AND target_product_ids IS NOT NULL AND array_length(target_product_ids, 1) > 0)
    OR (target_type = 'category' AND target_category_ids IS NOT NULL AND array_length(target_category_ids, 1) > 0)
    OR target_type = 'all'
  )
);

-- Index pour performance
CREATE INDEX idx_promotions_bar_id ON promotions(bar_id);
CREATE INDEX idx_promotions_status ON promotions(status);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX idx_promotions_target_products ON promotions USING GIN (target_product_ids);
CREATE INDEX idx_promotions_target_categories ON promotions USING GIN (target_category_ids);

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
  quantity_sold INT NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  discounted_price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL, -- Économie réalisée
  
  -- Traçabilité
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID NOT NULL
);

-- Index
CREATE INDEX idx_promo_apps_bar_id ON promotion_applications(bar_id);
CREATE INDEX idx_promo_apps_promotion_id ON promotion_applications(promotion_id);
CREATE INDEX idx_promo_apps_sale_id ON promotion_applications(sale_id);
CREATE INDEX idx_promo_apps_applied_at ON promotion_applications(applied_at);

-- RLS
ALTER TABLE promotion_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotion applications for their bars"
ON promotion_applications FOR SELECT
USING (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert promotion applications for their bars"
ON promotion_applications FOR INSERT
WITH CHECK (bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid()));
```

---

#### 1.4 Table `bar_events`

```sql
CREATE TABLE bar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  
  event_type event_type NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  
  -- Impact sur ventes (pour prévisions)
  impact_multiplier DECIMAL(5,2) DEFAULT 1.0, -- 1.5 = +50%, 2.0 = +100%
  
  -- Récurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- 'yearly_12_25', 'monthly_15', 'weekly_5'
  
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
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
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'promoteur')
));
```

---

### Types TypeScript

**Fichier :** `src/types/index.ts`

```typescript
// ===== PROMOTIONS =====
export type PromotionType = 
  | 'bundle'          // Lot : X unités à prix fixe
  | 'fixed_discount'  // Réduction montant fixe
  | 'percentage'      // Réduction pourcentage
  | 'special_price';  // Prix spécial (avec horaires optionnels)

export type PromotionStatus = 
  | 'draft' 
  | 'scheduled' 
  | 'active' 
  | 'paused' 
  | 'expired' 
  | 'cancelled';

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
  bundleQuantity?: number;      // Pour 'bundle'
  bundlePrice?: number;          // Pour 'bundle'
  discountAmount?: number;       // Pour 'fixed_discount'
  discountPercentage?: number;   // Pour 'percentage'
  specialPrice?: number;         // Pour 'special_price'
  timeStart?: string;            // OPTIONNEL : Pour Happy Hour (HH:MM)
  timeEnd?: string;              // OPTIONNEL : Pour Happy Hour (HH:MM)
  
  // Planification
  startDate: string;
  endDate?: string;
  isRecurring: boolean;
  recurrenceDays?: number[];     // [1,2,3,4,5] = Lun-Ven
  
  // Limites
  maxUsesPerCustomer?: number;
  maxTotalUses?: number;
  currentUses: number;
  
  // Priorité
  priority: number;
  
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
  productId: string;
  quantitySold: number;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  appliedAt: Date;
  appliedBy: string;
}

// ===== ÉVÉNEMENTS =====
export type EventType = 
  | 'holiday' 
  | 'anniversary' 
  | 'sports' 
  | 'theme_night' 
  | 'custom';

export interface BarEvent {
  id: string;
  barId: string;
  eventType: EventType;
  eventName: string;
  eventDate: string;
  impactMultiplier: number;
  isRecurring: boolean;
  recurrenceRule?: string;
  notes?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🎯 Phase 2 : Services & Logique Métier (Semaine 2)

### Service Promotions

**Fichier :** `src/services/supabase/promotions.service.ts`

```typescript
import { supabase } from './client';
import { Promotion, PromotionApplication, Product } from '../../types';

export const PromotionsService = {
  /**
   * Récupérer les promotions actives pour un bar
   */
  async getActivePromotions(barId: string, productId?: string): Promise<Promotion[]> {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
    const currentDayOfWeek = now.getDay();

    let query = supabase
      .from('promotions')
      .select('*')
      .eq('bar_id', barId)
      .eq('status', 'active')
      .lte('start_date', currentDate)
      .or(`end_date.is.null,end_date.gte.${currentDate}`);

    const { data, error } = await query;
    if (error) throw error;

    // Filtrer côté client pour logique complexe
    return (data || []).filter(promo => {
      // Vérifier si applicable aujourd'hui (récurrence)
      if (promo.is_recurring && promo.recurrence_days?.length > 0) {
        if (!promo.recurrence_days.includes(currentDayOfWeek)) {
          return false;
        }
      }

      // Vérifier horaires (Happy Hour)
      if (promo.time_start && promo.time_end) {
        if (currentTime < promo.time_start || currentTime > promo.time_end) {
          return false;
        }
      }

      // Vérifier ciblage produit
      if (productId) {
        if (promo.target_type === 'product' && !promo.target_product_ids?.includes(productId)) {
          return false;
        }
      }

      return true;
    });
  },

  /**
   * Calculer le meilleur prix avec promotions
   */
  calculateBestPrice(
    product: Product,
    quantity: number,
    promotions: Promotion[]
  ): {
    finalPrice: number;
    originalPrice: number;
    discount: number;
    appliedPromotion?: Promotion;
  } {
    const originalPrice = product.price * quantity;
    let bestPrice = originalPrice;
    let bestPromotion: Promotion | undefined;

    for (const promo of promotions) {
      let calculatedPrice = originalPrice;

      switch (promo.type) {
        case 'bundle':
          if (quantity >= (promo.bundleQuantity || 0)) {
            const bundles = Math.floor(quantity / (promo.bundleQuantity || 1));
            const remaining = quantity % (promo.bundleQuantity || 1);
            calculatedPrice = bundles * (promo.bundlePrice || 0) + remaining * product.price;
          }
          break;

        case 'special_price':
          calculatedPrice = (promo.specialPrice || 0) * quantity;
          break;

        case 'fixed_discount':
          calculatedPrice = Math.max(0, originalPrice - (promo.discountAmount || 0) * quantity);
          break;

        case 'percentage':
          calculatedPrice = originalPrice * (1 - (promo.discountPercentage || 0) / 100);
          break;
      }

      // Garder la meilleure offre (priorité si égalité)
      if (calculatedPrice < bestPrice || 
         (calculatedPrice === bestPrice && (promo.priority > (bestPromotion?.priority || 0)))) {
        bestPrice = calculatedPrice;
        bestPromotion = promo;
      }
    }

    return {
      finalPrice: bestPrice,
      originalPrice,
      discount: originalPrice - bestPrice,
      appliedPromotion: bestPromotion
    };
  },

  /**
   * Enregistrer l'application d'une promotion
   */
  async recordApplication(application: Omit<PromotionApplication, 'id' | 'appliedAt'>): Promise<void> {
    const { error } = await supabase
      .from('promotion_applications')
      .insert(application);

    if (error) throw error;

    // Incrémenter le compteur d'utilisations
    await supabase.rpc('increment_promotion_uses', {
      p_promotion_id: application.promotionId
    });
  },

  /**
   * Créer une nouvelle promotion
   */
  async createPromotion(promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>): Promise<Promotion> {
    const { data, error } = await supabase
      .from('promotions')
      .insert(promotion)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Mettre à jour une promotion
   */
  async updatePromotion(id: string, updates: Partial<Promotion>): Promise<Promotion> {
    const { data, error } = await supabase
      .from('promotions')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Obtenir les statistiques d'une promotion
   */
  async getPromotionStats(promotionId: string): Promise<{
    totalApplications: number;
    totalRevenue: number;
    totalDiscount: number;
    averageDiscount: number;
  }> {
    const { data, error } = await supabase
      .from('promotion_applications')
      .select('discount_amount, discounted_price')
      .eq('promotion_id', promotionId);

    if (error) throw error;

    const totalApplications = data?.length || 0;
    const totalDiscount = data?.reduce((sum, app) => sum + app.discount_amount, 0) || 0;
    const totalRevenue = data?.reduce((sum, app) => sum + app.discounted_price, 0) || 0;

    return {
      totalApplications,
      totalRevenue,
      totalDiscount,
      averageDiscount: totalApplications > 0 ? totalDiscount / totalApplications : 0
    };
  }
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
  async createEvent(event: Omit<BarEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<BarEvent> {
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
   * Obtenir le multiplicateur d'impact pour une date
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
      .single();

    if (error) return 1.0;
    return data?.impact_multiplier || 1.0;
  }
};
```

---

## 🎯 Phase 3 : Intégration QuickSale (Semaine 3)

### Modifications QuickSaleFlow

**Fichier :** `src/components/QuickSaleFlow.tsx`

**Changements principaux :**

1. **Charger promotions actives au démarrage**
2. **Calculer prix automatiquement avec promotions**
3. **Afficher badges "PROMO" sur produits**
4. **Montrer économie réalisée**
5. **Enregistrer applications dans historique**

**Exemple d'intégration :**

```typescript
// Dans QuickSaleFlow
const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);

useEffect(() => {
  loadActivePromotions();
}, [barId]);

const loadActivePromotions = async () => {
  const promos = await PromotionsService.getActivePromotions(barId);
  setActivePromotions(promos);
};

const handleAddToCart = (product: Product) => {
  const quantity = 1;
  const priceInfo = PromotionsService.calculateBestPrice(
    product,
    quantity,
    activePromotions.filter(p => 
      p.targetType === 'all' || 
      p.targetProductIds?.includes(product.id) ||
      p.targetCategoryIds?.includes(product.categoryId)
    )
  );

  // Ajouter au panier avec prix promotionnel
  addToCart({
    product,
    quantity,
    finalPrice: priceInfo.finalPrice,
    originalPrice: priceInfo.originalPrice,
    appliedPromotion: priceInfo.appliedPromotion
  });
};
```

---

## 🎯 Phase 4 : Gestion & Analytics (Semaine 4)

### Interface Gestion Promotions

**Composant :** `src/components/PromotionsManager.tsx`

**Fonctionnalités :**
- Liste des promotions (actives, programmées, expirées)
- Création/édition promotions
- Activation/désactivation
- Duplication promotions
- Statistiques par promotion

### Dashboard Performance

**Métriques affichées :**
- CA généré par promotion
- Quantités vendues
- Économie moyenne client
- ROI promotion
- Comparaison avant/pendant/après

---

## ✅ Checklist Implémentation

### Phase 1 : Fondations (Semaine 1)
- [ ] Créer migration 047 (tables + types ENUM)
- [ ] Ajouter types TypeScript dans `src/types/index.ts`
- [ ] Tester migration en local
- [ ] Vérifier RLS policies

### Phase 2 : Services (Semaine 2)
- [ ] Créer `promotions.service.ts`
- [ ] Créer `events.service.ts`
- [ ] Implémenter logique calcul prix
- [ ] Tests unitaires services

### Phase 3 : QuickSale (Semaine 3)
- [ ] Intégrer chargement promotions
- [ ] Calculer prix avec promos
- [ ] UI badges "PROMO"
- [ ] Afficher économies
- [ ] Enregistrer historique applications

### Phase 4 : Gestion (Semaine 4)
- [ ] Composant PromotionsManager
- [ ] CRUD promotions
- [ ] Dashboard analytics
- [ ] Tests utilisateur
- [ ] Documentation

---

## 📊 Valeur pour les Prévisions

Ce système enrichira les modèles de prévision (Phase 2 Roadmap) avec :

1. **Historique promotions** → Impact réel sur ventes
2. **Événements planifiés** → Ajustement prévisions futures
3. **Patterns saisonniers** → Récurrence promotions
4. **Élasticité prix** → Sensibilité clients aux réductions

---

## 🚀 Prochaines Étapes

**Ordre recommandé :**
1. ✅ Créer migration SQL
2. ✅ Ajouter types TypeScript
3. ✅ Implémenter services
4. ✅ Intégrer QuickSale
5. ✅ Interface gestion

**Prêt à commencer ?** 🎯
