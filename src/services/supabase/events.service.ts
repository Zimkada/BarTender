/**
 * Service de gestion des événements
 * 
 * Gère les événements spéciaux (jours fériés, anniversaires, matchs, etc.)
 * qui impactent les ventes et alimentent les modèles de prévisions.
 * 
 * @module events.service
 */

import { supabase } from './client';
import { BarEvent } from '../../types';

/**
 * Convertit les données SQL (snake_case) en objet TypeScript (camelCase)
 */
function mapDbEventToBarEvent(dbEvent: any): BarEvent {
    return {
        id: dbEvent.id,
        barId: dbEvent.bar_id,
        eventType: dbEvent.event_type,
        eventName: dbEvent.event_name,
        eventDate: dbEvent.event_date,
        impactMultiplier: dbEvent.impact_multiplier,
        isRecurring: dbEvent.is_recurring,
        recurrenceRule: dbEvent.recurrence_rule,
        notes: dbEvent.notes,
        isActive: dbEvent.is_active,
        createdBy: dbEvent.created_by,
        createdAt: new Date(dbEvent.created_at),
        updatedAt: new Date(dbEvent.updated_at)
    };
}

/**
 * Convertit un objet BarEvent (camelCase) en données SQL (snake_case)
 */
function mapBarEventToDbEvent(event: Partial<BarEvent>): any {
    const dbEvent: any = {};

    if (event.barId !== undefined) dbEvent.bar_id = event.barId;
    if (event.eventType !== undefined) dbEvent.event_type = event.eventType;
    if (event.eventName !== undefined) dbEvent.event_name = event.eventName;
    if (event.eventDate !== undefined) dbEvent.event_date = event.eventDate;
    if (event.impactMultiplier !== undefined) dbEvent.impact_multiplier = event.impactMultiplier;
    if (event.isRecurring !== undefined) dbEvent.is_recurring = event.isRecurring;
    if (event.recurrenceRule !== undefined) dbEvent.recurrence_rule = event.recurrenceRule;
    if (event.notes !== undefined) dbEvent.notes = event.notes;
    if (event.isActive !== undefined) dbEvent.is_active = event.isActive;
    if (event.createdBy !== undefined) dbEvent.created_by = event.createdBy;

    return dbEvent;
}

