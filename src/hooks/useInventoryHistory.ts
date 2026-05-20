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
     * ⚠️ Pagination explicite : PostgREST tronque à max_rows=1000 sinon (cf. config.toml).
     */
    const fetchMovements = useCallback(async (targetDate: Date, now: Date): Promise<FetchedMovements> => {
        const targetISO = targetDate.toISOString();
        const nowISO = now.toISOString();
        const PAGE_SIZE = 1000;
        const ABSOLUTE_CAP = 50000;

        // Helper de pagination générique pour les tables filtrées par plage temporelle.
        type PaginatedResult = { data: unknown[] | null; error: unknown };
        const fetchAllPaginated = async <T>(
            tableLabel: string,
            buildQuery: (from: number, to: number) => PromiseLike<PaginatedResult>
        ): Promise<T[]> => {
            const all: T[] = [];
            let from = 0;
            for (let page = 0; page < ABSOLUTE_CAP / PAGE_SIZE; page++) {
                const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
                if (error) throw new Error(`Erreur chargement ${tableLabel}: ${getErrorMessage(error)}`);
                const chunk = (data || []) as T[];
                all.push(...chunk);
                if (chunk.length < PAGE_SIZE) break;
                if (all.length >= ABSOLUTE_CAP) {
                    console.warn(`[useInventoryHistory] Plafond atteint pour ${tableLabel}`);
                    break;
                }
                from += PAGE_SIZE;
            }
            return all;
        };

        // 1. Ventes (Sales) - Uniquement validées
        const sales = await fetchAllPaginated<SaleRowMinimal>('ventes', (from, to) =>
            supabase
                .from('sales')
                .select('id, items, validated_at')
                .eq('bar_id', barId)
                .eq('status', 'validated')
                .gte('validated_at', targetISO)
                .lte('validated_at', nowISO)
                .order('validated_at', { ascending: true })
                .range(from, to)
        );

        // 2. Approvisionnements (Supplies)
        const supplies = await fetchAllPaginated<SupplyRowMinimal>('approvisionnements', (from, to) =>
            supabase
                .from('supplies')
                .select('id, product_id, quantity, created_at')
                .eq('bar_id', barId)
                .gte('created_at', targetISO)
                .lte('created_at', nowISO)
                .order('created_at', { ascending: true })
                .range(from, to)
        );

        // 3. Ajustements (Stock Adjustments)
        const adjustments = await fetchAllPaginated<StockAdjustmentRowMinimal>('ajustements', (from, to) =>
            supabase
                .from('stock_adjustments')
                .select('id, product_id, delta, adjusted_at')
                .eq('bar_id', barId)
                .gte('adjusted_at', targetISO)
                .lte('adjusted_at', nowISO)
                .order('adjusted_at', { ascending: true })
                .range(from, to)
        );

        // 4. Retours (Returns) - Uniquement ceux qui ont RÉELLEMENT impacté le stock
        const returns = await fetchAllPaginated<ReturnRowMinimal>('retours', (from, to) =>
            supabase
                .from('returns')
                .select('id, product_id, quantity_returned, restocked_at')
                .eq('bar_id', barId)
                .not('restocked_at', 'is', null)
                .gte('restocked_at', targetISO)
                .lte('restocked_at', nowISO)
                .order('restocked_at', { ascending: true })
                .range(from, to)
        );

        // 5. Consignations (Consignments) - UNIQUEMENT celles RÉCUPÉRÉES (claimed)
        const consignments = await fetchAllPaginated<ConsignmentRowMinimal>('consignations', (from, to) =>
            supabase
                .from('consignments')
                .select('id, product_id, quantity, status, claimed_at')
                .eq('bar_id', barId)
                .eq('status', 'claimed')
                .gte('claimed_at', targetISO)
                .lte('claimed_at', nowISO)
                .order('claimed_at', { ascending: true })
                .range(from, to)
        );

        return { sales, supplies, adjustments, returns, consignments };
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
