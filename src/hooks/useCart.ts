import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Product, CartItem } from '../types';
import { useCartLogic } from './useCartLogic';

interface UseCartOptions {
    barId?: string;
    initialCart?: CartItem[];
    maxStockLookup?: (productId: string) => number; // 🛡️ Fix : Validation de stock intrinsèque
}

/**
 * Hook de gestion de panier (State + Logic)
 * Peut être utilisé localement (ex: QuickSale) ou globalement.
 */
export function useCart({ barId, initialCart = [], maxStockLookup }: UseCartOptions = {}) {
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

    /**
     * @param quantity Quantité VOULUE au total pour cette ligne. Absente, le
     * comportement historique s'applique : +1 sur la quantité courante.
     *
     * ⭐ REMPLACE au lieu d'AJOUTER quand elle est fournie — c'est la lecture
     * naturelle du pavé de quantité (`QuantityPad`) : taper « 6 » donne 6, pas
     * 6 de plus. Le geste devient idempotent, un double tap ne double rien.
     */
    const addToCart = useCallback((product: Product, quantity?: number) => {
        setCart(currentCart => {
            const existingItem = currentCart.find(item => item.product.id === product.id);
            const currentQty = existingItem ? existingItem.quantity : 0;
            const newQty = quantity !== undefined ? quantity : currentQty + 1;

            // 🛡️ Validation de stock intrinsèque
            if (maxStockLookup) {
                const availableStock = maxStockLookup(product.id);
                if (newQty > availableStock) {
                    toast.error(`Stock limité : ${availableStock} disponible(s) maximum pour ${product.name}`, {
                        id: `stock-limit-${product.id}`, // Évite les doubles toasts
                    });
                    return currentCart; // Bloque l'ajout
                }
            }

            if (existingItem) {
                return currentCart.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: newQty }
                        : item
                );
            }
            // ⚠️ `newQty` et non `1` : une première ligne créée depuis le pavé
            // doit naître avec la quantité demandée.
            return [...currentCart, { product, quantity: newQty }];
        });
    }, [maxStockLookup]);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        setCart(currentCart => {
            if (quantity <= 0) {
                return currentCart.filter(item => item.product.id !== productId);
            }

            // 🛡️ Validation de stock intrinsèque
            if (maxStockLookup) {
                const availableStock = maxStockLookup(productId);
                if (quantity > availableStock) {
                    const itemName = currentCart.find(i => i.product.id === productId)?.product.name || 'produit';
                    toast.error(`Stock insuffisant : ${availableStock} unité(s) maximum pour ${itemName}`, {
                        id: `stock-limit-${productId}`,
                    });
                    return currentCart; // Bloque l'augmentation
                }
            }

            return currentCart.map(item =>
                item.product.id === productId
                    ? { ...item, quantity }
                    : item
            );
        });
    }, [maxStockLookup]);

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
