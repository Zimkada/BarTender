/**
 * types/catalogEnrichment.ts
 * Types pour le système d'enrichissement du catalogue global
 * Permet aux admins de promouvoir des produits locaux au catalogue global
 */

import type { GlobalProduct } from './index';

/**
 * Représente un produit local prêt à être enrichi au catalogue global
 * Extension de Product pour le contexte d'enrichissement
 */
export interface LocalProductForEnrichment {
  barProductId: string;
  barId: string;
  barName: string;
  localName: string;
  localImage?: string | null;
  price: number;
  stock: number;
  volume?: string;
  localCategoryId?: string;
  localCategoryName?: string;
  createdAt: Date;
  isCustomProduct: boolean;
}

/**
 * Données requises pour enrichir le catalogue global avec un produit local
 * Version éditée par l'admin avant création du global
 */
export interface EnrichGlobalCatalogData {
  // Éléments du produit global à créer
  name: string; // Nom du produit global (peut différer du local_name)
  category: string; // Catégorie globale
  volume: string; // Format standardisé
  brand?: string;
  manufacturer?: string;
  official_image?: string; // Image du produit global
  subcategory?: string;
  barcode?: string;
  description?: string;
  suggested_price_min?: number;
  suggested_price_max?: number;

  // Options de liaison
  linkSourceProduct: boolean; // Lier automatiquement au bar_product source?
}

/**
 * Résultat d'enrichissement - combinaison global + local
 */
export interface EnrichmentResult {
  globalProduct: GlobalProduct & {
    source_bar_id?: string;
    source_bar_product_id?: string;
    contributed_at?: string;
  };
  sourceBarProduct: {
    id: string;
    bar_id: string;
    global_product_id: string;
    is_source_of_global: boolean;
  };
}

/**
 * Produit global similaire détecté
 * Pour aider l'admin à choisir entre créer un doublon ou non
 */
export interface SimilarGlobalProduct {
  id: string;
  name: string;
  brand?: string;
  volume: string;
  category: string;
  official_image?: string;
  similarity: 'exact' | 'high' | 'medium'; // Niveau de similarité
}

/**
 * Audit event pour enrichissement de produit
 * Structure cohérente avec la table audit_logs existante (database.types.ts:479-600)
 *
 * Champs alignés sur la structure réelle :
 * - event: string (pas event_type)
 * - severity: string (accepte n'importe quelle valeur)
 * - user_id: string | null (nullable selon schéma)
 * - user_name: string (requis)
 * - user_role: string (requis)
 * - description: string (requis)
 * - metadata: JSON (flexible)
 * - bar_id: string | null (pour événements liés à un bar)
 * - bar_name: string | null
 */
export interface CatalogEnrichmentAuditLog {
  event: string; // 'UNAUTHORIZED_CATALOG_ENRICHMENT' | 'CATALOG_ENRICHED_FROM_LOCAL'
  severity: string; // 'info' | 'warning' | 'critical'
  user_id?: string | null; // Nullable selon schéma
  user_name: string; // Requis selon schéma
  user_role: string; // Requis selon schéma
  description: string;
  metadata?: Record<string, any>;
  bar_id?: string | null; // Pour événements liés à un bar
  bar_name?: string | null;
}

/**
 * État de progression de l'enrichissement
 */
export enum EnrichmentStatus {
  Idle = 'idle',
  Checking = 'checking', // Vérification des doublons
  Validating = 'validating', // Validation des données
  Processing = 'processing', // Création en cours
  Success = 'success',
  Error = 'error'
}

/**
 * Erreur d'enrichissement
 */
export interface EnrichmentError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
