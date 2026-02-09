import React, { useCallback, useEffect, useState } from 'react';
import { useBarContext } from '../context/BarContext';
import { useCacheWarming } from '../hooks/useViewMonitoring';
import { useAuth } from '../context/AuthContext';
import { useStock } from '../context/hooks/useStock';
import { useStockManagement } from '../hooks/useStockManagement';
import { useNotifications } from '../components/Notifications';
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
} from '../types';
import { filterByBusinessDateRange, getCurrentBusinessDateString, dateToYYYYMMDD } from '../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../constants/businessDay';

// React Query Hooks
import { useCategories } from '../hooks/queries/useStockQueries';
import { useSales } from '../hooks/queries/useSalesQueries';
import { useExpenses, useCustomExpenseCategories } from '../hooks/queries/useExpensesQueries';
import { useReturns } from '../hooks/queries/useReturnsQueries';
import { useBarMembers } from '../hooks/queries/useBarMembers';

import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useExpensesMutations } from '../hooks/mutations/useExpensesMutations';
import { useReturnsMutations } from '../hooks/mutations/useReturnsMutations';
import { useCategoryMutations } from '../hooks/mutations/useCategoryMutations';

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


    // React Query: Fetch data
    const { data: categories = [] } = useCategories(barId);
    const { products: allProducts, supplies: allSupplies } = useStock(); // From StockContext
    const { data: sales = [] } = useSales(barId);
    // 🚀 FIX: Désactiver polling pour returns/barMembers dans AppProvider (data synced via Broadcast+Realtime+Manual refresh)
    const { data: returns = [] } = useReturns(barId, { refetchInterval: false });
    const { data: expenses = [] } = useExpenses(barId);
    const { data: customExpenseCategories = [] } = useCustomExpenseCategories(barId);

    // React Query: Mutations
    const salesMutations = useSalesMutations(barId);
    const expensesMutations = useExpensesMutations(barId);
    const returnsMutations = useReturnsMutations(barId);
    const categoryMutations = useCategoryMutations(barId);
    const { allProductsStockInfo } = useStockManagement();

    // Notifications - MUST be declared before use in useEffect
    // Notifications - MUST be declared before use in useEffect
    const { showNotification } = useNotifications();

    // Bar Members
    // 🚀 FIX: Désactiver polling (data synced via mutations + manual refresh)
    const { data: barMembers = [] } = useBarMembers(barId, { refetchInterval: false });

    const settings = defaultSettings;
    const users: User[] = useMemo(() => barMembers.map(member => ({
        id: member.user.id,
        username: member.user.username,
        name: member.user.name,
        email: member.user.email,
        phone: member.user.phone,
        role: member.role,
        isActive: member.isActive,
        firstLogin: member.user.firstLogin,
        lastLoginAt: member.user.lastLoginAt,
        createdAt: member.user.createdAt,
        createdBy: member.user.createdBy,
        avatarUrl: member.user.avatarUrl,
    })), [barMembers]);

    // --- CART STATE & LOGIC ---
    const [cart, setCart] = useState<CartItem[]>([]);

    // 🧹 Fix: Vider le panier quand on change de bar pour éviter les mélanges
    useEffect(() => {
        setCart([]);
    }, [currentBar?.id]);

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
    }, [isSimplifiedMode, currentSession?.role]);

    const updateCartQuantity = useCallback((productId: string, quantity: number) => {
        setCart(currentCart => {
            if (quantity === 0) {
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
    // --- END CART STATE & LOGIC ---

    // Filtrage automatique (déjà fait par les hooks qui prennent barId)
    const products = allProducts; // Déjà filtré par StockContext/useStockQueries
    const supplies = allSupplies;

    const initializeBarData = useCallback(() => {
        // Plus nécessaire avec React Query qui fetch automatiquement
    }, []);

    // --- CATEGORIES ---
    const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
        return categoryMutations.createCategory.mutateAsync({
            name: category.name,
            color: category.color,
        }).then((data) => {
            showNotification('success', `Catégorie "${category.name}" créée avec succès`, { duration: 3000 });
            return data;
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
        // Créer les catégories une par une
        return Promise.all(
            categories.map(cat =>
                categoryMutations.createCategory.mutateAsync({
                    name: cat.name,
                    color: cat.color,
                })
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
    const getProductsByCategory = useCallback((categoryId: string) => products.filter(p => p.categoryId === categoryId), [products]);
    const getLowStockProducts = useCallback(() => {
        return products.filter(p => {
            const stockInfo = allProductsStockInfo[p.id];
            const stockToCompare = stockInfo ? stockInfo.availableStock : p.stock;
            return stockToCompare <= p.alertThreshold;
        });
    }, [products, allProductsStockInfo]);
    const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

    // --- SUPPLIES (Read Only) ---
    const getSuppliesByProduct = useCallback((productId: string) => supplies.filter(s => s.productId === productId), [supplies]);
    const getTotalCostByProduct = useCallback((productId: string) => {
        return getSuppliesByProduct(productId).reduce((sum, supply) => sum + supply.totalCost, 0);
    }, [getSuppliesByProduct]);
    const getAverageCostPerUnit = useCallback((productId: string) => {
        const productSupplies = getSuppliesByProduct(productId);
        const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
        const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
        return totalQuantity > 0 ? totalCost / totalQuantity : 0;
    }, [getSuppliesByProduct]);

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

        // Servers can only reject their own recent pending sales
        const sale = sales.find(s => s.id === saleId);
        if (!sale || !currentSession) return;

        // Check if sale belongs to current server
        if (sale.soldBy !== currentSession.userId) return;

        // Check if sale is pending
        if (sale.status !== 'pending') return;

        // Check if sale is recent (< 10 minutes)
        const saleCreatedAt = new Date(sale.createdAt);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        if (saleCreatedAt <= tenMinutesAgo) return;

        // All checks passed, allow server to reject their own sale
        salesMutations.rejectSale.mutate({ id: saleId, rejectorId });
    }, [hasPermission, salesMutations, sales, currentSession]);

    const getSalesByDate = useCallback((startDate: Date, endDate: Date, includePending: boolean = false) => {
        const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const startDateStr = dateToYYYYMMDD(startDate);
        const endDateStr = dateToYYYYMMDD(endDate);

        const salesToFilter = includePending
            ? sales.filter(sale => sale.status !== 'rejected') // Si on inclut pending, on exclut juste rejected
            : sales.filter(sale => sale.status === 'validated'); // Sinon, on garde seulement validated

        const filteredSales = filterByBusinessDateRange(salesToFilter, startDateStr, endDateStr, closeHour);

        if (currentSession?.role === 'serveur') {
            // ✨ MODE SWITCHING FIX: A server should see ALL their sales regardless of mode
            // Source of truth: soldBy is the business attribution
            return filteredSales.filter(sale =>
                sale.soldBy === currentSession.userId
            );
        }
        return filteredSales;
    }, [sales, currentSession, currentBar]);

    const getTodaySales = useCallback((includePending: boolean = false) => {
        const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const todayStr = getCurrentBusinessDateString(closeHour);

        const salesToFilter = includePending
            ? sales.filter(sale => sale.status !== 'rejected')
            : sales.filter(sale => sale.status === 'validated');

        const todaySales = filterByBusinessDateRange(salesToFilter, todayStr, todayStr, closeHour);


        if (currentSession?.role === 'serveur') {
            // Source of truth: soldBy is the business attribution
            const filtered = todaySales.filter(sale =>
                sale.soldBy === currentSession.userId
            );


            return filtered;
        }
        return todaySales;
    }, [sales, currentSession, currentBar]);

    /**
     * @deprecated Utiliser useRevenueStats() à la place pour garantir la cohérence DRY (SQL/Local)
     */
    const getTodayTotal = useCallback(() => {
        const todaySales = getTodaySales();
        const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);

        const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const todayStr = getCurrentBusinessDateString(closeHour);

        const todayRefunds = filterByBusinessDateRange(
            returns.filter(r => r.isRefunded),
            todayStr,
            todayStr,
            closeHour
        );

        const returnsTotal = todayRefunds.reduce((sum, r) => sum + r.refundAmount, 0);

        return salesTotal - returnsTotal;
    }, [getTodaySales, returns, currentBar]);

    const getSalesByUser = useCallback((userId: string) => {
        if (!hasPermission('canViewAllSales')) return [];
        return sales.filter(sale => sale.status === 'validated' && sale.soldBy === userId);
    }, [sales, hasPermission]);

    const getServerRevenue = useCallback((userId: string, startDate?: Date, endDate?: Date): number => {
        const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const startDateStr = startDate ? dateToYYYYMMDD(startDate) : undefined;
        const endDateStr = endDate ? dateToYYYYMMDD(endDate) : undefined;

        // Source of truth: soldBy is the business attribution
        let baseSales = sales.filter(sale =>
            sale.status === 'validated' && sale.soldBy === userId
        );
        if (startDateStr && endDateStr) {
            baseSales = filterByBusinessDateRange(baseSales, startDateStr, endDateStr, closeHour);
        }
        const salesTotal = baseSales.reduce((sum, s) => sum + s.total, 0);
        const serverSaleIds = new Set(baseSales.map(s => s.id));

        let baseReturns = returns.filter(r => r.isRefunded);
        if (startDateStr && endDateStr) {
            baseReturns = filterByBusinessDateRange(baseReturns, startDateStr, endDateStr, closeHour);
        }

        const serverReturns = baseReturns.filter(r => serverSaleIds.has(r.saleId));

        const returnsTotal = serverReturns.reduce((sum, r) => sum + r.refundAmount, 0);
        return salesTotal - returnsTotal;
    }, [sales, returns, currentBar]);

    const getServerReturns = useCallback((userId: string): Return[] => {
        // Source of truth: soldBy is the business attribution
        const serverSaleIds = sales
            .filter(s => s.soldBy === userId && s.status === 'validated')
            .map(s => s.id);
        return returns.filter(r => serverSaleIds.includes(r.saleId));
    }, [sales, returns]);


    // --- RETURNS ---
    const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
        if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;

        // Source of truth: soldBy is the business attribution
        const associatedSale = sales.find(s => s.id === returnData.saleId);
        let deducedServerId: string | undefined;

        if (associatedSale) {
            // Use soldBy as the source of truth for server attribution
            deducedServerId = associatedSale.soldBy;
        }

        returnsMutations.createReturn.mutate({
            ...returnData,
            barId: currentBar.id,
            returnedBy: currentSession.userId,
            server_id: deducedServerId || undefined
        });
    }, [hasPermission, currentBar, currentSession, returnsMutations, sales]);

    const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
        if (!hasPermission('canManageInventory')) return;
        returnsMutations.updateReturn.mutate({ id: returnId, updates });
    }, [hasPermission, returnsMutations]);

    const deleteReturn = useCallback((returnId: string) => {
        if (!hasPermission('canManageInventory')) return;
        returnsMutations.deleteReturn.mutate(returnId);
    }, [hasPermission, returnsMutations]);

    const getReturnsBySale = useCallback((saleId: string) => returns.filter(r => r.saleId === saleId), [returns]);
    const getPendingReturns = useCallback(() => returns.filter(r => r.status === 'pending'), [returns]);

    const getTodayReturns = useCallback(() => {
        const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const todayStr = getCurrentBusinessDateString(closeHour);

        const todayReturnsList = filterByBusinessDateRange(returns, todayStr, todayStr, closeHour);

        if (currentSession?.role === 'serveur') {
            // ✨ MODE SWITCHING FIX: A server should see ALL their returns regardless of mode
            // Check BOTH serverId (simplified mode) AND returnedBy (full mode)
            // Source of truth: returnedBy is who created the return, serverId is the server
            return todayReturnsList.filter(r =>
                r.returnedBy === currentSession.userId || r.serverId === currentSession.userId
            );
        }
        return todayReturnsList;
    }, [returns, currentSession, currentBar]);


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
        categories, products, supplies, sales, returns, settings, users,
        expenses, customExpenseCategories,
        cart, addToCart, updateCartQuantity, removeFromCart, clearCart,
        addCategory,
        linkCategory,
        addCategories, updateCategory, deleteCategory,
        getProductsByCategory, getLowStockProducts, getProductById,
        getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,
        addSale, validateSale, rejectSale,
        getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
        getServerRevenue, getServerReturns,
        addReturn, updateReturn, deleteReturn, getReturnsBySale, getPendingReturns, getTodayReturns,
        addExpense, deleteExpense, addCustomExpenseCategory,
        updateSettings,
        initializeBarData,
    }), [
        categories, products, supplies, sales, returns, settings, users,
        expenses, customExpenseCategories,
        cart, addToCart, updateCartQuantity, removeFromCart, clearCart,
        addCategory, linkCategory, addCategories, updateCategory, deleteCategory,
        getProductsByCategory, getLowStockProducts, getProductById,
        getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,
        addSale, validateSale, rejectSale,
        getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
        getServerRevenue, getServerReturns,
        addReturn, updateReturn, deleteReturn, getReturnsBySale, getPendingReturns, getTodayReturns,
        addExpense, deleteExpense, addCustomExpenseCategory,
        updateSettings, initializeBarData
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
