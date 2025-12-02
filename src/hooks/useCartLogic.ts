import { useMemo } from 'react';
import { CartItem } from '../types';
import { usePromotions } from './usePromotions';
import { FEATURES } from '../config/features';

interface UseCartLogicProps {
    items: CartItem[];
    barId?: string;
}

interface UseCartLogicReturn {
    total: number;
    totalDiscount: number;
    totalOriginal: number;
    totalItems: number;
    calculateItemPrice: (item: CartItem) => {
        original: number;
        final: number;
        discount: number;
        hasPromotion: boolean;
    };
}

/**
 * Hook partagé pour la logique des paniers
 * Centralise les calculs de prix, promotions et totaux
 * Utilisé par Cart.tsx, ServerCart.tsx, QuickSaleFlow.tsx
 */
export function useCartLogic({ items, barId }: UseCartLogicProps): UseCartLogicReturn {
    const { calculatePrice, isEnabled: promotionsEnabled } = usePromotions(barId);

    // Calculer le prix d'un item avec promotions
    const calculateItemPrice = (item: CartItem) => {
        if (promotionsEnabled && FEATURES.PROMOTIONS_AUTO_APPLY) {
            const priceInfo = calculatePrice(item.product, item.quantity);
            return {
                original: priceInfo.originalPrice,
                final: priceInfo.finalPrice,
                discount: priceInfo.discount,
                hasPromotion: priceInfo.hasPromotion
            };
        }

        const itemTotal = item.product.price * item.quantity;
        return {
            original: itemTotal,
            final: itemTotal,
            discount: 0,
            hasPromotion: false
        };
    };

    // Calculer les totaux
    const { total, totalDiscount, totalOriginal, totalItems } = useMemo(() => {
        let finalTotal = 0;
        let discount = 0;
        let original = 0;

        items.forEach(item => {
            const prices = calculateItemPrice(item);
            finalTotal += prices.final;
            discount += prices.discount;
            original += prices.original;
        });

        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        return {
            total: finalTotal,
            totalDiscount: discount,
            totalOriginal: original,
            totalItems: itemCount
        };
    }, [items, promotionsEnabled]);

    return {
        total,
        totalDiscount,
        totalOriginal,
        totalItems,
        calculateItemPrice
    };
}
