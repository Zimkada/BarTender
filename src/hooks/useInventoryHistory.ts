import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { getErrorMessage } from '../utils/errorHandler';
import type {
    HistoricalStockRecord,
    FetchedMovements,
    SaleRowMinimal,
    SupplyRowMinimal,
    StockAdjustmentRowMinimal,
    ReturnRowMinimal,
    ConsignmentRowMinimal,
    SaleItemDB
} from './useInventoryHistory.types';

// Re-export for backward compatibility
export type { HistoricalStockRecord } from './useInventoryHistory.types';

interface UseInventoryHistoryProps {
    barId: string;
    products: Product[];
}

export function useInventoryHistory({ barId, products }: UseInventoryHistoryProps) {
    const [isCalculating, setIsCalculating] = useState(false);
    const [progress, setProgress] = useState(0);

    /**
     * Récupère tous les mouvements depuis une date cible jusqu'à maintenant
     * ⚠️ Type-safe avec gestion d'erreur explicite
     */
    const fetchMovements = useCallback(async (targetDate: Date, now: Date): Promise<FetchedMovements> => {
        const targetISO = targetDate.toISOString();
        const nowISO = now.toISOString();

        // 1. Ventes (Sales) - Uniquement validées
        const { data: sales, error: salesError } = await supabase
            .from('sales')
            .select('id, items, validated_at')
            .eq('bar_id', barId)
            .eq('status', 'validated')
            .gte('validated_at', targetISO)
            .lte('validated_at', nowISO);

        if (salesError) {
            throw new Error(`Erreur chargement ventes: ${getErrorMessage(salesError)}`);
        }

        // 2. Approvisionnements (Supplies)
        const { data: supplies, error: suppliesError } = await supabase
            .from('supplies')
            .select('id, product_id, quantity, created_at')
            .eq('bar_id', barId)
            .gte('created_at', targetISO)
            .lte('created_at', nowISO);

        if (suppliesError) {
            throw new Error(`Erreur chargement approvisionnements: ${getErrorMessage(suppliesError)}`);
        }

        // 3. Ajustements (Stock Adjustments)
        const { data: adjustments, error: adjustmentsError } = await supabase
            .from('stock_adjustments')
            .select('id, product_id, delta, adjusted_at')
            .eq('bar_id', barId)
            .gte('adjusted_at', targetISO)
            .lte('adjusted_at', nowISO);

        if (adjustmentsError) {
            throw new Error(`Erreur chargement ajustements: ${getErrorMessage(adjustmentsError)}`);
        }

        // 4. Retours (Returns) - Uniquement ceux qui ont RÉELLEMENT impacté le stock
        // ✅ FIX CRITIQUE: Le trigger auto_restock s'active si status IN ('approved', 'restocked')
        // La présence de restocked_at est la SEULE preuve fiable que le stock a été incrémenté.
        const { data: returns, error: returnsError } = await supabase
            .from('returns')
            .select('id, product_id, quantity_returned, restocked_at')
            .eq('bar_id', barId)
            .not('restocked_at', 'is', null) // ✅ Inversion de tout ce qui a touché au stock
            .gte('restocked_at', targetISO)
            .lte('restocked_at', nowISO);

        if (returnsError) {
            throw new Error(`Erreur chargement retours: ${getErrorMessage(returnsError)}`);
        }

        // 5. Consignations (Consignments) - UNIQUEMENT celles RÉCUPÉRÉES (claimed)
        // ⚠️ FIX CRITIQUE: La création de consignation ne touche PAS product.stock
        // Seul le CLAIM (récupération client) décrémente le stock
        // Les consignations expired/forfeited retournent au stock vendable sans toucher product.stock
        const { data: consignments, error: consignmentsError } = await supabase
            .from('consignments')
            .select('id, product_id, quantity, status, claimed_at')
            .eq('bar_id', barId)
            .eq('status', 'claimed')  // ✅ SEULES les consignations récupérées
            .gte('claimed_at', targetISO)
            .lte('claimed_at', nowISO);

        if (consignmentsError) {
            throw new Error(`Erreur chargement consignations: ${getErrorMessage(consignmentsError)}`);
        }

        return {
            sales: (sales || []) as unknown as SaleRowMinimal[],
            supplies: (supplies || []) as SupplyRowMinimal[],
            adjustments: (adjustments || []) as StockAdjustmentRowMinimal[],
            returns: (returns || []) as ReturnRowMinimal[],
            consignments: (consignments || []) as ConsignmentRowMinimal[]
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

            // --- INVERSION DU TEMPS (TIME TRAVEL) ---
            // Formule: Stock(T) = Stock(now) - Entrées + Sorties

            // 1. Inverser les VENTES (On RAJOUTE ce qui a été vendu)
            // Vente = sortie → pour revenir en arrière, on rajoute
            movements.sales.forEach((sale) => {
                const items = sale.items as SaleItemDB[];
                items.forEach((item) => {
                    const record = inventoryMap.get(item.product_id);
                    if (record) {
                        record.historicalStock += item.quantity; // + Vente annulée
                        record.movements.sales += item.quantity;
                    }
                });
            });

            // 2. Inverser les APPROVISIONNEMENTS (On SOUSTRAIT ce qui est entré)
            // Approv = entrée → pour revenir en arrière, on soustrait
            movements.supplies.forEach((supply) => {
                const record = inventoryMap.get(supply.product_id);
                if (record) {
                    record.historicalStock -= supply.quantity; // - Approv
                    record.movements.supplies += supply.quantity;
                }
            });

            // 3. Inverser les AJUSTEMENTS (On INVERSE le delta)
            // Ajustement +5 → Stock(T) = Stock(now) - 5
            // Ajustement -3 → Stock(T) = Stock(now) + 3
            movements.adjustments.forEach((adj) => {
                const record = inventoryMap.get(adj.product_id);
                if (record) {
                    record.historicalStock -= adj.delta;
                    record.movements.adjustments += adj.delta;
                }
            });

            // 4. Inverser les RETOURS REMIS EN STOCK (On SOUSTRAIT ce qui est revenu)
            // Retour = entrée → pour revenir en arrière, on soustrait
            movements.returns.forEach((ret) => {
                const record = inventoryMap.get(ret.product_id);
                if (record) {
                    record.historicalStock -= ret.quantity_returned; // - Retour
                    record.movements.returns += ret.quantity_returned;
                }
            });

            // 5. Inverser les CONSIGNATIONS RÉCUPÉRÉES (On RAJOUTE car stock a été décrémenté)
            // ⚠️ FIX CRITIQUE: SEULES les consignations 'claimed' touchent product.stock
            // Claim = sortie (client récupère) → pour revenir en arrière, on rajoute
            // Note: Les consignations expired/forfeited ne sont PAS dans cette liste
            // car elles ne décrément jamais product.stock (voir useStockMutations.ts:321-334)
            movements.consignments.forEach((cons) => {
                const record = inventoryMap.get(cons.product_id);
                if (record) {
                    record.historicalStock += cons.quantity; // + Claim annulé
                    record.movements.consignments += cons.quantity;
                }
            });

            setProgress(100);
            return Array.from(inventoryMap.values());

        } catch (error) {
            console.error("Erreur calcul historique:", error);
            const errorMessage = getErrorMessage(error);
            throw new Error(`Échec du calcul historique: ${errorMessage}`);
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