export const EventsService = {
    /**
     * Crée un nouvel événement
     * 
     * @param event - Données de l'événement (sans id, createdAt, updatedAt)
     * @returns Événement créé
     * 
     * @example
     * const event = await EventsService.createEvent({
     *   barId: 'bar-123',
     *   eventType: 'sports',
     *   eventName: 'Finale CAN 2025',
     *   eventDate: '2025-02-11',
     *   impactMultiplier: 2.0,  // +100% de ventes attendues
     *   isRecurring: false,
     *   isActive: true,
     *   createdBy: 'user-123'
     * });
     */
    async createEvent(
        event: Omit<BarEvent, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<BarEvent> {
        try {
            // Convertir camelCase → snake_case
            const dbEvent = mapBarEventToDbEvent(event);

            const { data, error } = await supabase
                .from('bar_events')
                .insert(dbEvent)
                .select()
                .single();

            if (error) throw error;

            // Convertir snake_case → camelCase pour le retour
            return mapDbEventToBarEvent(data);
        } catch (error) {
            console.error('Erreur création événement:', error);
            throw error;
        }
    },

    /**
     * Met à jour un événement existant
     * 
     * @param id - ID de l'événement
     * @param updates - Champs à mettre à jour
     * @returns Événement mis à jour
     * 
     * @example
     * const updated = await EventsService.updateEvent('event-123', {
     *   impactMultiplier: 1.8
     * });
     */
    async updateEvent(
        id: string,
        updates: Partial<BarEvent>
    ): Promise<BarEvent> {
        try {
            // Convertir camelCase → snake_case
            const dbUpdates = mapBarEventToDbEvent(updates);
            dbUpdates.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('bar_events')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // Convertir snake_case → camelCase pour le retour
            return mapDbEventToBarEvent(data);
        } catch (error) {
            console.error('Erreur mise à jour événement:', error);
            throw error;
        }
    },

    /**
     * Supprime un événement
     * 
     * @param id - ID de l'événement
     * 
     * @example
     * await EventsService.deleteEvent('event-123');
     */
    async deleteEvent(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('bar_events')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Erreur suppression événement:', error);
            throw error;
        }
    },

    /**
     * Récupère les événements à venir pour un bar
     * 
     * @param barId - ID du bar
     * @param days - Nombre de jours à l'avance (défaut: 30)
     * @returns Liste des événements à venir
     * 
     * @example
     * const upcoming = await EventsService.getUpcomingEvents('bar-123', 7);
     * console.log(`${upcoming.length} événements dans les 7 prochains jours`);
     */
    async getUpcomingEvents(barId: string, days: number = 30): Promise<BarEvent[]> {
        try {
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);

            const { data, error } = await supabase
                .from('bar_events')
                .select('*')
                .eq('bar_id', barId)
                .eq('is_active', true)
                .gte('event_date', today.toISOString().split('T')[0])
                .lte('event_date', endDate.toISOString().split('T')[0])
                .order('event_date', { ascending: true });

            if (error) throw error;

            // Convertir snake_case → camelCase
            return (data || []).map(mapDbEventToBarEvent);
        } catch (error) {
            console.error('Erreur récupération événements à venir:', error);
            throw error;
        }
    },

    /**
     * Récupère tous les événements d'un bar
     * 
     * @param barId - ID du bar
     * @returns Liste de tous les événements
     * 
     * @example
     * const allEvents = await EventsService.getAllEvents('bar-123');
     */
    async getAllEvents(barId: string): Promise<BarEvent[]> {
        try {
            const { data, error } = await supabase
                .from('bar_events')
                .select('*')
                .eq('bar_id', barId)
                .order('event_date', { ascending: false });

            if (error) throw error;

            // Convertir snake_case → camelCase
            return (data || []).map(mapDbEventToBarEvent);
        } catch (error) {
            console.error('Erreur récupération événements:', error);
            throw error;
        }
    },

    /**
     * Obtient le multiplicateur d'impact pour une date donnée
     * Retourne le multiplicateur le plus élevé si plusieurs événements
     * 
     * @param date - Date au format 'YYYY-MM-DD'
     * @param barId - ID du bar
     * @returns Multiplicateur d'impact (1.0 = aucun impact, 1.5 = +50%, 2.0 = +100%)
     * 
     * @example
     * const impact = await EventsService.getEventImpact('2025-12-25', 'bar-123');
     * console.log(`Impact Noël: +${(impact - 1) * 100}%`);
     */
    async getEventImpact(date: string, barId: string): Promise<number> {
        try {
            const { data, error } = await supabase
                .from('bar_events')
                .select('impact_multiplier')
                .eq('bar_id', barId)
                .eq('event_date', date)
                .eq('is_active', true)
                .order('impact_multiplier', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                // Pas d'événement pour cette date
                if (error.code === 'PGRST116') return 1.0;
                throw error;
            }

            return data?.impact_multiplier || 1.0;
        } catch (error) {
            console.error('Erreur récupération impact événement:', error);
            return 1.0; // Valeur par défaut en cas d'erreur
        }
    },

    /**
     * Récupère les événements d'une période donnée
     * 
     * @param barId - ID du bar
     * @param startDate - Date de début (format 'YYYY-MM-DD')
     * @param endDate - Date de fin (format 'YYYY-MM-DD')
     * @returns Liste des événements dans la période
     * 
     * @example
     * const events = await EventsService.getEventsByPeriod(
     *   'bar-123',
     *   '2025-12-01',
     *   '2025-12-31'
     * );
     */
    async getEventsByPeriod(
        barId: string,
        startDate: string,
        endDate: string
    ): Promise<BarEvent[]> {
        try {
            const { data, error } = await supabase
                .from('bar_events')
                .select('*')
                .eq('bar_id', barId)
                .eq('is_active', true)
                .gte('event_date', startDate)
                .lte('event_date', endDate)
                .order('event_date', { ascending: true });

            if (error) throw error;

            // Convertir snake_case → camelCase
            return (data || []).map(mapDbEventToBarEvent);
        } catch (error) {
            console.error('Erreur récupération événements par période:', error);
            throw error;
        }
    },

    /**
     * Crée les jours fériés du Bénin pour une année donnée
     * Jours fériés fixes uniquement (les jours religieux variables doivent être ajoutés manuellement)
     * 
     * @param barId - ID du bar
     * @param year - Année (défaut: année en cours)
     * @param createdBy - ID de l'utilisateur créateur
     * @returns Nombre d'événements créés
     * 
     * @example
     * const count = await EventsService.createBeninHolidays('bar-123', 2025, 'user-123');
     * console.log(`${count} jours fériés créés pour 2025`);
     */
    async createBeninHolidays(
        barId: string,
        year: number = new Date().getFullYear(),
        createdBy: string
    ): Promise<number> {
        const holidays = [
            { month: 1, day: 1, name: 'Nouvel An', multiplier: 1.6 },
            { month: 1, day: 10, name: 'Fête du Vodoun', multiplier: 1.4 },
            { month: 5, day: 1, name: 'Fête du Travail', multiplier: 1.3 },
            { month: 8, day: 1, name: 'Fête Nationale (Indépendance)', multiplier: 1.5 },
            { month: 10, day: 26, name: 'Fête des Forces Armées', multiplier: 1.3 },
            { month: 11, day: 1, name: 'Toussaint', multiplier: 1.2 },
            { month: 11, day: 30, name: 'Fête Nationale (Indépendance du Dahomey)', multiplier: 1.4 },
            { month: 12, day: 25, name: 'Noël', multiplier: 1.7 },
            { month: 12, day: 31, name: 'Réveillon du Nouvel An', multiplier: 1.65 }
        ];

        try {
            const events = holidays.map(h => ({
                bar_id: barId,
                event_type: 'holiday' as const,
                event_name: h.name,
                event_date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
                impact_multiplier: h.multiplier,
                is_recurring: true,
                recurrence_rule: `yearly_${String(h.month).padStart(2, '0')}_${String(h.day).padStart(2, '0')}`,
                is_active: true,
                created_by: createdBy
            }));

            const { data, error } = await supabase
                .from('bar_events')
                .insert(events)
                .select();

            if (error) throw error;
            return data?.length || 0;
        } catch (error) {
            console.error('Erreur création jours fériés:', error);
            throw error;
        }
    }
};
