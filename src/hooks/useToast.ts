import { useState, useCallback } from 'react';
import { ToastVariant } from '../components/ui/Toast';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number | null;
}

/**
 * Hook pour gérer les toasts facilement
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'success', duration: number | null = 3000) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts(prev => [...prev, { id, message, variant, duration }]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message: string, duration = 3000) => {
    return addToast(message, 'success', duration);
  }, [addToast]);

  const error = useCallback((message: string, duration = 5000) => {
    return addToast(message, 'error', duration);
  }, [addToast]);

  const loading = useCallback((message: string) => {
    return addToast(message, 'loading', null);
  }, [addToast]);

  const warning = useCallback((message: string, duration = 4000) => {
    return addToast(message, 'warning', duration);
  }, [addToast]);

  const offline = useCallback((message: string) => {
    return addToast(message, 'offline', null);
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    loading,
    warning,
    offline,
  };
}
