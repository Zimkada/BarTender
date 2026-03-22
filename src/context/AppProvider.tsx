import React, { useCallback, useEffect, useMemo } from 'react';
import { useBarContext } from '../context/BarContext';
import { useCacheWarming } from '../hooks/useViewMonitoring';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../components/Notifications';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService } from '../services/realtime/RealtimeService';
import { broadcastService } from '../services/broadcast/BroadcastService';
import {
    Category,
    Product,
    Sale,
    SaleItem,
    AppSettings,
    Return,
    User,
    Expense,
    CartItem,
    ExpenseCategoryCustom
} from '../types';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../constants/businessDay';
import { generateUUID } from '../utils/crypto';

// React Query Hooks (Mutations only - data comes from Smart Hooks)
import { useBarMembers } from '../hooks/queries/useBarMembers';

import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useExpensesMutations } from '../hooks/mutations/useExpensesMutations';
import { useReturnsMutations } from '../hooks/mutations/useReturnsMutations';
import { useCategoryMutations } from '../hooks/mutations/useCategoryMutations';
import { useCart } from '../hooks/useCart';
import { useStock } from './hooks/useStock';

import { AppContext, AppContextType } from './AppContext';

const defaultSettings: AppSettings = {
    currency: 'FCFA',
    currencySymbol: ' FCFA',
    currentSession: null,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentSession, hasPermission } = useAuth();
    const { currentBar } = useBarContext();
    const queryClient = useQueryClient();

    // Initialize Realtime and Broadcast services
    useEffect(() => {
        realtimeService.setQueryClient(queryClient);
        broadcastService.setQueryClient(queryClient);

        return () => {
            broadcastService.closeAllChannels();
        };
    }, [queryClient]);

    // Cache Warming: Rafraîchir les vues matérialisées au démarrage
    const { isWarming } = useCacheWarming(!!currentSession);

    useEffect(() => {
        if (isWarming) {
            // Cache warming in progress
        }
    }, [isWarming]);

    const barId = currentBar?.id || '';
    const { isSimplifiedMode } = useBarContext();

    // ⚠️ PILLAR 3: Global queries DISABLED - Data now comes from Smart Hooks (useUnifiedStock, useUnifiedSales, useUnifiedReturns)
    // AppProvider now only provides mutations + legacy methods for backward compatibility
    const customExpenseCategories = useMemo<ExpenseCategoryCustom[]>(() => [], []);

    // React Query: Mutations (KEPT - still needed for operations)
    const salesMutations = useSalesMutations(barId);
    const expensesMutations = useExpensesMutations(barId);
    const returnsMutations = useReturnsMutations(barId);
    const categoryMutations = useCategoryMutations(barId);

    // Notifications - MUST be declared before use in useEffect
    // Notifications - MUST be declared before use in useEffect
    const { showNotification } = useNotifications();

    // 🚀 INITIALISATION DES DONNÉES DE BASE (Conditionnée à l'authentification)
    // On ne récupère les membres que si on a un bar ET une session
    const { data: members = [] } = useBarMembers(barId, {
        enabled: !!currentSession,
        refetchInterval: false
    });

    const settings = defaultSettings;
    const users: User[] = useMemo(() => members.map(member => ({
        id: member.user.id,
        username: member.user.username,
        name: member.user.name,
        phone: member.user.phone,
        email: member.user.email,
        createdAt: member.user.createdAt,
        createdBy: member.user.createdBy,
        isActive: member.user.isActive,
        firstLogin: member.user.firstLogin,
        lastLoginAt: member.user.lastLoginAt,
        role: member.user.role,
        hasCompletedOnboarding: member.user.hasCompletedOnboarding,
        onboardingCompletedAt: member.user.onboardingCompletedAt,
        trainingVersionCompleted: member.user.trainingVersionCompleted
    })), [members]);

    // --- CART STATE & LOGIC (UNIFIED) ---
    const { getProductStockInfo } = useStock();
    const {
        cart,
        setCart,
        addToCart: baseAddToCart,
        updateQuantity: baseUpdateCartQuantity,
        removeFromCart,
        clearCart
    } = useCart({
        barId,
        maxStockLookup: (id) => getProductStockInfo(id)?.availableStock ?? Infinity
    });

    // 🧹 Fix: Vider le panier quand on change de bar pour éviter les mélanges
    useEffect(() => {
        setCart([]);
    }, [currentBar?.id, setCart]);

    const addToCart = useCallback((product: Product) => {
        // Check if server in simplified mode - prevent adding to cart
        const isServerRole = currentSession?.role === 'serveur';

        if (isSimplifiedMode && isServerRole) {
            import('react-hot-toast').then(({ default: toast }) => {
                toast('En mode simplifié, seul le gérant crée les ventes.', {
                    icon: 'ℹ️',
                    duration: 3000
                });
            });
            return;
        }

        baseAddToCart(product);
    }, [baseAddToCart, isSimplifiedMode, currentSession?.role]);

    const updateCartQuantity = useCallback((productId: string, quantity: number) => {
        baseUpdateCartQuantity(productId, quantity);
    }, [baseUpdateCartQuantity]);
    // --- END CART STATE & LOGIC ---

    // Filtrage automatique (désactivé dans AppProvider - géré par Smart Hooks)


    // --- CATEGORIES ---
    const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
        return categoryMutations.createCategory.mutateAsync({
            name: category.name,
            color: category.color,
        }).then((data: any) => {
            showNotification('success', `Catégorie "${category.name}" créée avec succès`, { duration: 3000 });
            // Mapping DB -> App Type
            const newCategory: Category = {
                id: data.id,
                name: data.custom_name || '',
                color: data.custom_color || '#3B82F6',
                barId: data.bar_id,
                createdAt: new Date(data.created_at)
            };
            return newCategory;
        }).catch((error) => {
            showNotification('error', error.message || 'Erreur lors de la création de la catégorie', { duration: 5000 });
            throw error;
        });
    }, [categoryMutations, showNotification]);

    const linkCategory = useCallback((globalCategoryId: string) => {
        return categoryMutations.linkGlobalCategory.mutateAsync(globalCategoryId).then(() => {
            showNotification('success', 'Catégorie globale ajoutée avec succès', { duration: 3000 });
        }).catch((error) => {
            showNotification('error', error.message || 'Erreur lors de l\'ajout de la catégorie', { duration: 5000 });
            throw error;
        });
    }, [categoryMutations, showNotification]);

    const addCategories = useCallback((categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => {
        // Créer les catégories une par une et mapper les résultats
        return Promise.all(
            categories.map(cat =>
                categoryMutations.createCategory.mutateAsync({
                    name: cat.name,
                    color: cat.color,
                }).then((data: any) => ({
                    id: data.id,
                    name: data.custom_name || '',
                    color: data.custom_color || '#3B82F6',
                    barId: data.bar_id,
                    createdAt: new Date(data.created_at)
                } as Category))
            )
        )
            .then((results) => {
                showNotification('success', `${categories.length} catégories créées avec succès`, { duration: 3000 });
                return results;
            })
            .catch((error) => {
                showNotification('error', error.message || 'Erreur lors de la création des catégories', { duration: 5000 });
                throw error;
            });
    }, [categoryMutations, showNotification]);

    const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
        categoryMutations.updateCategory.mutate(
            {
                id,
                updates: {
                    name: updates.name,
                    color: updates.color,
                },
            },
            {
                onSuccess: () => {
                    showNotification('success', 'Catégorie mise à jour avec succès', { duration: 3000 });
                },
                onError: (error) => {
                    showNotification('error', error.message || 'Erreur lors de la mise à jour de la catégorie', { duration: 5000 });
                },
            }
        );
    }, [categoryMutations, showNotification]);

    const deleteCategory = useCallback((id: string) => {
        categoryMutations.deleteCategory.mutate(id, {
            onSuccess: () => {
                showNotification('success', 'Catégorie supprimée avec succès', { duration: 3000 });
            },
            onError: (error) => {
                showNotification('error', error.message || 'Erreur lors de la suppression de la catégorie', { duration: 5000 });
            },
        });
    }, [categoryMutations, showNotification]);


    // --- PRODUCTS (Read Only) ---
    // --- PRODUITS & STOCKS (GÉRÉ PAR useUnifiedStock) ---
    // Les getters sont maintenant délégués aux Smart Hooks dans les composants.

    // --- SALES ---
    const addSale = useCallback(async (saleData: Partial<Sale>) => {
        if (!hasPermission('canSell') || !currentBar || !currentSession) return null;

        // Vérifier si items est déjà au format SaleItem[] (a product_id) ou CartItem[] (a product.id)
        const isAlreadyFormatted = saleData.items?.[0]?.hasOwnProperty('product_id');

        // Mapping CartItem[] (UI) -> SaleItem[] (DB/Service)
        // ✨ Amélioration: Préserver les prix calculés et détails de promotion
        const formattedItems: SaleItem[] = isAlreadyFormatted
            ? (saleData.items as SaleItem[] || [])
            : saleData.items?.map((item) => {
                // Type guard: item est CartItem avec champs additionnels potentiels
                const cartItem = item as unknown as CartItem & {
                    unit_price?: number;
                    total_price?: number;
                    original_unit_price?: number;
                    discount_amount?: number;
                    promotion_id?: string;
                    promotion_type?: string;
                    promotion_name?: string;
                };
                return {
                    product_id: cartItem.product.id,
                    product_name: cartItem.product.name,
                    quantity: cartItem.quantity,
                    unit_price: cartItem.unit_price ?? cartItem.product.price,
                    total_price: cartItem.total_price ?? (cartItem.product.price * cartItem.quantity),
                    original_unit_price: cartItem.original_unit_price ?? cartItem.product.price,
                    discount_amount: cartItem.discount_amount ?? 0,
                    promotion_id: cartItem.promotion_id,
                    promotion_type: cartItem.promotion_type,
                    promotion_name: cartItem.promotion_name
                } as SaleItem;
            }) || [];

        // Mapping CartItem[] (UI) -> SaleItem[] (DB/Service)
        // ✨ FIX: En mode simplifié, sold_by = serveur sélectionné, pas le gérant
        // En mode complet, sold_by = créateur (currentSession.userId)
        const soldByValue = isSimplifiedMode && saleData.serverId
            ? saleData.serverId
            : currentSession.userId;

        const newSaleData: Partial<Sale> & { items: SaleItem[] } = {
            barId: currentBar.id,
            items: formattedItems,
            paymentMethod: saleData.paymentMethod || 'cash',
            soldBy: soldByValue,
            customerName: saleData.customerName,
            customerPhone: saleData.customerPhone,
            notes: saleData.notes,
            status: (currentSession.role === 'promoteur' || currentSession.role === 'gerant') ? 'validated' : 'pending',
            serverId: saleData.serverId,
            ticketId: saleData.ticketId
        };

        const result = await salesMutations.createSale.mutateAsync(newSaleData);

        // Clear cart after successful sale creation
        if (result) {
            clearCart();
        }

        return result;
    }, [hasPermission, currentBar, currentSession, salesMutations, clearCart]);

    const validateSale = useCallback((saleId: string, validatorId: string) => {
        if (!hasPermission('canManageInventory')) return;

        // Le stock est décrémenté atomiquement lors de la création de la vente via RPC.
        // Cette fonction ne fait que changer le statut de 'pending' à 'validated'.
        salesMutations.validateSale.mutate({ id: saleId, validatorId });
    }, [hasPermission, salesMutations]);

    const rejectSale = useCallback((saleId: string, rejectorId: string) => {
        // Managers can reject any sale
        if (hasPermission('canManageInventory')) {
            salesMutations.rejectSale.mutate({ id: saleId, rejectorId });
            return;
        }
        // Pour les serveurs, la validation est maintenant déléguée aux Smart Hooks ou se fait à l'aveugle
        // car le contexte n'a plus l'état local pour vérifier les 10 minutes.
        salesMutations.rejectSale.mutate({ id: saleId, rejectorId });
    }, [hasPermission, salesMutations]);



    // --- RETURNS ---
    const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
        console.log('[AppProvider.addReturn] CALLED with:', returnData);

        // ✅ FIX: Allow ALL users to create returns (aligned with SQL migration 20260210000001)
        // RLS policies handle authorization at DB level
        if (!currentBar || !currentSession) {
            console.error('[AppProvider.addReturn] BLOCKED - missing bar or session!');
            return;
        }

        console.log('[AppProvider.addReturn] Validation OK, proceeding to mutation');

        // Note: L'attribution au serveur est maintenant gérée via des métadonnées SQL ou passée explicitement par le composant.
        const deducedServerId = undefined; // Sera géré par la mutation côté serveur ou par le hook appelant.

        console.log('[AppProvider.addReturn] Calling returnsMutations.createReturn.mutate');

        // ✅ NEW: Auto-validate if created by Manager/Admin
        const finalStatus = (currentSession.role === 'promoteur' || currentSession.role === 'gerant')
            ? 'approved'
            : 'pending';

        returnsMutations.createReturn.mutate({
            ...returnData,
            barId: currentBar.id,
            returnedBy: currentSession.userId,
            server_id: deducedServerId || undefined,
            status: finalStatus, // Override the status from the UI
            businessDate: getCurrentBusinessDateString(currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR)
        });
    }, [currentBar, currentSession, returnsMutations]);

    const provideExchange = useCallback(async (returnData: Omit<Return, 'id' | 'barId'>, swapProduct: Product, ticketId?: string) => {
        if (!currentBar || !currentSession) return;

        // 🛡️ CONTRE-EXPERTISE : Génération d'IDs déterministes avant les appels
        // Cela garantit que le lien sourceReturnId est stable même en cas de sync offline différée.
        const returnId = generateUUID();
        const saleIdempotencyKey = generateUUID();

        try {
            // ✨ 1. Créer le retour d'abord
            console.log('[AppProvider.provideExchange] Step 1: Creating return', { returnId });

            const serverId = returnData.serverId;

            const newReturn = await returnsMutations.createReturn.mutateAsync({
                ...returnData,
                id: returnId, // ✅ ID stable injecté
                barId: currentBar.id,
                returnedBy: currentSession.userId,
                server_id: serverId || undefined,
                status: (currentSession.role === 'promoteur' || currentSession.role === 'gerant') ? 'approved' : 'pending',
                businessDate: getCurrentBusinessDateString(currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR)
            });

            // Note: En mode offline, mutateAsync retourne l'objet optimiste avec l'ID fourni.
            const finalReturnId = newReturn?.id || returnId;

            console.log('[AppProvider.provideExchange] Step 2: Creating linked sale for return', finalReturnId);

            // ✨ 2. Créer la vente liée (Magic Swap)
            await salesMutations.createSale.mutateAsync({
                items: [{
                    product_id: swapProduct.id,
                    product_name: swapProduct.name,
                    quantity: returnData.quantityReturned,
                    unit_price: swapProduct.price,
                    total_price: swapProduct.price * returnData.quantityReturned,
                    product_volume: swapProduct.volume || undefined
                }],
                sourceReturnId: finalReturnId, // 🛡️ FIX P2: Magic Swap traçabilité (typage correct, interface Sale L322)
                idempotencyKey: saleIdempotencyKey, // ✅ Clé fixe pour protéger des retries
                serverId: serverId || undefined,
                status: (currentSession.role === 'promoteur' || currentSession.role === 'gerant') ? 'validated' : 'pending',
                paymentMethod: 'cash',
                ticketId: ticketId || undefined, // ✅ Rattachement au bon original si présent
                notes: `Échange Produit (Source: Retour #${finalReturnId.slice(0, 8)})`
            });

            console.log('[AppProvider.provideExchange] Exchange completed successfully');
            toast.success("✨ Échange Produit effectué avec succès !");
        } catch (error) {
            console.error('[AppProvider.provideExchange] CRITICAL FAILURE:', {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                returnId,
                saleIdempotencyKey
            });

            // 🛡️ FIX P1: Rollback best-effort - supprimer le retour orphelin pour éviter stock gonflé
            try {
                console.log('[AppProvider.provideExchange] Attempting rollback: deleting orphan return', returnId);
                await returnsMutations.deleteReturn.mutateAsync(returnId);
                console.log('[AppProvider.provideExchange] Rollback successful');
            } catch (rollbackError) {
                console.error('[AppProvider.provideExchange] Rollback failed (non-blocking):', rollbackError);
                // Non-bloquant : on log mais on ne re-throw pas
            }

            throw error;
        }
    }, [currentBar, currentSession, returnsMutations, salesMutations]);

    const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
        console.log('[AppProvider.updateReturn] CALLED for:', returnId, 'with:', updates);

        // ✅ FIX: Allow if Manager/Promoteur OR if they have the permission
        const canUpdate = hasPermission('canManageInventory') ||
            currentSession?.role === 'gerant' ||
            currentSession?.role === 'promoteur';

        if (!canUpdate || !currentBar || !currentSession) {
            console.error('[AppProvider.updateReturn] BLOCKED by permission check!', {
                canUpdate,
                role: currentSession?.role,
                hasPerm: hasPermission('canManageInventory')
            });
            return;
        }

        console.log('[AppProvider.updateReturn] Permission OK, proceeding to mutation');
        returnsMutations.updateReturn.mutate({ id: returnId, updates });
    }, [hasPermission, currentBar, currentSession, returnsMutations]);

    const deleteReturn = useCallback((returnId: string) => {
        console.log('[AppProvider.deleteReturn] CALLED for:', returnId);

        const canDelete = hasPermission('canManageInventory') ||
            currentSession?.role === 'gerant' ||
            currentSession?.role === 'promoteur';

        if (!canDelete || !currentBar || !currentSession) {
            console.error('[AppProvider.deleteReturn] BLOCKED by permission check!', {
                canDelete,
                role: currentSession?.role,
                hasPerm: hasPermission('canManageInventory')
            });
            return;
        }

        console.log('[AppProvider.deleteReturn] Permission OK, proceeding to mutation');
        returnsMutations.deleteReturn.mutate(returnId);
    }, [hasPermission, currentBar, currentSession, returnsMutations]);

    // Les getters basés sur les tableaux locaux sont supprimés car les Smart Hooks gèrent le filtrage.
    // addReturn, deleteReturn, etc. sont conservés car ce sont des actions.

    // --- EXPENSES ---
    const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => {
        if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;
        expensesMutations.createExpense.mutate({
            ...expenseData,
            barId: currentBar.id,
            createdBy: currentSession.userId
        });
    }, [hasPermission, currentBar, currentSession, expensesMutations]);

    const deleteExpense = useCallback((expenseId: string) => {
        if (!hasPermission('canManageInventory')) return;
        expensesMutations.deleteExpense.mutate(expenseId);
    }, [hasPermission, expensesMutations]);

    const addCustomExpenseCategory = useCallback((name: string, icon: string) => {
        if (!hasPermission('canManageInventory') || !currentBar) return;
        expensesMutations.createCustomCategory.mutate({ name, icon });
    }, [hasPermission, currentBar, expensesMutations]);


    // --- SETTINGS ---
    const updateSettings = useCallback((updates: Partial<AppSettings>) => {
        // TODO: Implement settings mutation
    }, []);

    const value: AppContextType = useMemo(() => ({
        settings, users,
        customExpenseCategories,
        cart, addToCart, updateCartQuantity, removeFromCart, clearCart,
        addCategory,
        linkCategory,
        addCategories, updateCategory, deleteCategory,
        addSale, validateSale, rejectSale,
        addReturn, updateReturn, deleteReturn, provideExchange,
        addExpense, deleteExpense, addCustomExpenseCategory,
        updateSettings,
    }), [
        settings, users,
        customExpenseCategories,
        cart, addToCart, updateCartQuantity, removeFromCart, clearCart,
        addCategory,
        linkCategory,
        addCategories, updateCategory, deleteCategory,
        addSale, validateSale, rejectSale,
        // getSalesByDate, getTodaySales, getTodayTotal, // These were not in the original dependencies, and the instruction was to remove references, not add them. Keeping original.
        // getServerRevenue, getServerReturns, // These were not in the original dependencies. Keeping original.
        addReturn, updateReturn, deleteReturn, provideExchange,
        addExpense, deleteExpense, addCustomExpenseCategory,
        // updateExpense, // This was in the provided edit but not in the original code, and no instruction to add it. Keeping original.
        // addSalary, updateSalary, deleteSalary, // This line was in the provided edit but not in the original code, and no instruction to add it. Keeping original.
        updateSettings,
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
