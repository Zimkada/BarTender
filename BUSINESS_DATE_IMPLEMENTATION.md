# Plan d'Implémentation : Système `business_date` Offline-First

## 🎯 Objectif

Implémenter une **double logique cohérente** pour le calcul de `business_date` :
- **Backend (SQL)** : Calcul automatique via trigger (mode online)
- **Frontend (JavaScript)** : Calcul manuel identique (mode offline)

**Principe** : Accepter la duplication contrôlée pour garantir le fonctionnement offline.

---

## 📋 Architecture Finale

```
┌─────────────────────────────────────────────────────────────┐
│                    CRÉATION DE VENTE                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   ┌────────┴────────┐
                   │ Frontend calcule│
                   │ business_date   │ ← Helper JS centralisé
                   │ TOUJOURS        │
                   └────────┬────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
        MODE ONLINE                  MODE OFFLINE
              ↓                           ↓
    ┌─────────────────┐          ┌──────────────────┐
    │ Insert Supabase │          │ Save LocalStorage│
    │ avec business_  │          │ avec business_   │
    │ date pré-calc   │          │ date calculée    │
    └────────┬────────┘          └────────┬─────────┘
             ↓                            ↓
    ┌─────────────────┐          ┌──────────────────┐
    │ Trigger SQL     │          │ Utilisée telle   │
    │ RECALCULE       │          │ quelle           │
    │ (double check)  │          │                  │
    └────────┬────────┘          └────────┬─────────┘
             ↓                            ↓
    ┌─────────────────────────────────────────────┐
    │ Sale avec business_date GARANTIE correcte   │
    └─────────────────────────────────────────────┘
```

---

## Proposed Changes

### Étape 1 : Refactorisation des Types

#### [MODIFY] [types/index.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/types/index.ts)

**Objectif** : Déplacer `closingHour` hors de `settings` et rendre `businessDate` obligatoire.

```typescript
// ===== BARS & ORGANISATION =====
export interface Bar {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  ownerId: string;
  createdAt: Date;
  isActive: boolean;
  closingHour: number; // ✅ AJOUTER : Propriété directe (source de vérité)
  settings: BarSettings;
}

export interface BarSettings {
  currency: string;
  currencySymbol: string;
  timezone?: string;
  language?: string;
  // ❌ SUPPRIMER businessDayCloseHour (duplication avec closingHour)
  operatingMode?: 'full' | 'simplified';
  serversList?: string[];
  consignmentExpirationDays?: number;
  supplyFrequency?: number;
}

// ✅ MODIFIER : Rendre businessDate obligatoire
export interface Sale {
  id: string;
  barId: string;
  items: SaleItem[];
  total: number;
  currency: string;
  status: 'pending' | 'validated' | 'rejected';
  createdBy: string;
  validatedBy?: string;
  rejectedBy?: string;
  createdAt: Date;
  validatedAt?: Date;
  rejectedAt?: Date;
  businessDate: Date; // ✅ Obligatoire (calculée par frontend ou backend)
  assignedTo?: string;
  tableNumber?: string;
  paymentMethod?: 'cash' | 'mobile_money' | 'card' | 'credit';
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface Return {
  id: string;
  barId: string;
  saleId: string;
  productId: string;
  productName: string;
  productVolume: string;
  quantitySold: number;
  quantityReturned: number;
  reason: ReturnReason;
  returnedBy: string;
  returnedAt: Date;
  businessDate: Date; // ✅ Obligatoire
  refundAmount: number;
  isRefunded: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'restocked';
  autoRestock: boolean;
  manualRestockRequired: boolean;
  restockedAt?: Date;
  notes?: string;
  customRefund?: boolean;
  customRestock?: boolean;
  originalSeller?: string;
}

export interface Consignment {
  id: string;
  barId: string;
  saleId: string;
  productId: string;
  productName: string;
  productVolume: string;
  quantity: number;
  totalAmount: number;
  createdAt: Date;
  expiresAt: Date;
  claimedAt?: Date;
  businessDate: Date; // ✅ Obligatoire
  status: ConsignmentStatus;
  createdBy: string;
  claimedBy?: string;
  originalSeller?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}
```

