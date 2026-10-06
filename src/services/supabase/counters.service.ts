import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type CounterRow = Database['public']['Tables']['counters']['Row'];
type CounterAssignmentRow = Database['public']['Tables']['counter_assignments']['Row'];

/**
 * Un comptoir : unité d'inventaire autonome dans un bar.
 *
 * Le bar reste l'entité économique (facturation, comptabilité, personnel,
 * cuisine). Le comptoir porte le stock, les ventes et la caisse.
 */
export interface Counter {
  id: string;
  barId: string;
  name: string;
  /**
   * ⭐ Comptoir de référence du bar. Un seul par bar (index unique partiel).
   * Créé automatiquement pour tout nouveau bar par `trg_create_primary_counter`.
   * Sert de cible au mode stock partagé, et de comptoir par défaut.
   */
  isPrimary: boolean;
  isActive: boolean;
}

/**
 * Mode de gestion du stock d'un bar.
 * - `separate` (défaut) : chaque comptoir tient son propre stock
 * - `shared` : tous les comptoirs lisent le stock du comptoir de référence
 *
 * ⛔ `shared` est un AIGUILLAGE DE LECTURE, jamais une duplication de lignes
 * de stock : une divergence de stock sur un point de vente est un écart de
 * caisse.
 */
export type StockMode = 'separate' | 'shared';

function mapCounter(row: CounterRow): Counter {
  return {
    id: row.id,
    barId: row.bar_id,
    name: row.name,
    isPrimary: row.is_primary,
    isActive: row.is_active,
  };
}

export class CountersService {
  /**
   * Comptoirs actifs d'un bar.
   *
   * ⚠️ Ne filtre PAS par affectation : la RLS en lecture reste au niveau bar
   * (décision du 04/10/2026, après revue de code). Filtrer la lecture par
   * affectation rendrait aveugle tout membre non encore affecté, et coûterait
   * un accès base par ligne lue.
   *
   * Le filtrage par périmètre de travail se fait via `getMyCounters`.
   */
  static async getCounters(barId: string): Promise<Counter[]> {
    const { data, error } = await supabase
      .from('counters')
      .select('*')
      .eq('bar_id', barId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('name');

    if (error) throw error;
    return (data ?? []).map(mapCounter);
  }

  /**
   * Comptoirs où la personne courante peut travailler dans ce bar.
   *
   * - promoteur / co-promoteur / super_admin : tous les comptoirs du bar
   *   (ils supervisent, ils ne sont pas « en poste »)
   * - gérant / serveur : uniquement leurs affectations
   *
   * ⚠️ Ne dépend d'AUCUNE permission de rôle conditionnant la bascule
   * elle-même. Leçon du 23/09/2026 : une permission qui conditionne l'accès au
   * mécanisme de changement devient une souricière, l'utilisateur perdant le
   * moyen de revenir.
   *
   * ⚠️ Implémenté côté client plutôt que via un RPC `get_my_counters`, qui
   * n'est pas encore déployé (migration étape 2 volontairement non exécutée).
   * À remplacer par l'appel RPC quand elle le sera.
   */
  static async getMyCounters(
    barId: string,
    userId: string,
    isSupervisor: boolean
  ): Promise<Counter[]> {
    const counters = await this.getCounters(barId);

    if (isSupervisor) return counters;

    const { data, error } = await supabase
      .from('counter_assignments')
      .select('counter_id')
      .eq('bar_id', barId)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    const assigned = new Set((data ?? []).map((a) => a.counter_id));
    return counters.filter((c) => assigned.has(c.id));
  }

  /** Affectations d'un comptoir, pour l'écran d'organisation du service. */
  static async getAssignments(counterId: string): Promise<CounterAssignmentRow[]> {
    const { data, error } = await supabase
      .from('counter_assignments')
      .select('*')
      .eq('counter_id', counterId)
      .eq('is_active', true);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Crée un comptoir.
   *
   * ⚠️ RLS : réservé promoteur / co-promoteur (pas le gérant) — créer un
   * comptoir engage la structure du bar et consomme une place de gérant dans
   * le plafond d'abonnement, qui reste inchangé quel que soit le nombre de
   * comptoirs (décision du 04/10/2026).
   */
  static async createCounter(barId: string, name: string): Promise<Counter> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Le nom du comptoir est obligatoire');

    const { data, error } = await supabase
      .from('counters')
      .insert({ bar_id: barId, name: trimmed, is_primary: false, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return mapCounter(data);
  }

  static async renameCounter(counterId: string, name: string): Promise<Counter> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Le nom du comptoir est obligatoire');

    const { data, error } = await supabase
      .from('counters')
      .update({ name: trimmed })
      .eq('id', counterId)
      .select()
      .single();

    if (error) throw error;
    return mapCounter(data);
  }

  /**
   * Désactive un comptoir.
   *
   * ⛔ Il n'existe PAS de suppression : des ventes y sont rattachées en
   * `ON DELETE RESTRICT`. Un comptoir se désactive, il ne se supprime jamais.
   */
  static async deactivateCounter(counterId: string): Promise<void> {
    const { error } = await supabase
      .from('counters')
      .update({ is_active: false })
      .eq('id', counterId);

    if (error) throw error;
  }

  static async assignUser(
    barId: string,
    counterId: string,
    userId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('counter_assignments')
      .upsert(
        { bar_id: barId, counter_id: counterId, user_id: userId, is_active: true },
        { onConflict: 'counter_id,user_id' }
      );

    if (error) throw error;
  }

  static async unassignUser(counterId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('counter_assignments')
      .update({ is_active: false })
      .eq('counter_id', counterId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}
