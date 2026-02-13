import { useState, useEffect, useCallback } from 'react';
import { useBarContext } from '../context/BarContext';

export interface OrderDraftItem {
    productId: string;
    productName: string;
    productVolume: string;
    quantity: number;
    supplier: string;
    lotSize: number;
    lotPrice: number;
    unitPrice: number; // Prix d'achat unitaire calculé ou manuel
}

export interface OrderDraftState {
    items: OrderDraftItem[];
    lastUpdated: number;
}

const STORAGE_KEY_PREFIX = 'bartender_order_draft_';

export function useOrderDraft() {
    const { currentBar } = useBarContext();
    const barId = currentBar?.id;
    const storageKey = `${STORAGE_KEY_PREFIX}${barId}`;

    const [items, setItems] = useState<OrderDraftItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Charger le brouillon au démarrage
    useEffect(() => {
        if (!barId) return;

        try {
            const savedDraft = localStorage.getItem(storageKey);
            if (savedDraft) {
                const parsed: OrderDraftState = JSON.parse(savedDraft);
                // Optionnel: vérifier la validité / expiration du brouillon ici
                setItems(parsed.items || []);
            }
        } catch (error) {
            console.error('Erreur lors du chargement du brouillon de commande:', error);
        } finally {
            setIsLoaded(true);
        }
    }, [barId, storageKey]);

    // Sauvegarder automatiquement lors des changements
    useEffect(() => {
        if (!barId || !isLoaded) return;

        const state: OrderDraftState = {
            items,
            lastUpdated: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(state));
    }, [items, barId, storageKey, isLoaded]);

    const addItem = useCallback((newItem: Omit<OrderDraftItem, 'supplier' | 'lotSize' | 'lotPrice' | 'unitPrice'> & Partial<OrderDraftItem>) => {
        setItems(prev => {
            const existingIndex = prev.findIndex(i => i.productId === newItem.productId);
            if (existingIndex >= 0) {
                // Mise à jour si existe déjà
                const updated = [...prev];
                updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...newItem,
                    quantity: updated[existingIndex].quantity + newItem.quantity
                };
                return updated;
            }
            // Nouveau
            return [...prev, {
                supplier: '',
                lotSize: 24, // Défaut
                lotPrice: 0,
                unitPrice: 0,
                ...newItem
            }];
        });
    }, []);

    const updateItem = useCallback((productId: string, updates: Partial<OrderDraftItem>) => {
        setItems(prev => prev.map(item => {
            if (item.productId !== productId) return item;

            const updatedItem = { ...item, ...updates };

            // Recalcul automatique des prix cohérents si nécessaire
            if (updates.lotPrice !== undefined && updatedItem.lotSize > 0) {
                updatedItem.unitPrice = updatedItem.lotPrice / updatedItem.lotSize;
            } else if (updates.unitPrice !== undefined) {
                updatedItem.lotPrice = updatedItem.unitPrice * updatedItem.lotSize;
            }

            return updatedItem;
        }));
    }, []);

    const removeItem = useCallback((productId: string) => {
        setItems(prev => prev.filter(i => i.productId !== productId));
    }, []);

    const clearDraft = useCallback(() => {
        setItems([]);
        if (barId) {
            localStorage.removeItem(storageKey);
        }
    }, [barId, storageKey]);

    // Totaux calculés
    const totals = items.reduce((acc, item) => {
        let cost = 0;
        // Priorité au calcul par lot si disponible, sinon par unité
        if (item.lotPrice > 0 && item.lotSize > 0) {
            cost = (item.quantity / item.lotSize) * item.lotPrice;
        } else {
            cost = item.quantity * item.unitPrice;
        }

        return {
            itemsCount: acc.itemsCount + 1,
            totalUnits: acc.totalUnits + item.quantity,
            totalCost: acc.totalCost + cost
        };
    }, { itemsCount: 0, totalUnits: 0, totalCost: 0 });

    return {
        items,
        isLoaded,
        addItem,
        updateItem,
        removeItem,
        clearDraft,
        totals
    };
}
