/**
 * TicketsService
 * CRUD pour les tickets (bons) — même pattern que SalesService
 * Toutes les mutations passent par des RPCs SECURITY DEFINER
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { offlineQueue } from '../offlineQueue';

export interface TicketRow {
  id: string;
  bar_id: string;
  status: 'open' | 'paid';
  created_by: string;
  server_id: string | null;
  created_at: string;
  paid_at: string | null;
  paid_by: string | null;
  payment_method: string | null;
  ticket_number: number;
  notes: string | null;
  table_number: number | null;
  customer_name: string | null;
  isOptimistic?: boolean; // NEW: UI Metadata
}

export class TicketsService {
  /**
   * Créer un nouveau bon via RPC create_ticket (Resilience Pro)
   */
  static async createTicket(
    barId: string,
    createdBy: string,
    notes?: string,
    serverId?: string,
    closingHour?: number,
    tableNumber?: number,
    customerName?: string
  ): Promise<TicketRow> {
    // 🛡️ SÉCURITÉ UUID (Fix Compatibilité): crypto.randomUUID peut manquer sur certains envs
    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempId = `temp_tkt_${Date.now()}`;

    // 1. Détection réseau
    if (!networkManager.isOnline()) {
      console.log('[TicketsService] Offline detected, queuing ticket creation');

      const optimisticTicket: TicketRow = {
        id: tempId,
        bar_id: barId,
        status: 'open',
        created_by: createdBy,
        server_id: serverId || null,
        created_at: new Date().toISOString(),
        paid_at: null,
        paid_by: null,
        payment_method: null,
        ticket_number: 0, // Indique "Attente" dans l'UI
        notes: notes || null,
        table_number: tableNumber || null,
        customer_name: customerName || null,
        isOptimistic: true
      };

      await offlineQueue.addOperation('CREATE_TICKET', {
        bar_id: barId,
        created_by: createdBy,
        notes: notes || null,
        server_id: serverId || null,
        closing_hour: closingHour ?? 6,
        table_number: tableNumber || null,
        customer_name: customerName || null,
        idempotency_key: idempotencyKey,
        temp_id: tempId
      }, barId, createdBy);

      return optimisticTicket;
    }

    try {
      const { data, error } = await supabase.rpc('create_ticket', {
        p_bar_id: barId,
        p_created_by: createdBy,
        p_notes: notes || null,
        p_server_id: serverId || null,
        p_closing_hour: closingHour ?? 6,
        p_table_number: tableNumber || null,
        p_customer_name: customerName || null
      }).single();

      if (error || !data) {
        throw new Error('Erreur lors de la création du bon');
      }

      return data as TicketRow;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Fermer un bon (open → paid) via RPC pay_ticket (Resilience Pro)
   */
  static async payTicket(ticketId: string, paidBy: string, paymentMethod: string, barId?: string): Promise<TicketRow> {
    const idempotencyKey = crypto.randomUUID();

    if (!networkManager.isOnline() && barId) {
      console.log('[TicketsService] Offline detected, queuing ticket payment');

      await offlineQueue.addOperation('PAY_TICKET', {
        ticket_id: ticketId,
        paid_by: paidBy,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey
      }, barId, paidBy);

      // Return a partial for the UI to show success
      return { id: ticketId, status: 'paid', paid_by: paidBy, payment_method: paymentMethod } as any;
    }

    try {
      const { data, error } = await supabase.rpc('pay_ticket', {
        p_ticket_id: ticketId,
        p_paid_by: paidBy,
        p_payment_method: paymentMethod,
      }).single();

      if (error || !data) {
        throw new Error('Erreur lors du paiement du bon');
      }

      return data as TicketRow;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les bons ouverts d'un bar
   */
  static async getOpenTickets(barId: string): Promise<TicketRow[]> {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('bar_id', barId)
        .eq('status', 'open')
        .order('created_at', { ascending: true });

      if (error) throw new Error('Erreur lors de la récupération des bons');

      return (data || []) as TicketRow[];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
