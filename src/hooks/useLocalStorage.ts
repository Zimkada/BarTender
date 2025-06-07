import { useState, useEffect, useCallback } from 'react';

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

export function useLocalStorage<T>(key: string, initialValue: T) {
  // État local
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Fonction de mise à jour avec dispatch
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      
      // Notifier tous les autres composants
      storageEventDispatcher.dispatch();
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // Écouter les changements depuis d'autres composants
  useEffect(() => {
    const unsubscribe: () => void = storageEventDispatcher.subscribe(() => {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          const newValue = JSON.parse(item);
          setStoredValue(newValue);
        }
      } catch (error) {
        console.error(`Error syncing localStorage key "${key}":`, error);
      }
    });

    return unsubscribe;
  }, [key]);

  return [storedValue, setValue] as const;
}