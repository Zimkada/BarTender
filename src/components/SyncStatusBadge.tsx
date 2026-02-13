// SyncStatusBadge.tsx - Badge UI pour afficher statut de synchronisation
// Architecture: Composant React avec animations et tooltips

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  // Wifi, // Unused
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';
import { useSyncStatus } from '../hooks/useSyncStatus';

/**
 * Props du composant
 */
interface SyncStatusBadgeProps {
  /** Afficher en mode compact (juste l'icône) */
  compact?: boolean;

  /** Position du badge (pour animations) */
  position?: 'header' | 'floating';
}

/**
 * Composant Badge affichant le statut de synchronisation
 *
 * États visuels:
 * - Vert: Online, tout synchronisé
 * - Orange: Online, opérations en attente
 * - Rouge: Offline ou erreurs
 * - Bleu: Synchronisation en cours
 *
 * @example
 * <SyncStatusBadge position="header" />
 */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  compact = false,
  // position is currently unused but kept for API compatibility
  // position = 'header',
}) => {
  const {
    networkStatus,
    pendingCount,
    syncingCount,
    errorCount,
    isSyncing,
    isOnline,
    isOffline,
    hasErrors,
    hasPending,
    retryAll,
    forceNetworkCheck,
    errors,
  } = useSyncStatus();

  const [showTooltip, setShowTooltip] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(false);

  /**
   * Détermine la couleur du badge selon l'état
   */
  const getBadgeColor = (): string => {
    if (isOffline) return 'bg-red-500';
    if (hasErrors) return 'bg-red-500';
    if (isSyncing) return 'bg-blue-500';
    if (hasPending) return 'bg-amber-500';
    return 'bg-green-500';
  };

  /**
   * Détermine l'icône selon l'état
   */
  const getIcon = () => {
    if (isOffline) return <WifiOff size={16} />;
    if (isSyncing) return <RefreshCw size={16} className="animate-spin" />;
    if (hasErrors) return <AlertCircle size={16} />;
    if (hasPending) return <Clock size={16} />;
    return <CheckCircle size={16} />;
  };

  /**
   * Détermine le texte selon l'état
   */
  const getText = (): string => {
    if (isOffline) return 'Hors ligne';
    if (isSyncing) return `Sync... (${syncingCount})`;
    if (hasErrors) return `${errorCount} erreur${errorCount > 1 ? 's' : ''}`;
    if (hasPending) return `${pendingCount} en attente`;
    return 'Synchronisé';
  };

  /**
   * Handler pour clic sur le badge
   */
  const handleClick = () => {
    if (hasErrors) {
      setShowErrorsModal(true);
    } else if (hasPending) {
      setShowTooltip(!showTooltip);
    } else {
      forceNetworkCheck();
    }
  };

  return (
    <>
      {/* Badge principal */}
      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          relative flex items-center gap-2 px-3 py-1.5 rounded-full
          ${getBadgeColor()} text-white text-sm font-medium
          hover:opacity-90 transition-opacity cursor-pointer
          shadow-lg
        `}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Icône */}
        {getIcon()}

        {/* Texte (si pas compact) */}
        {!compact && <span>{getText()}</span>}

        {/* Compteur (si compact et pending/errors) */}
        {compact && (hasPending || hasErrors) && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {pendingCount + errorCount}
          </span>
        )}

        {/* Pulsation si syncing */}
        {isSyncing && (
          <motion.div
            className="absolute inset-0 rounded-full bg-blue-400"
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.button>

      {/* Tooltip informatif */}
      <AnimatePresence>
        {showTooltip && !showErrorsModal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-2 right-0 z-50 bg-gray-900 text-white rounded-lg shadow-xl p-3 min-w-[200px]"
          >
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Réseau:</span>
                <span className="font-medium">
                  {networkStatus === 'online' && '🟢 En ligne'}
                  {networkStatus === 'offline' && '🔴 Hors ligne'}
                  {networkStatus === 'checking' && '🟡 Vérification...'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">En attente:</span>
                <span className="font-medium">{pendingCount}</span>
              </div>
              {syncingCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">En cours:</span>
                  <span className="font-medium">{syncingCount}</span>
                </div>
              )}
              {errorCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Erreurs:</span>
                  <span className="font-medium text-red-400">{errorCount}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {hasPending && isOnline && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  forceNetworkCheck();
                  setShowTooltip(false);
                }}
                className="mt-3 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
              >
                <RefreshCw size={12} className="inline mr-1" />
                Forcer la sync
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal des erreurs */}
      <AnimatePresence>
        {showErrorsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowErrorsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-red-50">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                  <h2 className="text-xl font-bold text-gray-800">
                    Erreurs de synchronisation ({errorCount})
                  </h2>
                </div>
                <button
                  onClick={() => setShowErrorsModal(false)}
                  className="p-2 text-gray-600 hover:text-gray-600 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Liste des erreurs */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {errors.map((error) => (
                    <div
                      key={error.id}
                      className="bg-red-50 border border-red-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-red-800">
                              {error.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              Tentatives: {error.retryCount}
                            </span>
                          </div>
                          <p className="text-sm text-red-700 mb-2">
                            {error.errorMessage || 'Erreur inconnue'}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {error.id}
                          </p>
                        </div>
                        <button
                          onClick={() => retryAll()}
                          className="ml-4 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          Réessayer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <button
                  onClick={() => {
                    retryAll();
                    setShowErrorsModal(false);
                  }}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  <RefreshCw size={16} className="inline mr-2" />
                  Réessayer toutes les opérations
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
