/**
 * services/supabase/catalogEnrichment.service.ts
 * Service pour l'enrichissement du catalogue global avec produits locaux
 *
 * Workflow :
 * 1. Admin consulte produits locaux (custom) de tous les bars
 * 2. Admin sélectionne un produit et lance l'enrichissement
 * 3. Détection de doublons potentiels
 * 4. Admin édite les infos du produit global
 * 5. Création du produit global + liaison avec le produit source
 * 6. Audit log de l'opération
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { GlobalProduct } from '../../types';
import type {
  LocalProductForEnrichment,
  EnrichGlobalCatalogData,
  EnrichmentResult,
  SimilarGlobalProduct,
  CatalogEnrichmentAuditLog
} from '../../types/catalogEnrichment';
import { ProductNormalization } from '../../utils/productNormalization';

type GlobalProductRow = Database['public']['Tables']['global_products']['Row'];
type GlobalProductInsert = Database['public']['Tables']['global_products']['Insert'];
type BarProduct = Database['public']['Tables']['bar_products']['Row'];
type BarProductUpdate = Database['public']['Tables']['bar_products']['Update'];

/**
 * Service d'enrichissement du catalogue global
 * Permet aux admins (Super Admin) de promouvoir des produits locaux
 * au catalogue global avec validation et audit complets
 */