---

### Étape 2 : Helper Centralisé (Source de Vérité Frontend)

#### [NEW] [utils/businessDateHelpers.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/utils/businessDateHelpers.ts)

**Objectif** : Créer UN SEUL helper pour tous les calculs de `business_date`.

```typescript
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

/**
 * ⚠️ LOGIQUE CRITIQUE : Doit être IDENTIQUE au trigger SQL
 * 
 * Référence SQL (migration 067_add_business_date.sql) :
 * NEW.business_date := DATE(v_source_date - (v_closing_hour || ' hours')::INTERVAL);
 * 
 * Équivalent JavaScript :
 * if (hour < closeHour) { date.setDate(date.getDate() - 1); }
 * 
 * @param date - Date source (created_at, returned_at, etc.)
 * @param closeHour - Heure de clôture du bar (0-23)
 * @returns Date commerciale (normalisée à minuit)
 */
export function calculateBusinessDate(
  date: Date,
  closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): Date {
  const hour = date.getHours();
  const businessDate = new Date(date);
  
  // Si avant l'heure de clôture, c'est la journée commerciale d'hier
  if (hour < closeHour) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  
  // Normaliser à minuit (00:00:00.000)
  businessDate.setHours(0, 0, 0, 0);
  
  return businessDate;
}

/**
 * Convertit une Date en string YYYY-MM-DD
 */
export function dateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtient la business_date d'un item (Sale, Return, Consignment)
 * 
 * Priorité :
 * 1. businessDate (si déjà calculée)
 * 2. Calcul manuel depuis createdAt/validatedAt (fallback legacy)
 * 
 * @param item - Objet avec businessDate et/ou createdAt
 * @param closeHour - Heure de clôture du bar
 * @returns String YYYY-MM-DD
 */
export function getBusinessDate(
  item: { 
    businessDate?: Date | string; 
    createdAt?: Date | string;
    validatedAt?: Date | string;
  },
  closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): string {
  // Priorité 1 : businessDate (calculée par backend OU frontend)
  if (item.businessDate) {
    const date = typeof item.businessDate === 'string' 
      ? new Date(item.businessDate) 
      : item.businessDate;
    return dateToYYYYMMDD(date);
  }

  // Fallback : Calculer manuellement (données legacy sans businessDate)
  console.warn('businessDate manquante, calcul manuel (legacy data)', item);
  
  const sourceDate = item.validatedAt || item.createdAt;
  if (!sourceDate) {
    throw new Error('Item must have businessDate, validatedAt, or createdAt');
  }

  const date = typeof sourceDate === 'string' ? new Date(sourceDate) : sourceDate;
  const businessDate = calculateBusinessDate(date, closeHour);
  return dateToYYYYMMDD(businessDate);
}

/**
 * Filtre un tableau d'items par plage de dates commerciales
 * 
 * @param items - Tableau d'objets avec businessDate
 * @param startDate - Date de début (YYYY-MM-DD)
 * @param endDate - Date de fin (YYYY-MM-DD)
 * @param closeHour - Heure de clôture du bar
 * @returns Tableau filtré
 */
export function filterByBusinessDateRange<T extends { 
  businessDate?: Date | string; 
  createdAt?: Date | string;
  validatedAt?: Date | string;
}>(
  items: T[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
  closeHour: number = BUSINESS_DAY_CLOSE_HOUR
): T[] {
  return items.filter(item => {
    const itemDate = getBusinessDate(item, closeHour);
    return itemDate >= startDate && itemDate <= endDate;
  });
}

/**
 * Retourne la date commerciale actuelle (YYYY-MM-DD)
 * 
 * @param closeHour - Heure de clôture du bar
 * @returns String YYYY-MM-DD
 */
export function getCurrentBusinessDateString(closeHour: number = BUSINESS_DAY_CLOSE_HOUR): string {
  const now = new Date();
  const businessDate = calculateBusinessDate(now, closeHour);
  return dateToYYYYMMDD(businessDate);
}
```

---

### Étape 3 : Services Supabase

#### [MODIFY] [services/supabase/bars.service.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/services/supabase/bars.service.ts)

