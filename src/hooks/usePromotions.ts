import { useCallback } from 'react';
import { PromotionsService } from '../services/supabase/promotions.service';
import { Product } from '../types';
import { FEATURES } from '../config/features';
import { useActivePromotions } from './queries/usePromotionsQueries';

/**
 * Hook pour gérer les promotions actives et calculer les prix
 * Réutilisable dans Cart, ServerCart, QuickSale
 * 
 * ✅ V2: Migré vers React Query pour synchronisation temps réel automatique
 * 
 * @example
 * ```typescript
 * const { promotions, calculatePrice, hasPromotion } = usePromotions(barId);
 * ```
 */
export function usePromotions(barId: string | undefined) {
    // ✅ V2: Utilise React Query au lieu de useState
    const {
        data: promotions = [],
        isLoading,
        error: queryError,
        refetch
    } = useActivePromotions(barId);

    // Convert React Query error to string for backward compatibility
    const error = queryError ? (queryError as Error).message : null;

    /**
     * Calculer le meilleur prix pour un produit avec promotions applicables
     * Inclut fallback en cas d'erreur
     */
    const calculatePrice = useCallback((product: Product, quantity: number) => {
        // Vérifier feature flag
        if (!FEATURES.PROMOTIONS_ENABLED || !FEATURES.PROMOTIONS_AUTO_APPLY) {
            const normalPrice = product.price * quantity;
            return {
                finalPrice: normalPrice,
                originalPrice: normalPrice,
                discount: 0,
                appliedPromotion: undefined,
                hasPromotion: false
            };
        }

        try {
            // Filtrer promotions applicables à ce produit
            const applicablePromos = promotions.filter(p => {
                if (p.targetType === 'all') return true;
                if (p.targetType === 'product' && p.targetProductIds?.includes(product.id)) return true;
                if (p.targetType === 'category' && p.targetCategoryIds?.includes(product.categoryId)) return true;
                return false;
            });

            // Calculer meilleur prix
            const result = PromotionsService.calculateBestPrice(
                product,
                quantity,
                applicablePromos
            );

            if (FEATURES.PROMOTIONS_DEBUG_LOGGING && result.appliedPromotion) {
                console.log('[usePromotions] Applied promotion:', {
                    product: product.name,
                    promotion: result.appliedPromotion.name,
                    discount: result.discount
                });
            }

            return {
                finalPrice: result.finalPrice,
                originalPrice: result.originalPrice,
                discount: result.discount,
                appliedPromotion: result.appliedPromotion,
                hasPromotion: !!result.appliedPromotion
            };
        } catch (err) {
            // ✅ FALLBACK : En cas d'erreur, retourner prix normal
            console.error('[usePromotions] Error calculating price:', err);

            const normalPrice = product.price * quantity;
            return {
                finalPrice: normalPrice,
                originalPrice: normalPrice,
                discount: 0,
                appliedPromotion: undefined,
                hasPromotion: false
            };
        }
    }, [promotions]);

    /**
     * Vérifier si un produit a une promotion applicable
     */
    const hasPromotion = useCallback((product: Product): boolean => {
        if (!FEATURES.PROMOTIONS_ENABLED || promotions.length === 0) {
            return false;
        }

        return promotions.some(p => {
            if (p.targetType === 'all') return true;
            if (p.targetType === 'product' && p.targetProductIds?.includes(product.id)) return true;
            if (p.targetType === 'category' && p.targetCategoryIds?.includes(product.categoryId)) return true;
            return false;
        });
    }, [promotions]);

    /**
     * Obtenir la meilleure promotion pour un produit (sans calculer le prix)
     */
    const getBestPromotion = useCallback((product: Product, quantity: number) => {
        if (!FEATURES.PROMOTIONS_ENABLED || promotions.length === 0) {
            return undefined;
        }

        const result = calculatePrice(product, quantity);
        return result.appliedPromotion;
    }, [promotions, calculatePrice]);

    return {
        promotions,
        isLoading,
        error,
        calculatePrice,
        hasPromotion,
        getBestPromotion,
        reload: refetch, // ✅ V2: refetch replaces loadPromotions
        // Statistiques utiles
        activePromotionsCount: promotions.length,
        isEnabled: FEATURES.PROMOTIONS_ENABLED,
    };
}
