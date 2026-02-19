import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Loader, Wifi } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastVariant = 'success' | 'error' | 'loading' | 'warning' | 'offline';

interface ToastProps {
  id?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number; // ms, null = persist
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  showIcon?: boolean;
}

const toastConfig = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    icon: CheckCircle,
    color: 'text-green-600',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
    color: 'text-red-600',
  },
  loading: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: Loader,
    color: 'text-blue-600',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    icon: AlertCircle,
    color: 'text-yellow-600',
  },
  offline: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    text: 'text-gray-800',
    icon: Wifi,
    color: 'text-gray-600',
  },
};

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  variant = 'success',
  duration = 3000,
  onClose,
  action,
  showIcon = true,
}) => {
  const config = toastConfig[variant];
  const Icon = config.icon;

  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: 100 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 100 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg border',
        config.bg,
        config.border,
        config.text,
        'min-w-[300px] max-w-[500px] shadow-lg'
      )}
      role="alert"
      aria-live="polite"
    >
      {showIcon && variant === 'loading' && (
        <Icon className={cn(config.color, 'w-5 h-5 flex-shrink-0 animate-spin')} />
      )}
      {showIcon && variant !== 'loading' && (
        <Icon className={cn(config.color, 'w-5 h-5 flex-shrink-0')} />
      )}

      <div className="flex-1 text-sm font-medium">{message}</div>

      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            'px-3 py-1 rounded text-xs font-semibold whitespace-nowrap',
            'hover:bg-black/10 transition-colors'
          )}
        >
          {action.label}
        </button>
      )}

      {onClose && !action && (
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/10 rounded transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
};

/**
 * Container pour afficher plusieurs toasts
 */
interface ToastContainerProps {
  toasts: (ToastProps & { id: string })[];
  onRemove: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
  position = 'top-right',
}) => {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  return (
    <div
      className={cn(
        'fixed z-[9999] flex flex-col gap-2 pointer-events-none',
        positionClasses[position]
      )}
    >
      <AnimatePresence>
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              {...toast}
              onClose={() => onRemove(toast.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};
