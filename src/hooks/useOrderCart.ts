import { useState, useCallback, useMemo } from 'react';
import { OrderSuggestion } from '../services/supabase/forecasting.service';

export interface OrderItem {
    productId: string;
    productName: string;
    productVolume: string;
    quantity: number;
    lotSize: number;
    lotPrice: number;
    supplier: string;
    isAiSuggestion: boolean;
    suggestedQuantity?: number;
}

export interface OrderCartCalculations {
    totalItems: number;
    totalLots: number;
    totalCost: number;
    totalUnits: number;
    averageCostPerUnit: number;
}

export function useOrderCart() {
    const [items, setItems] = useState<OrderItem[]>([]);

    // Calculs dérivés avec useMemo pour performance
    const calculations = useMemo<OrderCartCalculations>(() => {
        const totalItems = items.length;
        let totalLots = 0;
        let totalCost = 0;
        let totalUnits = 0;

        items.forEach(item => {
            const lots = Math.floor(item.quantity / item.lotSize);
            const cost = lots * item.lotPrice;
            totalLots += lots;
            totalCost += cost;
            totalUnits += item.quantity;
        });

        return {
            totalItems,
            totalLots,
            totalCost,
            totalUnits,
            averageCostPerUnit: totalUnits > 0 ? totalCost / totalUnits : 0
        };
    }, [items]);

    // Ajouter un item au panier
    const addItem = useCallback((item: OrderItem) => {
        setItems(prev => {
            const existing = prev.find(i => i.productId === item.productId);
            if (existing) {
                // Produit déjà dans le panier, on met à jour la quantité
                return prev.map(i =>
                    i.productId === item.productId
                        ? { ...i, quantity: i.quantity + item.quantity }
                        : i
                );
            }
            return [...prev, item];
        });
    }, []);

    // Mettre à jour un item
    const updateItem = useCallback((productId: string, updates: Partial<OrderItem>) => {
        setItems(prev => prev.map(item =>
            item.productId === productId ? { ...item, ...updates } : item
        ));
    }, []);

    // Retirer un item
    const removeItem = useCallback((productId: string) => {
        setItems(prev => prev.filter(item => item.productId !== productId));
    }, []);

    // Vider le panier
    const clearCart = useCallback(() => {
        setItems([]);
    }, []);

    // Ajouter toutes les suggestions IA au panier
    const addAllSuggestions = useCallback((suggestions: OrderSuggestion[]) => {
        const orderItems: OrderItem[] = suggestions.map(s => ({
            productId: s.productId,
            productName: s.productName,
            productVolume: s.productVolume,
            quantity: s.suggestedQuantity,
            lotSize: 24, // Valeur par défaut, à ajuster par l'utilisateur
            lotPrice: s.estimatedCost / Math.ceil(s.suggestedQuantity / 24), // Approximation
            supplier: '',
            isAiSuggestion: true,
            suggestedQuantity: s.suggestedQuantity
        }));

        setItems(prev => {
            const newItems = [...prev];
            orderItems.forEach(newItem => {
                const existingIndex = newItems.findIndex(i => i.productId === newItem.productId);
                if (existingIndex >= 0) {
                    newItems[existingIndex] = newItem; // Remplace avec les nouvelles valeurs
                } else {
                    newItems.push(newItem);
                }
            });
            return newItems;
        });
    }, []);

    return {
        items,
        calculations,
        addItem,
        updateItem,
        removeItem,
        clearCart,
        addAllSuggestions
    };
}
