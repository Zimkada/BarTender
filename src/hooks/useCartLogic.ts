import { useMemo } from 'react';
import { CartItem } from '../types';
import { usePromotions } from './usePromotions';
import { FEATURES } from '../config/features';

interface UseCartLogicProps {
    items: CartItem[];
    barId?: string;
}

export interface CalculatedItem extends CartItem {
    unit_price: number;
    total_price: number;
    original_unit_price: number;
    discount_amount: number;
    promotion_id?: string;
    promotion_type?: 'bundle' | 'fixed_discount' | 'percentage' | 'special_price';
    promotion_name?: string;
    hasPromotion: boolean;
}

interface UseCartLogicReturn {
    total: number;
    totalDiscount: number;
    totalOriginal: number;
    totalItems: number;
    calculatedItems: CalculatedItem[];
}

/**
 * Hook partagé pour la logique des paniers
 * Centralise les calculs de prix, promotions et totaux
 * Utilisé par Cart.tsx, ServerCart.tsx, QuickSaleFlow.tsx
 */
export function useCartLogic({ items, barId }: UseCartLogicProps): UseCartLogicReturn {
    const { calculatePrice, isEnabled: promotionsEnabled } = usePromotions(barId);

    const {
        calculatedItems,
        total,
        totalDiscount,
        totalOriginal,
        totalItems
    } = useMemo(() => {
        if (!items) {
            return {
                calculatedItems: [],
                total: 0,
                totalDiscount: 0,
                totalOriginal: 0,
                totalItems: 0
            };
        }

        const newCalculatedItems: CalculatedItem[] = items.map(item => {
            const { product, quantity } = item;
            const originalUnitPrice = product.price;

            if (promotionsEnabled && FEATURES.PROMOTIONS_AUTO_APPLY) {
                const priceInfo = calculatePrice(product, quantity);
                const finalUnitPrice = quantity > 0 ? priceInfo.finalPrice / quantity : 0;

                return {
                    ...item,
                    unit_price: finalUnitPrice,
                    total_price: priceInfo.finalPrice,
                    original_unit_price: originalUnitPrice,
                    discount_amount: priceInfo.discount,
                    promotion_id: priceInfo.appliedPromotion?.id,
                    promotion_type: priceInfo.appliedPromotion?.type,
                    promotion_name: priceInfo.appliedPromotion?.name,
                    hasPromotion: priceInfo.hasPromotion,
                };
            }

            // Fallback if promotions are disabled
            const total_price = originalUnitPrice * quantity;
            return {
                ...item,
                unit_price: originalUnitPrice,
                total_price: total_price,
                original_unit_price: originalUnitPrice,
                discount_amount: 0,
                promotion_id: undefined,
                promotion_type: undefined,
                promotion_name: undefined,
                hasPromotion: false,
            };
        });

        const finalTotal = newCalculatedItems.reduce((sum, item) => sum + item.total_price, 0);
        const discount = newCalculatedItems.reduce((sum, item) => sum + item.discount_amount, 0);
        const original = newCalculatedItems.reduce((sum, item) => sum + (item.original_unit_price * item.quantity), 0);
        const itemCount = newCalculatedItems.reduce((sum, item) => sum + item.quantity, 0);

        return {
            calculatedItems: newCalculatedItems,
            total: finalTotal,
            totalDiscount: discount,
            totalOriginal: original,
            totalItems: itemCount
        };
    }, [items, promotionsEnabled, calculatePrice]);

    return {
        calculatedItems,
        total,
        totalDiscount,
        totalOriginal,
        totalItems,
    };
}
