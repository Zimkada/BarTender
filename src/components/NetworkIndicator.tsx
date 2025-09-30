import React from 'react';
import { Wifi, WifiOff, Battery, BatteryLow, Zap, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNetworkOptimization } from '../hooks/useNetworkOptimization';

export function NetworkIndicator() {
  const { networkInfo, performanceSettings } = useNetworkOptimization();

  const getConnectionIcon = () => {
    if (!networkInfo.isOnline) {
      return <WifiOff size={16} className="text-red-500" />;
    }

    switch (networkInfo.effectiveType) {
      case 'slow-2g':
      case '2g':
        return <Globe size={16} className="text-red-400" />;
      case '3g':
        return <Wifi size={16} className="text-yellow-500" />;
      case '4g':
      default:
        return <Wifi size={16} className="text-green-500" />;
    }
  };

  const getConnectionLabel = () => {
    if (!networkInfo.isOnline) return 'Hors ligne';

    switch (networkInfo.effectiveType) {
      case 'slow-2g': return 'Très lent';
      case '2g': return '2G';
      case '3g': return '3G';
      case '4g': return '4G';
      default: return 'Connecté';
    }
  };

  const getBatteryIcon = () => {
    if (networkInfo.batteryLevel === undefined) return null;

    return networkInfo.isLowBattery ?
      <BatteryLow size={16} className="text-red-500" /> :
      <Battery size={16} className="text-green-500" />;
  };

  const showOptimizationNotice = networkInfo.isSlowConnection ||
                                networkInfo.isLowBattery ||
                                networkInfo.saveData;

  return (
    <div className="flex items-center gap-2">
      {/* Indicateur de connexion */}
      <div className="flex items-center gap-1 text-white/80">
        {getConnectionIcon()}
        <span className="text-xs hidden sm:inline">
          {getConnectionLabel()}
        </span>
      </div>

      {/* Indicateur de batterie */}
      {getBatteryIcon() && (
        <div className="flex items-center gap-1 text-white/80">
          {getBatteryIcon()}
          {networkInfo.batteryLevel !== undefined && (
            <span className="text-xs hidden sm:inline">
              {Math.round(networkInfo.batteryLevel * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Indicateur d'économie de données */}
      {networkInfo.saveData && (
        <div className="flex items-center gap-1 text-white/80" title="Mode économie de données">
          <Zap size={16} className="text-blue-400" />
          <span className="text-xs hidden sm:inline">Éco</span>
        </div>
      )}

      {/* Notice d'optimisation */}
      <AnimatePresence>
        {showOptimizationNotice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="bg-blue-500/20 text-white text-xs px-2 py-1 rounded-full"
          >
            {networkInfo.isSlowConnection ? '🐌 Mode lent' :
             networkInfo.isLowBattery ? '🔋 Éco batterie' :
             networkInfo.saveData ? '💾 Éco data' : '⚡ Optimisé'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Composant pour afficher les statistiques détaillées
export function NetworkStats() {
  const { networkInfo, performanceSettings } = useNetworkOptimization();

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-white text-sm space-y-2">
      <h4 className="font-medium">État du réseau</h4>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-white/70">Connexion:</span>
          <span className="ml-1 font-medium">
            {networkInfo.isOnline ? networkInfo.effectiveType.toUpperCase() : 'Hors ligne'}
          </span>
        </div>

        <div>
          <span className="text-white/70">Débit:</span>
          <span className="ml-1 font-medium">
            {networkInfo.downlink.toFixed(1)} Mbps
          </span>
        </div>

        {networkInfo.batteryLevel !== undefined && (
          <>
            <div>
              <span className="text-white/70">Batterie:</span>
              <span className="ml-1 font-medium">
                {Math.round(networkInfo.batteryLevel * 100)}%
              </span>
            </div>

            <div>
              <span className="text-white/70">Mode:</span>
              <span className="ml-1 font-medium">
                {performanceSettings.useLowPowerMode ? 'Économie' : 'Normal'}
              </span>
            </div>
          </>
        )}

        <div className="col-span-2">
          <span className="text-white/70">Optimisations actives:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {!performanceSettings.enableAnimations && (
              <span className="bg-blue-500/30 px-1 rounded text-xs">Sans animations</span>
            )}
            {!performanceSettings.enableImageLoading && (
              <span className="bg-blue-500/30 px-1 rounded text-xs">Images limitées</span>
            )}
            {!performanceSettings.enableAutoSync && (
              <span className="bg-blue-500/30 px-1 rounded text-xs">Sync manuelle</span>
            )}
            {networkInfo.saveData && (
              <span className="bg-blue-500/30 px-1 rounded text-xs">Économie data</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}