import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';

// Event dispatcher pour synchroniser entre composants
const createStorageEventDispatcher = () => {
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: () => {
      listeners.forEach(listener => listener());
    }
  };
};

const storageEventDispatcher = createStorageEventDispatcher();

export function useLocalStorage<T>(key: string, initialValue: T, schema?: z.ZodType<T>) {
  // État local
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;

      const parsed = JSON.parse(item);
      if (schema) {
        return schema.parse(parsed);
      }
      return parsed as T;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Fonction de mise à jour avec dispatch
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue(currentValue => {
        const valueToStore = value instanceof Function ? value(currentValue) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));

        // Notifier tous les autres composants
        storageEventDispatcher.dispatch();

        return valueToStore;
      });
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  // Écouter les changements depuis d'autres composants
  useEffect(() => {
    const unsubscribe: () => void = storageEventDispatcher.subscribe(() => {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          const newValue = schema ? schema.parse(parsed) : parsed;
          // Utiliser queueMicrotask pour éviter setState pendant render
          queueMicrotask(() => {
            setStoredValue(newValue);
          });
        }
      } catch (error) {
        console.error(`Error syncing localStorage key "${key}":`, error);
      }
    });

    return unsubscribe;
  }, [key]);

  return [storedValue, setValue] as const;
}