import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Product, StockAdjustment, Supply, Return, Sale, Consignment } from '../types';
import { calculateBusinessDate, dateToYYYYMMDD } from '../utils/businessDateHelpers';

// Types pour l'historique
export interface HistoricalStockRecord {
    productId: string;
    productName: string;
    currentStock: number; // Stock à l'instant T (réel)
    historicalStock: number; // Stock reconstruit à T-x
    movements: {
        sales: number;
        supplies: number;
        adjustments: number;
        returns: number;
        consignments: number;
    };
    // Détails pour audit
    auditTrail: string[];
}

interface UseInventoryHistoryProps {
    barId: string;
    products: Product[];
}

export function useInventoryHistory({ barId, products }: UseInventoryHistoryProps) {
    const [isCalculating, setIsCalculating] = useState(false);
    const [progress, setProgress] = useState(0);

    /**
     * Récupère tous les mouvements depuis une date cible jusqu'à maintenant
     */
    const fetchMovements = useCallback(async (targetDate: Date, now: Date) => {
        const targetISO = targetDate.toISOString();
        const nowISO = now.toISOString();

        // 1. Ventes (Sales) - Uniquement validées
        const { data: sales } = await supabase
            .from('sales')
            .select('items')
            .eq('bar_id', barId)
            .eq('status', 'validated')
            .gte('validated_at', targetISO) // Validées après la date cible
            .lte('validated_at', nowISO);

        // 2. Approvisionnements (Supplies)
        const { data: supplies } = await supabase
            .from('supplies')
            .select('*')
            .eq('bar_id', barId)
            .gte('created_at', targetISO)
            .lte('created_at', nowISO);

        // 3. Ajustements (Stock Adjustments)
        const { data: adjustments } = await supabase
            .from('stock_adjustments')
            .select('*')
            .eq('bar_id', barId)
            .gte('adjusted_at', targetISO)
            .lte('adjusted_at', nowISO);

        // 4. Retours (Returns) - Uniquement ceux remis en stock
        const { data: returns } = await supabase
            .from('returns')
            .select('*')
            .eq('bar_id', barId)
            .eq('status', 'restocked')
            .gte('restocked_at', targetISO)
            .lte('restocked_at', nowISO);

        // 5. Consignations (Consignments)
        // Pour le stock physique, une consignation active est une sortie.
        // On cherche celles créées après la date cible.
        const { data: consignments } = await supabase
            .from('consignments')
            .select('*')
            .eq('bar_id', barId)
            .gte('created_at', targetISO)
            .lte('created_at', nowISO);

        return {
            sales: sales || [],
            supplies: supplies || [],
            adjustments: adjustments || [],
            returns: returns || [],
            consignments: consignments || []
        };
    }, [barId]);

    /**
     * Algorithme de reconstruction "Time Travel"
     */
    const calculateHistoricalStock = useCallback(async (targetDate: Date) => {
        setIsCalculating(true);
        setProgress(10);

        try {
            const now = new Date();
            const movements = await fetchMovements(targetDate, now);
            setProgress(50);

            const inventoryMap = new Map<string, HistoricalStockRecord>();

            // Initialisation avec le stock ACTUEL
            products.forEach(p => {
                inventoryMap.set(p.id, {
                    productId: p.id,
                    productName: p.name,
                    currentStock: p.stock, // Stock SOURCE de vérité
                    historicalStock: p.stock, // Sera modifié par le calcul inverse
                    movements: {
                        sales: 0,
                        supplies: 0,
                        adjustments: 0,
                        returns: 0,
                        consignments: 0
                    },
                    auditTrail: []
                });
            });

            // --- INVERSION DU TEMPS ---

            // 1. Inverser les VENTES (On RAJOUTE ce qui a été vendu)
            movements.sales.forEach((sale: any) => {
                sale.items.forEach((item: any) => {
                    const record = inventoryMap.get(item.product_id);
                    if (record) {
                        record.historicalStock += item.quantity; // + Vente
                        record.movements.sales += item.quantity;
                        // record.auditTrail.push(`+ ${item.quantity} (Vente annulée)`);
                    }
                });
            });

            // 2. Inverser les APPROVISIONNEMENTS (On SOUSTRAIT ce qui est entré)
            movements.supplies.forEach((supply: any) => {
                const record = inventoryMap.get(supply.product_id);
                if (record) {
                    record.historicalStock -= supply.quantity; // - Approv
                    record.movements.supplies += supply.quantity;
                }
            });

            // 3. Inverser les AJUSTEMENTS (On INVERSE le delta)
            movements.adjustments.forEach((adj: any) => {
                const record = inventoryMap.get(adj.product_id);
                if (record) {
                    record.historicalStock -= adj.delta; // - (+5) = -5 ; - (-3) = +3
                    record.movements.adjustments += adj.delta;
                }
            });

            // 4. Inverser les RETOURS REMIS EN STOCK (On SOUSTRAIT ce qui est revenu)
            movements.returns.forEach((ret: any) => {
                const record = inventoryMap.get(ret.product_id);
                if (record) {
                    record.historicalStock -= ret.quantity_returned; // - Retour
                    record.movements.returns += ret.quantity_returned;
                }
            });

            // 5. Inverser les CONSIGNATIONS (On RAJOUTE car c'était sorti)
            // Une consignation active = stock en moins. Si elle a été faite après T, on la remet.
            movements.consignments.forEach((cons: any) => {
                const record = inventoryMap.get(cons.product_id);
                if (record) {
                    record.historicalStock += cons.quantity; // + Consignation annulée
                    record.movements.consignments += cons.quantity;
                }
            });

            setProgress(100);
            return Array.from(inventoryMap.values());

        } catch (error) {
            console.error("Erreur calcul historique", error);
            throw error;
        } finally {
            setIsCalculating(false);
        }
    }, [barId, products, fetchMovements]);

    return {
        calculateHistoricalStock,
        isCalculating,
        progress
    };
}