export class CatalogEnrichmentService {
  /**
   * Récupère tous les produits custom (locaux) de tous les bars
   * Super Admin uniquement - voir tous les produits custom
   */
  static async getAllCustomLocalProducts(filters?: {
    barId?: string;
    categoryId?: string;
    searchTerm?: string;
    limit?: number;
    offset?: number;
  }): Promise<LocalProductForEnrichment[]> {
    try {
      let query = supabase
        .from('bar_products')
        .select(`
          id,
          bar_id,
          local_name,
          local_image,
          price,
          stock,
          volume,
          local_category_id,
          created_at,
          is_custom_product
        `)
        .eq('is_custom_product', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Appliquer les filtres optionnels
      if (filters?.barId) {
        query = query.eq('bar_id', filters.barId);
      }

      if (filters?.categoryId) {
        query = query.eq('local_category_id', filters.categoryId);
      }

      if (filters?.searchTerm) {
        query = query.ilike('local_name', `%${filters.searchTerm}%`);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des produits custom');
      }

      // Get unique bar IDs from products
      const barIds = Array.from(new Set((data || []).map(p => p.bar_id)));

      // Fetch bar names
      let barNames: Record<string, string> = {};
      if (barIds.length > 0) {
        const { data: barsData } = await supabase
          .from('bars')
          .select('id, name')
          .in('id', barIds);

        if (barsData) {
          barNames = Object.fromEntries(barsData.map(b => [b.id, b.name]));
        }
      }

      return (data || []).map((p: any) => ({
        barProductId: p.id,
        barId: p.bar_id,
        barName: barNames[p.bar_id] || 'Bar inconnu',
        localName: p.local_name,
        localImage: p.local_image,
        price: p.price,
        stock: p.stock,
        volume: p.volume,
        localCategoryId: p.local_category_id,
        localCategoryName: 'Catégorie inconnue',
        createdAt: new Date(p.created_at || Date.now()),
        isCustomProduct: p.is_custom_product
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Détecte les produits globaux similaires
   * Utilise normalisation simple pour éviter les faux positifs
   * Retourne max 10 résultats
   */
  static async findSimilarGlobalProducts(
    name: string,
    volume?: string
  ): Promise<SimilarGlobalProduct[]> {
    try {
      const { data, error } = await supabase
        .from('global_products')
        .select('id, name, brand, volume, category, official_image, is_active')
        .eq('is_active', true)
        .limit(50); // Récupère 50 pour filtrer côté client

      if (error) {
        throw new Error('Erreur lors de la détection de doublons');
      }

      const normalized = ProductNormalization.normalizeName(name);

      // Filtre côté client avec similarité
      const similar = (data || [])
        .filter(product => {
          const productNormalized = ProductNormalization.normalizeName(
            product.name
          );

          // Vérifier similarité du nom
          const nameMatch = ProductNormalization.areSimilar(name, product.name);

          // Vérifier similarité du volume
          const volumeMatch =
            !volume ||
            ProductNormalization.normalizeVolume(product.volume) ===
              ProductNormalization.normalizeVolume(volume);

          return nameMatch || volumeMatch;
        })
        .map(p => ({
          id: p.id,
          name: p.name,
          brand: p.brand || undefined,
          volume: p.volume,
          category: p.category,
          official_image: p.official_image || undefined,
          similarity: ProductNormalization.areSimilar(name, p.name)
            ? 'high'
            : 'medium'
        }))
        .slice(0, 10);

      return similar;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Enrichit le catalogue global avec un produit local
   * Transaction atomique :
   * 1. Crée le produit global
   * 2. Met à jour le bar_product avec liaison + flag source
   * 3. Log audit de l'opération
   *
   * ✅ Defense in Depth :
   * - Layer 1 (App) : Vérification rôle + messages clairs + audit logs
   * - Layer 2 (DB) : Transaction atomique
   * - Layer 3 (RLS) : Policies sur global_products
   */
  static async enrichGlobalCatalogWithLocal(
    barProductId: string,
    enrichmentData: EnrichGlobalCatalogData,
    currentUserId?: string
  ): Promise<EnrichmentResult> {
    try {
      // =====================================================
      // LAYER 1 : Validation applicative (Fail Fast)
      // =====================================================

      // 1a. Vérifier authentification
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error('Authentification requise');
      }

      const userId = currentUserId || authData.user.id;

      // 1b. Vérifier rôle Super Admin
      const { data: memberData } = await supabase
        .from('bar_members')
        .select('role, is_active, bars(name)')
        .eq('user_id', userId)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .maybeSingle();

      if (!memberData) {
        // 🔍 Log tentative d'accès non autorisé
        await supabase
          .from('audit_logs')
          .insert({
            event: 'UNAUTHORIZED_CATALOG_ENRICHMENT',
            severity: 'warning',
            user_id: userId,
            user_name: authData.user.email || 'Unknown',
            user_role: 'unknown',
            description: `Tentative d'enrichissement sans privilèges super_admin pour produit ${barProductId}`,
            metadata: { bar_product_id: barProductId }
          })
          .catch(console.error); // Non bloquant

        throw new Error('❌ Action réservée aux Super Admins');
      }

      // 1c. Vérifier produit source existe
      const barProduct = await this.getBarProductById(barProductId);
      if (!barProduct) {
        throw new Error('Produit local introuvable');
      }

      // 1d. Vérifier produit n'est pas déjà lié
      if (barProduct.global_product_id) {
        throw new Error(
          'Ce produit est déjà lié au catalogue global. Impossible de l\'enrichir à nouveau.'
        );
      }

      // 1e. Vérifier produit est custom
      if (!barProduct.is_custom_product) {
        throw new Error(
          'Seuls les produits custom locaux peuvent être enrichis au catalogue global'
        );
      }

      // 1f. Vérifier image existe ou sera uploadée
      if (!enrichmentData.official_image && !barProduct.local_image) {
        throw new Error(
          'Une image est requise pour enrichir le catalogue global. Veuillez uploader une image.'
        );
      }

      // 1g. Normaliser le volume
      const normalizedVolume = ProductNormalization.normalizeVolume(
        enrichmentData.volume
      );

      // =====================================================
      // LAYER 2 : Transaction atomique
      // =====================================================

      try {
        // Créer le produit global
        const { data: globalProductData, error: createError } = await supabase
          .from('global_products')
          .insert({
            name: enrichmentData.name.trim(),
            category: enrichmentData.category,
            volume: normalizedVolume,
            brand: enrichmentData.brand?.trim(),
            manufacturer: enrichmentData.manufacturer?.trim(),
            official_image:
              enrichmentData.official_image || barProduct.local_image,
            subcategory: enrichmentData.subcategory?.trim(),
            barcode: enrichmentData.barcode?.trim(),
            description: enrichmentData.description?.trim(),
            suggested_price_min: enrichmentData.suggested_price_min,
            suggested_price_max: enrichmentData.suggested_price_max,
            is_active: true,
            // Métadonnées d'enrichissement (pas de FK, juste traçabilité)
            source_bar_id: barProduct.bar_id,
            source_bar_product_id: barProduct.id,
            contributed_at: new Date().toISOString(),
            created_by: userId
          } as GlobalProductInsert)
          .select()
          .single();

        if (createError || !globalProductData) {
          throw new Error('Erreur lors de la création du produit global');
        }

        const newGlobalProduct = globalProductData as GlobalProductRow;

        // Mettre à jour le bar_product source
        const { data: updatedBarProductData, error: updateError } =
          await supabase
            .from('bar_products')
            .update({
              global_product_id: newGlobalProduct.id,
              is_source_of_global: true
            } as BarProductUpdate)
            .eq('id', barProductId)
            .select()
            .single();

        if (updateError || !updatedBarProductData) {
          throw new Error('Erreur lors de la liaison du produit source');
        }

        // 🔍 Log succès (non-blocking)
        try {
          const { error: auditError } = await supabase
            .from('audit_logs')
            .insert({
              event: 'CATALOG_ENRICHED_FROM_LOCAL',
              severity: 'info',
              user_id: userId,
              user_name: authData.user.email || 'Unknown',
              user_role: memberData.role,
              bar_id: barProduct.bar_id,
              bar_name: memberData.bars?.name,
              description: `Produit "${enrichmentData.name}" enrichi au catalogue global (source: ${barProduct.local_name} de ${memberData.bars?.name})`,
              metadata: {
                global_product_id: newGlobalProduct.id,
                bar_product_id: barProductId,
                bar_id: barProduct.bar_id,
                volume: normalizedVolume
              }
            });
          if (auditError) {
            console.error('Audit log failed (non-blocking):', auditError);
          }
        } catch (auditErr) {
          console.error('Audit log error (non-blocking):', auditErr);
        }

        return {
          globalProduct: {
            id: newGlobalProduct.id,
            name: newGlobalProduct.name,
            brand: newGlobalProduct.brand || undefined,
            manufacturer: newGlobalProduct.manufacturer || undefined,
            volume: newGlobalProduct.volume,
            volumeMl: newGlobalProduct.volume_ml || undefined,
            category: newGlobalProduct.category,
            subcategory: newGlobalProduct.subcategory || undefined,
            officialImage: newGlobalProduct.official_image || undefined,
            barcode: newGlobalProduct.barcode || undefined,
            description: newGlobalProduct.description || undefined,
            suggestedPriceMin: newGlobalProduct.suggested_price_min || undefined,
            suggestedPriceMax: newGlobalProduct.suggested_price_max || undefined,
            isActive: newGlobalProduct.is_active ?? true,
            createdBy: newGlobalProduct.created_by || undefined,
            createdAt: new Date(newGlobalProduct.created_at || Date.now()),
            source_bar_id: newGlobalProduct.source_bar_id || undefined,
            source_bar_product_id: newGlobalProduct.source_bar_product_id || undefined,
            contributed_at: newGlobalProduct.contributed_at || undefined
          },
          sourceBarProduct: {
            id: updatedBarProductData.id,
            bar_id: updatedBarProductData.bar_id,
            global_product_id: updatedBarProductData.global_product_id,
            is_source_of_global: updatedBarProductData.is_source_of_global ?? false
          }
        };
      } catch (dbError: any) {
        // =====================================================
        // LAYER 3 : RLS bloque si Layer 1 bypassé
        // =====================================================
        if (dbError.code === '42501') {
          throw new Error('❌ Permissions insuffisantes (sécurité RLS)');
        }
        throw dbError;
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Utility : récupère un produit bar par ID
   * Utilisé en interne
   */
  private static async getBarProductById(productId: string): Promise<BarProduct | null> {
    try {
      const { data, error } = await supabase
        .from('bar_products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }
}
