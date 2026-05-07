import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { StockService } from '../../services/supabase/stock.service';
import { StockAdjustmentsService } from '../../services/supabase/stock-adjustments.service';
import { stockKeys } from '../queries/useStockQueries';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { broadcastService } from '../../services/broadcast/BroadcastService';
import { getErrorMessage } from '../../utils/errorHandler';
import type { AdjustmentReason } from '../../types';

// Map legacy/unknown reason strings to valid RPC enum values
const VALID_REASONS: ReadonlyArray<AdjustmentReason> = [
    'inventory_count', 'loss_damage', 'donation_sample', 'expiration', 'theft_report', 'other'
];
const LEGACY_REASON_NOTES: Record<string, string> = {
    return_auto_restock: 'Remise en stock automatique suite à retour client',
    return_manual_restock: 'Remise en stock manuelle suite à retour client',
    restock: 'Remise en stock',
    manual_decrease: 'Diminution manuelle',
};
const toAdjustmentReason = (reason: string): { reason: AdjustmentReason; autoNotes?: string } => {
    if (VALID_REASONS.includes(reason as AdjustmentReason)) {
        return { reason: reason as AdjustmentReason };
    }
    return { reason: 'other', autoNotes: LEGACY_REASON_NOTES[reason] ?? `Ajustement : ${reason}` };
};

// Helper: Centralized cache invalidation for stock queries
const invalidateStockQuery = (
    queryClient: ReturnType<typeof useQueryClient>,
    queryKey: readonly any[],
    barId: string
) => {
    queryClient.invalidateQueries({
        queryKey: queryKey as any[],
        exact: true
    });
};

