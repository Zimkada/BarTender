import { useState, useEffect, useCallback } from 'react';
import type { InitialBalance } from '../types';

const STORAGE_KEY_PREFIX = 'initial_balance_'; // ⚠️ Changé de 'initial_balances_' à 'initial_balance_' (singulier)

export function useInitialBalance(barId?: string) {
  const [initialBalance, setInitialBalance] = useState<InitialBalance | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const balance: InitialBalance = {
          ...parsed,
          date: new Date(parsed.date),
          createdAt: new Date(parsed.createdAt),
        };
        setInitialBalance(balance);
      }
    } catch (error) {
      console.error('❌ Erreur chargement solde initial:', error);
    }
  }, [barId]);

  // Save to localStorage
  const saveToStorage = useCallback((balance: InitialBalance | null) => {
    if (!barId) return;

    try {
      const key = `${STORAGE_KEY_PREFIX}${barId}`;
      if (balance) {
        localStorage.setItem(key, JSON.stringify(balance));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde solde initial:', error);
    }
  }, [barId]);

  // Create initial balance (only if none exists)
  const createInitialBalance = useCallback((balanceData: Omit<InitialBalance, 'id' | 'createdAt' | 'isLocked'>) => {
    if (initialBalance) {
      throw new Error('Un solde initial existe déjà pour ce bar. Supprimez-le d\'abord pour en créer un nouveau.');
    }

    const newBalance: InitialBalance = {
      ...balanceData,
      id: `init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      isLocked: false,
    };

    setInitialBalance(newBalance);
    saveToStorage(newBalance);

    return newBalance;
  }, [initialBalance, saveToStorage]);

  // Update initial balance (only if not locked)
  const updateInitialBalance = useCallback((updates: Partial<Omit<InitialBalance, 'id' | 'barId' | 'createdAt' | 'createdBy'>>) => {
    if (!initialBalance) {
      throw new Error('Aucun solde initial à modifier.');
    }

    if (initialBalance.isLocked) {
      throw new Error('Le solde initial est verrouillé car des transactions postérieures existent. Suppression impossible.');
    }

    const updated: InitialBalance = {
      ...initialBalance,
      ...updates,
    };

    setInitialBalance(updated);
    saveToStorage(updated);

    return updated;
  }, [initialBalance, saveToStorage]);

  // Delete initial balance (only if not locked)
  const deleteInitialBalance = useCallback(() => {
    if (!initialBalance) return;

    if (initialBalance.isLocked) {
      throw new Error('Le solde initial est verrouillé car des transactions postérieures existent. Suppression impossible.');
    }

    setInitialBalance(null);
    saveToStorage(null);
  }, [initialBalance, saveToStorage]);

  // Lock initial balance (prevent modifications)
  const lockInitialBalance = useCallback(() => {
    if (!initialBalance) return;

    const locked: InitialBalance = {
      ...initialBalance,
      isLocked: true,
    };

    setInitialBalance(locked);
    saveToStorage(locked);
  }, [initialBalance, saveToStorage]);

  // Get initial balance amount (0 if none)
  const getInitialBalanceAmount = useCallback(() => {
    return initialBalance?.amount || 0;
  }, [initialBalance]);

  // Check if initial balance exists
  const hasInitialBalance = useCallback(() => {
    return initialBalance !== null;
  }, [initialBalance]);

  return {
    initialBalance,
    createInitialBalance,
    updateInitialBalance,
    deleteInitialBalance,
    lockInitialBalance,
    getInitialBalanceAmount,
    hasInitialBalance,
  };
}