**Objectif** : Mapper `bars.closing_hour` ↔ `Bar.closingHour`.

```typescript
import { supabase } from '../../lib/supabase';
import type { Bar, BarSettings } from '../../types';

export const BarsService = {
  /**
   * Récupère un bar par son ID
   */
  async getBar(barId: string): Promise<Bar> {
    const { data, error } = await supabase
      .from('bars')
      .select('*')
      .eq('id', barId)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      ownerId: data.owner_id,
      createdAt: new Date(data.created_at),
      isActive: data.is_active,
      closingHour: data.closing_hour ?? 6, // ✅ Mapper depuis DB
      settings: data.settings as BarSettings,
    };
  },

  /**
   * Récupère tous les bars d'un utilisateur
   */
  async getUserBars(userId: string): Promise<Bar[]> {
    const { data, error } = await supabase
      .from('bars')
      .select(`
        *,
        bar_members!inner(user_id)
      `)
      .eq('bar_members.user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    return (data || []).map(bar => ({
      id: bar.id,
      name: bar.name,
      address: bar.address,
      phone: bar.phone,
      email: bar.email,
      ownerId: bar.owner_id,
      createdAt: new Date(bar.created_at),
      isActive: bar.is_active,
      closingHour: bar.closing_hour ?? 6, // ✅ Mapper depuis DB
      settings: bar.settings as BarSettings,
    }));
  },

  /**
   * Met à jour un bar
   */
  async updateBar(barId: string, updates: Partial<Bar>): Promise<void> {
    const dbUpdates: any = {};

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.settings !== undefined) dbUpdates.settings = updates.settings;
    
    // ✅ Mapper closingHour vers closing_hour (DB)
    if (updates.closingHour !== undefined) {
      dbUpdates.closing_hour = updates.closingHour;
    }

    const { error } = await supabase
      .from('bars')
      .update(dbUpdates)
      .eq('id', barId);

    if (error) throw error;
  },

  /**
   * Crée un nouveau bar
   */
  async createBar(bar: Omit<Bar, 'id' | 'createdAt'>): Promise<string> {
    const { data, error } = await supabase
      .from('bars')
      .insert({
        name: bar.name,
        address: bar.address,
        phone: bar.phone,
        email: bar.email,
        owner_id: bar.ownerId,
        is_active: bar.isActive,
        closing_hour: bar.closingHour ?? 6, // ✅ Mapper vers DB
        settings: bar.settings,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  },
};
```

---

### Étape 4 : Calcul de business_date à la Création

#### [MODIFY] [hooks/mutations/useSalesMutations.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/hooks/mutations/useSalesMutations.ts)

**Objectif** : Calculer `business_date` AVANT insertion (online et offline).

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import { calculateBusinessDate } from '../../utils/businessDateHelpers';
import { useBarContext } from '../../context/BarContext';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../config/constants';
import type { Sale } from '../../types';

