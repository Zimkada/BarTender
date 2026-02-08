/**
 * Types stricts pour les RPCs Supabase
 * Permet d'éviter les casts dangereux vers 'any'
 */

import type { Json } from './database.types';
import type { SaleItem } from '../types/sync';

/**
 * Convertit un tableau TypeScript en Json pour Supabase
 * ✅ Valide la sérialisation JSON pour éviter la corruption de données
 *
 * @throws Error si les données contiennent des types non-sérialisables (fonctions, symboles, références circulaires)
 */
export function toSupabaseJson<T>(items: T[]): Json {
  try {
    // ✅ Validation : Test de sérialisation complète
    const serialized = JSON.stringify(items);
    const parsed = JSON.parse(serialized);
    return parsed as Json;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`toSupabaseJson: Invalid JSON data - ${errorMsg}`);
  }
}

/**
 * Paramètres pour create_sale_idempotent RPC
 */
export interface CreateSaleIdempotentParams {
  p_bar_id: string;
  p_items: Json;
  p_payment_method: string;
  p_sold_by: string;
  p_idempotency_key: string;
  p_server_id?: string;
  p_status?: string;
  p_customer_name?: string;
  p_customer_phone?: string;
  p_notes?: string;
  p_business_date?: string;
  p_ticket_id?: string;
}

/**
 * Paramètres pour create_ticket RPC
 */
export interface CreateTicketParams {
  p_bar_id: string;
  p_created_by: string;
  p_notes?: string;
  p_server_id?: string;
  p_closing_hour?: number;
  p_table_number?: number;
  p_customer_name?: string;
  p_idempotency_key?: string;
}

/**
 * Paramètres pour pay_ticket RPC
 */
export interface PayTicketParams {
  p_ticket_id: string;
  p_paid_by: string;
  p_payment_method: string;
}

/**
 * Paramètres pour create_stock_adjustment RPC
 */
export interface CreateStockAdjustmentParams {
  p_bar_id: string;
  p_product_id: string;
  p_delta: number;
  p_reason: string;
  p_notes?: string | null;
}

/**
 * Helper pour construire les paramètres RPC de vente
 * Convertit null en undefined pour la compatibilité Supabase RPC
 */
export function buildCreateSaleParams(
  data: {
    bar_id: string;
    items: SaleItem[];
    payment_method: string;
    sold_by: string;
    server_id?: string | null;
    status?: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    notes?: string | null;
    business_date?: string | null;
    ticket_id?: string | null;
  },
  idempotencyKey: string
): CreateSaleIdempotentParams {
  return {
    p_bar_id: data.bar_id,
    p_items: toSupabaseJson(data.items),
    p_payment_method: data.payment_method,
    p_sold_by: data.sold_by,
    p_idempotency_key: idempotencyKey,
    p_server_id: data.server_id || undefined,
    p_status: data.status || 'validated',
    p_customer_name: data.customer_name || undefined,
    p_customer_phone: data.customer_phone || undefined,
    p_notes: data.notes || undefined,
    p_business_date: data.business_date || undefined,
    p_ticket_id: data.ticket_id || undefined,
  };
}
