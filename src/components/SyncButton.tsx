import React, { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, Zap, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNetworkOptimization } from '../hooks/useNetworkOptimization';
import { optimizedSyncService } from '../services/optimizedSyncService';

export function SyncButton() {
  const { networkInfo, performanceSettings } = useNetworkOptimization();
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Mise à jour de la taille de la queue
  useEffect(() => {
    const updateQueueSize = async () => {
      const size = await optimizedSyncService.getQueueSize();
      setQueueSize(size);
    };

    updateQueueSize();
    const interval = setInterval(updateQueueSize, 10000); // Vérifier toutes les 10s

    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    if (isSyncing || !networkInfo.isOnline) return;

    setIsSyncing(true);
    try {
      await optimizedSyncService.smartSync({
        type: networkInfo.effectiveType,
        downlink: networkInfo.downlink,
        saveData: networkInfo.saveData,
        batteryLevel: networkInfo.batteryLevel
      });

      setLastSyncTime(new Date());
      setQueueSize(0);

    } catch (error) {
      console.error('Erreur de synchronisation:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncCriticalOnly = async () => {
    if (isSyncing || !networkInfo.isOnline) return;

    setIsSyncing(true);
    try {
      await optimizedSyncService.syncCriticalOnly({
        type: networkInfo.effectiveType,
        downlink: networkInfo.downlink,
        saveData: networkInfo.saveData,
        batteryLevel: networkInfo.batteryLevel
      });

      setLastSyncTime(new Date());

    } catch (error) {
      console.error('Erreur de synchronisation critique:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const getSyncIcon = () => {
    if (!networkInfo.isOnline) return <WifiOff size={16} />;
    if (isSyncing) return <RefreshCw size={16} className="animate-spin" />;
    return <RefreshCw size={16} />;
  };

  const getSyncButtonColor = () => {
    if (!networkInfo.isOnline) return 'bg-gray-500';
    if (queueSize > 0) return 'bg-orange-500 hover:bg-orange-600';
    return 'bg-green-500 hover:bg-green-600';
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Jamais';

    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins}min`;

    const diffHours = Math.floor(diffMins / 60);
    return `Il y a ${diffHours}h`;
  };

  return (
    <div className="flex items-center gap-2">
      {/* Bouton de sync principal */}
      <motion.button
        onClick={handleSync}
        disabled={isSyncing || !networkInfo.isOnline}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-white transition-all ${getSyncButtonColor()} disabled:opacity-50 disabled:cursor-not-allowed touch-target`}
        whileTap={{ scale: 0.95 }}
        title={`Synchroniser${queueSize > 0 ? ` (${queueSize} en attente)` : ''}`}
      >
        {getSyncIcon()}
        <span className="text-sm hidden sm:inline">
          {isSyncing ? 'Sync...' : 'Sync'}
        </span>

        {queueSize > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center"
          >
            {queueSize > 99 ? '99+' : queueSize}
          </motion.span>
        )}
      </motion.button>

      {/* Bouton sync critique pour connexions très lentes */}
      {networkInfo.isSlowConnection && queueSize > 0 && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={handleSyncCriticalOnly}
          disabled={isSyncing || !networkInfo.isOnline}
          className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-all disabled:opacity-50 touch-target"
          title="Synchroniser seulement les ventes et stocks (connexion lente)"
        >
          <Zap size={12} />
          <span className="hidden sm:inline">Critique</span>
        </motion.button>
      )}

      {/* Indicateur de dernière sync */}
      <AnimatePresence>
        {lastSyncTime && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-white/70 text-xs"
          >
            <Clock size={12} />
            <span className="hidden md:inline">{formatLastSync()}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Version compacte pour mobile
export function CompactSyncButton() {
  const { networkInfo } = useNetworkOptimization();
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    const updateQueueSize = async () => {
      const size = await optimizedSyncService.getQueueSize();
      setQueueSize(size);
    };

    updateQueueSize();
    const interval = setInterval(updateQueueSize, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickSync = async () => {
    if (isSyncing || !networkInfo.isOnline) return;

    setIsSyncing(true);
    try {
      if (networkInfo.isSlowConnection) {
        await optimizedSyncService.syncCriticalOnly({
          type: networkInfo.effectiveType,
          downlink: networkInfo.downlink,
          saveData: networkInfo.saveData,
          batteryLevel: networkInfo.batteryLevel
        });
      } else {
        await optimizedSyncService.smartSync({
          type: networkInfo.effectiveType,
          downlink: networkInfo.downlink,
          saveData: networkInfo.saveData,
          batteryLevel: networkInfo.batteryLevel
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (queueSize === 0) return null;

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      onClick={handleQuickSync}
      disabled={isSyncing || !networkInfo.isOnline}
      className="fixed top-4 right-4 bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-full shadow-lg z-50 disabled:opacity-50 touch-target"
      whileTap={{ scale: 0.9 }}
    >
      <div className="relative">
        {isSyncing ? (
          <RefreshCw size={20} className="animate-spin" />
        ) : (
          <RefreshCw size={20} />
        )}

        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-[16px] flex items-center justify-center">
          {queueSize > 9 ? '9+' : queueSize}
        </span>
      </div>
    </motion.button>
  );
}