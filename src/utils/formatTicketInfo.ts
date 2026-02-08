/**
 * Helper pour formater les informations de ticket (table + client)
 * Utilisé dans BonStrip, InvoiceModal, CartDrawer pour un affichage cohérent
 * 
 * Accepte à la fois:
 * - TicketRow (snake_case: table_number, customer_name) - depuis la DB
 * - Ticket/TicketWithSummary (camelCase: tableNumber, customerName) - depuis le frontend
 */

import { TicketRow } from '../services/supabase/tickets.service';
import type { Ticket } from '../types';
import type { TicketWithSummary } from '../hooks/queries/useTickets';

type TicketInfo = Pick<TicketRow, 'table_number' | 'customer_name' | 'notes'> | Pick<Ticket, 'tableNumber' | 'customerName' | 'notes'> | TicketWithSummary;

export function formatTicketInfo(ticket: TicketInfo): string {
    const parts: string[] = [];

    // Support both snake_case (DB) and camelCase (frontend)
    const tableNumber = 'table_number' in ticket ? ticket.table_number : 'tableNumber' in ticket ? ticket.tableNumber : undefined;
    const customerName = 'customer_name' in ticket ? ticket.customer_name : 'customerName' in ticket ? ticket.customerName : undefined;

    // Priorité aux champs structurés
    if (tableNumber) {
        parts.push(`Table ${tableNumber}`);
    }

    if (customerName) {
        parts.push(customerName);
    }

    // Fallback sur notes si aucun champ structuré
    if (parts.length === 0 && ticket.notes) {
        return ticket.notes;
    }

    return parts.join(' • ');
}
