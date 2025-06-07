import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// Hook pour synchroniser les données en temps réel
export const useRealTimeSync = () => {
  const context = useAppContext();

  useEffect(() => {
    // Simuler une vérification périodique (en attendant Supabase)
    const interval = setInterval(() => {
      // Force la re-lecture depuis localStorage
      window.dispatchEvent(new Event('storage'));
    }, 1000); // Vérifie toutes les secondes

    return () => clearInterval(interval);
  }, []);

  return context;
};