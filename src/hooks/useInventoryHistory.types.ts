/**
 * Type-safe interfaces for inventory history calculations
 * Replaces 'any' types with strict Supabase database schema types
 */

// ===== SALE ITEM (from sales.items JSONB) =====
export interface SaleItemDB {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

// ===== DATABASE ROW TYPES (minimal needed fields) =====
export interface SaleRowMinimal {
  id: string;
  items: SaleItemDB[];  // JSONB parsed
  validated_at: string;
}

export interface SupplyRowMinimal {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
}

export interface StockAdjustmentRowMinimal {
  id: string;
  product_id: string;
  delta: number;
  adjusted_at: string;
}

export interface ReturnRowMinimal {
  id: string;
  product_id: string;
  quantity_returned: number;
  restocked_at: string;
}

export interface ConsignmentRowMinimal {
  id: string;
  product_id: string;
  quantity: number;
  status: 'active' | 'claimed' | 'expired' | 'forfeited';
  claimed_at: string | null;
}

// ===== AGGREGATED MOVEMENTS =====
export interface MovementsByProduct {
  sales: number;
  supplies: number;
  adjustments: number;
  returns: number;
  consignments: number;
}

export interface HistoricalStockRecord {
  productId: string;
  productName: string;
  currentStock: number;      // Stock actuel (réel)
  historicalStock: number;   // Stock reconstruit à T-x
  movements: MovementsByProduct;
  auditTrail: string[];      // Détails pour debug (optionnel)
}

// ===== FETCHED MOVEMENTS =====
export interface FetchedMovements {
  sales: SaleRowMinimal[];
  supplies: SupplyRowMinimal[];
  adjustments: StockAdjustmentRowMinimal[];
  returns: ReturnRowMinimal[];
  consignments: ConsignmentRowMinimal[];
}
