import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';

/**
 * Bouton de rafraîchissement manuel
 * Invalide toutes les queries React Query pour forcer un refetch
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      // Invalider toutes les queries pour forcer un refetch
      await queryClient.invalidateQueries();

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
