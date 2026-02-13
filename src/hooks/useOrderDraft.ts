import { useState, useEffect, useCallback } from 'react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';

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
    const { currentSession } = useAuth();
    const barId = currentBar?.id;
    const userId = currentSession?.userId;
    // Scoped to Bar AND User to prevent shared device leaks
    const storageKey = `${STORAGE_KEY_PREFIX}${barId}_${userId}`;

    const [items, setItems] = useState<OrderDraftItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Charger le brouillon au démarrage & écouter les changements inter-onglets
    useEffect(() => {
        if (!barId || !userId) return;

        const loadFromStorage = () => {
            try {
                const savedDraft = localStorage.getItem(storageKey);
                if (savedDraft) {
                    const parsed: OrderDraftState = JSON.parse(savedDraft);
                    setItems(parsed.items || []);
                }
            } catch (error) {
                console.error('Erreur chargement brouillon:', error);
            } finally {
                setIsLoaded(true);
            }
        };

        // Chargement initial
        loadFromStorage();

        // Écouteur pour la synchro multi-onglets
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === storageKey && e.newValue) {
                // On ne charge que si la valeur a changé et n'est pas nulle
                const parsed: OrderDraftState = JSON.parse(e.newValue);
                setItems(parsed.items || []);
            } else if (e.key === storageKey && !e.newValue) {
                // Si la clé a été supprimée (clearDraft dans un autre onglet)
                setItems([]);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [barId, userId, storageKey]);

    // Sauvegarder automatiquement lors des changements (sans déclencher de boucle infinie locale)
    useEffect(() => {
        if (!barId || !userId || !isLoaded) return;

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
                lotSize: 24,
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

            // --- LOGIQUE DE COHÉRENCE DES PRIX ---
            // Règle d'Or : Le Prix Unitaire est la base, sauf si on modifie explicitement le Prix du Lot.

            // Cas 1 : Modification de la TAILLE DU LOT
            // -> On recalcule le Prix du Lot (Prix Lot = Prix Unitaire * Taille Lot)
            // -> On garde le Prix Unitaire constant (c'est la constante physique du produit)
            if (updates.lotSize !== undefined) {
                const newSize = updates.lotSize;
                if (newSize > 0) {
                    updatedItem.lotPrice = updatedItem.unitPrice * newSize;
                } else {
                    updatedItem.lotPrice = 0; // Taille invalide -> Prix lot invalide
                }
            }
            // Cas 2 : Modification du PRIX DU LOT
            // -> On recalcule le Prix Unitaire (Prix Unitaire = Prix Lot / Taille Lot)
            else if (updates.lotPrice !== undefined) {
                const newLotPrice = updates.lotPrice;
                if (updatedItem.lotSize > 0) {
                    updatedItem.unitPrice = newLotPrice / updatedItem.lotSize;
                }
            }
            // Cas 3 : Modification du PRIX UNITAIRE
            // -> On recalcule le Prix du Lot (Prix Lot = Prix Unitaire * Taille Lot)
            else if (updates.unitPrice !== undefined) {
                const newUnitPrice = updates.unitPrice;
                if (updatedItem.lotSize > 0) {
                    updatedItem.lotPrice = newUnitPrice * updatedItem.lotSize;
                }
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
