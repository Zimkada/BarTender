import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { salesKeys } from '../hooks/queries/useSalesQueries';
import { returnKeys } from '../hooks/queries/useReturnsQueries';
import { expenseKeys } from '../hooks/queries/useExpensesQueries';
import { ticketKeys } from '../hooks/queries/useTickets';
import { analyticsKeys } from '../hooks/queries/useAnalyticsQueries';

/**
 * Bouton de rafraîchissement manuel
 * Invalide uniquement les queries métier utiles pour forcer un refetch
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      // Rafraîchir uniquement les données métier actives.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all, refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stock', 'products'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stock', 'supplies'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stock', 'consignments'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: returnKeys.all, refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: [...expenseKeys.all, 'list'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ticketKeys.all, refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: analyticsKeys.all, refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['dailySummary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['topProducts'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['barMembers'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stale-pending-sales'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['server-pending-sales-for-stock'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stock-adjustments'], refetchType: 'active' }),
      ]);

      // Feedback visuel court
      setTimeout(() => setIsRefreshing(false), 1000);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement:', error);
      setIsRefreshing(false);
    }
  };

  return (
    <motion.button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="flex items-center justify-center p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50"
      whileTap={{ scale: 0.9 }}
      title="Actualiser les données"
    >
      <RefreshCw
        size={18}
        className={isRefreshing ? 'animate-spin' : ''}
      />
    </motion.button>
  );
}
