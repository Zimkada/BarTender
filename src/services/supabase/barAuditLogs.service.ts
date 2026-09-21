// services/supabase/barAuditLogs.service.ts
// Lecture du journal d'audit d'UN bar - Phase 2, chantier B3.
//
// Consomme le RPC get_bar_audit_logs (migration 20260921100000, en prod
// depuis le 21/09/2026), accessible au SuperAdmin, au promoteur et au
// co-promoteur du bar. PAS au gerant (decision Q3 du plan Phase 2).
//
// ⛔ Ne pas confondre avec les deux autres lecteurs d'audit du projet :
//   * AdminService.getPaginatedAuditLogs -> get_paginated_audit_logs,
//     meme table (audit_logs) mais journal GLOBAL, verrouille super_admin.
//   * BarAuditLogsViewer -> admin_get_bar_audit_logs, qui lit une AUTRE
//     table (bar_audit_log : creation/suspension de bars), sans rapport
//     avec les operations metier.
//
// ⚠️ DETTE CONNUE : get_bar_audit_logs est ABSENT de database.types.ts -
// les types Supabase n'ont pas ete regeneres depuis sa creation. D'ou le
// cast cible ci-dessous, a retirer apres `npm run gen:types`. Meme dette
// que coPromoteur.service.ts.

import { supabase, handleSupabaseError } from '../../lib/supabase';

/**
 * Colonnes renvoyees par le RPC (= json_agg(audit_logs.*), donc toutes les
 * colonnes de la table). Identique a AuditLogFromRPC de admin.service.ts,
 * redeclare ici pour ne pas exporter un type interne d'un service admin.
 */
interface BarAuditLogFromRPC {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  bar_id: string | null;
  bar_name: string | null;
  event: string;
  description: string;
  severity: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
}

/** Champs du RPC, timestamp converti en Date. */
export type BarAuditLogEntry = Omit<BarAuditLogFromRPC, 'timestamp'> & { timestamp: Date };

export interface GetBarAuditLogsParams {
  barId: string;
  page: number;
  limit: number;
  /**
   * Valeur de la colonne `user_role` a filtrer (ex. 'co_promoteur'), PAS un
   * role d'acces. `undefined` = toutes les lignes du bar.
   *
   * ⚠️ Le RPC refuse toute valeur hors des 6 roles de UserRole avec une
   * erreur 22023 - il ne renvoie pas 0 ligne en silence.
   */
  roleFilter?: string;
}

export interface BarAuditLogsResult {
  logs: BarAuditLogEntry[];
  totalCount: number;
}

/** Plafond impose par le RPC (ERREUR 22023 au-dela). */
export const BAR_AUDIT_LOGS_MAX_LIMIT = 200;

type UntypedRpcClient = {
  rpc(
    fn: 'get_bar_audit_logs',
    args: { p_bar_id: string; p_page: number; p_limit: number; p_role_filter?: string }
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export class BarAuditLogsService {
  /**
   * Retourne une page du journal d'audit du bar, la plus recente d'abord.
   *
   * Refus attendus du RPC, a laisser remonter tels quels :
   *   - 42501 : appelant ni SuperAdmin, ni promoteur/co-promoteur du bar
   *   - 22004 : barId manquant
   *   - 22023 : page < 1, limit hors [1, 200], ou roleFilter inconnu
   */
  static async getBarAuditLogs(params: GetBarAuditLogsParams): Promise<BarAuditLogsResult> {
    const { barId, page, limit, roleFilter } = params;

    try {
      const { data, error } = await (supabase as unknown as UntypedRpcClient).rpc(
        'get_bar_audit_logs',
        {
          p_bar_id: barId,
          p_page: page,
          p_limit: limit,
          // '' et undefined sont traites a l'identique par le RPC (pas de
          // filtre), mais on n'envoie rien plutot qu'une chaine vide.
          p_role_filter: roleFilter || undefined,
        }
      );

      if (error) throw error;

      // Le RPC renvoie RETURNS TABLE(logs json, total_count bigint), donc
      // PostgREST rend un tableau d'une seule ligne.
      const rows = data as Array<{ logs: unknown; total_count: number }> | null;

      if (Array.isArray(rows) && rows.length > 0) {
        const result = rows[0];
        // ⚠️ json_agg retourne NULL (pas '[]') quand la page est vide - bar
        // sans activite, ou page au-dela du dernier resultat. Sans cette
        // garde, un .map() sur null planterait l'ecran au lieu d'afficher
        // un etat vide. Contrat documente par la migration B1.
        const rawLogs = (Array.isArray(result.logs) ? result.logs : []) as BarAuditLogFromRPC[];

        return {
          logs: rawLogs.map((log) => ({ ...log, timestamp: new Date(log.timestamp) })),
          totalCount: Number(result.total_count) || 0,
        };
      }

      return { logs: [], totalCount: 0 };
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
