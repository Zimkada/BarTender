/**
 * useUnifiedExpenses.ts - Smart Hook (Mission Elite)
 * Unifie les dépenses, les salaires et les approvisionnements (supplies).
 * Gère la fusion Online (React Query) + Offline (IndexedDB).
 */

import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useExpenses, useCustomExpenseCategories } from '../queries/useExpensesQueries';
import { useSupplies } from '../queries/useStockQueries';
import { useSalaries } from '../useSalaries';
import { offlineQueue } from '../../services/offlineQueue';
import { ExpenseCategory } from '../../types';

export interface UnifiedExpense {
    id: string;
    amount: number;
    date: Date;
    category: ExpenseCategory | 'supply' | string;
    customCategoryId?: string;
    notes?: string;
    isSupply: boolean;
    isOptimistic: boolean;
    productName?: string;
    quantity?: number;
    createdBy: string;
    beneficiary?: string;
}

/**
 * Hook Central pour la Gestion Unifiée des Flux Sortants
 * Combine Expenses, Supplies, et Salaries (Online + Offline)
 */
export function useUnifiedExpenses(barId: string | undefined) {

    // 1. Online Data
    const { data: onlineExpenses = [] } = useExpenses(barId);
    const { data: onlineSupplies = [] } = useSupplies(barId);
    const { data: customCategories = [] } = useCustomExpenseCategories(barId);
    const { salaries: onlineSalaries = [] } = useSalaries(barId || '');

    // 2. Offline Data (Operations en attente)
    const { data: offlineOps = [], refetch: refetchOffline } = useQuery({
        queryKey: ['offline-expenses-list', barId],
        networkMode: 'always',
        queryFn: async () => {
            if (!barId) return [];
            const ops = await offlineQueue.getOperations({
                status: 'pending'
            });

            // On ne prend que ce qui impacte les finances
            return ops.filter(op =>
                op.type === 'ADD_EXPENSE' ||
                op.type === 'ADD_SALARY' ||
                op.type === 'ADD_SUPPLY'
            );
        },
        enabled: !!barId
    });

    // 3. Sync Listeners
    useEffect(() => {
        const handleSync = (e: any) => {
            // Si c'est notre bar ou global
            if (!e.detail?.barId || e.detail.barId === barId) {
                refetchOffline();
            }
        };

        window.addEventListener('expenses-synced', handleSync);
        window.addEventListener('stock-synced', handleSync);
        window.addEventListener('sync-completed', handleSync);

        return () => {
            window.removeEventListener('expenses-synced', handleSync);
            window.removeEventListener('stock-synced', handleSync);
            window.removeEventListener('sync-completed', handleSync);
        };
    }, [barId, refetchOffline]);

    /**
     * 🔴 Hash-Based Memoization (Mission Elite)
     * Stabilise la référence via un hash du contenu réel
     */
    const expensesHash = useMemo(() => {
        return JSON.stringify({
            ex: onlineExpenses.map(e => `${e.id}-${e.amount}`),
            sup: onlineSupplies.map(s => `${s.id}-${s.totalCost}`),
            sal: onlineSalaries.map(s => `${s.id}-${s.amount}`),
            off: offlineOps.map(op => op.id),
        });
    }, [onlineExpenses, onlineSupplies, onlineSalaries, offlineOps]);

    /**
     * Fusion & Transformation
     */
    const unifiedExpenses = useMemo(() => {
        // Transform Online Expenses
        const mappedExpenses: UnifiedExpense[] = onlineExpenses.map(e => ({
            id: e.id,
            amount: e.amount,
            date: e.date,
            category: e.category,
            customCategoryId: e.customCategoryId,
            notes: e.description,
            isSupply: false,
            isOptimistic: false,
            createdBy: e.createdBy
        }));

        // Transform Online Supplies
        const mappedSupplies: UnifiedExpense[] = onlineSupplies.map(s => ({
            id: s.id,
            amount: s.totalCost,
            date: new Date(s.date),
            category: 'supply',
            notes: `${s.productName} (${s.quantity} unités)`,
            isSupply: true,
            isOptimistic: false,
            productName: s.productName,
            quantity: s.quantity,
            createdBy: s.createdBy
        }));

        // Transform Online Salaries
        const mappedSalaries: UnifiedExpense[] = onlineSalaries.map(s => ({
            id: s.id,
            amount: s.amount,
            date: new Date(s.paidAt),
            category: 'salary',
            notes: `Salaire : ${s.period}`,
            isSupply: false,
            isOptimistic: false,
            createdBy: s.createdBy,
            beneficiary: s.memberName || s.staffName
        }));

        // Transform Offline Ops
        const mappedOffline: UnifiedExpense[] = offlineOps.map(op => {
            const payload = op.payload as any;
            const isSupply = op.type === 'ADD_SUPPLY';
            const isSalary = op.type === 'ADD_SALARY';

            return {
                id: op.id,
                amount: isSupply ? (payload.lotPrice * payload.lotSize) : payload.amount,
                date: new Date(op.timestamp),
                category: isSupply ? 'supply' : (isSalary ? 'salary' : payload.category),
                customCategoryId: payload.customCategoryId,
                notes: isSupply ? `${payload.productName} (Offline)` : (isSalary ? `Salaire (Offline)` : payload.notes),
                isSupply,
                isOptimistic: true,
                productName: isSupply ? payload.productName : undefined,
                quantity: isSupply ? payload.quantity : undefined,
                createdBy: payload.createdBy
            };
        });

        const combined = [...mappedOffline, ...mappedExpenses, ...mappedSupplies, ...mappedSalaries];

        // Tri par date décroissante
        return combined.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [expensesHash]);

    return {
        expenses: unifiedExpenses,
        customCategories,
        isLoading: false // Simplified for now
    };
}
