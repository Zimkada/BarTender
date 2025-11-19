/**
 * Services Supabase - Point d'entrée centralisé
 *
 * Importe tous les services pour faciliter leur utilisation
 *
 * Usage:
 * import { AuthService, BarsService, ProductsService, SalesService } from '@/services/supabase';
 */

export { AuthService } from './auth.service';
export { BarsService } from './bars.service';
export { ProductsService } from './products.service';
export { SalesService } from './sales.service';

// Types
export type { AuthUser, LoginCredentials, SignupData } from './auth.service';
export type { BarWithOwner, CreateBarData } from './bars.service';
export type {
  BarProductWithDetails,
  CreateBarProductData,
} from './products.service';
export type { SaleItem, CreateSaleData, SaleWithDetails } from './sales.service';
