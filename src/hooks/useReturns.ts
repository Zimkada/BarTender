import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { Return, ReturnReason } from '../types';

const STORAGE_KEY = 'bartender_returns';

export function useReturns() {
  const [returns, setReturns] = useLocalStorage<Return[]>(STORAGE_KEY, []);

  const addReturn = useCallback((returnData: Omit<Return, 'id'>) => {
    const newReturn: Return = {
      ...returnData,
      id: `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    setReturns(prev => [newReturn, ...prev]);
    return newReturn;
  }, [setReturns]);

  const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
    setReturns(prev => prev.map(r =>
      r.id === returnId ? { ...r, ...updates } : r
    ));
  }, [setReturns]);

  const deleteReturn = useCallback((returnId: string) => {
    setReturns(prev => prev.filter(r => r.id !== returnId));
  }, [setReturns]);

  const getReturnsBySale = useCallback((saleId: string) => {
    return returns.filter(r => r.saleId === saleId);
  }, [returns]);

  const getReturnsByBar = useCallback((barId: string) => {
    return returns.filter(r => r.barId === barId);
  }, [returns]);

  const getPendingReturns = useCallback((barId: string) => {
    return returns.filter(r => r.barId === barId && r.status === 'pending');
  }, [returns]);

  return {
    returns,
    addReturn,
    updateReturn,
    deleteReturn,
    getReturnsBySale,
    getReturnsByBar,
    getPendingReturns,
  };
}
