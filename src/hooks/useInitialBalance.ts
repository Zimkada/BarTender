import { useState, useEffect, useCallback } from 'react';
import type { InitialBalance } from '../types';

const STORAGE_KEY_PREFIX = 'initial_balances_';

export function useInitialBalance(barId?: string) {
  const [initialBalances, setInitialBalances] = useState<InitialBalance[]>([]);

  // Load from localStorage
  useEffect(() => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const balances = parsed.map((bal: any) => ({
          ...bal,
          date: new Date(bal.date),
          createdAt: new Date(bal.createdAt),
        }));
        setInitialBalances(balances);
      }
    } catch (error) {
      console.error('❌ Erreur chargement soldes initiaux:', error);
    }
  }, [barId]);

  // Save to localStorage
  const saveToStorage = useCallback((balances: InitialBalance[]) => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      localStorage.setItem(key, JSON.stringify(balances));
    } catch (error) {
      console.error('❌ Erreur sauvegarde soldes initiaux:', error);
    }
  }, [barId]);

  // Add new initial balance
  const addInitialBalance = useCallback((balance: Omit<InitialBalance, 'id' | 'createdAt'>) => {
    const newBalance: InitialBalance = {
      ...balance,
      id: `init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    const updated = [...initialBalances, newBalance];
    setInitialBalances(updated);
    saveToStorage(updated);

    return newBalance;
  }, [initialBalances, saveToStorage]);

  // Delete initial balance
  const deleteInitialBalance = useCallback((id: string) => {
    const updated = initialBalances.filter(bal => bal.id !== id);
    setInitialBalances(updated);
    saveToStorage(updated);
  }, [initialBalances, saveToStorage]);

  // Get total initial balance before or at a specific date
  const getTotalInitialBalance = useCallback((beforeDate: Date) => {
    return initialBalances
      .filter(bal => new Date(bal.date) <= beforeDate)
      .reduce((sum, bal) => sum + bal.amount, 0);
  }, [initialBalances]);

  // Get the most recent initial balance
  const getLatestInitialBalance = useCallback(() => {
    if (initialBalances.length === 0) return null;

    return initialBalances.reduce((latest, current) => {
      const latestDate = new Date(latest.date);
      const currentDate = new Date(current.date);
      return currentDate > latestDate ? current : latest;
    });
  }, [initialBalances]);

  return {
    initialBalances,
    addInitialBalance,
    deleteInitialBalance,
    getTotalInitialBalance,
    getLatestInitialBalance,
  };
}