export const useStockMutations = (barId?: string) => {
    const queryClient = useQueryClient();
    const { currentSession } = useAuth();
    const { currentBar } = useBarContext();

    // --- PRODUCTS ---

    const createProduct = useMutation({
        meta: { suppressGlobalError: true }, // 🛡️ onError local gère le toast — évite le double toast de MutationCache
        mutationFn: async (productData: any) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.createBarProduct(productData);
        },
        onSuccess: () => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit créé avec succès');
            });
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            const isDuplicate = msg.includes('23505') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique');
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(isDuplicate ? 'Ce produit est déjà dans votre inventaire.' : `Erreur création produit: ${msg}`);
            });
        }
    });

    const updateProduct = useMutation({
        meta: { suppressGlobalError: true }, // 🛡️ onError local gère le toast
        mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.updateBarProduct(id, updates);
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit mis à jour');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.id, ...variables.updates },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur mise à jour produit: ${msg}`);
            });
        }
    });

    const deleteProduct = useMutation({
        meta: { suppressGlobalError: true }, // 🛡️ onError local gère le toast
        mutationFn: async (id: string) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");
            return ProductsService.deactivateProduct(id);
        },
        onSuccess: (data, id) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Produit supprimé');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'DELETE',
                    table: 'bar_products',
                    barId,
                    data: { id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur suppression produit: ${msg}`);
            });
        }
    });

    // --- STOCK ADJUSTMENT (New) ---
    const adjustStock = useMutation({
        mutationFn: async ({ productId, delta, reason, notes }: { productId: string; delta: number; reason: string; notes?: string }) => {
            const barId = currentBar?.id;
            if (!barId) throw new Error("No bar selected");

            const { reason: validReason, autoNotes } = toAdjustmentReason(reason);
            // Use passed notes first, fall back to auto-generated notes for mapped reasons
            const finalNotes = notes || autoNotes;

            return StockAdjustmentsService.createAdjustment({
                barId,
                productId,
                delta,
                reason: validReason,
                notes: finalNotes
            });
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Stock mis à jour');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.productId, stockDelta: variables.delta },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
                queryClient.invalidateQueries({ queryKey: ['stock-adjustments', barId] });
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur mise à jour stock: ${msg}`);
            });
        }
    });

    // --- SUPPLIES (Complex Flow) ---

    const addSupply = useMutation({
        // ⚠️ PAS de retry automatique : addSupply n'a pas d'idempotency_key côté serveur.
        // Un retry sur réponse perdue doublerait le stock et fausserait le CUMP.
        // Réactiver quand l'idempotence backend sera en place (Layer 4C).
        retry: false,
        mutationFn: async (data: {
            bar_id: string;
            product_id: string;
            quantity: number;
            lot_price: number;
            lot_size: number;
            supplier: string;
            created_by: string;
        }) => {
            const rpcData = await StockService.createSupplyAndUpdateProduct({
                p_bar_id: data.bar_id,
                p_product_id: data.product_id,
                p_quantity: data.quantity,
                p_lot_price: data.lot_price,
                p_lot_size: data.lot_size,
                p_supplier: data.supplier,
                p_created_by: data.created_by,
            });

            if (rpcData && !rpcData.success) {
                throw new Error(rpcData.message || 'Une erreur est survenue dans la base de données.');
            }

            return rpcData.supply;
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Approvisionnement enregistré et CUMP mis à jour !');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'supplies',
                    barId,
                    data: variables,
                });
                // Également broadcaster la mise à jour du produit (stock + CUMP)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.product_id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.supplies(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur: ${msg}`);
            });
        }
    });

    const reverseSupply = useMutation({
        meta: { suppressGlobalError: true }, // onError local gère le toast
        retry: false, // Idempotent côté serveur via reversed_at — pas de besoin de retry auto
        mutationFn: async ({ supplyId }: { supplyId: string; productId: string }) => {
            // productId n'est pas envoyé au RPC (le serveur le résout lui-même),
            // mais est utilisé dans onSuccess pour le broadcast bar_products.
            return StockService.reverseSupply(supplyId);
        },
        onSuccess: (_data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Approvisionnement annulé');
            });

            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'supplies',
                    barId,
                    data: { reversal_of_id: variables.supplyId },
                });
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.productId },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.supplies(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur annulation: ${msg}`);
            });
        }
    });

    const updateSupplyMetadata = useMutation({
        meta: { suppressGlobalError: true },
        mutationFn: async ({ supplyId, updates }: {
            supplyId: string;
            updates: { supplierName?: string; supplierPhone?: string; notes?: string };
        }) => {
            await StockService.updateSupplyMetadata(supplyId, updates);
        },
        onSuccess: () => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Approvisionnement mis à jour');
            });

            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'supplies',
                    barId,
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.supplies(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur mise à jour: ${msg}`);
            });
        }
    });

    // --- CONSIGNMENTS ---

    const createConsignment = useMutation({
        mutationFn: async (data: any) => {
            const barId = currentBar?.id;
            if (!currentSession?.userId || !barId) {
                throw new Error('Utilisateur non connecté ou bar non sélectionné');
            }

            // Validate required fields
            if (!data.saleId) throw new Error('Sale ID est obligatoire');
            if (!data.productId) throw new Error('Product ID est obligatoire');
            if (!data.quantity || data.quantity < 1) throw new Error('Quantité invalide');

            const expiresAt = data.expiresAt
                ? (data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt)
                : new Date(Date.now() + (data.expirationDays || 7) * 24 * 60 * 60 * 1000).toISOString();

            // ✅ ATOMIC RPC: Single transaction (INSERT + INCREMENT stock)
            return StockService.createConsignmentAtomic(
                barId,
                data.saleId,
                data.productId,
                data.productName || 'Unknown',
                data.quantity,
                {
                    productVolume: data.productVolume,
                    totalAmount: data.totalAmount,
                    customerName: data.customerName,
                    customerPhone: data.customerPhone,
                    notes: data.notes,
                    expiresAt,
                    expirationDays: data.expirationDays,
                    originalSeller: data.originalSeller,
                    serverId: data.serverId,
                    createdBy: currentSession.userId,
                    businessDate: new Date().toISOString(),
                }
            );
        },
        onSuccess: (newConsignment) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation créée');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'INSERT',
                    table: 'consignments',
                    barId,
                    data: newConsignment,
                });
                // Notifier aussi le changement de stock (incrément)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: newConsignment.product_id },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur: ${msg}`);
            });
        }
    });

    const claimConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity, claimedBy }: { id: string; productId: string; quantity: number; claimedBy: string }) => {
            // ✅ ATOMIC RPC: Single transaction (UPDATE status + DECREMENT stock)
            return StockService.claimConsignmentAtomic(id, claimedBy);
        },
        onSuccess: (consignment, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation réclamée');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'consignments',
                    barId,
                    data: { id: variables.id, status: 'claimed' },
                });
                // Notifier aussi le changement de stock (décrément)
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                    data: { id: variables.productId },
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const forfeitConsignment = useMutation({
        mutationFn: async ({ id, productId, quantity }: { id: string; productId: string; quantity: number }) => {
            // ✅ ATOMIC RPC: UPDATE status to 'forfeited'
            return StockService.forfeitConsignmentAtomic(id);
        },
        onSuccess: async () => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Consignation abandonnée — article disponible à nouveau');
            });
            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.consignments(barId), barId);
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
            }
        },
    });

    const expireConsignments = useMutation({
        mutationFn: async (ids: string[]) => {
            const promises = ids.map(id => StockService.updateConsignmentStatus(id, 'expired', {}));
            return Promise.all(promises);
        },
        onSuccess: async (data) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success(`${data.length} consignation(s) marquée(s) comme expirée(s)`);
            });
            if (barId) {
                await queryClient.refetchQueries({ queryKey: stockKeys.consignments(barId) });
            }
        },
        onError: (error) => {
            const msg = getErrorMessage(error);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(`Erreur lors de l'expiration: ${msg}`);
            });
        }
    });

    // --- SALES ---

    const validateSale = useMutation({
        mutationFn: async ({ id, validatedBy }: { id: string, validatedBy: string }) => {
            const { SalesService } = await import('../../services/supabase/sales.service');
            return SalesService.validateSale(id, validatedBy);
        },
        onSuccess: (data, variables) => {
            const barId = currentBar?.id;
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Vente validée et stock décrémenté');
            });

            // 🚀 PHASE 3-4: Broadcast aux autres onglets
            if (barId && broadcastService.isSupported()) {
                broadcastService.broadcast({
                    event: 'UPDATE',
                    table: 'bar_products',
                    barId,
                });
            }

            if (barId) {
                invalidateStockQuery(queryClient, stockKeys.products(barId), barId);
                // 🛡️ Fix: Retirer la vente du cache server-pending-sales pour éviter la double déduction
                queryClient.invalidateQueries({ queryKey: ['server-pending-sales-for-stock', barId] });
            }
        },
    });

    return {
        createProduct,
        updateProduct,
        deleteProduct,
        adjustStock, // ✅ EXPORTED
        addSupply,
        reverseSupply,
        updateSupplyMetadata,
        createConsignment,
        claimConsignment,
        forfeitConsignment,
        expireConsignments,
        validateSale,
    };
};
