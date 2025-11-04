// useDataStore.ts - Hook React pour utiliser DataStore
// Remplace useLocalStorage avec une API identique

import { useState, useEffect, useCallback, useRef } from 'react';
import { dataStore } from '../services/DataStore';

/**
 * Hook pour accéder au DataStore (localStorage actuellement, Supabase futur)
 * API identique à useLocalStorage pour faciliter la migration
 *
 * @param key - Clé de stockage (ex: 'products-v3')
 * @param initialValue - Valeur par défaut si la clé n'existe pas
 * @returns [valeur, setValue] - Tuple identique à useState
 *
 * @example
 * const [products, setProducts] = useDataStore<Product[]>('products-v3', []);
 */
export function useDataStore<T>(key: string, initialValue: T) {
  // État local React
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = dataStore.get<T>(key);
    return item !== null ? item : initialValue;
  });

  // ✅ FIX CRITIQUE: Utiliser ref pour éviter closure stale dans updates rapides (import batch)
  // Sans cela, les appels rapides à setValue() en boucle utilisent l'ancienne valeur
  const storedValueRef = useRef(storedValue);

  // Mettre à jour la ref à chaque changement
  useEffect(() => {
    storedValueRef.current = storedValue;
  }, [storedValue]);

  // Fonction de mise à jour (compatible useState)
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      // ✅ FIX: Utiliser ref.current au lieu de closure pour avoir TOUJOURS la valeur la plus récente
      // Cela garantit que les callbacks (prev => [...prev, item]) utilisent la bonne valeur
      const valueToStore = value instanceof Function ? value(storedValueRef.current) : value;

      // Sauvegarder dans le store
      dataStore.set(key, valueToStore);

      // Mettre à jour l'état local
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`[useDataStore] Error setting key "${key}":`, error);
    }
  }, [key]);

  // S'abonner aux changements (multi-composants / multi-onglets)
  useEffect(() => {
    const unsubscribe = dataStore.subscribe<T>(key, (newValue) => {
      if (newValue !== null) {
        // Utiliser queueMicrotask pour éviter setState pendant render
        queueMicrotask(() => {
          setStoredValue(newValue);
        });
      }
    });

    return unsubscribe;
  }, [key]);

  return [storedValue, setValue] as const;
}

/**
 * Hook pour lire une valeur du DataStore sans s'abonner aux changements
 * Utile pour des lectures ponctuelles sans re-render
 *
 * @example
 * const products = useDataStoreRead<Product[]>('products-v3', []);
 */
export function useDataStoreRead<T>(key: string, defaultValue: T): T {
  const value = dataStore.get<T>(key);
  return value !== null ? value : defaultValue;
}
