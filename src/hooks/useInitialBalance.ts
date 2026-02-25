import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { InitialBalance } from '../types';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errorHandler';

export function useInitialBalance(barId?: string) {
  const [initialBalance, setInitialBalance] = useState<InitialBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentSession } = useAuth();

  // Load from Supabase
  useEffect(() => {
    if (!barId) {
      setLoading(false);
      return;
    }

    const fetchInitialBalance = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('initial_balances')
          .select('*')
          .eq('bar_id', barId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
          console.error('❌ Erreur chargement solde initial:', error);
          return;
        }

        if (data) {
          const balance: InitialBalance = {
            id: data.id,
            barId: data.bar_id,
            amount: Number(data.amount),
            date: new Date(data.date),
            description: data.description || undefined,
            createdBy: data.created_by,
            createdAt: new Date(data.created_at),
            isLocked: data.is_locked,
          };
          setInitialBalance(balance);
        }
      } catch (error) {
        console.error('❌ Erreur chargement solde initial:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialBalance();
  }, [barId]);

  // Create initial balance (only if none exists)
  const createInitialBalance = useCallback(
    async (balanceData: Omit<InitialBalance, 'id' | 'createdAt' | 'isLocked'>) => {
      if (!barId || !currentSession) {
        throw new Error('Bar ID or session missing');
      }

      if (initialBalance) {
        throw new Error('Un solde initial existe déjà pour ce bar. Supprimez-le d\'abord pour en créer un nouveau.');
      }

      try {
        const { data, error } = await supabase
          .from('initial_balances')
          .insert([
            {
              bar_id: barId,
              amount: balanceData.amount,
              date: balanceData.date.toISOString().split('T')[0],
              description: balanceData.description,
              created_by: currentSession.userId,
            },
          ])
          .select()
          .single();

        if (error) {
          throw new Error(getErrorMessage(error));
        }

        if (data) {
          const newBalance: InitialBalance = {
            id: data.id,
            barId: data.bar_id,
            amount: Number(data.amount),
            date: new Date(data.date),
            description: data.description || undefined,
            createdBy: data.created_by,
            createdAt: new Date(data.created_at),
            isLocked: data.is_locked,
          };
          setInitialBalance(newBalance);
          return newBalance;
        }
      } catch (error) {
        console.error('❌ Erreur création solde initial:', error);
        throw error;
      }
    },
    [barId, currentSession, initialBalance]
  );

  // Update initial balance (only if not locked)
  const updateInitialBalance = useCallback(
    async (updates: Partial<Omit<InitialBalance, 'id' | 'barId' | 'createdAt' | 'createdBy'>>) => {
      if (!initialBalance) {
        throw new Error('Aucun solde initial à modifier.');
      }

      if (initialBalance.isLocked) {
        throw new Error('Le solde initial est verrouillé car des transactions postérieures existent. Modification impossible.');
      }

      try {
        const updateData: any = {};
        if (updates.amount !== undefined) updateData.amount = updates.amount;
        if (updates.date !== undefined) updateData.date = updates.date.toISOString().split('T')[0];
        if (updates.description !== undefined) updateData.description = updates.description;

        const { data, error } = await supabase
          .from('initial_balances')
          .update(updateData)
          .eq('id', initialBalance.id)
          .select()
          .single();

        if (error) {
          throw new Error(getErrorMessage(error));
        }

        if (data) {
          const updated: InitialBalance = {
            id: data.id,
            barId: data.bar_id,
            amount: Number(data.amount),
            date: new Date(data.date),
            description: data.description || undefined,
            createdBy: data.created_by,
            createdAt: new Date(data.created_at),
            isLocked: data.is_locked,
          };
          setInitialBalance(updated);
          return updated;
        }
      } catch (error) {
        console.error('❌ Erreur modification solde initial:', error);
        throw error;
      }
    },
    [initialBalance]
  );

  // Delete initial balance (only if not locked)
  const deleteInitialBalance = useCallback(async () => {
    if (!initialBalance) return;

    if (initialBalance.isLocked) {
      throw new Error('Le solde initial est verrouillé car des transactions postérieures existent. Suppression impossible.');
    }

    try {
      const { error } = await supabase
        .from('initial_balances')
        .delete()
        .eq('id', initialBalance.id);

      if (error) {
        throw new Error(getErrorMessage(error));
      }

      setInitialBalance(null);
    } catch (error) {
      console.error('❌ Erreur suppression solde initial:', error);
      throw error;
    }
  }, [initialBalance]);

  // Lock initial balance (prevent modifications)
  const lockInitialBalance = useCallback(async () => {
    if (!initialBalance) return;

    try {
      const { data, error } = await supabase
        .from('initial_balances')
        .update({ is_locked: true })
        .eq('id', initialBalance.id)
        .select()
        .single();

      if (error) {
        throw new Error(getErrorMessage(error));
      }

      if (data) {
        const locked: InitialBalance = {
          id: data.id,
          barId: data.bar_id,
          amount: Number(data.amount),
          date: new Date(data.date),
          description: data.description || undefined,
          createdBy: data.created_by,
          createdAt: new Date(data.created_at),
          isLocked: data.is_locked,
        };
        setInitialBalance(locked);
      }
    } catch (error) {
      console.error('❌ Erreur verrouillage solde initial:', error);
      throw error;
    }
  }, [initialBalance]);

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
    loading,
    createInitialBalance,
    updateInitialBalance,
    deleteInitialBalance,
    lockInitialBalance,
    getInitialBalanceAmount,
    hasInitialBalance,
  };
}
