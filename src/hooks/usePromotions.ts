import { useState, useEffect, useCallback, useMemo } from 'react';
import { PromotionsService } from '../services/supabase/promotions.service';
import { Promotion, Product } from '../types';
import { FEATURES } from '../config/features';

/**
 * Hook pour gérer les promotions actives et calculer les prix
 * Réutilisable dans Cart, ServerCart, QuickSale
 */
export function usePromotions(barId: string | undefined) {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Charger les promotions actives
    useEffect(() => {
        if (!barId || !FEATURES.PROMOTIONS_ENABLED) {
            setIsLoading(false);
            return;
        }
        loadPromotions();
    }, [barId]);

    const loadPromotions = useCallback(async () => {
        if (!barId) return;

        setIsLoading(true);
        setError(null);

        try {
            const data = await PromotionsService.getActivePromotions(barId);
            setPromotions(data);

            if (FEATURES.PROMOTIONS_DEBUG_LOGGING) {
                console.log('[usePromotions] Loaded promotions:', data.length);
            }
        } catch (err) {
            console.error('[usePromotions] Error loading promotions:', err);
            setError('Impossible de charger les promotions');
            setPromotions([]); // Fallback: continuer sans promotions
        } finally {
            setIsLoading(false);
        }
    }, [barId]);

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
    const getBestPromotion = useCallback((product: Product, quantity: number): Promotion | undefined => {
        if (!FEATURES.PROMOTIONS_ENABLED || promotions.length === 0) {
            return undefined;
        }

        const result = calculatePrice(product, quantity);
        return result.promotion;
    }, [promotions, calculatePrice]);

    return {
        promotions,
        isLoading,
        error,
        calculatePrice,
        hasPromotion,
        getBestPromotion,
        reload: loadPromotions,
        // Statistiques utiles
        activePromotionsCount: promotions.length,
        isEnabled: FEATURES.PROMOTIONS_ENABLED
    };
}
