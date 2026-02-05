/**
 * TicketsService
 * CRUD pour les tickets (bons) — même pattern que SalesService
 * Toutes les mutations passent par des RPCs SECURITY DEFINER
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';

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
}

export class TicketsService {
  /**
   * Créer un nouveau bon via RPC create_ticket
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
   * Fermer un bon (open → paid) via RPC pay_ticket
   */
  static async payTicket(ticketId: string, paidBy: string, paymentMethod: string): Promise<TicketRow> {
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