export const useSalesMutations = () => {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();

  const createSale = useMutation({
    mutationFn: async (saleData: Omit<Sale, 'id' | 'createdAt' | 'businessDate'>) => {
      const now = new Date();
      const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
      
      // ✅ Calculer business_date AVANT insertion (frontend)
      const businessDate = calculateBusinessDate(now, closeHour);
      
      const newSale: Sale = {
        ...saleData,
        id: crypto.randomUUID(),
        createdAt: now,
        businessDate, // ✅ Remplie dès la création
      };

      // Envoyer à Supabase
      // Le trigger SQL recalculera business_date (double vérification)
      const savedSale = await SalesService.createSale(newSale);
      
      return savedSale;
    },
    onSuccess: () => {
      // Invalider les caches
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return { createSale };
};
```

---

### Étape 5 : Simplification des Composants

#### [MODIFY] [components/Settings.tsx](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/components/Settings.tsx)

**Objectif** : Éditer `closingHour` directement (pas dans settings).

```typescript
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { settings, updateSettings } = useSettings();
  const { currentBar, updateBar } = useBarContext();

  // ✅ REMPLACER (ligne 80-81)
  const [tempCloseHour, setTempCloseHour] = useState(
    currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR
  );

  const handleSave = () => {
    updateSettings(tempSettings);

    if (currentBar) {
      updateBar(currentBar.id, {
        name: barName.trim(),
        address: barAddress.trim() || undefined,
        phone: barPhone.trim() || undefined,
        email: barEmail.trim() || undefined,
        closingHour: tempCloseHour, // ✅ Sauvegarder directement
        settings: {
          ...currentBar.settings,
          // ❌ businessDayCloseHour supprimé
          consignmentExpirationDays: tempConsignmentExpirationDays,
          supplyFrequency: tempSupplyFrequency,
          operatingMode: tempOperatingMode,
          serversList: tempOperatingMode === 'simplified' ? tempServersList : undefined,
        }
      });
    }

    onClose();
  };

  // ✅ REMPLACER la section heure de clôture (lignes 468-487)
  {activeTab === 'operational' && (
    <>
      {/* Heure de clôture - ÉDITABLE */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Clock size={16} className="text-amber-500" />
          Heure de clôture de la journée commerciale
        </label>
        <p className="text-xs text-gray-600 mb-3">
          Les ventes réalisées avant cette heure sont comptabilisées dans la journée commerciale précédente.
          Par exemple, avec une clôture à {tempCloseHour}h, une vente à 3h du matin sera comptée la veille.
        </p>
        <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <input
            type="range"
            min="0"
            max="12"
            value={tempCloseHour}
            onChange={(e) => setTempCloseHour(Number(e.target.value))}
            className="flex-1 h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-amber-200 min-w-[90px] justify-center">
            <Clock size={18} className="text-amber-600" />
            <span className="text-lg font-bold text-gray-800">
              {tempCloseHour.toString().padStart(2, '0')}h
            </span>
          </div>
        </div>
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900">
            <strong>💡 Exemple :</strong> Avec clôture à {tempCloseHour}h :
          </p>
          <ul className="text-xs text-blue-800 mt-1 ml-4 list-disc">
            <li>Vente à {Math.max(0, tempCloseHour - 3)}h → Comptée la veille</li>
            <li>Vente à {Math.min(23, tempCloseHour + 2)}h → Comptée aujourd'hui</li>
          </ul>
        </div>
      </div>
      {/* ... reste du code ... */}
    </>
  )}
```

#### [MODIFY] [components/SalesHistory.tsx](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/components/SalesHistory.tsx)

**Objectif** : Utiliser le helper centralisé pour tous les filtrages.

```typescript
import { filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

export function EnhancedSalesHistory({ isOpen, onClose }: EnhancedSalesHistoryProps) {
  const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
  const { barMembers, currentBar } = useBarContext();
  
  // ✅ REMPLACER (ligne 74)
  const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;

  // ✅ SIMPLIFIER filteredSales (lignes 131-164)
  const filteredSales = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    const baseSales = sales.filter(sale => {
      if (isServer) {
        return sale.createdBy === currentSession.userId;
      } else {
        return sale.status === 'validated';
      }
    });

    // ✅ Utiliser le helper centralisé
    const dateFiltered = filterByBusinessDateRange(baseSales, startDate, endDate, closeHour);

    // Filtre par recherche
    if (searchTerm) {
      return dateFiltered.filter(sale =>
        sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.items.some(item => 
          item.product_name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    return dateFiltered.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sales, startDate, endDate, searchTerm, currentSession, closeHour]);

  // ✅ SIMPLIFIER filteredConsignments (lignes 167-235)
  const filteredConsignments = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    const baseConsignments = consignments.filter(consignment => {
      if (isServer) {
        return consignment.originalSeller === currentSession.userId;
      }
      return true;
    });

    // ✅ Utiliser le helper centralisé
    return filterByBusinessDateRange(baseConsignments, startDate, endDate, closeHour)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [consignments, startDate, endDate, currentSession, closeHour]);

  // ... reste du code
}
```

#### [MODIFY] [hooks/useRevenueStats.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/hooks/useRevenueStats.ts)

**Objectif** : Utiliser le helper centralisé pour les calculs locaux.

```typescript
import { filterByBusinessDateRange, getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

export function useRevenueStats(options: { 
  startDate?: string; 
  endDate?: string; 
  enabled?: boolean;
} = {}): RevenueStats {
  const { currentBar } = useBarContext();
  const { sales, returns } = useAppContext();

  const currentBarId = currentBar?.id || '';
  const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;

  // Dates par défaut = Aujourd'hui (Commercial)
  const todayStr = getCurrentBusinessDateString(closeHour);
  
  const {
    startDate = todayStr,
    endDate = todayStr,
    enabled = true
  } = options;

  const calculateLocalStats = useCallback(() => {
    if (!sales || !returns) return { netRevenue: 0, grossRevenue: 0, refundsTotal: 0, saleCount: 0 };

    // ✅ Utiliser le helper centralisé
    const filteredSales = filterByBusinessDateRange(
      sales.filter(s => s.status === 'validated'),
      startDate,
      endDate,
      closeHour
    );

    const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const saleCount = filteredSales.length;

    const filteredReturns = filterByBusinessDateRange(
      returns.filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked')),
      startDate,
      endDate,
      closeHour
    );

    const refundsTotal = filteredReturns.reduce((sum, r) => sum + r.refundAmount, 0);
    const netRevenue = grossRevenue - refundsTotal;

    return { netRevenue, grossRevenue, refundsTotal, saleCount };
  }, [sales, returns, startDate, endDate, closeHour]);

  // ... reste du code
}
```

---

### Étape 6 : Nettoyage du Code Obsolète

#### [MODIFY] [utils/saleHelpers.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/utils/saleHelpers.ts)

**Objectif** : Simplifier en utilisant uniquement `businessDate`.

```typescript
import type { Sale } from '../types';

/**
 * Obtient la date effective d'une vente
 * 
 * ✅ SIMPLIFIÉ : Utilise uniquement businessDate (calculée par backend ou frontend)
 * 
 * @param sale - La vente
 * @returns Date effective de la vente
 */
export function getSaleDate(sale: Sale): Date {
  // ✅ Utiliser businessDate (toujours remplie après migration 067)
  return typeof sale.businessDate === 'string'
    ? new Date(sale.businessDate)
    : sale.businessDate;
}

/**
 * Formate la date d'une vente au format local français
 */
export function formatSaleDate(sale: Sale, includeTime = false): string {
  const date = getSaleDate(sale);

  if (includeTime) {
    return date.toLocaleString('fr-FR');
  }

  return date.toLocaleDateString('fr-FR');
}

/**
 * Formate l'heure d'une vente au format local français
 */
export function formatSaleTime(sale: Sale, shortFormat = true): string {
  const date = getSaleDate(sale);

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(shortFormat ? {} : { second: '2-digit' })
  });
}
```

#### [MODIFY] [utils/businessDay.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/utils/businessDay.ts)

**Objectif** : Marquer comme déprécié et rediriger vers le nouveau helper.

```typescript
/**
 * @deprecated Ce fichier est déprécié. Utiliser businessDateHelpers.ts à la place.
 * 
 * Raison : Logique dupliquée et non centralisée.
 * Migration : Remplacer tous les imports par businessDateHelpers.ts
 * 
 * Sera supprimé dans une version future.
 */

import { calculateBusinessDate as calculateBusinessDateNew, dateToYYYYMMDD } from './businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../config/constants';

/**
 * @deprecated Utiliser calculateBusinessDate() de businessDateHelpers.ts
 */
export function getBusinessDay(saleDate: Date, closeHour: number = BUSINESS_DAY_CLOSE_HOUR): Date {
  console.warn('⚠️ getBusinessDay() est déprécié. Utiliser calculateBusinessDate() de businessDateHelpers.ts');
  return calculateBusinessDateNew(saleDate, closeHour);
}

/**
 * @deprecated Utiliser calculateBusinessDate(new Date(), closeHour) de businessDateHelpers.ts
 */
export function getCurrentBusinessDay(closeHour: number = BUSINESS_DAY_CLOSE_HOUR): Date {
  console.warn('⚠️ getCurrentBusinessDay() est déprécié. Utiliser calculateBusinessDate(new Date(), closeHour) de businessDateHelpers.ts');
  return calculateBusinessDateNew(new Date(), closeHour);
}

/**
 * @deprecated Utiliser dateToYYYYMMDD() de businessDateHelpers.ts
 */
export function getBusinessDayDateString(date: Date = new Date(), closeHour: number = BUSINESS_DAY_CLOSE_HOUR): string {
  console.warn('⚠️ getBusinessDayDateString() est déprécié. Utiliser dateToYYYYMMDD(calculateBusinessDate()) de businessDateHelpers.ts');
  const businessDate = calculateBusinessDateNew(date, closeHour);
  return dateToYYYYMMDD(businessDate);
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
```

#### [MODIFY] Autres Composants

**Objectif** : Remplacer `currentBar?.settings?.businessDayCloseHour` par `currentBar?.closingHour`.

Fichiers à modifier :
- `src/components/ReturnsSystem.tsx`
- `src/components/BarsManagementPanel.tsx`
- `src/components/SuperAdminDashboard.tsx`
- `src/components/BarStatsModal.tsx`
- `src/components/OldSalesHistory.tsx`

```typescript
// ✅ REMPLACER partout
// const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
```

#### [MODIFY] [utils/devHelpers.ts](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/utils/devHelpers.ts)

```typescript
// ✅ REMPLACER (ligne 20)
// businessDayCloseHour: 6,
closingHour: 6,
```

#### [MODIFY] [components/UsersManagementPanel.tsx](file:///c:/Users/HP%20ELITEBOOK/DEV/BarTender/src/components/UsersManagementPanel.tsx)

```typescript
// ✅ REMPLACER (ligne 190)
// businessDayCloseHour: 6,
closingHour: 6,
```

---

## Verification Plan

### Tests Automatisés

```bash
# 1. Vérifier les types TypeScript
npm run type-check

# 2. Tester le helper centralisé
npm test -- businessDateHelpers.test.ts

# 3. Tester les services
npm test -- bars.service.test.ts
npm test -- sales.service.test.ts
```

### Tests Manuels

#### Test 1 : Mode Online
1. Créer une vente à 3h du matin
2. Vérifier dans la DB : `business_date` = date d'hier
3. Vérifier dans l'UI : Vente apparaît dans la journée d'hier

#### Test 2 : Mode Offline
1. Désactiver la connexion internet
2. Créer une vente à 3h du matin
3. Vérifier dans LocalStorage : `business_date` = date d'hier
4. Vérifier dans l'UI : Vente apparaît dans la journée d'hier

#### Test 3 : Synchronisation
1. En mode offline, créer 3 ventes (2h, 8h, 15h)
2. Reconnecter internet
3. Synchroniser
4. Vérifier dans la DB : Les 3 ventes ont les bonnes `business_date`

#### Test 4 : Changement d'heure de clôture
1. Ouvrir Settings → Changer l'heure de clôture à 4h
2. Créer une vente à 2h du matin
3. Vérifier : Vente comptée la veille
4. Créer une vente à 10h du matin
5. Vérifier : Vente comptée aujourd'hui

#### Test 5 : Cohérence Frontend-Backend
1. Créer une vente en mode online
2. Comparer `business_date` calculée par frontend vs backend
3. Vérifier : Les deux valeurs sont identiques

---

## Documentation de la Double Logique

### Pourquoi Deux Logiques ?

**Backend (SQL)** :
- ✅ Calcul automatique via trigger
- ✅ Garantit cohérence en production
- ✅ Permet requêtes SQL performantes (index sur `business_date`)
- ❌ Ne fonctionne PAS en mode offline

**Frontend (JavaScript)** :
- ✅ Calcul manuel identique au backend
- ✅ Fonctionne en mode offline
- ✅ Permet filtrage/affichage sans requête DB
- ⚠️ Duplication de logique (acceptable car simple)

### Comment Garantir la Cohérence ?

1. **Tests unitaires** : Vérifier que les deux logiques produisent le même résultat
2. **Documentation** : Référence SQL dans le code JavaScript
3. **Revue de code** : Toute modification de la logique doit être faite dans les 2 endroits
4. **Double vérification** : Le trigger SQL recalcule toujours (même si frontend a déjà calculé)

### Exemple de Test Unitaire

```typescript
// businessDateHelpers.test.ts

import { calculateBusinessDate } from './businessDateHelpers';

describe('calculateBusinessDate', () => {
  it('should match SQL logic: before closing hour = yesterday', () => {
    const closeHour = 6;
    
    // Vente à 3h du matin le 28/11/2025
    const date = new Date('2025-11-28T03:00:00');
    const result = calculateBusinessDate(date, closeHour);
    
    // Doit retourner le 27/11/2025 (journée d'hier)
    expect(result.getDate()).toBe(27);
    expect(result.getMonth()).toBe(10); // Novembre = 10
    expect(result.getFullYear()).toBe(2025);
  });

  it('should match SQL logic: after closing hour = today', () => {
    const closeHour = 6;
    
    // Vente à 10h du matin le 28/11/2025
    const date = new Date('2025-11-28T10:00:00');
    const result = calculateBusinessDate(date, closeHour);
    
    // Doit retourner le 28/11/2025 (journée actuelle)
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(10);
    expect(result.getFullYear()).toBe(2025);
  });
});
```

---

## Estimation

**Temps total : 3-4 heures**

| Tâche | Temps |
|-------|-------|
| Refactorisation types | 20 min |
| Création helper centralisé | 30 min |
| Modification services | 20 min |
| Modification hooks mutations | 30 min |
| Modification Settings | 20 min |
| Modification SalesHistory | 30 min |
| Modification useRevenueStats | 20 min |
| Nettoyage code obsolète (6 fichiers) | 40 min |
| Tests manuels | 30 min |
| **TOTAL** | **3h40** |

---

## Checklist d'Implémentation

- [ ] Refactoriser `types/index.ts` (Bar.closingHour, businessDate obligatoire)
- [ ] Créer `utils/businessDateHelpers.ts` (helper centralisé)
- [ ] Modifier `services/supabase/bars.service.ts` (mapping closing_hour)
- [ ] Modifier `hooks/mutations/useSalesMutations.ts` (calcul avant insertion)
- [ ] Modifier `components/Settings.tsx` (édition closingHour)
- [ ] Modifier `components/SalesHistory.tsx` (utiliser helper)
- [ ] Modifier `hooks/useRevenueStats.ts` (utiliser helper)
- [ ] Simplifier `utils/saleHelpers.ts` (juste lire businessDate)
- [ ] Déprécier `utils/businessDay.ts` (rediriger vers nouveau helper)
- [ ] Nettoyer `ReturnsSystem.tsx` (closingHour au lieu de settings)
- [ ] Nettoyer `BarsManagementPanel.tsx` (closingHour au lieu de settings)
- [ ] Nettoyer `SuperAdminDashboard.tsx` (closingHour au lieu de settings)
- [ ] Nettoyer `BarStatsModal.tsx` (closingHour au lieu de settings)
- [ ] Nettoyer `OldSalesHistory.tsx` (closingHour au lieu de settings)
- [ ] Nettoyer `devHelpers.ts` (closingHour au lieu de businessDayCloseHour)
- [ ] Nettoyer `UsersManagementPanel.tsx` (closingHour au lieu de businessDayCloseHour)
- [ ] Tester mode online
- [ ] Tester mode offline
- [ ] Tester synchronisation
- [ ] Tester changement d'heure de clôture
- [ ] Vérifier cohérence frontend-backend

---

## Notes Importantes

1. **Ne PAS supprimer `businessDay.ts` immédiatement** : Le marquer comme déprécié et migrer progressivement les imports.

2. **Double vérification** : Le trigger SQL recalcule toujours `business_date`, même si le frontend l'a déjà calculée. C'est voulu pour garantir la cohérence.

3. **Tests unitaires** : Créer des tests pour vérifier que la logique JS produit le même résultat que la logique SQL.

4. **Documentation** : Maintenir la référence SQL dans les commentaires du code JavaScript.

5. **Migration progressive** : Remplacer les imports de `businessDay.ts` par `businessDateHelpers.ts` au fur et à mesure.
