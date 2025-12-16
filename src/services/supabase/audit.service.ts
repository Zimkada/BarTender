import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { GlobalCatalogAuditLog, GlobalCatalogAuditAction, GlobalCatalogAuditEntityType } from '../../types';

type AuditLogRow = {
  id: string;
  action: GlobalCatalogAuditAction;
  entity_type: GlobalCatalogAuditEntityType;
  entity_id: string;
  entity_name: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  modified_by: string;
  created_at: string;
};

/**
 * Service pour accéder aux logs d'audit du catalogue global
 * Accessible uniquement aux super_admin
 */
export class AuditService {
  /**
   * Récupérer tous les logs d'audit du catalogue global
   * Optionnellement filtrés par:
   * - entityType (PRODUCT ou CATEGORY)
   * - entityId (un produit ou catégorie spécifique)
   * - action (CREATE, UPDATE, DELETE)
   * - dateRange (derniers N jours)
   */
  static async getGlobalCatalogAuditLogs(options?: {
    entityType?: GlobalCatalogAuditEntityType;
    entityId?: string;
    action?: GlobalCatalogAuditAction;
    limit?: number;
    offset?: number;
  }): Promise<GlobalCatalogAuditLog[]> {
    try {
      let query = supabase
        .from('global_catalog_audit_log')
        .select(
          `
          id,
          action,
          entity_type,
          entity_id,
          entity_name,
          old_values,
          new_values,
          modified_by,
          created_at,
          users:modified_by(name)
        `
        )
        .order('created_at', { ascending: false });

      // Apply filters
      if (options?.entityType) {
        query = query.eq('entity_type', options.entityType);
      }
      if (options?.entityId) {
        query = query.eq('entity_id', options.entityId);
      }
      if (options?.action) {
        query = query.eq('action', options.action);
      }

      // Pagination
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des logs d\'audit');
      }

      // Map to GlobalCatalogAuditLog format
      return (data || []).map((row: any) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        oldValues: row.old_values,
        newValues: row.new_values,
        modifiedBy: row.modified_by,
        modifiedByName: row.users?.name,
        createdAt: new Date(row.created_at)
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer l'historique complet d'un produit global
   * Montre toutes les modifications depuis sa création
   */
  static async getProductAuditHistory(productId: string): Promise<GlobalCatalogAuditLog[]> {
    return this.getGlobalCatalogAuditLogs({
      entityType: 'PRODUCT',
      entityId: productId,
      limit: 1000
    });
  }

  /**
   * Récupérer l'historique complet d'une catégorie globale
   */
  static async getCategoryAuditHistory(categoryId: string): Promise<GlobalCatalogAuditLog[]> {
    return this.getGlobalCatalogAuditLogs({
      entityType: 'CATEGORY',
      entityId: categoryId,
      limit: 1000
    });
  }

  /**
   * Récupérer tous les logs d'un utilisateur spécifique (qui a modifié quoi)
   */
  static async getUserAuditTrail(userId: string, limit: number = 100): Promise<GlobalCatalogAuditLog[]> {
    try {
      const { data, error } = await supabase
        .from('global_catalog_audit_log')
        .select(`
          id,
          action,
          entity_type,
          entity_id,
          entity_name,
          old_values,
          new_values,
          modified_by,
          created_at,
          users:modified_by(name)
        `)
        .eq('modified_by', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error('Erreur lors de la récupération de la trace utilisateur');
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        oldValues: row.old_values,
        newValues: row.new_values,
        modifiedBy: row.modified_by,
        modifiedByName: row.users?.name,
        createdAt: new Date(row.created_at)
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les derniers logs (pour tableau de bord)
   */
  static async getRecentAuditLogs(limit: number = 50): Promise<GlobalCatalogAuditLog[]> {
    return this.getGlobalCatalogAuditLogs({
      limit
    });
  }

  /**
   * Compter les modifications d'une entité dans une période
   */
  static async countChanges(
    entityType: GlobalCatalogAuditEntityType,
    action: GlobalCatalogAuditAction,
    hoursAgo: number = 24
  ): Promise<number> {
    try {
      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      const { count, error } = await supabase
        .from('global_catalog_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', entityType)
        .eq('action', action)
        .gte('created_at', since);

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
