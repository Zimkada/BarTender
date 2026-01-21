import { useState, useCallback } from 'react';
import { Product, CartItem } from '../types';
import { useCartLogic } from './useCartLogic';

interface UseCartOptions {
    barId?: string;
    initialCart?: CartItem[];
}

/**
 * Hook de gestion de panier (State + Logic)
 * Peut être utilisé localement (ex: QuickSale) ou globalement.
 */
export function useCart({ barId, initialCart = [] }: UseCartOptions = {}) {
    const [cart, setCart] = useState<CartItem[]>(initialCart);

    // Intégration de la logique métier (calculs, promos)
    const {
        calculatedItems,
        total,
        totalDiscount,
        totalOriginal,
        totalItems
    } = useCartLogic({ items: cart, barId });

    // --- ACTIONS ---

    const addToCart = useCallback((product: Product) => {
        setCart(currentCart => {
            const existingItem = currentCart.find(item => item.product.id === product.id);
            if (existingItem) {
                return currentCart.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...currentCart, { product, quantity: 1 }];
        });
    }, []);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        setCart(currentCart => {
            if (quantity <= 0) {
                return currentCart.filter(item => item.product.id !== productId);
            }
            return currentCart.map(item =>
                item.product.id === productId
                    ? { ...item, quantity }
                    : item
            );
        });
    }, []);

    const removeFromCart = useCallback((productId: string) => {
        setCart(currentCart => currentCart.filter(item => item.product.id !== productId));
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
    }, []);

    return {
        // State brut
        cart,

        // Données calculées (enrichies avec prix/promos)
        items: calculatedItems,
        total,
        totalDiscount,
        totalOriginal,
        totalItems,

        // Actions
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        setCart // Exposé si besoin de reset complet externe
    };
}
