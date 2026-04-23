import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useBarContext } from '../context/BarContext';
import { salesKeys } from '../hooks/queries/useSalesQueries';
import { statsKeys } from '../hooks/queries/useStatsQueries';
import { stockKeys } from '../hooks/queries/useStockQueries';
import { returnKeys } from '../hooks/queries/useReturnsQueries';
import { expenseKeys } from '../hooks/queries/useExpensesQueries';
import { ticketKeys } from '../hooks/queries/useTickets';
import { analyticsKeys } from '../hooks/queries/useAnalyticsQueries';
import { topProductsKeys } from '../hooks/queries/useTopProductsQuery';
import { barMembersKeys } from '../hooks/queries/useBarMembers';

/**
 * Bouton de rafraîchissement manuel
 * Invalide uniquement les queries métier actives, scopées par barId
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    const barId = currentBar?.id;
    if (!barId) return;

    setIsRefreshing(true);
    try {
      // Rafraîchir uniquement les données métier actives, scopées par barId
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.list(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: salesKeys.stats(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: statsKeys.all(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: stockKeys.products(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: stockKeys.supplies(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: returnKeys.list(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ticketKeys.open(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ predicate: analyticsKeys.barPredicate(barId) }),
        queryClient.invalidateQueries({ queryKey: topProductsKeys.all(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: barMembersKeys.list(barId), refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stale-pending-sales', barId], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['server-pending-sales-for-stock', barId], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['stock-adjustments', barId], refetchType: 'active' }),
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
