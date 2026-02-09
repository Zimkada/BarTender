import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { Input } from './Input';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'default' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  headerClassName?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  default: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-full mx-4',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  size = 'default',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  footer,
  icon,
  headerClassName,
}) => {
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Handle ESC key
  React.useEffect(() => {
    if (!open || !closeOnEsc) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, closeOnEsc, onClose]);

  // Focus trap
  React.useEffect(() => {
    if (!open) return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    firstElement?.focus();
    document.addEventListener('keydown', handleTab);

    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeOnOverlayClick ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'relative z-10 w-full bg-white rounded-lg shadow-xl max-h-[90vh] flex flex-col',
              sizeClasses[size]
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-description' : undefined}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className={cn(
                "flex items-start justify-between p-6 border-b border-gray-200 flex-shrink-0",
                headerClassName
              )}>
                <div className="flex-1 flex items-center gap-3">
                  {icon && <div className="flex-shrink-0 mt-0.5">{icon}</div>}
                  <div>
                    {title && (
                      <h2
                        id="modal-title"
                        className="text-lg font-semibold text-gray-900"
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p
                        id="modal-description"
                        className="mt-1 text-sm text-gray-500"
                      >
                        {description}
                      </p>
                    )}
                  </div>
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="ml-4 text-gray-400 hover:text-gray-500 transition-colors"
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// Confirmation Modal preset
export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  isLoading?: boolean;
  // Double-check confirmation (optional)
  requireConfirmation?: boolean;
  confirmationValue?: string;
  confirmationPlaceholder?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'default',
  isLoading = false,
  requireConfirmation = false,
  confirmationValue = '',
  confirmationPlaceholder = '',
}) => {
  const [inputValue, setInputValue] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  const isConfirmDisabled =
    isLoading ||
    (requireConfirmation && inputValue !== confirmationValue);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={requireConfirmation ? 'default' : 'sm'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isConfirmDisabled}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      {requireConfirmation && (
        <div className="space-y-4">
          {variant === 'danger' && (
            <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-semibold">Cette action est irréversible</p>
                <p className="mt-1">Veuillez confirmer en saisissant la valeur ci-dessous.</p>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tapez <span className="font-mono font-semibold">"{confirmationValue}"</span> pour confirmer:
            </label>
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={confirmationPlaceholder || confirmationValue}
              className="font-mono"
              autoFocus
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-2">
              {inputValue === confirmationValue ? (
                <span className="text-green-600">✓ Confirmation valide</span>
              ) : (
                <span>Doit correspondre exactement</span>
              )}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
};
